# REST API reference

Base URL: `https://api-platform.brightbean.xyz` (staging: `https://api-platform-staging.brightbean.xyz`).
Every path below starts with `/api/v1`.

Every request needs:

```
Authorization: Bearer bb_live_...
User-Agent: <your client>/<version>      # see authentication.md: Cloudflare blocks Python-urllib
Content-Type: application/json           # on requests with a body
```

## Conventions

- **JSON in, JSON out.** Field names are camelCase. A few error fields are snake_case
  (`retry_after`, `available_at`).
- **Trailing slash optional.** `/api/v1/posts/` and `/api/v1/posts` are the same route.
- **Ids are UUIDs.** A path id that isn't a UUID is a 404.
- **Times are ISO 8601 with an offset.** For example `2026-10-06T09:00:00+02:00` or
  `2026-10-06T07:00:00Z`. A time without an offset is a 422.
- **Bodies are strict.** An unknown field is a 422 `invalid_request`. Never send fields that
  aren't listed here.
- **Body size:** 1 MiB at most (413 `too_large`). Files don't go in JSON bodies; see
  [media-uploads.md](media-uploads.md).
- **Writes take `Idempotency-Key`.** The header, or `idempotencyKey` in the body (the
  header wins). See [Idempotency](#idempotency).
- **Errors** are `{"error": "<code>", "detail": "<sentence>"}`. See [errors.md](errors.md).
- **Interactive docs** are at `/api/v1/docs`. The machine spec is at `/api/v1/openapi.json`.
  The spec is wrong in a few places; this file describes what the server actually does
  (see [Where the OpenAPI spec is wrong](#where-the-openapi-spec-is-wrong)).

## All operations

| Method | Path | operationId | Permission | MCP tool |
|---|---|---|---|---|
| GET | `/api/v1/me/` | `me` | `read` | none |
| GET | `/api/v1/accounts/` | `account_list` | `read` | `social_list_accounts` |
| GET | `/api/v1/accounts/{id}/boards` | `account_boards` | `read` | `social_list_boards` |
| GET | `/api/v1/accounts/{id}/tiktok-creator-info` | `account_tiktok_creator_info` | `read` | `social_get_tiktok_creator_info` |
| GET | `/api/v1/accounts/{id}/youtube-categories` | `account_youtube_categories` | `read` | `social_list_youtube_categories` |
| GET | `/api/v1/analytics/accounts/{id}` | `account_analytics` | `view_analytics` | `social_get_analytics` (`accountId`) |
| GET | `/api/v1/posts/` | `post_list` | `read` | `social_list_posts` |
| POST | `/api/v1/posts/` | `post_create` | `create_posts` | `social_create_draft` |
| GET | `/api/v1/posts/{id}` | `post_get` | `read` | `social_get_post` |
| PATCH | `/api/v1/posts/{id}` | `post_update` | `create_posts` | `social_update_draft` |
| DELETE | `/api/v1/posts/{id}` | `post_delete` | `create_posts` (+ `publish_directly` if scheduled/queued) | `social_delete_draft` |
| POST | `/api/v1/posts/{id}/duplicate` | `post_duplicate` | `create_posts` | `social_duplicate_post` |
| POST | `/api/v1/posts/{id}/submit` | `post_submit` | `create_posts` | `social_submit_post` |
| POST | `/api/v1/posts/{id}/withdraw` | `post_withdraw` | `create_posts` | `social_withdraw_post` |
| POST | `/api/v1/posts/{id}/schedule` | `post_schedule` | `publish_directly` | `social_schedule_post` |
| POST | `/api/v1/posts/{id}/publish` | `post_publish` | `publish_directly` | `social_publish_now` |
| POST | `/api/v1/posts/{id}/cancel` | `post_cancel` | `publish_directly` | `social_cancel_post` |
| GET | `/api/v1/analytics/posts/{id}` | `post_analytics` | `view_analytics` | `social_get_analytics` (`postId`) |
| POST | `/api/v1/media/uploads` | `media_request_upload` | `upload_media` | `social_request_media_upload` |
| POST | `/api/v1/media/uploads/{id}/parts` | `media_sign_parts` | `upload_media` | `social_sign_upload_parts` |
| POST | `/api/v1/media/uploads/{id}/complete` | `media_complete_upload` | `upload_media` | `social_finalize_media_upload` |

Only one file upload has no REST route: `social_upload_media` (a small base64 file in one
call) exists on MCP only.

---

## Shared objects

### Account (a channel)

```jsonc
{
  "id": "6f1c…",                     // use this id everywhere a channel is asked for
  "platform": "linkedin",            // facebook | instagram | threads | linkedin | tiktok | youtube |
                                     // pinterest | bluesky | mastodon | google_business | devto
  "handle": "acme",
  "avatarUrl": "https://…" ,         // or null
  "status": "connected",             // connected | token_expiring | disconnected | error
  "needsReconnect": false,           // true when status is disconnected or error: a person must reconnect it in the app
  "capabilities": {
    "charLimit": 3000,               // longest caption this channel takes
    "title": { "supported": false, "required": false, "maxChars": null },
    "firstComment": true,            // can it take a firstComment?
    "link": false,                   // does it act on linkUrl? (Pinterest only)
    "boardRequired": false,          // Pinterest: a boardId is required
    "mediaRequired": null,           // "video" (TikTok, YouTube) | "visual" (Instagram, Pinterest) | null
    "optionsKey": null               // "tiktok" | "youtube" | "facebook" | "devto" | null: the key under perAccount[id].options
  },
  "optionsSchema": null,             // JSON Schema of perAccount[id].options for this channel, or null
  "queues": [                        // named queues; the Main queue is NOT listed (pass null for it)
    { "id": "9a2e…", "name": "Evergreen", "categoryId": null }
  ]
}
```

Read `capabilities` before writing a post. It tells you, for this channel:
- the caption limit;
- whether a title is allowed or required;
- whether a first comment is allowed;
- whether a link, a board or media is needed;
- which per-network options it takes.

[platforms.md](platforms.md) lists the same facts per network.

### Post

```jsonc
{
  "id": "c0ffee…",
  "status": "scheduled",             // see "Post statuses" in posts-and-delivery.md
  "caption": "Launching today!",
  "title": null,
  "firstComment": null,
  "linkUrl": null,
  "mediaAssetIds": ["a1b2…"],        // display order
  "scheduledAt": "2026-10-06T07:00:00.000Z",
  "proposedPublishAt": null,         // a note only; see posts-and-delivery.md
  "publishedAt": null,
  "createdAt": "…", "updatedAt": "…",
  "createdVia": { "credentialId": "…", "name": "Zapier" },   // null when made in the app; name only for your own key
  "channels": [
    {
      "accountId": "6f1c…",
      "platform": "linkedin",
      "handle": "acme",
      "status": "scheduled",         // draft | queued | scheduled | publishing | published | failed
      "scheduledAt": "2026-10-06T07:00:00.000Z",
      "publishedAt": null,
      "url": null,                   // the live post, once published
      "error": null,                 // set only when this channel's status is failed
      "warnings": [],                // [{code, message}], e.g. thumbnail_not_applied, category_not_applied
      "queuePosition": null,         // order in its queue, while queued
      "queueId": null,               // the named queue it waits in; null = Main queue
      "caption": null,               // per-channel override; null = uses the post's caption
      "title": null,
      "firstComment": null,
      "boardId": null,
      "options": null                // this network's options, if any
    }
  ]
}
```

### WritePost

Every write that can deliver answers with this:

```jsonc
{ "post": { /* Post */ }, "routed": "draft" }   // "draft" | "enacted" | "pending_approval"
```

| `routed` | What happened |
|---|---|
| `draft` | Saved as a draft; nothing goes out. |
| `enacted` | Carried out: scheduled, queued, or publishing. |
| `pending_approval` | Sent to Review in BrightBean; it goes out after a person approves it. |

### Delivery

How a draft goes out. It is one of these objects:

```jsonc
{ "mode": "at", "at": "2026-10-06T09:00:00+02:00" }        // a set time; `at` required, with offset
{ "mode": "now" }                                           // publish now
{ "mode": "queue" }                                         // join the channel's queue (back)
{ "mode": "prioritise" }                                    // join the channel's queue (front)
{ "mode": "queue", "queueIds": { "<accountId>": "<queueId>", "<otherAccountId>": null } }
```

- `queueIds` maps a channel id to one of its named queues, or to `null` for its Main queue.
  A channel left out goes to its queue for the post's category, else Main.
- Every mode also accepts an optional `timezone` (an IANA name such as `Europe/Berlin`). It
  only changes how times are worded in MCP replies. It never moves the time.
- Unknown keys inside `delivery` are dropped silently, so spell `mode` and `at` exactly.

---

## Who and where

### `GET /api/v1/me/`

Who this key is. Make it the first call in a new session.

```jsonc
// 200
{
  "workspace": { "id": "…", "name": "Acme" },
  "credential": { "id": "…", "kind": "key", "name": "Zapier", "expiresAt": "2027-01-01T00:00:00.000Z" },
  "permissions": ["read", "create_posts", "upload_media", "view_analytics"],   // effective, right now
  "channels": [ { "id": "6f1c…", "platform": "linkedin", "handle": "acme" } ]
}
```

### `GET /api/v1/accounts/`

The channels this key may use, with what each can take.

```jsonc
// 200
{ "data": [ /* Account */ ] }
```

The OpenAPI spec says this returns one Account. It returns `{ "data": [...] }`.

### `GET /api/v1/accounts/{id}/boards`

A Pinterest channel's boards. A pin needs `perAccount[<accountId>].boardId`.

```jsonc
// 200 (most pins first)
{ "data": [ { "id": "1234…", "name": "Recipes", "pinCount": 42 } ] }   // privacy and pinCount may be absent
```

- A channel that isn't Pinterest is 422 `invalid`.
- A channel not on the key is 404.

### `GET /api/v1/accounts/{id}/tiktok-creator-info`

What a TikTok channel allows right now. TikTok requires this read before every post. It is
never cached.

```jsonc
// 200
{
  "username": "acme", "nickname": "Acme", "avatarUrl": "https://…",
  "privacyLevelOptions": ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
  "commentDisabled": false, "duetDisabled": false, "stitchDisabled": true,
  "maxVideoPostDurationSec": 600,
  "canPost": true                        // when false, "cannotPostReason" says why
}
```

- Set `perAccount[<id>].options.tiktok.privacyLevel` to one of `privacyLevelOptions`.
- Don't turn on comments, duets or stitches that the account has disabled.
- If `canPost` is false, tell the user `cannotPostReason`.
- A channel that isn't TikTok, an expired token, or a TikTok outage is 422 `invalid`.

### `GET /api/v1/accounts/{id}/youtube-categories`

```jsonc
// 200
{ "regionCode": "DE", "categories": [ { "id": "22", "title": "People & Blogs" } ] }
```

Use an `id` as `perAccount[<id>].options.youtube.categoryId`. A channel that isn't YouTube
is 422.

---

## Posts

### `GET /api/v1/posts/`

Posts on this key's channels, newest first.

| Query | Type | Notes |
|---|---|---|
| `status` | string | Comma-separated: `draft, pending_approval, approved, changes_requested, rejected, queued, scheduled, publishing, published, partially_published, failed, on_hold`. Unknown value → 422 `unknown status: x`. |
| `accountId` | uuid | Only posts on this channel. |
| `updatedSince` | date-time with offset | Only posts changed after this. Pass the previous response's `serverTime`. Order becomes oldest change first. |
| `cursor` | uuid | The previous page's `nextCursor`. |
| `limit` | 1–100 | Default 50. |

Unknown query parameters are a 422.

```jsonc
// 200, with an ETag header
{ "data": [ /* Post */ ], "nextCursor": "c0ffee…", "serverTime": "2026-10-02T19:59:30.000Z" }
```

- `nextCursor` is `null` on the last page.
- A cursor whose post has gone is 422 `that cursor no longer points at a post; start again`.
- Send the ETag back as `If-None-Match`. When nothing changed, the answer is `304` with no
  body.
- With `updatedSince` and nothing changed, the answer is
  `{"data": [], "nextCursor": null, "serverTime": <your updatedSince>}`.
- Details: [polling.md](polling.md).

A post appears only if **every** channel it targets is on this key. A post with no channels
appears only to the key that made it.

### `POST /api/v1/posts/`

Create a post as a draft. Add a `delivery` to send it on in the same call.

| Field | Type | Req? | Notes |
|---|---|---|---|
| `accounts` | uuid[] (1–20) | **yes** | Channel ids from `/accounts/`. Each must be on this key, else 403. |
| `caption` | string | **yes** | The post text. Keep within each channel's `capabilities.charLimit`. |
| `title` | string | no | For channels that take one (YouTube, Pinterest; required for DEV). |
| `firstComment` | string | no | Posted as the first comment. A channel that can't take one makes the whole call 422. |
| `linkUrl` | string ≤2048 | no | Where the post points. Only Pinterest uses it. `javascript:` and `data:` are refused. |
| `perAccount` | object | no | Per-channel overrides, keyed by channel id: `{caption?, title?, firstComment?, boardId?, options?}`. See [posts-and-delivery.md](posts-and-delivery.md). |
| `mediaAssetIds` | uuid[] (≤20) | no | Uploaded media, in display order. Each must be finished uploading. |
| `proposedPublishAt` | date-time \| null | no | A suggested time, as a note only. Nothing is scheduled from it. |
| `delivery` | [Delivery](#delivery) | no | Schedule, queue or publish in the same call. Left out, the post stays a draft. |
| `idempotencyKey` | string 1–128 | no | Or the `Idempotency-Key` header. **Always send one.** |

**201** → [WritePost](#writepost).

```bash
curl -X POST https://api-platform.brightbean.xyz/api/v1/posts/ \
  -H "Authorization: Bearer $BRIGHTBEAN_API_KEY" -H "User-Agent: my-agent/1.0" \
  -H "Content-Type: application/json" -H "Idempotency-Key: launch-2026-10-06" \
  -d '{
        "accounts": ["6f1c…"],
        "caption": "Launching today!",
        "delivery": { "mode": "at", "at": "2026-10-06T09:00:00+02:00" }
      }'
```

Errors you will meet:

| Status | When |
|---|---|
| 403 `forbidden` | `this key may not post to channel <ids>. Add it to the key's channels in Settings.` |
| 422 `invalid_request` | A field that doesn't fit the schema, e.g. `delivery.at: Invalid datetime` for a time without an offset, or `body: Unrecognized key(s) in object: 'foo'` |
| 422 `invalid` | Over a channel's limits. A first comment on a channel that can't take one. A time in the past (more than 60 s). Missing required media (e.g. a TikTok without a video). Media not finished uploading. Missing Pinterest board. |
| 422 `platform_quota` | The channel's daily cap is full at that time. `available_at` says when it fits. |
| 429 `platform_quota` | The daily cap is full and you asked to publish now. |

⚠️ **A refusal can come before or after the draft is made.**

- **Before (nothing is created):** a channel not on the key (403), a schema error, a time
  in the past, or a first comment a channel can't take.
- **After (the draft exists, but the error doesn't carry its id):** the delivery's own
  checks, such as missing media, the daily cap, or a TikTok without a video.
  - Retrying with the same `Idempotency-Key` reuses that draft instead of making another.
  - To fix the content first, find the draft with `GET /posts/?status=draft` (newest first).

Easier: create without `delivery`, then call `/submit` or `/schedule`. You hold the id from
the first call.

### `GET /api/v1/posts/{id}`

**200** → [Post](#post), with an `ETag` header. Send it back as `If-None-Match` to get a
`304` when the post hasn't changed. A post with any channel outside this key is 404.

### `PATCH /api/v1/posts/{id}`

Edit a **draft**.

- A field left out keeps its value; `null` clears it.
- `perAccount[id].options` merges field by field: a field left out stays, `null` clears it,
  and `null` for the whole object clears every option.

Fields: `accounts` (uuid[] 1–20), `caption`, `title`, `firstComment`, `linkUrl`,
`perAccount`, `mediaAssetIds` (replaces the whole list), `proposedPublishAt`. All are
optional; every one except `accounts`, `caption` and `mediaAssetIds` takes `null`.

**200** → [WritePost](#writepost).

- ⚠️ No `idempotencyKey` field. Sending one in the body is a 422. The header is ignored.
- 409 `conflict` for a post waiting for approval: withdraw it first (`POST /posts/{id}/withdraw`), then edit.
- 409 `conflict`: `Only drafts can be edited (this post is <status>).`
- 422: `someone else wrote this post…`. A key can edit only posts its creator wrote.

### `DELETE /api/v1/posts/{id}`

Delete a post that isn't live.

- Deletable statuses: `draft`, `queued`, `scheduled`, `failed`, `rejected`.
- Deleting a `scheduled` or `queued` post also needs `publish_directly` (403 without it).
- Any other status is 422 `cannot delete a post that is <status>`.

**204**, no body.

### `POST /api/v1/posts/{id}/duplicate`

Copy a post in any state into a **new draft**. The copy has the same words, media, channels
and per-channel settings, with no schedule and no approval.
- Channels that can no longer be used are left out and listed.
- A partly published post keeps only the channels that didn't go out.
- TikTok settings are not copied: TikTok requires them to be chosen for every post.

Body: `{ "idempotencyKey"?: string }`.

```jsonc
// 201
{ "post": { /* Post */ }, "routed": "draft",
  "droppedChannels": [ { "id": "…", "platform": "tiktok", "handle": "acme", "status": "disconnected" } ],
  "keptFailedOnly": false }
```

### `POST /api/v1/posts/{id}/submit`

Send a draft on.
- With `publish_directly` (and no workspace-wide approval), the delivery is carried out.
- Otherwise it goes to Review.

Body: `{ "delivery": Delivery, "idempotencyKey"?: string }`. **200** → [WritePost](#writepost).

- 409: `only a draft can be submitted (this post is <status>)`.

### `POST /api/v1/posts/{id}/withdraw`

Take a post that is waiting for approval back to a draft. Body: `{}`.

**200** → [WritePost](#writepost).

- 409 if the post isn't `pending_approval`: `This changed while you were looking at it. Reload to see where it is now.`
- 422 if another member wrote it.

### `POST /api/v1/posts/{id}/schedule`

Needs `publish_directly`. Schedule a draft for a time, or put it in its channels' queue. On
a post that is already `scheduled`, `queued` or `failed`, it re-times it in place.

| Field | Type | Notes |
|---|---|---|
| `mode` | `at` \| `queue` \| `prioritise` | Default `at`. |
| `at` | date-time with offset | Required for `mode: at`, and only for it. |
| `queueIds` | `{accountId: queueId \| null}` | Only with `queue` / `prioritise`. |
| `timezone` | IANA name | Wording only. |
| `idempotencyKey` | string 1–128 | |

**200** → [WritePost](#writepost). For a draft, the workspace's approval mode still applies:
`routed` can be `pending_approval`.

- 409: `This post is on hold. Resume it first.` (a person resumes it in the app).

### `POST /api/v1/posts/{id}/publish`

Needs `publish_directly`. Publish now on every channel. Body: `{ "idempotencyKey"?: string }`.

**200** → [WritePost](#writepost).

Publishing is asynchronous. Read the post again to see `published` (with `url`) or
`failed` (with `error`) on each channel.

### `POST /api/v1/posts/{id}/cancel`

Needs `publish_directly`. Unschedule a `queued`, `scheduled`, `failed` or `on_hold` post
back to a draft. Body: `{ "idempotencyKey"?: string }`.

**200** → [WritePost](#writepost).

- 409 for any other status: `illegal post transition: <status> → draft (cancel)`.

---

## Analytics

See [analytics.md](analytics.md) for what the numbers mean.

### `GET /api/v1/analytics/accounts/{id}`

| Query | Type | Notes |
|---|---|---|
| `windowDays` | 1–365 | Leave it out, or pass `30`. Snapshots are only collected for a 30-day window, so any other value returns `data: []`. |

```jsonc
// 200, newest first
{ "data": [ { "capturedAt": "2026-10-02T09:00:00.000Z", "windowDays": 30,
              "metrics": { "impressions": 12034, "followers": 5120, "followers_delta_30d": 88 } } ] }
```

### `GET /api/v1/analytics/posts/{id}`

```jsonc
// 200: one entry per channel, snapshots newest first
{ "data": [ { "accountId": "6f1c…", "platform": "linkedin",
              "snapshots": [ { "capturedAt": "…", "metrics": { "impressions": 2418, "likes": 31 } } ] } ] }
```

---

## Media

The four-step upload for any file up to 3 GiB is in [media-uploads.md](media-uploads.md).
In short:

### `POST /api/v1/media/uploads`

Body: `{ "mediaType": "image" | "video" | "gif", "sizeBytes": int, "altText"?: string ≤1000, "idempotencyKey"?: string }`.

```jsonc
// 201
{ "mediaAssetId": "a1b2…", "r2Key": "…", "uploadId": "…",
  "partSize": 67108864, "partCount": 3,
  "urls": [ { "partNumber": 1, "url": "https://…" } ] }   // up to the first 8 parts
```

### `POST /api/v1/media/uploads/{mediaAssetId}/parts`

Body: `{ "fromPart": int ≥1, "count": 1–16 }` → `{ "urls": [ { "partNumber", "url" } ] }`.

The `{id}` is the **`mediaAssetId`**, not `uploadId`. This call counts as a read.

### `POST /api/v1/media/uploads/{mediaAssetId}/complete`

Body: `{ "parts": [ { "partNumber": 1, "etag": "\"…\"" } ], "durationSec"?, "width"?, "height"? }`.

**200** → the media asset (`id`, `mediaType`, `processingStatus`, `width`, `height`,
`durationSec`, `contentType`, `sizeBytes`, … plus some internal fields to ignore). Put its
`id` in `mediaAssetIds`.

---

## Idempotency

| Operation | Honours the key? |
|---|---|
| `POST /posts/` | Yes, for the draft creation. A refused `delivery` retried with the same key reuses the same draft. |
| `duplicate`, `submit`, `schedule`, `publish`, `cancel`, `POST /media/uploads` | Yes |
| `PATCH /posts/{id}` | No. A body `idempotencyKey` is a 422. |
| `DELETE`, `withdraw`, `/parts`, `/complete` | No. The header is ignored, and `/parts` and `/complete` refuse a body `idempotencyKey` (strict bodies). `/complete` is safe to repeat anyway. |

- **Scope:** a key is scoped to the workspace and the credential.
- **Lifetime:** 24 hours.
- **Same key, same body:** the work is not repeated, and the answer reflects the post as it
  is now.
- **Same key, different body:** 422 `idempotency_mismatch`.
- **Same key while the first request is still running:** 409 `idempotency_in_flight`. Wait
  a moment and retry.
- **First attempt failed with an error:** the key is released, so a retry runs again.

Use a fresh key per intent, e.g. `"<session>-create-<uuid4>"`. Reuse it only for retries of
that same request.

## Where the OpenAPI spec is wrong

The spec at `/api/v1/openapi.json` is generated from the same code, but it gets these wrong.
Trust this file:

1. `GET /accounts/` returns `{ "data": Account[] }`, not a single Account.
2. `Idempotency-Key` is listed on every write. PATCH, DELETE, withdraw and complete ignore it.
3. 304 isn't documented. Only `GET /posts/` and `GET /posts/{id}` send ETags, though the
   spec offers `If-None-Match` on every read.
4. `boards`, `tiktok-creator-info`, `youtube-categories`, both analytics routes and
   `complete` have no response schema. Their shapes are above.
5. `POST /media/uploads/{id}/parts` is marked as a read, which is right for rate limits.
   It takes no `Idempotency-Key`.
6. A create whose `delivery` is refused leaves a draft whose id the error doesn't carry
   (see above).
