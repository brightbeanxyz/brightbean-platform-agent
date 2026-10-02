#!/usr/bin/env bash
# Speak MCP JSON-RPC with plain curl: initialize, tools/list, tools/call.
#   bash 11_mcp_call.sh
#   bash 11_mcp_call.sh social_get_post '{"postId":"<id>"}'
source "$(dirname "$0")/_common.sh"
tool="${1:-social_list_accounts}"
tool_args="${2:-}"
[[ -n "$tool_args" ]] || tool_args="{}"

echo "=== initialize ==="
mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"bb-curl","version":"1.0"}}}'
echo
echo "=== tools/list ==="
mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
echo
echo "=== tools/call ${tool} ==="
mcp "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"${tool}\",\"arguments\":${tool_args}}}"
echo
