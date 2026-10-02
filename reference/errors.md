# Errors

Every REST error has the same shape:

```jsonc
{
  "error": "invalid",                       // a code to branch on
  "detail": "that time (…) is in the past", // a sentence written for the user: show it as is
  // only on some errors:
  "tier": "credential_writes", "limit": 120, "remaining": 0, "retry_after": 60, "available_at": "…"
}
```

Over MCP the same `detail` comes back as the text of an `isError: true` result (see
[mcp-tools.md](mcp-tools.md#when-a-tool-fails)).

**Show `detail` to the user word for word.** It names the channel, the permission or the
time that matters.

## By status

| Status | `error` | Typical `detail` | What to do |
|---|---|---|---|
| 401 | `unauthorized` | ``Send your API key as `Authorization: Bearer <key>`.`` · `That isn't a valid API key.` · `This API key has been revoked.` · `This API key has expired.` · `The person who created this API key is no longer in the workspace.` | Check the key and the host (a `bb_staging_` key fails on production). Otherwise ask the user for a new key. Don't loop. |
| 403 | `forbidden` | `missing permission: publish_directly` | Use the path that fits the permission (e.g. `submit` → Review), or ask the user to add the permission to the key |
| 403 | `forbidden` | `this key may not post to channel <ids>. Add it to the key's channels in Settings.` | Use only channels from `/accounts/`, or ask the user to add the channel to the key |
| 403 | *(plain text)* | `error code: 1010` | Not from BrightBean: Cloudflare blocked your User-Agent. Send your own `User-Agent`. |
| 404 | `not_found` | `Not found.` | No such post/channel, **or** one this key can't see (all the same on purpose). Don't guess ids. |
| 405 | `method_not_allowed` | `Use GET or POST.` (lists the allowed methods) | Wrong method; the `Allow` header lists the right ones |
| 409 | `conflict` | `Only drafts can be edited (this post is scheduled).` | Cancel it first (→ draft), or duplicate it |
| 409 | `conflict` | `This post is waiting for approval, … Withdraw it first …, then edit it.` | `POST /posts/{id}/withdraw`, then PATCH |
| 409 | `conflict` | `only a draft can be submitted (this post is …)` | It is already on its way. Use `/schedule` to re-time. |
| 409 | `conflict` | `This post is on hold. Resume it first.` | A person resumes it in the app, or `cancel` it to a draft |
| 409 | `conflict` | `illegal post transition: <status> → draft (cancel)` | Nothing to cancel |
| 409 | `conflict` | `This workspace needs approval before posts go out. Send it for approval instead.` | Use `submit`: it goes to Review |
| 409 | `idempotency_in_flight` | | The same Idempotency-Key is still running. Wait a second, then retry. |
| 413 | `too_large` | `The request body is too large.` | Bodies are at most 1 MiB. Upload files separately. |
| 422 | `invalid_request` | `accounts: Array must contain at least 1 element(s); body: Unrecognized key(s) in object: 'foo'` | The body or query doesn't match the schema. Fix the named fields. |
| 422 | `invalid_request` | `The request body isn't valid JSON.` | Send JSON |
| 422 | `invalid` | `that time (…) is in the past` · `That time has passed. Pick a new date and time.` | Pick a future time, with its offset |
| 422 | `invalid` | `TikTok only publishes videos. Add a video to schedule this post, or deselect the account.` | Attach the media the channel needs (`capabilities.mediaRequired`) |
| 422 | `invalid` | `<Network> @<handle> can't take a first comment. …` | `perAccount[id].firstComment = ""` for that channel |
| 422 | `invalid` | `connect a channel and select it on this draft before publishing or scheduling` | The post has no channels |
| 422 | `invalid` | `one or more media uploads haven't finished…` | `complete` the upload first |
| 422 | `invalid` | `someone else wrote this post…` | A key can change only posts its creator wrote. Duplicate it instead. |
| 422 | `invalid` | `cannot delete a post that is published` | Live posts can't be deleted through BrightBean |
| 422 | `invalid` | `that cursor no longer points at a post; start again` | Restart the listing without `cursor` |
| 422 | `idempotency_mismatch` | `idempotency key "<k>" was already used with a different request body` | A new request needs a new key |
| 422 | `platform_quota` | `… The earliest time that fits is <iso>.` (+ `available_at`, `tier`, `limit`) | The channel's daily cap is full at that time. Offer `available_at` or another channel. |
| 429 | `rate_limited` | `Too many requests. Try again in 60 seconds.` (+ `tier`, `retry_after`) | Wait `Retry-After` |
| 429 | `platform_quota` | (+ `retry_after`, `available_at`) | Daily cap full when publishing now: schedule for `available_at` instead |
| 500 | `internal` | `Something went wrong on our side. Try again.` | Retry once with the same Idempotency-Key |
| 503 | `unavailable` | (upload storage failure) | Repeat the same call |

## Retrying safely

| Retry? | When |
|---|---|
| Yes, with the same Idempotency-Key | Network error, timeout, 500, 503, 409 `idempotency_in_flight` |
| Yes, after `Retry-After` | 429 |
| No, change something first | 400-range errors other than the above: fix the request, or ask the user |

A retry of a `POST /posts/` with the same key never makes a second post (see
[rest-api.md#idempotency](rest-api.md#idempotency)).

## MCP-only failures

| Text | Meaning |
|---|---|
| `There's no tool called <name> here.` | Wrong tool name |
| `This connection can't do that: it doesn't have "<label>". …` | The connection lacks the permission |
| `This connection has ended. Connect BrightBean again.` (HTTP 401) | The OAuth connection was disconnected or expired. Reconnect. |
| `Connect BrightBean first: sign in, or send an API key as a Bearer token.` (HTTP 401) | No token sent |
| HTTP 406 `Not Acceptable` | Send `Accept: application/json, text/event-stream` |
| HTTP 405 on GET | MCP here is POST-only; there is no event stream |
