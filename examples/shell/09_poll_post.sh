#!/usr/bin/env bash
# Wait for a post to settle, using its ETag (an unchanged post answers 304, cheaply).
#   bash 09_poll_post.sh <post_id> [seconds_between_polls]
source "$(dirname "$0")/_common.sh"
need_jq
post="${1:?usage: 09_poll_post.sh <post_id> [seconds]}"
every="${2:-15}"
etag=""
while true; do
  headers="$(mktemp)"
  args=(-sS -D "$headers" -H "Authorization: Bearer ${BRIGHTBEAN_API_KEY}" -H "User-Agent: ${UA}")
  [[ -n "$etag" ]] && args+=(-H "If-None-Match: ${etag}")
  body="$(curl "${args[@]}" "${API}/posts/${post}")"
  code="$(awk 'NR==1 {print $2}' "$headers")"
  if [[ "$code" == "304" ]]; then
    echo "  (unchanged)"
  else
    etag="$(tr -d '\r' <"$headers" | awk 'tolower($1)=="etag:" {sub(/^[^:]*: /, ""); print}')"
    jq -r '"\(.status): " + ([.channels[] | "\(.platform)=\(.status)"] | join(", "))' <<<"$body"
    if jq -e '[.channels[].status] | all(. == "draft" or . == "published" or . == "failed")' <<<"$body" >/dev/null; then
      jq -r '.channels[] | "  \(.platform) @\(.handle): \(.status) \(.url // .error // "")"' <<<"$body"
      rm -f "$headers"
      break
    fi
  fi
  rm -f "$headers"
  sleep "$every"
done
