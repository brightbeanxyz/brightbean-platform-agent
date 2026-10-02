#!/usr/bin/env bash
# Wait until a post has gone out, using its ETag (an unchanged post answers 304, cheaply).
#   bash 09_poll_post.sh <post_id> [seconds_between_polls]
source "$(dirname "$0")/_common.sh"
need_jq
post="${1:?usage: 09_poll_post.sh <post_id> [seconds]}"
every="${2:-15}"

headers="$(mktemp)"
trap 'rm -f "$headers"' EXIT

# Still on its way while the POST waits in Review, is approved, held, queued, scheduled or
# publishing, or any channel is queued, scheduled or publishing. (In Review the channels
# still read "draft", so the post's own status matters.)
settled='(.status | IN("pending_approval","approved","on_hold","queued","scheduled","publishing") | not)
  and ([.channels[].status | IN("queued","scheduled","publishing")] | any | not)'

etag=""
while true; do
  args=(-sS -D "$headers" -H "Authorization: Bearer ${BRIGHTBEAN_API_KEY}" -H "User-Agent: ${UA}")
  if [[ -n "$etag" ]]; then args+=(-H "If-None-Match: ${etag}"); fi
  body="$(curl "${args[@]}" "${API}/posts/${post}")"
  code="$(awk 'NR==1 {print $2}' "$headers")"
  if [[ "$code" == "304" ]]; then
    echo "  (unchanged)"
  elif [[ "$code" -ge 400 ]]; then
    echo "HTTP ${code}: $(jq -r '.detail // .' <<<"$body" 2>/dev/null || printf '%s' "$body")" >&2
    [[ "$code" == "404" ]] && echo "The post is gone (deleted, or no longer on this key's channels)." >&2
    exit 1
  else
    # A 200 doesn't prove a change (see reference/polling.md): judge by the content.
    etag="$(tr -d '\r' <"$headers" | awk 'tolower($1)=="etag:" {sub(/^[^:]*: /, ""); print}')"
    jq -r '"\(.status): " + ([.channels[] | "\(.platform)=\(.status)"] | join(", "))' <<<"$body"
    if [[ "$(jq -r .status <<<"$body")" == "pending_approval" ]]; then
      echo "  waiting for someone to approve it in BrightBean Review"
    fi
    if jq -e "$settled" <<<"$body" >/dev/null; then
      jq -r '.channels[] | "  \(.platform) @\(.handle): \(.status) \(.url // .error // "")"' <<<"$body"
      break
    fi
  fi
  sleep "$every"
done
