#!/usr/bin/env bash
# The same Idempotency-Key twice creates ONE post; the same key with a different body is a 422.
# Creates one draft and deletes it at the end.
#   bash 07_idempotent_retry.sh <account_id>
source "$(dirname "$0")/_common.sh"
need_jq
account="${1:?usage: 07_idempotent_retry.sh <account_id>}"
key="$(new_key demo)"
body="$(jq -n --arg a "$account" '{accounts: [$a], caption: "Idempotency demo (safe to delete)"}')"
first="$(bb POST /posts/ "$body" -H "Idempotency-Key: $key" | jq -r .post.id)"
second="$(bb POST /posts/ "$body" -H "Idempotency-Key: $key" | jq -r .post.id)"
echo "first:  $first"
echo "second: $second"
other="$(jq -n --arg a "$account" '{accounts: [$a], caption: "something else"}')"
bb POST /posts/ "$other" -H "Idempotency-Key: $key" || true
bb DELETE "/posts/${first}" >/dev/null && echo "cleaned up"
