"""Speak MCP over plain HTTP: initialize, list tools, call one. No SDK needed.

    python 11_mcp_client.py
    python 11_mcp_client.py social_get_post '{"postId": "<id>"}'

The server is stateless and answers in JSON (no SSE). Requests must send
`Accept: application/json, text/event-stream` (client.py does).
"""

import json
import sys

from client import BrightBean, McpRpcError, McpToolError, show

bb = BrightBean()
name = sys.argv[1] if len(sys.argv) > 1 else "social_list_accounts"
arguments = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

try:
    init = bb.mcp_rpc(
        "initialize",
        {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "bb-example", "version": "1.0"}},
    )
    print(f"server: {init['serverInfo']['name']} {init['serverInfo']['version']}, protocol {init['protocolVersion']}")
    print(f"instructions: {init.get('instructions', '')}\n")

    tools = bb.mcp_rpc("tools/list")["tools"]
    print(f"{len(tools)} tools visible to this key:")
    for tool in tools:
        print(f"  {tool['name']:<32} {tool['title']}")

    print(f"\ntools/call {name} {arguments}")
    show(bb.mcp(name, **arguments))
except McpToolError as e:
    print(f"tool error: {e}")
except McpRpcError as e:
    # e.g. a rate-limited initialize / tools/list: -32000 with data.retry_after
    retry = e.data.get("retry_after")
    print(f"{e}" + (f" (retry after {retry} s)" if retry else ""))
    sys.exit(1)
