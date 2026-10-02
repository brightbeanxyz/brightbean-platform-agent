#!/usr/bin/env bash
# Shared setup for the shell examples. Source it: `source "$(dirname "$0")/_common.sh"`.
#
# Needs: curl, and jq for the scripts that build JSON or read answers.
# Environment:
#   BRIGHTBEAN_API_KEY  the key (bb_live_...) from Settings → Workspace → API & MCP
#   BRIGHTBEAN_API_URL  optional; defaults to https://api-platform.brightbean.xyz
#
# Provides:
#   $API                      the REST base, .../api/v1
#   $MCP                      the MCP endpoint, .../api/v1/mcp
#   bb METHOD PATH [BODY] [extra curl args...]
#                             call the REST API; prints the body, exits non-zero on 4xx/5xx
#   mcp JSON_RPC_MESSAGE      POST one JSON-RPC message to the MCP server
#   new_key INTENT            a fresh Idempotency-Key

set -euo pipefail

if [[ -z "${BRIGHTBEAN_API_KEY:-}" ]]; then
  echo "Set BRIGHTBEAN_API_KEY first (Settings → Workspace → API & MCP → Create API key)." >&2
  exit 1
fi

BASE="${BRIGHTBEAN_API_URL:-https://api-platform.brightbean.xyz}"
BASE="${BASE%/}"
API="${BASE}/api/v1"
MCP="${BASE}/api/v1/mcp"
# Name your client. Cloudflare blocks some default agents with a plain-text "403 error code: 1010".
UA="brightbean-platform-agent-examples/1.0 (curl)"

need_jq() {
  command -v jq >/dev/null || { echo "This example needs jq (https://jqlang.github.io/jq/)." >&2; exit 1; }
}

new_key() {
  printf '%s-%s' "$1" "$(uuidgen 2>/dev/null || od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
}

bb() {
  local method="$1" path="$2" body="${3:-}"
  shift 3 2>/dev/null || shift $#
  local args=(-sS -X "$method" -H "Authorization: Bearer ${BRIGHTBEAN_API_KEY}" -H "User-Agent: ${UA}")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  local out status
  out="$(curl "${args[@]}" "$@" -w $'\n%{http_code}' "${API}${path}")"
  status="${out##*$'\n'}"
  out="${out%$'\n'*}"
  printf '%s\n' "$out"
  if [[ "$status" -ge 400 ]]; then
    echo "HTTP $status" >&2
    return 1
  fi
}

mcp() {
  curl -sS -X POST "$MCP" \
    -H "Authorization: Bearer ${BRIGHTBEAN_API_KEY}" \
    -H "User-Agent: ${UA}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    --data "$1"
}
