#!/usr/bin/env bash
# Schedule a draft for a time (needs publish_directly), or put it in the queue.
#   bash 04_schedule.sh <post_id> 2026-10-06T09:00:00+02:00
#   bash 04_schedule.sh <post_id> queue
# Without publish_directly, use submit instead (goes to Review):
#   SUBMIT=1 bash 04_schedule.sh <post_id> 2026-10-06T09:00:00+02:00
source "$(dirname "$0")/_common.sh"
need_jq
post="${1:?usage: 04_schedule.sh <post_id> <ISO time with offset | queue>}"
when="${2:?usage: 04_schedule.sh <post_id> <ISO time with offset | queue>}"
if [[ "$when" == "queue" || "$when" == "prioritise" ]]; then
  delivery="$(jq -n --arg m "$when" '{mode: $m}')"
else
  [[ "$when" =~ (Z|[+-][0-9]{2}:[0-9]{2})$ ]] || { echo "The time needs an offset, e.g. 2026-10-06T09:00:00+02:00" >&2; exit 2; }
  delivery="$(jq -n --arg at "$when" '{mode: "at", at: $at}')"
fi
if [[ -n "${SUBMIT:-}" ]]; then
  bb POST "/posts/${post}/submit" "$(jq -n --argjson d "$delivery" '{delivery: $d}')" -H "Idempotency-Key: $(new_key submit)"
else
  bb POST "/posts/${post}/schedule" "$delivery" -H "Idempotency-Key: $(new_key schedule)"
fi | jq '{routed, status: .post.status, channels: [.post.channels[] | {platform, status, scheduledAt}]}'
