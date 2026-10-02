// A small BrightBean API client used by the example scripts. Node 18+, no dependencies.
//
// Configuration:
//   BRIGHTBEAN_API_KEY  the key (bb_live_...) from Settings → Workspace → API & MCP
//   BRIGHTBEAN_API_URL  optional; defaults to https://api-platform.brightbean.xyz
//
// It sends its own User-Agent (Cloudflare blocks some default agents with a plain-text
// "403 error code: 1010"), raises ApiError with the API's `error` code and `detail`
// sentence, and speaks MCP JSON-RPC with the Accept header the server requires.

import { randomUUID } from "node:crypto";

export const DEFAULT_API_URL = "https://api-platform.brightbean.xyz";
const USER_AGENT = "brightbean-platform-agent-examples/1.0 (node)";

export class ApiError extends Error {
  constructor(status, body, headers) {
    const parsed = typeof body === "object" && body ? body : { error: "http_error", detail: String(body) };
    super(`HTTP ${status} ${parsed.error}: ${parsed.detail}`);
    this.status = status;
    this.body = parsed;
    this.code = parsed.error;
    this.detail = parsed.detail;
    this.retryAfter = headers.get("retry-after");
  }
}

/** A tool call that came back with `isError: true` (the text says why). */
export class McpToolError extends Error {}

/** A JSON-RPC error, e.g. -32000 "Too many requests" on initialize / tools/list (data.retry_after). */
export class McpRpcError extends Error {
  constructor({ code, message, data }) {
    super(`JSON-RPC error ${code}: ${message}`);
    this.code = code;
    this.data = data;
  }
}

export class BrightBean {
  constructor({ apiUrl, apiKey } = {}) {
    this.apiUrl = (apiUrl ?? process.env.BRIGHTBEAN_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");
    this.apiKey = apiKey ?? process.env.BRIGHTBEAN_API_KEY ?? "";
    if (!this.apiKey) {
      console.error("Set BRIGHTBEAN_API_KEY first (Settings → Workspace → API & MCP → Create API key).");
      process.exit(1);
    }
    this.rpcId = 0;
  }

  headers(extra = {}) {
    return { Authorization: `Bearer ${this.apiKey}`, "User-Agent": USER_AGENT, ...extra };
  }

  /** Call /api/v1<path>. Returns the Response; throws ApiError on 4xx/5xx (not on 304). */
  async request(method, path, { body, params, idempotencyKey, etag } = {}) {
    const url = new URL(`${this.apiUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers = this.headers(body !== undefined ? { "Content-Type": "application/json" } : {});
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (etag) headers["If-None-Match"] = etag;
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (response.status >= 400) {
      const text = await response.text();
      let payload = text;
      try {
        payload = JSON.parse(text);
      } catch {
        // plain text, e.g. Cloudflare's "error code: 1010"
      }
      throw new ApiError(response.status, payload, response.headers);
    }
    return response;
  }

  async get(path, params) {
    return (await this.request("GET", path, { params })).json();
  }

  async post(path, body = {}, { idempotencyKey } = {}) {
    const response = await this.request("POST", path, { body, idempotencyKey });
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async patch(path, body) {
    return (await this.request("PATCH", path, { body })).json();
  }

  async delete(path) {
    await this.request("DELETE", path);
  }

  /** One JSON-RPC call to the MCP server. Returns `result`; throws on a JSON-RPC error. */
  async mcpRpc(method, params) {
    const message = { jsonrpc: "2.0", id: ++this.rpcId, method, ...(params ? { params } : {}) };
    const response = await fetch(`${this.apiUrl}/api/v1/mcp`, {
      method: "POST",
      headers: this.headers({
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      }),
      body: JSON.stringify(message),
    });
    const text = await response.text();
    let reply = text;
    try {
      reply = JSON.parse(text);
    } catch {
      // not JSON
    }
    if (response.status >= 400) throw new ApiError(response.status, reply, response.headers);
    if (!reply || typeof reply !== "object" || !("result" in reply || "error" in reply)) {
      throw new Error(`unexpected MCP reply to ${method} (HTTP ${response.status}): ${String(text).slice(0, 200) || "<empty>"}`);
    }
    if (reply.error) throw new McpRpcError(reply.error);
    return reply.result;
  }

  /** Call a tool. Returns its JSON payload (the second text item), or the sentence if there is none. */
  async mcp(tool, args = {}) {
    const result = await this.mcpRpc("tools/call", { name: tool, arguments: args });
    const texts = (result.content ?? []).filter((c) => c.type === "text").map((c) => c.text);
    if (result.isError) throw new McpToolError(texts[0] ?? "tool failed");
    return texts.length >= 2 ? JSON.parse(texts[1]) : texts[0];
  }
}

/** A fresh key per intent. Reuse the SAME key only to retry the SAME request. */
export function newIdempotencyKey(intent) {
  return `${intent}-${randomUUID()}`;
}

export function show(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Tiny flag parser. `--name value` and `--name=value` take a value (even one that starts
 * with "--", e.g. a caption); names listed in `booleans` are switches (`--queue`).
 * A value flag with nothing after it is a usage error rather than `true`.
 */
export function parseArgs(argv = process.argv.slice(2), { booleans = [] } = {}) {
  const switches = new Set(booleans);
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 2) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (switches.has(arg.slice(2))) {
      flags[arg.slice(2)] = true;
    } else if (i + 1 < argv.length) {
      flags[arg.slice(2)] = argv[++i];
    } else {
      usage(`${arg} needs a value`);
    }
  }
  return { flags, positional };
}

export function usage(text) {
  console.error(text);
  process.exit(2);
}
