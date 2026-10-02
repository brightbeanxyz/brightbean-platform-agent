# Analytics

Read-only. You need the `view_analytics` permission. Analytics never change a post.

| Question | REST | MCP |
|---|---|---|
| How is this channel doing? | `GET /api/v1/analytics/accounts/{accountId}` | `social_get_analytics` with `{accountId}` |
| How did this post do? | `GET /api/v1/analytics/posts/{postId}` | `social_get_analytics` with `{postId}` |

## What comes back

Analytics are **snapshots**: the numbers as they were at `capturedAt`. The newest comes
first.

**Channel**

```jsonc
{ "data": [
  { "capturedAt": "2026-10-02T09:00:00.000Z", "windowDays": 30,
    "metrics": { "impressions": 12034, "reach": 8120, "engagement_rate": 3.1,
                 "followers": 5120, "followers_delta_30d": 88 } },
  { "capturedAt": "2026-10-01T09:00:00.000Z", "windowDays": 30, "metrics": { … } }
] }
```

`windowDays` is the period the channel numbers cover. **Only 30-day snapshots are
collected.** Leave `windowDays` out, or pass `30`. Any other value returns `data: []`.

**Post** (one entry per channel the post went to)

```jsonc
{ "data": [
  { "accountId": "6f1c…", "platform": "linkedin",
    "snapshots": [ { "capturedAt": "2026-10-02T10:00:00.000Z",
                     "metrics": { "impressions": 2418, "likes": 31, "comments": 4 } } ] }
] }
```

- A draft or scheduled post has entries with empty `snapshots`.
- A post with no channels, or one this key can't see, is 404.

## Metric keys

| Key | Meaning |
|---|---|
| `impressions` | Times shown |
| `reach` | Unique people reached |
| `likes` | Likes / reactions |
| `comments` | Comments |
| `shares` | Shares / reposts |
| `saves` | Saves / bookmarks |
| `link_clicks` | Link clicks |
| `watch_time` | Total watch time |
| `avg_view_pct` | Average share of a video watched |
| `engagement_rate` | Engagement rate, in percent |
| `followers` | Followers (channel) |
| `followers_delta_30d` | Follower change over 30 days (channel) |
| `follows` | New follows from this post |

**A missing key means the network doesn't report that number.** It does not mean zero.
Show "n/a", never 0.

## How fresh the numbers are

- A post is read from its network on a ladder that slows down as it ages:

  | Post age | New snapshot every |
  |---|---|
  | under 24 hours | 1 hour |
  | 1–7 days | 6 hours |
  | 7–30 days | 1 day |
  | 30–90 days | 1 week |
  | over 90 days | never again (the last snapshot stays) |

- Channel snapshots (30-day window) are taken by the same hourly job.
- Answers are cached until 10 minutes past the next hour. Polling more often than hourly
  only returns the same snapshot, and costs rate-limit budget.
- A newly connected channel may have no snapshots yet (`data: []`). Try again later.

## Ideas

- **After publishing:** read the post's analytics the next day, and compare channels.
- **Before drafting:** list the last N `published` posts on a channel
  (`GET /posts/?status=published&accountId=…`), read their analytics, and tell the user
  what worked best. Then write the next post in that direction.
