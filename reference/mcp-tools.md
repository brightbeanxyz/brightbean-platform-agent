# MCP server reference

```
https://api-platform.brightbean.xyz/api/v1/mcp
```

(staging: `https://api-platform-staging.brightbean.xyz/api/v1/mcp`)

The same 20 tools work for every MCP client. Each tool **is** a REST route: same handler,
same permission, same validation, same limits. [rest-api.md](rest-api.md) has the object
shapes. This file covers what is specific to MCP. Client setup (Claude, Cursor, VS Code,
Codex…) is in [`../mcp/`](../mcp/README.md).

## Protocol facts

| | |
|---|---|
| Transport | Streamable HTTP. `POST` only. Stateless: there is no `Mcp-Session-Id`, and each request stands alone. |
| Answers | Always plain JSON (`enableJsonResponse`), never an SSE stream. `GET` is 405. |
| Auth | `Authorization: Bearer <API key or OAuth access token>`. No token → 401 with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/v1/mcp"`, which starts OAuth in clients that support it. |
| Protocol versions | `2025-11-25` (default), `2025-06-18`, `2025-03-26`, `2024-11-05`, `2024-10-07`. A supported requested version is echoed back. |
| Server | `serverInfo: {name: "BrightBean", title: "BrightBean", version: "1.0.0"}`; capabilities `{tools: {listChanged: false}}` only. There are no resources and no prompts. |
| Methods | `initialize`, `notifications/initialized` (→ HTTP 202), `ping`, `tools/list`, `tools/call`. Anything else is `-32601 Method not found`. |
| Batching | JSON-RPC arrays work. `initialize` must be alone in its batch. |
| Body limit | About 28 MB, enough for a 20 MB file as base64 in `social_upload_media`. Larger is HTTP 413. |

### Talking to it without an SDK

Send both of these headers. The server refuses a request without them (406 / 415):

```
Content-Type: application/json
Accept: application/json, text/event-stream
```

```bash
curl -sS https://api-platform.brightbean.xyz/api/v1/mcp \
  -H "Authorization: Bearer $BRIGHTBEAN_API_KEY" \
  -H "User-Agent: my-agent/1.0" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"social_list_accounts","arguments":{}}}'
```

Because the server is stateless, a raw client can call `tools/call` without an
`initialize` first. MCP SDK clients will still run `initialize`, and that is fine.

`initialize` returns these `instructions`, which MCP clients pass to the model:

> BrightBean drafts, schedules and publishes social posts for one workspace. Start with
> social_list_accounts: it gives each channel's id and what the channel can take. Every time
> needs its offset (2026-10-06T09:00:00+02:00). Without publish rights, or when the workspace
> requires approval, a delivery goes to BrightBean Review, where a person approves it. Pass
> an idempotencyKey on writes, so a retry never posts twice.

## What a tool answers

There is no `structuredContent`. A successful call returns `content` with **two text items**:

1. A sentence for people, e.g. `Scheduled for Tue 6 Oct, 09:00 Europe/Berlin on LinkedIn @acme. Post c0ffee…. Open it in BrightBean: https://platform.brightbean.xyz/w/…/compose/…?tab=composer`.
2. The REST response body as compact JSON. Parse this one: `JSON.parse(result.content[1].text)`.

`social_delete_draft` returns the single text `Deleted.`.

```jsonc
{"jsonrpc":"2.0","id":3,"result":{"content":[
  {"type":"text","text":"Saved as a draft (post c0ffee…). Open it in BrightBean: https://…"},
  {"type":"text","text":"{\"post\":{\"id\":\"c0ffee…\",…},\"routed\":\"draft\"}"}
]}}
```

The sentence for a write tells you what happened:

| `routed` | Sentence starts with |
|---|---|
| `pending_approval` | `Sent for approval. It won't be scheduled until someone approves it in BrightBean Review.` |
| `draft` | `Saved as a draft` / `Draft updated` / `Duplicated as a new draft` / `Withdrawn from Review. It is a draft again` / `Unscheduled. It is a draft again` |
| `enacted` | One line per channel: `Scheduled for …`, `Added to the queue on …`, `Publishing now on …`, `Published on …: <url>`, `Failed on …: <error>` |

Times in the sentences use the `timezone` you passed. Without one, they use the channel's
posting-schedule zone, else UTC.

## When a tool fails

A failing tool is **not** a JSON-RPC error. It is a normal result with `isError: true` and
one text item, usually the REST `detail`:

```jsonc
{"jsonrpc":"2.0","id":4,"result":{"isError":true,"content":[{"type":"text","text":"missing permission: publish_directly"}]}}
```

| Text | Meaning |
|---|---|
| `There's no tool called <name> here.` | Wrong tool name |
| `This connection can't do that: it doesn't have "<label>". Someone in the workspace can change that in Settings → API & MCP.` | The tool exists but needs a permission this connection lacks (it is hidden from `tools/list` too) |
| `missing permission: <permission>` | Missing permission (e.g. deleting a scheduled post without `publish_directly`) |
| `Not found.` | No such post or channel, or one this connection can't see |
| `` `postId` must be an id (a UUID).`` | Bad id argument |
| `<tool> takes no argument called <names>.` | An unknown argument on a tool that takes nothing, or only an id (`social_get_post`, `social_delete_draft`, the account tools…). On other tools an unknown argument reads `body: Unrecognized key(s) in object: '<name>'`. |
| `<path>: <message>; …` | Validation failed (up to 5 issues) |
| `this key may not post to channel <ids>. …` | A channel not on this connection |
| `that time (<at>) is in the past` | `at` more than 60 s ago |
| `<Network> @<handle> can't take a first comment. …` | Drop `firstComment` for that channel |
| `Too many requests. Try again in 60 seconds.` | Rate limit (see [rate-limits.md](rate-limits.md)) |
| `… The earliest time that fits is <iso>.` | The channel's daily cap is full; pick that time or later. The sentence may appear twice. |
| `Something went wrong on our side. Try again.` | Server error |

Real JSON-RPC errors happen only at the protocol level:
- `-32700`: the body isn't JSON (HTTP 400).
- `-32601`: unknown method.
- `-32600`: a bad batch.
- `-32000`: a rate-limited `initialize` / `tools/list` / `ping`. It comes with
  `data.retry_after` and a `Retry-After` header.

## Which tools a connection sees

`tools/list` lists only the tools the credential's permissions allow. A key without
`publish_directly` never sees `social_schedule_post`, `social_publish_now` or
`social_cancel_post`. A read-only connection sees the six read tools plus nothing else.

## Tools

Every id argument is a UUID string. Every time is ISO 8601 **with an offset**.

| Tool | Title | Permission | Kind | REST equivalent |
|---|---|---|---|---|
| `social_list_accounts` | List channels | `read` | read | `GET /api/v1/accounts/` |
| `social_list_boards` | List Pinterest boards | `read` | read | `GET /api/v1/accounts/{id}/boards` |
| `social_get_tiktok_creator_info` | Read TikTok settings | `read` | read | `GET /api/v1/accounts/{id}/tiktok-creator-info` |
| `social_list_youtube_categories` | List YouTube categories | `read` | read | `GET /api/v1/accounts/{id}/youtube-categories` |
| `social_list_posts` | List posts | `read` | read | `GET /api/v1/posts/` |
| `social_get_post` | Read a post | `read` | read | `GET /api/v1/posts/{id}` |
| `social_create_draft` | Create a post | `create_posts` | write | `POST /api/v1/posts/` |
| `social_update_draft` | Edit a draft | `create_posts` | write | `PATCH /api/v1/posts/{id}` |
| `social_duplicate_post` | Duplicate a post | `create_posts` | write | `POST /api/v1/posts/{id}/duplicate` |
| `social_submit_post` | Send a draft on | `create_posts` | write | `POST /api/v1/posts/{id}/submit` |
| `social_withdraw_post` | Withdraw from Review | `create_posts` | write | `POST /api/v1/posts/{id}/withdraw` |
| `social_delete_draft` | Delete a post | `create_posts` | destructive | `DELETE /api/v1/posts/{id}` |
| `social_schedule_post` | Schedule a post | `publish_directly` | destructive | `POST /api/v1/posts/{id}/schedule` |
| `social_publish_now` | Publish now | `publish_directly` | destructive | `POST /api/v1/posts/{id}/publish` |
| `social_cancel_post` | Unschedule a post | `publish_directly` | destructive | `POST /api/v1/posts/{id}/cancel` |
| `social_upload_media` | Upload a small file | `upload_media` | write | none (MCP only) |
| `social_request_media_upload` | Start a large upload | `upload_media` | write | `POST /api/v1/media/uploads` |
| `social_sign_upload_parts` | Get more upload URLs | `upload_media` | write | `POST /api/v1/media/uploads/{id}/parts` |
| `social_finalize_media_upload` | Finish a large upload | `upload_media` | write | `POST /api/v1/media/uploads/{id}/complete` |
| `social_get_analytics` | Read analytics | `view_analytics` | read | `GET /api/v1/analytics/accounts/{id}` and `/analytics/posts/{id}` |

The exact `inputSchema` of every tool is in [`../docs/mcp-tools.json`](../docs/mcp-tools.json).

### `social_list_accounts`

No arguments. Returns `{ "data": [Account] }`: the channels this connection may use, each
with `capabilities`, `optionsSchema` and `queues`. **Call it first.** Never invent a
channel id.

### `social_list_boards`

| Argument | Req? | Notes |
|---|---|---|
| `accountId` | yes | A Pinterest channel |

Returns `{ "data": [{id, name, privacy?, pinCount?}] }`. Put a board's `id` in
`perAccount[<accountId>].boardId`.

### `social_get_tiktok_creator_info`

| Argument | Req? |
|---|---|
| `accountId` | yes |

Returns the creator info object: `privacyLevelOptions`, `commentDisabled`, `duetDisabled`,
`stitchDisabled`, `maxVideoPostDurationSec`, `canPost`, `cannotPostReason`. Call it
**before every TikTok post**, then set `options.tiktok.privacyLevel` to one of
`privacyLevelOptions`.

### `social_list_youtube_categories`

| Argument | Req? |
|---|---|
| `accountId` | yes |

Returns `{ regionCode, categories: [{id, title}] }`, for `options.youtube.categoryId`.

### `social_list_posts`

| Argument | Type | Notes |
|---|---|---|
| `status` | string | Comma-separated statuses, e.g. `"scheduled,queued"` |
| `accountId` | uuid | One channel |
| `updatedSince` | date-time | The previous answer's `serverTime` |
| `cursor` | uuid | The previous page's `nextCursor` |
| `limit` | 1–100 | Default 50 |

Returns `{ data: [Post], nextCursor, serverTime }`.

### `social_get_post`

| Argument | Req? |
|---|---|
| `postId` | yes |

Returns the Post with every channel's `status`, `scheduledAt`, `publishedAt`, `url` and `error`.

### `social_create_draft`

| Argument | Type | Req? | Notes |
|---|---|---|---|
| `accounts` | uuid[] 1–20 | yes | From `social_list_accounts` |
| `caption` | string | yes | |
| `title` | string | no | YouTube, Pinterest; required for DEV |
| `firstComment` | string | no | Refused if any channel can't take one: drop it with `perAccount[id].firstComment = ""` |
| `linkUrl` | string ≤2048 | no | Pinterest only |
| `perAccount` | object | no | `{ "<accountId>": { caption?, title?, firstComment?, boardId?, options? } }` |
| `mediaAssetIds` | uuid[] ≤20 | no | From an upload |
| `proposedPublishAt` | date-time \| null | no | A note only |
| `delivery` | object | no | `{mode:"at", at}` · `{mode:"now"}` · `{mode:"queue"\|"prioritise", queueIds?}`; all take an optional `timezone` |
| `idempotencyKey` | string 1–128 | no | **Always send one** |

Returns `{ post, routed }`. A refused `delivery` may leave the draft behind: the delivery's
own checks, such as missing media or the daily cap, run after the draft is made. Retry with
the **same** `idempotencyKey` to reuse it, or find it with `social_list_posts`
(`status: "draft"`). A time in the past or an unsupported first comment is refused before
anything is created.

### `social_update_draft`

| Argument | Req? | Notes |
|---|---|---|
| `postId` | yes | |
| `accounts`, `caption`, `title`, `firstComment`, `linkUrl`, `perAccount`, `mediaAssetIds`, `proposedPublishAt` | no | Left out = unchanged; `null` clears (except `accounts`, `caption`, `mediaAssetIds`). `mediaAssetIds` replaces the list. `perAccount[id].options` merges field by field. |

⚠️ This tool has **no `idempotencyKey`** argument, and passing one fails validation. A post
in `pending_approval` must be withdrawn first with `social_withdraw_post`. Only drafts can
be edited.

### `social_duplicate_post`

| Argument | Req? |
|---|---|
| `postId` | yes |
| `idempotencyKey` | no |

Returns `{ post, routed: "draft", droppedChannels, keptFailedOnly }`. It never schedules:
send the copy on with `social_submit_post`.

### `social_submit_post`

| Argument | Req? |
|---|---|
| `postId` | yes |
| `delivery` | yes |
| `idempotencyKey` | no |

Sends a draft on. It is carried out if the connection has `publish_directly` and the
workspace doesn't require approval; otherwise it goes to Review. **This is the tool to use
when you lack `publish_directly`**: `social_schedule_post` won't even be listed.

### `social_withdraw_post`

| Argument | Req? |
|---|---|
| `postId` | yes |

Takes a `pending_approval` post back to a draft, so it can be edited. It also accepts an
`idempotencyKey`, which is ignored.

### `social_delete_draft`

| Argument | Req? |
|---|---|
| `postId` | yes |

Deletes a post that isn't live (`draft`, `queued`, `scheduled`, `failed`, `rejected`).
It takes **no `idempotencyKey`**; passing one is refused.
Deleting a scheduled or queued post needs `publish_directly`. Returns `Deleted.`.

### `social_schedule_post`

| Argument | Type | Req? | Notes |
|---|---|---|---|
| `postId` | uuid | yes | |
| `mode` | `at` \| `queue` \| `prioritise` | no | Default `at` |
| `at` | date-time | for `at` | Required for `mode: at`, and only for it |
| `queueIds` | `{accountId: queueId \| null}` | no | Only with `queue` / `prioritise`; `null` = Main |
| `timezone` | IANA name | no | Wording only |
| `idempotencyKey` | string | no | |

Schedules or queues a draft. It also re-times a post that is already scheduled, queued or
failed.

### `social_publish_now`

| Argument | Req? |
|---|---|
| `postId` | yes |
| `idempotencyKey` | no |

Publishes on every channel the post targets. **Confirm with the user first.**

### `social_cancel_post`

| Argument | Req? |
|---|---|
| `postId` | yes |
| `idempotencyKey` | no |

Turns a `scheduled`, `queued`, `failed` or `on_hold` post back into a draft.

### `social_upload_media`

| Argument | Type | Req? | Notes |
|---|---|---|---|
| `mediaType` | `image` \| `video` \| `gif` \| `document` | yes | |
| `bytesBase64` | string | yes | The whole file, base64. **Up to 20 MB.** |
| `altText` | string ≤1000 | no | |
| `idempotencyKey` | string | no | |

Returns `{ mediaAssetId, processingStatus }`. Use it for small files. Anything bigger goes
through the three large-upload tools.

### `social_request_media_upload`

| Argument | Type | Req? |
|---|---|---|
| `mediaType` | `image` \| `video` \| `gif` | yes |
| `sizeBytes` | int > 0 | yes |
| `altText` | string ≤1000 | no |
| `idempotencyKey` | string | no |

Returns `{ mediaAssetId, uploadId, partSize, partCount, urls: [{partNumber, url}] }`. Then
PUT each part's bytes to its URL **outside MCP**, with plain HTTP, and keep each response's
`ETag` header. See [media-uploads.md](media-uploads.md).

### `social_sign_upload_parts`

| Argument | Type | Req? | Notes |
|---|---|---|---|
| `uploadId` | uuid | yes | ⚠️ The **`mediaAssetId`**, not the `uploadId` field of the previous answer |
| `fromPart` | int ≥1 | yes | |
| `count` | 1–16 | yes | |

No `idempotencyKey` (it is safe to repeat).

### `social_finalize_media_upload`

| Argument | Type | Req? | Notes |
|---|---|---|---|
| `uploadId` | uuid | yes | ⚠️ The **`mediaAssetId`** |
| `parts` | `[{partNumber, etag}]` | yes | Every part |
| `durationSec`, `width`, `height` | number | no | |

Returns the media asset. Its `id` (= `mediaAssetId`) goes in `mediaAssetIds`. No
`idempotencyKey`: completing twice is safe and returns the same asset.

### `social_get_analytics`

| Argument | Type | Notes |
|---|---|---|
| `postId` | uuid | Every channel a post went out on |
| `accountId` | uuid | A channel's analytics |
| `platformPostId` | uuid | One channel's copy of a post. The public API never shows these ids, so use `postId`. |
| `windowDays` | 1–365 | Channel analytics only. Leave it out or use 30 (see [analytics.md](analytics.md)). |

Pass **exactly one** of `postId`, `platformPostId` or `accountId`. Returns the same body as
the REST analytics routes.
