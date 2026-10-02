# Connecting an MCP client

```
https://api-platform.brightbean.xyz/api/v1/mcp
```

Enter the address **exactly** like this: no trailing slash, and no `/sse`. It is a remote
Streamable HTTP server. There are two ways to sign in:

- **OAuth (no key):** the client opens a BrightBean page in the browser. The user signs in
  and picks the workspace, the channels and what the client may do. This is the easiest
  for people.
- **API key in a header:** `Authorization: Bearer bb_live_…`. Best for unattended agents
  and scripts. Create the key in BrightBean under Settings → Workspace → **API & MCP** →
  **Create API key**, and keep it in an environment variable (`BRIGHTBEAN_API_KEY`), never
  in a committed file.

Once connected, the client sees up to 20 tools named `social_*`. Tools for permissions the
connection lacks are hidden. Load [`../SKILL.md`](../SKILL.md) into the agent's context as
well. The tool descriptions alone don't cover the rules about times, idempotency, Review
and confirmations.

| Client | OAuth | API key header | Snippet |
|---|---|---|---|
| Claude Code | yes (`/mcp`) | yes | below, [`claude-code.mcp.json`](claude-code.mcp.json) |
| claude.ai | yes (custom connector) | only orgs in the request-headers beta | below |
| Claude Desktop | yes (custom connector) | via the `mcp-remote` bridge | below, [`claude_desktop_config.json`](claude_desktop_config.json) |
| Cursor | yes | yes | [`cursor.mcp.json`](cursor.mcp.json) |
| VS Code (Copilot) | yes | yes | [`vscode.mcp.json`](vscode.mcp.json) |
| Codex CLI | yes (`codex mcp login`) | yes | [`codex.config.toml`](codex.config.toml) |
| ChatGPT (developer mode) | yes | **no** (ChatGPT can't send API keys) | below |
| Devin Desktop (ex-Windsurf) | yes | yes | below |
| Anything else | | | any client that speaks Streamable HTTP; see the raw examples in [`../examples/`](../examples/README.md) |

## Claude Code

OAuth:

```bash
claude mcp add --transport http brightbean https://api-platform.brightbean.xyz/api/v1/mcp
```

Then run `/mcp` in Claude Code, pick **brightbean** and sign in in the browser.

With a key:

```bash
claude mcp add --transport http brightbean https://api-platform.brightbean.xyz/api/v1/mcp \
  --header "Authorization: Bearer $BRIGHTBEAN_API_KEY"
```

- Your shell expands `$BRIGHTBEAN_API_KEY` when you run this, so the key itself is stored in
  `~/.claude.json`.
- For a project-shared `.mcp.json`, use [`claude-code.mcp.json`](claude-code.mcp.json). It
  keeps `${BRIGHTBEAN_API_KEY}` as a reference that Claude Code expands at start-up.
- A configured header that the server rejects is reported as a failure. Claude Code does
  not fall back to OAuth.

To also install the skill (this repo) so Claude knows the rules:

```bash
npx skills@^1 add brightbeanxyz/brightbean-platform-agent
# or: git clone https://github.com/brightbeanxyz/brightbean-platform-agent ~/.claude/skills/brightbean-platform
```

## claude.ai and Claude Desktop (custom connector, OAuth)

1. Open the **Connectors** settings and choose **Add custom connector**.
   - On Team and Enterprise plans, an owner adds it under Organization settings →
     Connectors. Each member then clicks **Connect**.
2. URL: `https://api-platform.brightbean.xyz/api/v1/mcp`
3. Leave authentication on sign-in, with automatic client registration.
4. Connect. A BrightBean page opens. Sign in, pick the workspace, the channels and the
   permissions, then click **Allow**.

To disconnect, remove the connector in Claude. The connection also shows in BrightBean
under Settings → API & MCP → **Connected apps**, where it can be disconnected.

A connector added on claude.ai also appears in Claude Desktop and in Claude Code, when they
are signed in to the same account.

### Claude Desktop with an API key

Claude Desktop's config file only runs local (stdio) servers. To use a key instead of OAuth,
run the remote server through the [`mcp-remote`](https://github.com/geelen/mcp-remote)
bridge. See [`claude_desktop_config.json`](claude_desktop_config.json).

The file goes in `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS,
or `%APPDATA%\Claude\claude_desktop_config.json` on Windows. Restart Claude Desktop after
editing it.

The header is written as `Authorization:${AUTH_HEADER}` with `AUTH_HEADER="Bearer …"`, so
there is no space inside `args`. Some clients break arguments that contain spaces.

## Cursor

`~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):
- **With a key:** use [`cursor.mcp.json`](cursor.mcp.json). `${env:BRIGHTBEAN_API_KEY}` is
  read from Cursor's environment.
- **With OAuth:** leave out `headers`, and Cursor offers a sign-in.

## VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json` in the workspace, or **MCP: Open User Configuration**:
- **With a key:** use [`vscode.mcp.json`](vscode.mcp.json). VS Code asks for the key once and
  stores it securely. Use `${input:…}`: `${env:…}` in `headers` isn't documented to work.
- **With OAuth:** leave out `inputs` and `headers`.

## Codex CLI

```bash
codex mcp add brightbean --url https://api-platform.brightbean.xyz/api/v1/mcp --bearer-token-env-var BRIGHTBEAN_API_KEY
# OAuth instead:
codex mcp add brightbean --url https://api-platform.brightbean.xyz/api/v1/mcp     # starts the sign-in
```

Or edit `~/.codex/config.toml` directly; see [`codex.config.toml`](codex.config.toml).

## ChatGPT (developer mode)

Settings → Security and login → Developer mode. Then add an app with the URL above, and
choose OAuth. ChatGPT cannot send API keys.

## Devin Desktop (formerly Windsurf)

`~/.config/devin/mcp_config.json`:

```json
{ "mcpServers": { "brightbean": {
    "serverUrl": "https://api-platform.brightbean.xyz/api/v1/mcp",
    "headers": { "Authorization": "Bearer ${env:BRIGHTBEAN_API_KEY}" } } } }
```

Leave out `headers` for OAuth.

## Clients that only speak stdio

Use the [`mcp-remote`](https://github.com/geelen/mcp-remote) bridge as in the Claude Desktop
snippet, or use the REST API directly. Everything MCP does is also at `/api/v1/...`, except
the single-call base64 upload.

## What has been tested

| Path | Status |
|---|---|
| Raw JSON-RPC over HTTP with a key (`examples/*/11_*`) | Run against a local BrightBean server on 2026-10-02: `initialize`, `tools/list` (20 tools), `tools/call` |
| Official MCP TypeScript SDK (`StreamableHTTPClientTransport`) with a key header | Run against a local server on 2026-10-02 |
| Claude Code with a key header | Tested during the server's development, on its earlier `/mcp` path |
| OAuth flow (discovery → registration → PKCE → consent → token) | Tested with MCP Inspector during development, on the earlier `/mcp` path. Production's discovery documents were checked on 2026-10-02. |
| claude.ai / Claude Desktop connectors, Cursor, VS Code, Codex, ChatGPT, Devin | Snippets follow each vendor's documentation (checked 2026-10-02); not yet run end to end against production |

If a client fails to connect, check:
- the URL is exact;
- a key is for the right environment (`bb_live_` for production);
- the client sends `Accept: application/json, text/event-stream`.

Then try the raw example in [`../examples/`](../examples/README.md) with the same key, to
tell a client problem from a key problem.
