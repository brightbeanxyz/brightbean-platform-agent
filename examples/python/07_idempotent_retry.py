"""Show what an Idempotency-Key does: a retry never creates a second post.

    python 07_idempotent_retry.py <account_id>

Creates ONE draft (and deletes it at the end).
"""

import argparse
import time

from client import ApiError, BrightBean, new_idempotency_key

parser = argparse.ArgumentParser()
parser.add_argument("account_id")
args = parser.parse_args()

bb = BrightBean()
key = new_idempotency_key("demo")
body = {"accounts": [args.account_id], "caption": "Idempotency demo (safe to delete)"}


def create_with_retries(body: dict, key: str, attempts: int = 4) -> dict:
    """The retry loop to copy: same key + same body on every attempt."""
    for attempt in range(1, attempts + 1):
        try:
            return bb.post("/posts/", body, idempotency_key=key)
        except ApiError as e:
            if e.code == "idempotency_in_flight":  # the first attempt is still running
                time.sleep(1)
            elif e.status == 429:
                time.sleep(int(e.retry_after or 60))
            elif e.status >= 500:
                time.sleep(2**attempt)
            else:
                raise  # 4xx: fix the request instead of retrying
    raise RuntimeError("gave up")


first = create_with_retries(body, key)
second = create_with_retries(body, key)  # e.g. after a timeout you couldn't see the answer to
print(f"first:  {first['post']['id']}")
print(f"second: {second['post']['id']}  (same post: {first['post']['id'] == second['post']['id']})")

try:
    bb.post("/posts/", {**body, "caption": "something else"}, idempotency_key=key)
except ApiError as e:
    print(f"same key, different body -> HTTP {e.status} {e.code}: {e.detail}")

bb.delete(f"/posts/{first['post']['id']}")
print("cleaned up (draft deleted)")
