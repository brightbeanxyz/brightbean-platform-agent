# Rate limits and daily caps

There are two separate things: **request limits** (how fast you call) and **daily caps**
(how many posts a channel publishes per day).

## Request limits

| `tier` in the 429 | Limit | Counted per |
|---|---|---|
| `credential_writes` | 120 writes a minute | key / OAuth connection |
| `credential_reads` | 300 reads a minute (304s included) | key / OAuth connection |
| `workspace_writes` | 1000 writes a minute | workspace (all its keys together) |

Writes are POST, PATCH and DELETE, except `/media/uploads/{id}/parts`, which counts as a
read. In MCP:
- a `tools/call` counts as a read or a write, like its REST route;
- `initialize`, `tools/list` and `ping` count as reads;
- notifications aren't counted.

Windows are 60 seconds and counted per Cloudflare location.

Over the limit:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{"error": "rate_limited", "detail": "Too many requests. Try again in 60 seconds.",
 "tier": "credential_writes", "limit": 120, "remaining": 0, "retry_after": 60}
```

Wait `Retry-After` seconds (always 60), then go on. There are **no `X-RateLimit-*`
headers**, so pace yourself: about 1 write a second leaves plenty of room.

MCP:
- A rate-limited tool call returns `isError: true` with `Too many requests. Try again in 60 seconds.`
- A rate-limited `initialize`, `tools/list` or `ping` is a JSON-RPC error `-32000` with
  `data.retry_after`.

A wrong key is not rate-limited with a 429. After about 10 failed attempts a minute from one
IP, every attempt gets the same `401 That isn't a valid API key.`

## Daily caps per channel

Each channel may publish a limited number of posts in **any rolling 24 hours**. Scheduled,
queued and published posts all count, by the time they go out.

| Network | Posts per 24 h |
|---|---|
| Threads | 250 |
| Facebook | 200 |
| Bluesky, Mastodon | 200 each |
| LinkedIn, Pinterest | 100 each |
| YouTube, Google Business | 50 each |
| Instagram | 25 |
| TikTok | 15 |
| DEV | 10 |

A workspace admin can change a channel's cap. The answer depends on how you asked:

**Scheduled, queued or prioritised** (a fixed time; waiting doesn't help):

```http
HTTP/1.1 422
{"error": "platform_quota", "detail": "… The earliest time that fits is 2026-10-07T09:00:00.000Z.",
 "tier": "platform_quota:instagram", "limit": 25, "available_at": "2026-10-07T09:00:00.000Z"}
```

→ Offer the user `available_at` (or later), or a different channel.

**Publish now:**

```http
HTTP/1.1 429
Retry-After: 4271
{"error": "platform_quota", "detail": "…", "tier": "platform_quota:instagram", "limit": 25,
 "remaining": 0, "retry_after": 4271, "available_at": "2026-10-03T08:11:00.000Z"}
```

→ A slot frees in `retry_after` seconds. Ask the user whether to schedule it for
`available_at` instead of waiting.

`available_at` can be `null` when no slot was found within a week.
