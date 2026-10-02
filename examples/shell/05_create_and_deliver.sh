#!/usr/bin/env bash
# Create a post and schedule it in one call. If the delivery's own checks refuse it (missing
# media, the daily cap), the draft exists anyway: re-run with the same IDEMPOTENCY_KEY to reuse it.
#   bash 05_create_and_deliver.sh <account_id> "Caption" 2026-10-06T09:00:00+02:00
source "$(dirname "$0")/_common.sh"
need_jq
account="${1:?usage: 05_create_and_deliver.sh <account_id> \"caption\" <ISO time with offset>}"
caption="${2:?missing caption}"
at="${3:?missing time}"
key="${IDEMPOTENCY_KEY:-$(new_key create-and-deliver)}"
echo "Idempotency-Key: $key" >&2
body="$(jq -n --arg a "$account" --arg c "$caption" --arg at "$at" \
  '{accounts: [$a], caption: $c, delivery: {mode: "at", at: $at}}')"
bb POST /posts/ "$body" -H "Idempotency-Key: $key" | jq '{id: .post.id, routed, status: .post.status}'
