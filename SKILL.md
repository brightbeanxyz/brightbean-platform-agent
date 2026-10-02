---
name: brightbean-platform
description: |
  Draft, schedule, queue, publish, duplicate and track social posts through BrightBean
  (platform.brightbean.xyz), and read their analytics. Covers Facebook, Instagram, Threads,
  LinkedIn, TikTok, YouTube, Pinterest, Bluesky, Mastodon, Google Business and DEV (dev.to).
  Use when the user wants to post or schedule something through their BrightBean workspace,
  check or change posts already there, upload media for a post, or see how posts and
  channels perform. Works over the BrightBean MCP server (tools named `social_*`, at
  https://api-platform.brightbean.xyz/api/v1/mcp) or the REST API
  (https://api-platform.brightbean.xyz/api/v1). Needs a `bb_live_…` API key or an OAuth
  connection. Not for Brightbean Studio (studio.brightbean.xyz), which has its own skill.
---

# BrightBean platform: API and MCP

You can act on the user's social channels through their BrightBean workspace. Every call
runs as one **credential** (an API key, or an OAuth connection). A credential belongs to
one workspace. It may use only the channels picked for it, and do only what its
permissions allow.

## When to use this, and when not

Use it when the user wants to:
- write a post and put it out now, at a time, or in a queue, on one or more channels;
- see, change, reschedule, unschedule, duplicate or delete posts in BrightBean;
- upload an image or video for a post;
- read how a post or a channel performed.

Don't use it:
- **For copy only, with no posting.** Just write the copy.
- **For networks BrightBean doesn't publish to** (X/Twitter, Reddit, Substack, …).
- **For connecting or reconnecting channels, approving posts, or managing queues and
  posting times.** People do these in the web app.
- **For Brightbean Studio** (`studio.brightbean.xyz`, keys starting `bb_studio_`). It is a
  different product with a different API.

## 1. Connect

| You are… | Use |
|---|---|
| An MCP client with OAuth (claude.ai, Claude Desktop, Claude Code `/mcp`, Cursor, VS Code) | Add `https://api-platform.brightbean.xyz/api/v1/mcp` as a remote MCP server. The client opens a sign-in; the user picks workspace, channels and permissions. No key needed. |
| An MCP client with a key | Same URL, plus the header `Authorization: Bearer <key>` |
| A script / backend / agent without MCP | REST at `https://api-platform.brightbean.xyz/api/v1`, with `Authorization: Bearer <key>` |

**Check for tools first.** If tools named `social_list_accounts`, `social_create_draft` and
so on are available, the BrightBean MCP server is connected: use them. If not, use REST,
or help the user connect (see [`mcp/`](mcp/README.md)).

**Getting a key (the user does this; you can't):**
1. Open [platform.brightbean.xyz/settings/workspace/api](https://platform.brightbean.xyz/settings/workspace/api)
   (Workspace settings → **API & MCP**), and click **Create API key**. Only owners and
   admins can.
2. Pick channels and permissions. Tick **Publish and schedule without approval**
   (`publish_directly`) only if posts may go live without review.
3. Copy the key; it is shown once.
4. Store it as `BRIGHTBEAN_API_KEY`. **Never ask the user to paste a key into the chat.**

Keys look like `bb_live_<43 chars>_<8 chars>` (production). `bb_staging_` keys work only on
`https://api-platform-staging.brightbean.xyz`, and `bb_local_` keys only on a local dev
server.

**Base URL.** REST is always `<base>/api/v1`, and MCP is `<base>/api/v1/mcp`. The base is
`https://api-platform.brightbean.xyz` unless the user says otherwise. The examples read an
override from `BRIGHTBEAN_API_URL` (a base only, no `/api/v1`).

**Raw MCP without a client** (stateless: no `initialize` or session id needed):
```bash
curl -sS "${BRIGHTBEAN_API_URL:-https://api-platform.brightbean.xyz}/api/v1/mcp" \
  -H "Authorization: Bearer $BRIGHTBEAN_API_KEY" -H "User-Agent: my-agent/1.0" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"social_list_accounts","arguments":{}}}'
```

**Every REST request:**
```
Authorization: Bearer $BRIGHTBEAN_API_KEY
User-Agent: <your-client>/1.0                 ← required in practice, see below
Content-Type: application/json                ← with a body
Idempotency-Key: <unique per intent>          ← on writes
```

⚠️ Cloudflare blocks Python's default `Python-urllib/3.x` User-Agent with a plain-text
`403 error code: 1010`. Always set your own User-Agent. `requests`, `httpx`, curl and Node
already send acceptable ones.

## 2. First call, every session

- MCP: `social_list_accounts` (no arguments).
- REST: `GET /api/v1/me/` (workspace, effective permissions, channels), then
  `GET /api/v1/accounts/` (each channel's capabilities).

From the answer, keep:
- each channel's `id`. **Never invent or guess ids.**
- `needsReconnect`. If it is true, a person must reconnect the channel in the app first.
- `capabilities`: `charLimit`, `title {supported, required, maxChars}`, `firstComment`,
  `link`, `boardRequired`, `mediaRequired` (`video` | `visual` | null), `optionsKey`.
- `queues`: named queues, for `queueIds`. The Main queue isn't listed; it is `null`.
- your permissions: `me.permissions` over REST, or which tools `tools/list` shows over MCP.

## 3. The operations

### MCP tools (20) and their REST twins

| Tool | Permission | REST | Key arguments |
|---|---|---|---|
| `social_list_accounts` | read | `GET /accounts/` | none |
| `social_list_boards` | read | `GET /accounts/{id}/boards` | `accountId` (Pinterest) |
| `social_get_tiktok_creator_info` | read | `GET /accounts/{id}/tiktok-creator-info` | `accountId`. Call it before **every** TikTok post |
| `social_list_youtube_categories` | read | `GET /accounts/{id}/youtube-categories` | `accountId` |
| `social_list_posts` | read | `GET /posts/` | `status?` (comma list), `accountId?`, `updatedSince?`, `cursor?`, `limit?` ≤100 |
| `social_get_post` | read | `GET /posts/{id}` | `postId` |
| `social_create_draft` | create_posts | `POST /posts/` | `accounts`[1–20], `caption`, `title?`, `firstComment?`, `linkUrl?`, `perAccount?`, `mediaAssetIds?`, `proposedPublishAt?`, `delivery?`, `idempotencyKey?` |
| `social_update_draft` | create_posts | `PATCH /posts/{id}` | `postId` + fields to change (`null` clears). **No `idempotencyKey`.** |
| `social_duplicate_post` | create_posts | `POST /posts/{id}/duplicate` | `postId`, `idempotencyKey?` |
| `social_submit_post` | create_posts | `POST /posts/{id}/submit` | `postId`, `delivery`, `idempotencyKey?` |
| `social_withdraw_post` | create_posts | `POST /posts/{id}/withdraw` | `postId` |
| `social_delete_draft` | create_posts (+publish_directly if scheduled/queued) | `DELETE /posts/{id}` | `postId` |
| `social_schedule_post` | publish_directly | `POST /posts/{id}/schedule` | `postId`, `mode` (`at`\|`queue`\|`prioritise`), `at?`, `queueIds?`, `timezone?`, `idempotencyKey?` |
| `social_publish_now` | publish_directly | `POST /posts/{id}/publish` | `postId`, `idempotencyKey?` |
| `social_cancel_post` | publish_directly | `POST /posts/{id}/cancel` | `postId`, `idempotencyKey?` |
| `social_upload_media` | upload_media | MCP only | `mediaType` (`image`\|`video`\|`gif`\|`document`), `bytesBase64` (≤20 MB), `altText?` |
| `social_request_media_upload` | upload_media | `POST /media/uploads` | `mediaType` (`image`\|`video`\|`gif`), `sizeBytes`, `altText?` |
| `social_sign_upload_parts` | upload_media | `POST /media/uploads/{id}/parts` | `uploadId` (= the **mediaAssetId**), `fromPart`, `count` ≤16 |
| `social_finalize_media_upload` | upload_media | `POST /media/uploads/{id}/complete` | `uploadId` (= the **mediaAssetId**), `parts` [{partNumber, etag}] |
| `social_get_analytics` | view_analytics | `GET /analytics/posts/{id}`, `GET /analytics/accounts/{id}` | exactly one of `postId` / `accountId` (`windowDays` 30 only) |

REST-only: `GET /api/v1/me/`. All REST paths start with `/api/v1`, and a trailing slash
is optional.

**Delivery** (in `delivery`, or as the `/schedule` body):
`{"mode":"at","at":"2026-10-06T09:00:00+02:00"}` · `{"mode":"now"}` · `{"mode":"queue"}` ·
`{"mode":"prioritise"}`.
- Queue modes take an optional `queueIds: {"<accountId>": "<queueId>"|null}`.
- Every mode, and `social_schedule_post`, takes an optional `timezone` (IANA, e.g.
  `"Europe/Berlin"`). It only changes how replies word the time, so pass the user's zone.

**Per channel** (`perAccount`, keyed by channel id): `caption`, `title`, `firstComment`
(`""` = none on this channel), `boardId` (Pinterest), and `options`:
- `tiktok`: `privacyLevel`, `allowComment`/`allowDuet`/`allowStitch`, disclosure flags, `aiGenerated`, `coverMs`
- `youtube`: `privacyStatus`, `madeForKids`, `tags`, `categoryId`, `thumbnail`
- `facebook`: `publishAs` (`video`|`reel`)
- `devto`: `tags`, `canonicalUrl`

The channel's `optionsSchema` has the exact JSON Schema.

### What comes back

- **Writes** answer `{post, routed}`. `routed` is one of:
  - `draft`: saved;
  - `enacted`: scheduled, queued or publishing;
  - `pending_approval`: sent to Review, waiting for a person.
- **A Post** has `id`, `status`, `caption`, `mediaAssetIds`, `scheduledAt`, `publishedAt`
  and `channels[]`. Each channel has its own `status` (`draft`, `queued`, `scheduled`,
  `publishing`, `published`, `failed`), `url` (when live) and `error` (when failed).
- **MCP results** are usually two text items: a sentence for people, then the JSON. Parse
  `content[1].text` when it exists.
  - `social_delete_draft` returns only `Deleted.`.
  - Errors are `isError: true` with one text item (the reason), not JSON-RPC errors.
  - Raw JSON-RPC callers must send `Accept: application/json, text/event-stream`.
- **REST errors** are `{"error": "<code>", "detail": "<sentence>"}`.

## 4. Rules that matter

1. **Times need an offset.** Use `2026-10-06T09:00:00+02:00`, not `2026-10-06T09:00:00`.
   - A missing offset is refused as `<path>: Invalid datetime` (e.g. `delivery.at: Invalid datetime`).
   - A time more than 60 s in the past is refused.
   - Ask for the user's time zone if you don't know it.
   - Say the time back in words before scheduling.
2. **Confirm before anything goes public.** Show the final copy, the channels and the time,
   and wait for a clear yes before:
   - `delivery` with `now`;
   - `social_publish_now` / `/publish`;
   - scheduling.

   Drafts are safe to create without asking.
3. **Always send an idempotency key on writes.** `Idempotency-Key` header, or
   `idempotencyKey` in the body or arguments. Use a fresh value per intent, and the same
   value for retries.
   - A retry is never repeated within 24 h.
   - The same key with a different body is a 422.
   - **Writes that take no `idempotencyKey`:** `social_update_draft` / PATCH,
     `social_delete_draft` / DELETE, `social_sign_upload_parts` and
     `social_finalize_media_upload` (REST `/parts`, `/complete`).
     - Passing one as an argument or body field is refused. Over MCP that is an `isError`;
       over REST, a 422.
     - Over REST the `Idempotency-Key` header is simply ignored on these.
4. **Prefer two steps:** create the draft, confirm, then schedule/submit/publish. If a
   delivery inside `create` fails its own checks (missing media, daily cap), the draft is
   left behind, but the error doesn't carry its id.
5. **Report `routed` honestly.** `pending_approval` means not scheduled yet: a person must
   approve it in BrightBean Review.
   - It happens when the credential lacks `publish_directly`, or the workspace requires
     approval.
   - Without `publish_directly`, use `submit` (MCP `social_submit_post`). The schedule,
     publish and cancel tools won't be listed.
6. **Respect each channel's `capabilities` before writing.**
   - Stay under `charLimit` on every channel. Use `perAccount[id].caption` for a shorter one.
   - A `firstComment` on a channel that can't take one fails the whole call. Set
     `perAccount[id].firstComment = ""` for those.
   - TikTok and YouTube need a video. Instagram and Pinterest need an image or video.
   - Pinterest needs `boardId` (from boards) and usually `title` and `linkUrl`.
   - TikTok needs `options.tiktok.privacyLevel` from a fresh creator-info read.
   - DEV needs a `title`.
7. **Only drafts can be edited.**
   - A scheduled post: `cancel` → edit → schedule again (or just `schedule` again to
     re-time it).
   - A post waiting for approval: `withdraw` → edit → `submit`.
   - A key can only edit posts its creator wrote.
8. **404 `Not found.` also means "not visible to this credential".** Don't probe other ids.
9. **Media goes in by id.** Upload first and pass `mediaAssetIds`; URLs can't be attached.
   - Up to 20 MB: `social_upload_media` (MCP, base64).
   - Larger: the presigned upload ([reference/media-uploads.md](reference/media-uploads.md)).
     PUT the parts without an `Authorization` header, keep each part's ETag, then complete.
10. **Limits.**
    - 120 writes and 300 reads per minute per credential; 1000 writes a minute per
      workspace. A 429 carries `Retry-After: 60`.
    - Each channel also has a daily cap:
      - for a set time or the queue: 422 `platform_quota` with `available_at`;
      - for publish-now: 429 with `retry_after`.
      - Offer `available_at` to the user.
11. **Polling is cheap.**
    - Use `If-None-Match` with the ETag of `GET /posts/` or `GET /posts/{id}` (→ 304).
    - Or use `updatedSince` = the last `serverTime`. It overlaps by 30 s, so de-duplicate by `id`.
    - Analytics refresh at most hourly. A missing metric key means "not reported", not 0.
12. **Show `detail` (or the MCP error text) to the user word for word.** It names what to fix.

## 5. Common requests

| User says | Do |
|---|---|
| "What channels do I have?" | `social_list_accounts` and summarise; flag `needsReconnect` |
| "Post this on LinkedIn tomorrow 9am" | list accounts → `social_create_draft` → confirm → `social_schedule_post {mode:"at", at:"…+02:00", timezone:"Europe/Berlin"}` (or `social_submit_post` without publish rights) |
| "Add it to the queue" | `social_schedule_post {mode:"queue"}` (or `submit` with `delivery {mode:"queue"}`) |
| "Post it now" | confirm → `social_publish_now` → poll `social_get_post` until no channel is `publishing` → report URLs |
| "Move it to Friday" | `social_schedule_post {mode:"at", at:<Friday>}` (re-times in place) |
| "Change the text" | scheduled: `social_cancel_post` → `social_update_draft` → reschedule; draft: `social_update_draft` |
| "Don't post it" | `social_cancel_post` keeps it as a draft. To remove it entirely, `social_delete_draft` (deleting a scheduled or queued post directly needs `publish_directly`; otherwise cancel first, then delete). |
| "What's scheduled this week?" | `social_list_posts {status:"scheduled,queued"}` |
| "How did it do?" | `social_get_analytics {postId}` |
| "Post this video to TikTok" | upload → `social_get_tiktok_creator_info` → create with `options.tiktok.privacyLevel` → confirm → deliver |

## Reference

- [reference/overview.md](reference/overview.md): objects, statuses, REST vs MCP
- [reference/authentication.md](reference/authentication.md): keys, permissions, OAuth flow
- [reference/rest-api.md](reference/rest-api.md): every endpoint, field and response
- [reference/mcp-tools.md](reference/mcp-tools.md): every tool, result format, MCP errors
- [reference/posts-and-delivery.md](reference/posts-and-delivery.md): statuses, delivery, Review, `perAccount`, options
- [reference/platforms.md](reference/platforms.md): per-network limits and rules
- [reference/media-uploads.md](reference/media-uploads.md): small and multipart uploads
- [reference/analytics.md](reference/analytics.md): metrics and freshness
- [reference/polling.md](reference/polling.md): ETags and `updatedSince`
- [reference/errors.md](reference/errors.md): every error and what to do
- [reference/rate-limits.md](reference/rate-limits.md): request limits and daily caps
- [reference/workflows.md](reference/workflows.md): recipes
- [examples/](examples/): runnable Python, Node and shell scripts
- [mcp/](mcp/README.md): MCP client setup
- [docs/openapi.json](docs/openapi.json) and [docs/mcp-tools.json](docs/mcp-tools.json): machine-readable snapshots
