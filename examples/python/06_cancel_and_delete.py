"""Unschedule a post back to a draft, and optionally delete it.

    python 06_cancel_and_delete.py <post_id>            # cancel only
    python 06_cancel_and_delete.py <post_id> --delete   # cancel (if needed) and delete
"""

import argparse

from client import BrightBean, new_idempotency_key

parser = argparse.ArgumentParser()
parser.add_argument("post_id")
parser.add_argument("--delete", action="store_true")
args = parser.parse_args()

bb = BrightBean()
post = bb.get(f"/posts/{args.post_id}")
print(f"Post {post['id']} is {post['status']}")

if post["status"] in ("scheduled", "queued", "failed", "on_hold"):
    result = bb.post(f"/posts/{args.post_id}/cancel", {}, idempotency_key=new_idempotency_key("cancel"))
    print(f"Cancelled: now {result['post']['status']}")
elif post["status"] == "pending_approval":
    result = bb.post(f"/posts/{args.post_id}/withdraw", {})
    print(f"Withdrawn from Review: now {result['post']['status']}")

if args.delete:
    bb.delete(f"/posts/{args.post_id}")
    print("Deleted.")
