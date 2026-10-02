# Overview: how BrightBean is shaped

BrightBean ([platform.brightbean.xyz](https://platform.brightbean.xyz)) drafts, schedules,
queues and publishes social posts. This page is the map. The other files in `reference/`
are the detail.

## Addresses

| What | Production | Staging |
|---|---|---|
| REST API | `https://api-platform.brightbean.xyz/api/v1` | `https://api-platform-staging.brightbean.xyz/api/v1` |
| MCP server | `https://api-platform.brightbean.xyz/api/v1/mcp` | `https://api-platform-staging.brightbean.xyz/api/v1/mcp` |
| OpenAPI spec | `https://api-platform.brightbean.xyz/api/v1/openapi.json` | same path on staging |
| Interactive docs | `https://api-platform.brightbean.xyz/api/v1/docs` | same path on staging |
| Web app | `https://platform.brightbean.xyz` | `https://platform-staging.brightbean.xyz` |

Use production unless the user says otherwise. A key only works on the environment that
made it (see [authentication.md](authentication.md)).

## The objects

```
Workspace                         one brand / client; owns everything below
├── Channel (social account)      a connected Facebook page, LinkedIn profile, TikTok, …
│   └── Queue(s)                  posting slots; every channel has a Main queue, plus named ones
├── Credential                    an API key, or an OAuth connection (e.g. Claude)
│   ├── channels                  the channels it may use (a subset of the workspace's)
│   └── permissions               read, create_posts, upload_media, view_analytics, publish_directly
├── Post                          the shared content: caption, media, title, first comment …
│   └── per-channel copy          one per channel the post targets: own status, time, live URL, error
└── Media asset                   an uploaded image / video / gif, used by id in posts
```

- **A credential lives in one workspace.** It never sees another workspace, even in the
  same organisation.
- **A credential sees only its channels.** A post is visible only when *every* channel it
  targets is on the credential. Anything else answers 404 `Not found.`, the same as a post
  that doesn't exist.
- **A credential acts as the person who made it.** It can do only what its permissions
  allow AND what that person can still do in the workspace. It can edit, send, withdraw or
  delete only posts that person wrote. If the person leaves the workspace, the key stops.
- **A post has one status, and each channel has its own.** Read `channels[]` to see what
  happened on each network: status, `scheduledAt`, `publishedAt`, `url`, `error`.

## Two ways in, one set of rules

| | REST | MCP |
|---|---|---|
| Address | `/api/v1/...` | `POST /api/v1/mcp` (Streamable HTTP, JSON answers) |
| Auth | API key only | API key **or** OAuth (claude.ai, Claude Desktop, Claude Code) |
| Operations | 21 | 20 tools (`social_*`) |
| Only here | `GET /me/` (who am I) | `social_upload_media` (small base64 upload), `social_get_analytics` (one tool for post + channel analytics) |

Both run the same handlers, with the same permissions, rate limits, idempotency and
activity log. Nothing one accepts can be refused by the other for a different reason.

## What happens to a post

```
                 ┌───────── withdraw ─────────┐
                 ▼                            │
create ──► draft ──► submit / schedule / publish ──┬──► scheduled ──► publishing ──► published
   │                                               ├──► queued ──────┘        └──► failed
   │                                               └──► pending_approval (Review)
   └── (delivery in the same call skips straight to the right-hand side)

cancel: scheduled | queued | failed | on_hold ──► draft
```

**Delivery** is how a draft goes out. There are four modes:

| Mode | Meaning |
|---|---|
| `at` | Publish at a time. The time must carry its offset. |
| `queue` | Join the channel's queue, at the back. |
| `prioritise` | Join the channel's queue, at the front. |
| `now` | Publish now. |

**Review (approval).** A delivery goes to BrightBean's Review screen instead of out, and
`routed` is `pending_approval`, when either is true:
- the credential lacks `publish_directly`;
- the workspace's approval mode is `required` or `required_client`.

When a person approves it, the delivery is carried out. Every write that can deliver says
what happened in `routed`:

| `routed` | What happened |
|---|---|
| `draft` | Saved as a draft; nothing goes out. |
| `enacted` | Carried out: scheduled, queued, or publishing. |
| `pending_approval` | Sent to Review; it waits for a person. |

Publishing itself is asynchronous. A scheduled post is picked up at its time. A
publish-now goes out within moments. Read the post again, or poll (see
[polling.md](polling.md)), to see `published` or `failed` and the live `url`.

## What the API does not do

- Connect or reconnect channels. That happens in the web app (Workspace settings → Social Accounts). A channel
  with `needsReconnect: true` must be reconnected there by a person.
- Approve posts. Review is done by people in the web app.
- Put posts on hold or resume them. A person does that in the web app; the API can only
  `cancel` an `on_hold` post back to a draft.
- Read or answer comments and DMs.
- Create or change queues and posting times. Queues are listed on each channel, for use
  in `queueIds`.
