# For AI agents

This repository teaches you to use **BrightBean** (platform.brightbean.xyz) to draft, schedule,
queue, publish and measure social posts, over its MCP server or its REST API.

**Read [`SKILL.md`](SKILL.md) first.** It is self-contained for normal use: how to connect,
the first call to make, every tool and endpoint, and the rules that matter. Go to
[`reference/`](reference/) when you need detail, and to [`examples/`](examples/) for
working code.

The essentials:

- MCP server: `https://api-platform.brightbean.xyz/api/v1/mcp` (Streamable HTTP; OAuth, or `Authorization: Bearer <key>`).
- REST API: `https://api-platform.brightbean.xyz/api/v1` (`Authorization: Bearer <key>`, plus your own `User-Agent`).
- The key comes from the user: Settings → Workspace → API & MCP → Create API key. Read it from
  `BRIGHTBEAN_API_KEY`. Never ask for it in chat, and never write it to a file in a repository.
- Start with `social_list_accounts` (MCP) or `GET /api/v1/me/` (REST). Never invent ids.
- Times need an offset. Send an idempotency key on writes. Confirm with the user before
  anything is published or scheduled.

## Working on this repository itself

- The docs describe the live API. `node scripts/check-drift.mjs` checks them against it:
  `docs/openapi.json`, docs coverage of every operation and tool, and the MCP `tools/list`
  when `BRIGHTBEAN_API_KEY` is set. Run it after any change, and keep it passing.
  `--offline` checks only the docs against the snapshots.
- Where the live OpenAPI spec and the server disagree, the docs follow the server. They
  list the differences in `reference/rest-api.md` ("Where the OpenAPI spec is wrong").
- Examples must keep working in all three languages, and must send their own `User-Agent`.
