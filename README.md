# brightbean-platform-agent

> **AI agent? Read [`SKILL.md`](SKILL.md) first.** It tells you how to connect to BrightBean
> and use every tool and endpoint correctly. Details are in [`reference/`](reference/).
> Runnable code is in [`examples/`](examples/README.md). An index with raw URLs is in
> [`llms.txt`](llms.txt).

Everything an AI agent needs to draft, schedule, queue, publish and measure social posts
through [BrightBean](https://platform.brightbean.xyz). That includes Claude Code, Claude
Desktop, claude.ai, Cursor, VS Code, Codex, OpenClaw, or a plain script calling an LLM.

BrightBean publishes to Facebook, Instagram, Threads, LinkedIn, TikTok, YouTube, Pinterest,
Bluesky, Mastodon, Google Business and DEV. It has two ways in, with the same rules:

| | Address | Auth |
|---|---|---|
| **MCP server** | `https://api-platform.brightbean.xyz/api/v1/mcp` | OAuth (sign in from the client) or `Authorization: Bearer <key>` |
| **REST API** | `https://api-platform.brightbean.xyz/api/v1` | `Authorization: Bearer <key>` |

Interactive API docs: <https://api-platform.brightbean.xyz/api/v1/docs>.

## Quick links

| Want | Look at |
|---|---|
| The skill an agent loads | [`SKILL.md`](SKILL.md) |
| How it all fits together | [`reference/overview.md`](reference/overview.md) |
| Keys, permissions, OAuth | [`reference/authentication.md`](reference/authentication.md) |
| Every REST endpoint | [`reference/rest-api.md`](reference/rest-api.md) |
| Every MCP tool | [`reference/mcp-tools.md`](reference/mcp-tools.md) |
| Statuses, scheduling, queues, Review, per-network options | [`reference/posts-and-delivery.md`](reference/posts-and-delivery.md) |
| Per-network limits | [`reference/platforms.md`](reference/platforms.md) |
| Uploading images and video | [`reference/media-uploads.md`](reference/media-uploads.md) |
| Analytics | [`reference/analytics.md`](reference/analytics.md) |
| Polling for changes | [`reference/polling.md`](reference/polling.md) |
| Errors and what to do | [`reference/errors.md`](reference/errors.md) |
| Rate limits and daily caps | [`reference/rate-limits.md`](reference/rate-limits.md) |
| Recipes | [`reference/workflows.md`](reference/workflows.md) |
| Python / Node / shell examples | [`examples/`](examples/README.md) |
| MCP client setup (Claude, Cursor, VS Code, Codex, ChatGPT…) | [`mcp/`](mcp/README.md) |
| OpenAPI and MCP tool snapshots | [`docs/openapi.json`](docs/openapi.json), [`docs/mcp-tools.json`](docs/mcp-tools.json) |

## Setup

### Step 1: access to BrightBean

Either way, the user decides which workspace, which channels, and what the agent may do.

- **OAuth (MCP clients only, no key):** add the MCP address to the client, and sign in when
  it asks. See [`mcp/`](mcp/README.md).
- **API key (REST, and MCP clients that take a header):** a workspace owner or admin opens
  [Settings → Workspace → API & MCP](https://platform.brightbean.xyz/settings/workspace/api) →
  **Create API key**, picks channels and permissions, and copies the key (shown once):
  ```bash
  export BRIGHTBEAN_API_KEY=bb_live_...
  ```
  Leave **Publish and schedule without approval** off if posts should go through Review
  before they go out.

### Step 2: connect your agent

**Claude Code: skill + MCP**

```bash
npx skills@^1 add brightbeanxyz/brightbean-platform-agent     # the skill
claude mcp add --transport http brightbean https://api-platform.brightbean.xyz/api/v1/mcp   # then /mcp to sign in
```

- Instead of `npx skills`, you can
  `git clone https://github.com/brightbeanxyz/brightbean-platform-agent ~/.claude/skills/brightbean-platform`.
- To use a key instead of OAuth, add `--header "Authorization: Bearer $BRIGHTBEAN_API_KEY"`.

**claude.ai / Claude Desktop:** add a custom connector with the MCP address and sign in
([`mcp/`](mcp/README.md#claudeai-and-claude-desktop-custom-connector-oauth)). For the rules,
add `SKILL.md` to the project's knowledge, or install it as a skill.

**Cursor, VS Code, Codex, ChatGPT, Devin:** ready-made configs in [`mcp/`](mcp/README.md).
Also put `SKILL.md` in the agent's context (or open this repo as the workspace; `AGENTS.md`
points there).

**OpenClaw, the OpenAI Agents SDK, your own agent:** give the agent `SKILL.md` (and
`reference/` if it can read files). Then either connect the MCP server, or let it call REST
with the key from the environment.

**No agent (Zapier, n8n, cron, a backend):** use REST. Start with
[`examples/`](examples/README.md):

```bash
curl https://api-platform.brightbean.xyz/api/v1/me/ \
  -H "Authorization: Bearer $BRIGHTBEAN_API_KEY" \
  -H "User-Agent: my-tool/1.0"
```

Always send your own `User-Agent`. Cloudflare blocks Python's default `Python-urllib` agent
with a plain-text `403 error code: 1010`.

## REST or MCP?

The two have the same handlers, permissions, limits, idempotency and activity log.

- **MCP** suits agents in an MCP client. Tools are typed, OAuth needs no key, and results come
  with a readable sentence.
- **REST** suits everything else. It also has `GET /api/v1/me/`, ETag-based polling, and
  plain HTTP status codes.

## Repo layout

```
SKILL.md               the skill (start here)
AGENTS.md, CLAUDE.md   pointers for coding agents that open this repo
llms.txt               index of raw links for agents that fetch over the web
reference/             deep-dive docs
examples/              python/ (requests), node/ (no deps), shell/ (curl + jq)
mcp/                   client configs and setup notes
docs/                  openapi.json and mcp-tools.json snapshots of the live API
scripts/check-drift.mjs   checks this repo against the live API
```

## Keeping it accurate

`node scripts/check-drift.mjs` compares `docs/openapi.json` with the live spec. It also
checks that every operation and tool is documented. With `BRIGHTBEAN_API_KEY` set, it
compares the live MCP `tools/list` too. A GitHub Action runs it weekly.

When the live OpenAPI spec and the server disagree, these docs follow the server (see
[rest-api.md](reference/rest-api.md#where-the-openapi-spec-is-wrong)).

## Versioning

This repo tracks BrightBean API version **1** (`/api/v1`, `info.version` in
[`docs/openapi.json`](docs/openapi.json)). A breaking change would come with a new path
version, and a matching update here.

## Not to be confused with

**Brightbean Studio** (`studio.brightbean.xyz`, keys `bb_studio_…`) is a separate product
with its own API. Its agent repo is
[brightbean-studio-agent](https://github.com/brightbeanxyz/brightbean-studio-agent).

## License

[MIT](LICENSE).
