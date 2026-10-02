# Workflows

Recipes for the things users ask for. Each shows MCP first, then REST. The runnable
versions are in [`../examples/`](../examples/).

## 1. Start of every session: what can I do?

| MCP | REST |
|---|---|
| `social_list_accounts` | `GET /api/v1/me/`, then `GET /api/v1/accounts/` |

From the answer, note:
- **Which channels exist:** ids, platforms and handles. Never guess ids, and never reuse
  ids from an earlier session without checking.
- **Which channels need a person:** `needsReconnect: true` means a person must reconnect
  the channel in the app first. Don't post to it.
- **What each channel takes:** `capabilities` (caption limit, title, first comment, media,
  board, options).
- **Your permissions:** `me.permissions` over REST; over MCP, which tools `tools/list`
  shows. Without `publish_directly`, deliveries go to Review.

## 2. "Post this on LinkedIn tomorrow at 9"

1. Find the LinkedIn channel id (recipe 1).
2. Work out the time **with an offset** in the user's zone, e.g.
   `2026-10-06T09:00:00+02:00`. If you don't know the zone, ask.
3. Check the caption against `capabilities.charLimit`.
4. Create the draft:
   - MCP: `social_create_draft {accounts: [id], caption, idempotencyKey}`
   - REST: `POST /posts/` with the same fields.
5. Show the user the copy and the time in words ("Tuesday 6 October, 09:00 Berlin time").
   Wait for a yes.
6. Send it on:
   - With `publish_directly`: MCP `social_schedule_post {postId, mode: "at", at, idempotencyKey}`,
     or REST `POST /posts/{id}/schedule`.
   - Without it: MCP `social_submit_post {postId, delivery: {mode: "at", at}, idempotencyKey}`,
     or REST `POST /posts/{id}/submit`.
7. Report `routed` truthfully:
   - `enacted`: "Scheduled for Tue 6 Oct 09:00."
   - `pending_approval`: "Sent for approval. It goes out at 09:00 once someone approves it
     in BrightBean."

## 3. One message, several networks

```jsonc
// social_create_draft / POST /posts/
{
  "accounts": ["<linkedin>", "<bluesky>", "<instagram>"],
  "caption": "Long version for LinkedIn and Instagram…",
  "mediaAssetIds": ["<image>"],                 // Instagram needs media
  "perAccount": {
    "<bluesky>": { "caption": "Short version, ≤300 chars" }
  },
  "idempotencyKey": "spring-launch-1"
}
```

Then deliver once. Each channel gets its own status in `channels[]`. Check every channel's
`capabilities` first: one channel that can't take something (a first comment, a missing
video) refuses the whole request.

## 4. Fill the queue instead of picking times

`social_schedule_post {postId, mode: "queue"}`, or `POST /posts/{id}/schedule {"mode": "queue"}`.
The post takes the channel's next free queue slot.
- `prioritise` puts it first in line.
- To use a named queue, pass `queueIds: {"<accountId>": "<queueId>"}`, with queue ids from
  the channel's `queues`.

## 5. Pinterest pin

1. `social_list_boards {accountId}` / `GET /accounts/{id}/boards`, and pick a board with the user.
2. Upload an image or video ([media-uploads.md](media-uploads.md)).
3. Create the pin:
   ```jsonc
   { "accounts": ["<pinterest>"], "caption": "…", "title": "Spring menu",
     "linkUrl": "https://example.com/menu", "mediaAssetIds": ["<image>"],
     "perAccount": { "<pinterest>": { "boardId": "<boardId>" } } }
   ```

## 6. TikTok video

1. Upload the video (large-upload flow).
2. `social_get_tiktok_creator_info {accountId}` / `GET /accounts/{id}/tiktok-creator-info`.
   - If `canPost` is false, stop and tell the user `cannotPostReason`.
   - Pick a `privacyLevel` from `privacyLevelOptions`, together with the user.
3. Create the post:
   ```jsonc
   { "accounts": ["<tiktok>"], "caption": "…", "mediaAssetIds": ["<video>"],
     "perAccount": { "<tiktok>": { "options": { "tiktok": {
        "privacyLevel": "PUBLIC_TO_EVERYONE", "allowComment": true, "allowDuet": false, "allowStitch": false } } } } }
   ```

## 7. YouTube video

1. Upload the video.
2. Optionally `social_list_youtube_categories {accountId}`.
3. Create the post:
   ```jsonc
   { "accounts": ["<youtube>"], "caption": "Description…", "title": "Video title (≤100)",
     "mediaAssetIds": ["<video>"],
     "perAccount": { "<youtube>": { "options": { "youtube": {
        "privacyStatus": "public", "categoryId": "22", "tags": ["launch"] } } } } }
   ```

## 8. Change a scheduled post

- **Only the time:** schedule again. MCP `social_schedule_post {postId, mode: "at", at: <new>}`;
  REST `POST /posts/{id}/schedule`. It re-times in place.
- **The words or media:**
  1. Cancel it back to a draft: `social_cancel_post` / `POST /posts/{id}/cancel`.
  2. Edit it: `social_update_draft` / `PATCH /posts/{id}`.
  3. Schedule it again.
- **It is waiting for approval:**
  1. Withdraw it: `social_withdraw_post` / `POST /posts/{id}/withdraw`.
  2. Edit it.
  3. Submit it again.

## 9. Publish now and confirm it went out

1. Get an explicit yes from the user. This posts publicly at once.
2. Publish: `social_publish_now {postId, idempotencyKey}` / `POST /posts/{id}/publish`.
3. Poll `social_get_post` / `GET /posts/{id}` (with `If-None-Match`) every 10–30 s until no
   channel is `publishing`.
4. Report each channel: `published` with its `url`, or `failed` with its `error`.

## 10. Retry a failed post

`channels[].error` says why it failed. Fix the cause with the user. For example, a channel
may need reconnecting in the app. Then:
- **Retry now:** `social_publish_now` / `POST /posts/{id}/publish`.
- **New time:** `social_schedule_post` / `POST /posts/{id}/schedule`.
- **Edit first:** `cancel` (→ draft), PATCH, then schedule.

## 11. Reuse a past post

`social_duplicate_post {postId}` / `POST /posts/{id}/duplicate` gives a new draft with the
same content. Check `droppedChannels`, then edit and deliver it like any draft.

## 12. Weekly report

1. List the posts: `social_list_posts {status: "published", limit: 100}`, or
   `GET /posts/?status=published&limit=100`. Follow `nextCursor`.
2. For each post, read `social_get_analytics {postId}` / `GET /analytics/posts/{id}`.
3. For each channel, read `social_get_analytics {accountId}` / `GET /analytics/accounts/{id}`.
4. Summarise. A missing metric is "n/a", not 0.

## 13. Keep a local copy in sync

1. Do a first full `GET /posts/` (follow cursors), and store `serverTime`.
2. Every few minutes, `GET /posts/?updatedSince=<serverTime>`:
   - follow cursors;
   - merge by `id`;
   - store the new `serverTime`.
3. A post that suddenly answers 404 was deleted.

## When the user lacks a permission

| Missing | What you can still do |
|---|---|
| `publish_directly` | Create drafts and `submit` them. They go to Review. Tell the user someone must approve them. |
| `create_posts` | Read only. Suggest the copy in chat; the user posts it. |
| `upload_media` | Text-only posts, or duplicate a post that already has the media. You can't upload new files. |
| `view_analytics` | No numbers. Ask the user to add the permission to the key. |

Never ask the user to paste a key into chat. Ask them to set it as an environment variable,
or to add it to their MCP client's config.
