# Networks

These are the defaults, so you can plan. **The channel itself is the authority.** Read
`capabilities` on each account from `GET /api/v1/accounts/` (or `social_list_accounts`)
before writing a post. A Mastodon instance, for example, may allow more than 500 characters,
and a LinkedIn personal profile can't take a first comment.

| `platform` | Name | Caption limit | Title | First comment | Needs media | Link (`linkUrl`) | Options key | Daily cap |
|---|---|---|---|---|---|---|---|---|
| `facebook` | Facebook | 63,206 | no | yes | no | no | `facebook` | 200 |
| `instagram` | Instagram | 2,200 | no | yes | image or video | no | none | 25 |
| `threads` | Threads | 500 | no | yes | no | no | none | 250 |
| `linkedin` | LinkedIn | 3,000 | no | company pages only | no | no | none | 100 |
| `tiktok` | TikTok | 2,200 | no | no | **video** | no | `tiktok` | 15 |
| `youtube` | YouTube | 5,000 | yes (≤100) | no | **video** | no | `youtube` | 50 |
| `pinterest` | Pinterest | 800 | yes (≤100) | no | image or video | **yes** (≤2,048) | none (but `boardId` required) | 100 |
| `bluesky` | Bluesky | 300 | no | yes | no | no | none | 200 |
| `mastodon` | Mastodon | 500 (per instance) | no | yes | no | no | none | 200 |
| `google_business` | Google Business | 1,500 | no | no | no | no | none | 50 |
| `devto` | DEV | 100,000 | **required** (≤128) | no | no | no | `devto` | 10 |

- **Caption limit** is `capabilities.charLimit`. Stay under it on every channel, or give
  that channel a shorter `perAccount[id].caption`.
- **First comment** is `capabilities.firstComment`. Sending one to a channel that can't
  take it refuses the whole request (422). Turn it off per channel with
  `perAccount[id].firstComment = ""`.
- **Needs media** is `capabilities.mediaRequired` (`"video"`, `"visual"` or `null`).
- **Daily cap** is the most posts a channel may publish in any rolling 24 hours. A workspace
  admin can change it per channel. See [rate-limits.md](rate-limits.md).

## Media limits per network

These are what each network itself takes. BrightBean refuses media a network can't
publish before it goes out.

| `platform` | Images per post | Videos per post | Longest video | Largest video |
|---|---|---|---|---|
| `facebook` | 10 | 1 | 4 h | 10 GiB |
| `instagram` | 10 (a carousel may mix up to 10 images and videos) | 1 | 15 min (60 s in a carousel) | 1 GiB (300 MiB in a carousel) |
| `threads` | 20 | 1 | 5 min | 1 GiB |
| `linkedin` | 20 | 1 | 30 min | 500 MiB |
| `tiktok` | 0 | 1 | 10 min (see creator info) | 4 GiB |
| `youtube` | 0 | 1 | 12 h | 128 GiB (the upload API stops at 3 GiB) |
| `pinterest` | 1 | 1 | 15 min | 2 GiB |
| `bluesky` | 4 | 1 | 3 min | 50 MiB |
| `mastodon` | 4 | 1 | 5 min | 40 MiB |
| `google_business` | 10 | 0 | none | none |
| `devto` | none | none | none | none |

Uploads through the API take images and gifs up to 64 MiB and videos up to 3 GiB (see
[media-uploads.md](media-uploads.md)).

## Network notes

- **Pinterest:** every pin needs a board. List boards with `/accounts/{id}/boards` and set
  `perAccount[id].boardId`. Use `linkUrl` for where the pin sends people, and a `title`.
- **TikTok:** read `/accounts/{id}/tiktok-creator-info` before **every** post (TikTok
  requires it). Set `options.tiktok.privacyLevel` to one of its `privacyLevelOptions`. If
  `canPost` is false, stop and tell the user why. Duplicating a post never copies TikTok
  settings.
- **YouTube:** a video is required. Set `title`, and optionally `options.youtube`
  (`privacyStatus`, `categoryId` from `/youtube-categories`, `tags`, `thumbnail`).
  First comments aren't supported.
- **LinkedIn:** a personal profile and a company page are both `platform: "linkedin"`.
  Only company pages take a first comment, and `capabilities.firstComment` tells you which
  is which.
- **Instagram:** needs at least one image or video. Mixed carousels are allowed.
- **DEV (dev.to):** posts are articles. A `title` is required. The caption is the
  Markdown body.
- **Facebook:** for a video, `options.facebook.publishAs` picks `video` or `reel`.
- **X / Twitter, Reddit, Substack** are not publishable through this API.
