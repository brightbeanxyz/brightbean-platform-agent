#!/usr/bin/env node
// Drift guard: does this repo still describe the live BrightBean API?
//
//   node scripts/check-drift.mjs            check, exit 1 on any drift
//   node scripts/check-drift.mjs --update   rewrite the snapshots in docs/ from the live API
//
// Environment:
//   BRIGHTBEAN_API_URL  default https://api-platform.brightbean.xyz
//   BRIGHTBEAN_API_KEY  optional. With it, the MCP tools/list is compared too. Use a key
//                       with every permission, or tools it can't see are only reported.
//
// Checks:
//   1. The live /api/v1/openapi.json equals docs/openapi.json.
//   2. Every REST operation (its operationId and path) appears in reference/rest-api.md, and
//      every MCP tool in docs/mcp-tools.json appears in reference/mcp-tools.md and SKILL.md.
//   3. (with a key) The live tools/list matches docs/mcp-tools.json.
//
// Node 18+, no dependencies.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = (process.env.BRIGHTBEAN_API_URL ?? "https://api-platform.brightbean.xyz").replace(/\/+$/, "");
const API_KEY = process.env.BRIGHTBEAN_API_KEY ?? "";
const UPDATE = process.argv.includes("--update");
const UA = "brightbean-platform-agent-drift-check/1.0";

const problems = []; // drift between the snapshots and the live API (--update fixes these)
const gaps = []; // things the docs fail to mention (only editing the docs fixes these)
const notes = [];

/** JSON with object keys sorted, so key order never counts as drift. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const pretty = (value) => JSON.stringify(canonical(value), null, 2) + "\n";

async function readJson(rel) {
  return JSON.parse(await readFile(join(ROOT, rel), "utf8"));
}
async function readText(rel) {
  return readFile(join(ROOT, rel), "utf8");
}

function operations(spec) {
  const ops = new Map();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(item)) {
      if (op && typeof op === "object" && op.operationId) ops.set(`${method.toUpperCase()} ${path}`, { path, ...op });
    }
  }
  return ops;
}

// ---- 1. OpenAPI ---------------------------------------------------------------

async function checkOpenApi() {
  const res = await fetch(`${API_URL}/api/v1/openapi.json`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`GET /api/v1/openapi.json: HTTP ${res.status}`);
  const live = await res.json();
  const snapshot = await readJson("docs/openapi.json");
  if (same(live, snapshot)) {
    notes.push("openapi.json: matches the live spec");
    return live;
  }
  const a = operations(snapshot);
  const b = operations(live);
  for (const key of b.keys()) if (!a.has(key)) problems.push(`openapi: NEW operation ${key} (${b.get(key).operationId})`);
  for (const key of a.keys()) if (!b.has(key)) problems.push(`openapi: REMOVED operation ${key}`);
  for (const key of a.keys()) if (b.has(key) && !same(a.get(key), b.get(key))) problems.push(`openapi: CHANGED ${key}`);
  const rest = (s) => ({ ...s, paths: undefined });
  if (!same(rest(live), rest(snapshot))) problems.push("openapi: info / components / servers changed");
  if (UPDATE) {
    await writeFile(join(ROOT, "docs/openapi.json"), pretty(live));
    notes.push("openapi.json: UPDATED from the live spec. Now update reference/ and SKILL.md to match.");
  }
  return live;
}

// ---- 2. Docs mention everything ------------------------------------------------

async function checkDocsCover(spec) {
  const restDoc = await readText("reference/rest-api.md");
  for (const [key, op] of operations(spec)) {
    if (!restDoc.includes(op.operationId)) gaps.push(`reference/rest-api.md: missing operationId ${op.operationId} (${key})`);
    if (!restDoc.includes(op.path)) gaps.push(`reference/rest-api.md: missing path ${op.path}`);
  }
  const { tools } = await readJson("docs/mcp-tools.json");
  if (!tools?.length) gaps.push("docs/mcp-tools.json: no tools in the snapshot");
  const mcpDoc = await readText("reference/mcp-tools.md");
  const skill = await readText("SKILL.md");
  for (const t of tools ?? []) {
    if (!mcpDoc.includes(`\`${t.name}\``)) gaps.push(`reference/mcp-tools.md: missing tool ${t.name}`);
    if (!skill.includes(`\`${t.name}\``)) gaps.push(`SKILL.md: missing tool ${t.name}`);
  }
  notes.push(`docs cover ${operations(spec).size} operations and ${tools?.length ?? 0} tools`);
}

// ---- 3. MCP tools/list ---------------------------------------------------------

async function mcp(method, params, id) {
  const res = await fetch(`${API_URL}/api/v1/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "User-Agent": UA,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`MCP ${method}: HTTP ${res.status} ${JSON.stringify(body?.error ?? body)}`);
  return body.result;
}

async function checkMcp() {
  if (!API_KEY) {
    notes.push("MCP tools/list: SKIPPED (set BRIGHTBEAN_API_KEY to compare it)");
    return;
  }
  await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "drift-check", version: "1" } }, 1);
  const { tools: live } = await mcp("tools/list", undefined, 2);
  const snapshot = (await readJson("docs/mcp-tools.json")).tools ?? [];
  const byName = new Map(snapshot.map((t) => [t.name, t]));
  for (const t of live) {
    if (!byName.has(t.name)) problems.push(`mcp: NEW tool ${t.name}`);
    else if (!same(t, byName.get(t.name))) problems.push(`mcp: CHANGED tool ${t.name}`);
  }
  const liveNames = new Set(live.map((t) => t.name));
  const hidden = snapshot.filter((t) => !liveNames.has(t.name)).map((t) => t.name);
  if (hidden.length) notes.push(`mcp: not visible to this key (permissions?), not compared: ${hidden.join(", ")}`);
  notes.push(`mcp: compared ${live.length} tools`);
  if (UPDATE) {
    const merged = snapshot.filter((t) => !liveNames.has(t.name)).concat(live);
    const order = new Map(live.map((t, i) => [t.name, i]));
    merged.sort((x, y) => (order.get(x.name) ?? 1e9) - (order.get(y.name) ?? 1e9));
    await writeFile(join(ROOT, "docs/mcp-tools.json"), pretty({ tools: merged }));
    notes.push("mcp-tools.json: UPDATED from the live tools/list");
  }
}

// ---- run -----------------------------------------------------------------------

try {
  const spec = await checkOpenApi();
  await checkMcp();
  await checkDocsCover(UPDATE ? spec : await readJson("docs/openapi.json"));
} catch (error) {
  console.error(`drift check could not run: ${error.message}`);
  process.exit(2);
}

console.log(`Checked ${API_URL}`);
for (const n of notes) console.log(`  ok    ${n}`);
for (const p of problems) console.log(`  DRIFT ${p}`);
for (const g of gaps) console.log(`  DOCS  ${g}`);
if (gaps.length || (problems.length && !UPDATE)) {
  console.log(
    `\n${problems.length} drift problem(s), ${gaps.length} docs gap(s). ` +
      "Update reference/ and SKILL.md, then run with --update to refresh the snapshots.",
  );
  process.exit(1);
}
console.log(problems.length ? "\nSnapshots updated. Check reference/ and SKILL.md still describe them." : "\nNo drift.");
