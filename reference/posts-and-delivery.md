# Posts and delivery

## Post statuses

A post has one overall `status`. Each of its `channels[]` also has its own status, one of
`draft | queued | scheduled | publishing | published | failed`.

| Status | Means | What the API can do next |
|---|---|---|
| `draft` | Not going anywhere yet | PATCH, submit, schedule, publish, duplicate, delete |
| `pending_approval` | Waiting in Review | withdraw (→ draft), duplicate |
| `approved` | A reviewer approved it; it is being carried out | read |
| `changes_requested` | A reviewer asked for changes | duplicate (a person moves it back to draft in the app) |
| `rejected` | A reviewer rejected it | duplicate, delete |
| `queued` | Waiting in a channel queue | schedule (re-time), publish, cancel (→ draft), delete* |
| `scheduled` | Waiting for its time | schedule (re-time), publish, cancel (→ draft), delete* |
| `publishing` | Going out now | read; poll until it settles |
| `published` | Live on every channel | read, duplicate, analytics |
| `partially_published` | Live on some channels, failed on others | read, duplicate (keeps only the channels that didn't go out) |
| `failed` | Didn't go out | schedule (new time), publish (retry now), cancel (→ draft), delete |
| `on_hold` | A reviewer paused it | cancel (→ draft); a person resumes it in the app |

\* Deleting a queued or scheduled post needs `publish_directly`.

Read each channel's `error` for the reason a channel `failed`. Read `url` for the live post.
While a post is `pending_approval`, its channels still show `draft`. The post's own
`status` is the one that says it waits in Review.

## Delivery: how a draft goes out

There are four modes. Pass a delivery in `POST /posts/` (`delivery`), in `POST /posts/{id}/submit`,
or as the body of `/schedule` (`mode` + `at`).

| Mode | Body | Goes out |
|---|---|---|
| `at` | `{"mode": "at", "at": "2026-10-06T09:00:00+02:00"}` | At that time |
| `now` | `{"mode": "now"}` | Right away (`/publish` is the shortcut) |
| `queue` | `{"mode": "queue"}` | At the channel's next free queue slot |
| `prioritise` | `{"mode": "prioritise"}` | At the front of the channel's queue |

Rules:
- **`at` needs an offset.** `2026-10-06T09:00:00` without `Z` or `+02:00` is refused. Work
  out the user's zone, and say the time back to them in words.
- **Not in the past.** An `at` more than 60 seconds ago is refused.
- **Queues.** Every channel has a **Main** queue, plus any named queues listed in
  `queues` on the channel.
  - `queueIds` picks one per channel: `{"<accountId>": "<queueId>"}`, or `null` for Main.
  - A channel left out goes to its queue for the post's category, else Main.
  - Queue slots (posting times) are set by people in the app; the API can't change them.
- **`timezone`** (optional, IANA, e.g. `Europe/Berlin`) only changes how MCP words the time.

## Who decides: carried out, or sent to Review

```
             has publish_directly?
                 │
          no ────┼──── yes
          │             │
          │      workspace approval mode is required / required_client?
          │             │
          │      yes ───┼─── no (standard / optional)
          ▼      ▼             ▼
   routed: "pending_approval"   routed: "enacted"
   (waits in Review; a person   (scheduled / queued / publishing)
    approving it carries it out)
```

Tell the user the truth about `routed`. With `pending_approval`, the post is **not**
scheduled yet. A person must approve it in BrightBean Review.

A draft created without a delivery returns `routed: "draft"`.

## Two ways to write a post

**Two steps (recommended for agents):**

1. `POST /posts/` without `delivery`. You get the post id and a draft.
2. Show the user the copy and the time. On a yes, call `POST /posts/{id}/schedule` (or
   `/submit`, or `/publish`).

If step 2 is refused (daily cap, missing media, past time…), you still hold the id. Fix the
draft with PATCH and try again.

**One step:** `POST /posts/` with `delivery`. This saves a call. But if the delivery fails
its own checks (missing media, the daily cap), the draft is left behind and the error
doesn't tell you its id (see [rest-api.md](rest-api.md)).

## Per-channel overrides: `perAccount`

One post can go to up to 20 channels. Override anything per channel, keyed by the channel's
id:

```jsonc
"perAccount": {
  "<linkedinId>":  { "caption": "Longer LinkedIn version…", "firstComment": "Link: https://…" },
  "<blueskyId>":   { "caption": "Short version (≤300)", "firstComment": "" },   // "" = no first comment here
  "<pinterestId>": { "title": "Spring menu", "boardId": "1234567890" },
  "<tiktokId>":    { "options": { "tiktok": { "privacyLevel": "PUBLIC_TO_EVERYONE", "allowComment": true } } }
}
```

| Field | Notes |
|---|---|
| `caption` | Replaces the post's caption on this channel |
| `title` | YouTube (≤100), Pinterest (≤100), DEV (≤128, required) |
| `firstComment` | `""` turns the post's first comment off for this channel |
| `boardId` | Pinterest board id from `/accounts/{id}/boards`. `""` clears it. |
| `options` | This network's settings (below). `null` clears them. |

In PATCH, every field inside an entry takes `null` (back to inherited or cleared), but
`perAccount` itself doesn't. `options` merges field by field.

## Per-network options: `perAccount[id].options`

Each channel's `capabilities.optionsKey` names the key it takes, and `optionsSchema` gives
its JSON Schema. Channels with `optionsKey: null` take no options. Unknown fields are
refused.

**`tiktok`**: read `/accounts/{id}/tiktok-creator-info` first, every time.

| Field | Type |
|---|---|
| `privacyLevel` | `PUBLIC_TO_EVERYONE` \| `MUTUAL_FOLLOW_FRIENDS` \| `FOLLOWER_OF_CREATOR` \| `SELF_ONLY`: must be one the creator info allows |
| `allowComment`, `allowDuet`, `allowStitch` | boolean: don't enable what the creator info says is disabled |
| `disclose`, `brandOrganic`, `brandContent` | boolean: commercial content disclosure |
| `aiGenerated` | boolean |
| `coverMs` | integer ≥ 0: the video frame to use as cover |

**`youtube`**

| Field | Type |
|---|---|
| `privacyStatus` | `public` \| `unlisted` \| `private` |
| `madeForKids` | boolean. Left out = the channel's own setting. |
| `tags` | string[] (each 1–500 chars, ≤500 tags) |
| `categoryId` | from `/accounts/{id}/youtube-categories` (`^\d{1,4}$`) |
| `thumbnail` | `{"assetId": "<image mediaAssetId>"}` or `{"coverFrame": true}` |

**`facebook`**

| Field | Type |
|---|---|
| `publishAs` | `video` \| `reel`: for a video post |

**`devto`**

| Field | Type |
|---|---|
| `tags` | string[] (each ≤100 chars, ≤20 tags) |
| `canonicalUrl` | string ≤2048: "Originally published at" |

A post may carry warnings on a channel, such as `thumbnail_not_applied` or
`category_not_applied`, in `channels[].warnings`. They mean the post went out, but that
setting didn't take.

## Proposed time (`proposedPublishAt`)

A note on a draft ("we'd like this out Tuesday 9:00"). Nothing is scheduled because of it.
Scheduling, queueing or publishing the post clears it. Use it when the user wants to
suggest a time without having publish rights. Use `delivery` to actually schedule.

## Media on a post

`mediaAssetIds` holds up to 20 uploaded asset ids, in display order (the carousel order).
Upload first ([media-uploads.md](media-uploads.md)), then attach. A post whose channel needs
media (`capabilities.mediaRequired`) is refused on delivery without it:

| Channels | Need |
|---|---|
| TikTok, YouTube | a video |
| Instagram, Pinterest | an image or a video |

## Who may edit what

A key acts as its creator. It can edit, submit, withdraw or delete only posts **its
creator** wrote. Others' posts answer 422 (`someone else wrote this post…`). It can read and
duplicate any post on its channels.
