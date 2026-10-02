#!/usr/bin/env bash
# Unschedule a post back to a draft; with --delete, delete it too.
#   bash 06_cancel_and_delete.sh <post_id> [--delete]
source "$(dirname "$0")/_common.sh"
need_jq
post="${1:?usage: 06_cancel_and_delete.sh <post_id> [--delete]}"
status="$(bb GET "/posts/${post}" | jq -r .status)"
echo "Post is ${status}"
case "$status" in
  scheduled|queued|failed|on_hold)
    bb POST "/posts/${post}/cancel" '{}' -H "Idempotency-Key: $(new_key cancel)" | jq -r '"Cancelled: now \(.post.status)"' ;;
  pending_approval)
    bb POST "/posts/${post}/withdraw" '{}' | jq -r '"Withdrawn: now \(.post.status)"' ;;
esac
if [[ "${2:-}" == "--delete" ]]; then
  bb DELETE "/posts/${post}" >/dev/null && echo "Deleted."
fi
