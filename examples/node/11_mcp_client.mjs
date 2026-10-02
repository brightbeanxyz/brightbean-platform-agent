// Speak MCP over plain HTTP: initialize, list tools, call one. No SDK needed.
//   node 11_mcp_client.mjs
//   node 11_mcp_client.mjs social_get_post '{"postId":"<id>"}'
// The server is stateless and answers in JSON (no SSE). Requests must send
// `Accept: application/json, text/event-stream` (client.mjs does).
import { BrightBean, McpRpcError, McpToolError, show } from "./client.mjs";

const bb = new BrightBean();
const name = process.argv[2] ?? "social_list_accounts";
const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};

try {
  const init = await bb.mcpRpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "bb-example", version: "1.0" },
  });
  console.log(`server: ${init.serverInfo.name} ${init.serverInfo.version}, protocol ${init.protocolVersion}`);
  console.log(`instructions: ${init.instructions ?? ""}\n`);

  const { tools } = await bb.mcpRpc("tools/list");
  console.log(`${tools.length} tools visible to this key:`);
  for (const t of tools) console.log(`  ${t.name.padEnd(32)} ${t.title}`);

  console.log(`\ntools/call ${name} ${JSON.stringify(args)}`);
  show(await bb.mcp(name, args));
} catch (e) {
  if (e instanceof McpToolError) {
    console.log(`tool error: ${e.message}`);
  } else if (e instanceof McpRpcError) {
    // e.g. a rate-limited initialize / tools/list: -32000 with data.retry_after
    console.log(`${e.message}${e.data?.retry_after ? ` (retry after ${e.data.retry_after} s)` : ""}`);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
