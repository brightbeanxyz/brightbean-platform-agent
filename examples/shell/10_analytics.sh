#!/usr/bin/env bash
# Analytics for a channel or a post (needs view_analytics).
#   bash 10_analytics.sh account <account_id>
#   bash 10_analytics.sh post <post_id>
source "$(dirname "$0")/_common.sh"
kind="${1:?usage: 10_analytics.sh account|post <id>}"
id="${2:?usage: 10_analytics.sh account|post <id>}"
case "$kind" in
  account) bb GET "/analytics/accounts/${id}" ;;   # 30-day window snapshots, newest first
  post) bb GET "/analytics/posts/${id}" ;;
  *) echo "first argument is account or post" >&2; exit 2 ;;
esac
