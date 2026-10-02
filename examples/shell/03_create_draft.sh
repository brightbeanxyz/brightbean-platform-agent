#!/usr/bin/env bash
# Create a draft on one channel. Nothing is published.
#   bash 03_create_draft.sh <account_id> "Caption text"
source "$(dirname "$0")/_common.sh"
need_jq
account="${1:?usage: 03_create_draft.sh <account_id> \"caption\"}"
caption="${2:?usage: 03_create_draft.sh <account_id> \"caption\"}"
body="$(jq -n --arg a "$account" --arg c "$caption" '{accounts: [$a], caption: $c}')"
bb POST /posts/ "$body" -H "Idempotency-Key: $(new_key create-draft)" | jq '{id: .post.id, status: .post.status, routed}'
