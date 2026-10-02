"""A small BrightBean API client used by the example scripts.

Configuration comes from two environment variables:

* ``BRIGHTBEAN_API_KEY``: the key (``bb_live_...``) from Settings → Workspace → API & MCP.
* ``BRIGHTBEAN_API_URL``: optional. Defaults to production
  (``https://api-platform.brightbean.xyz``). No trailing slash, no ``/api/v1``.

Everything an agent tends to get wrong is handled here once:

* An explicit ``User-Agent``. Cloudflare blocks Python's default ``Python-urllib`` agent
  with a plain-text ``403 error code: 1010``. ``requests`` sends its own, but naming your
  client is better anyway.
* Errors are raised as ``ApiError`` carrying the API's ``error`` code and ``detail`` sentence.
* ``mcp()`` speaks MCP JSON-RPC with the two ``Accept`` types the server requires, and
  parses the tool's JSON result.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from typing import Any

import requests

DEFAULT_API_URL = "https://api-platform.brightbean.xyz"
USER_AGENT = "brightbean-platform-agent-examples/1.0 (python)"


class ApiError(Exception):
    """A non-2xx answer from the API."""

    def __init__(self, status: int, body: Any, headers: Any):
        self.status = status
        self.body = body if isinstance(body, dict) else {"error": "http_error", "detail": str(body)}
        self.code = self.body.get("error")
        self.detail = self.body.get("detail")
        self.retry_after = headers.get("Retry-After")
        super().__init__(f"HTTP {status} {self.code}: {self.detail}")


class McpToolError(Exception):
    """A tool call that came back with ``isError: true``."""


class BrightBean:
    def __init__(self, api_url: str | None = None, api_key: str | None = None):
        self.api_url = (api_url or os.environ.get("BRIGHTBEAN_API_URL") or DEFAULT_API_URL).rstrip("/")
        self.api_key = api_key or os.environ.get("BRIGHTBEAN_API_KEY", "")
        if not self.api_key:
            sys.exit("Set BRIGHTBEAN_API_KEY first (Settings → Workspace → API & MCP → Create API key).")
        self.session = requests.Session()
        self.session.headers.update(
            {"Authorization": f"Bearer {self.api_key}", "User-Agent": USER_AGENT}
        )
        self._rpc_id = 0

    # ---- REST ---------------------------------------------------------------

    def request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        params: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        etag: str | None = None,
    ) -> requests.Response:
        """Call ``/api/v1<path>``. Returns the response; raises ApiError on 4xx/5xx (not on 304)."""
        headers = {}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        if etag:
            headers["If-None-Match"] = etag
        response = self.session.request(
            method,
            f"{self.api_url}/api/v1{path}",
            json=body,
            params=params,
            headers=headers,
            timeout=30,
        )
        if response.status_code >= 400:
            try:
                payload = response.json()
            except ValueError:
                payload = response.text  # e.g. Cloudflare's plain-text "error code: 1010"
            raise ApiError(response.status_code, payload, response.headers)
        return response

    def get(self, path: str, **params: Any) -> Any:
        return self.request("GET", path, params=params or None).json()

    def post(self, path: str, body: dict[str, Any] | None = None, *, idempotency_key: str | None = None) -> Any:
        response = self.request("POST", path, body or {}, idempotency_key=idempotency_key)
        return response.json() if response.content else None

    def patch(self, path: str, body: dict[str, Any]) -> Any:
        return self.request("PATCH", path, body).json()

    def delete(self, path: str) -> None:
        self.request("DELETE", path)

    # ---- MCP ----------------------------------------------------------------

    def mcp_rpc(self, method: str, params: dict[str, Any] | None = None) -> Any:
        """One JSON-RPC call to the MCP server. Returns ``result``; raises on a JSON-RPC error."""
        self._rpc_id += 1
        message: dict[str, Any] = {"jsonrpc": "2.0", "id": self._rpc_id, "method": method}
        if params is not None:
            message["params"] = params
        response = self.session.post(
            f"{self.api_url}/api/v1/mcp",
            json=message,
            headers={"Accept": "application/json, text/event-stream"},
            timeout=60,
        )
        if response.status_code >= 400:
            try:
                payload = response.json()
            except ValueError:
                payload = response.text
            raise ApiError(response.status_code, payload, response.headers)
        reply = response.json()
        if "error" in reply:
            raise RuntimeError(f"JSON-RPC error {reply['error']['code']}: {reply['error']['message']}")
        return reply["result"]

    def mcp(self, tool: str, **arguments: Any) -> Any:
        """Call a tool. Returns its JSON payload (the second text item), or the sentence if there is none."""
        result = self.mcp_rpc("tools/call", {"name": tool, "arguments": arguments})
        texts = [c["text"] for c in result.get("content", []) if c.get("type") == "text"]
        if result.get("isError"):
            raise McpToolError(texts[0] if texts else "tool failed")
        if len(texts) >= 2:
            return json.loads(texts[1])
        return texts[0] if texts else None


def new_idempotency_key(intent: str) -> str:
    """A fresh key per intent. Reuse the SAME key only to retry the SAME request."""
    return f"{intent}-{uuid.uuid4()}"


def show(data: Any) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False))
