# Polling for changes

Publishing happens in the background. To learn when a post went live (or failed), poll.
BrightBean makes "nothing changed" cheap. Use one of the two methods below.

## 1. ETag (`If-None-Match`): watch one post or one list

`GET /api/v1/posts/` and `GET /api/v1/posts/{id}` return an `ETag` header. Send it back:

```http
GET /api/v1/posts/c0ffee…
If-None-Match: "p1.1790000000000.3f2a9c0d1e2b4a5f"
```

- Nothing changed → **`304 Not Modified`**, no body. It is answered without touching the
  database.
- Something changed → `200` with the new body and a new ETag.

Only these two routes send ETags. A 304 still counts toward the read limit
(300 a minute).

⚠️ **A 200 doesn't prove something changed.** The server can't always answer 304, and
then sends a full `200` with a new ETag even though nothing changed. This happens:
- for four minutes four times an hour (minutes 07–10, 22–25, 37–40 and 52–55 UTC), when
  it reads the database to be sure;
- briefly after any write in the workspace.

Compare the content (`updatedAt`, the channel statuses) before acting on a 200.

## 2. `updatedSince`: what changed across all posts

```http
GET /api/v1/posts/?updatedSince=2026-10-02T19:59:30.000Z
```

1. Start with a normal `GET /api/v1/posts/`, and keep its `serverTime`.
2. Next time, pass that `serverTime` as `updatedSince`, and keep the new `serverTime`.
3. Repeat.

Details:
- With `updatedSince`, posts come **oldest change first**. Follow `nextCursor` until it is
  `null`.
- `serverTime` is set **30 seconds early** on purpose, so nothing slips between two polls.
  You will see some posts twice: de-duplicate by `id` (keep the newer `updatedAt`).
- When nothing changed, the answer is `{"data": [], "nextCursor": null, "serverTime": <your updatedSince>}`.
  Keep using the same time.
- Posts that didn't change can come back too (the 30-second overlap, and reads during the
  windows above). De-duplicate.
- A change can take **up to a minute** to show.
- **Deleted posts are never reported.** A post you knew about that now answers 404 was
  deleted, or moved out of this key's channels.

MCP: `social_list_posts` with `updatedSince`. Its sentence says `No changes since <time>.`
when nothing moved.

## How often

| Waiting for | Poll every |
|---|---|
| A publish-now to finish | 10–30 seconds, for a few minutes |
| A scheduled post, near its time | 1 minute |
| A dashboard / sync | 5–15 minutes |
| Analytics | Hourly at most (see [analytics.md](analytics.md)) |

Every channel of a post settles on its own. The post is done when no channel is
`publishing`, `scheduled` or `queued`. Then read `published` + `url`, or `failed` + `error`,
on each channel.
