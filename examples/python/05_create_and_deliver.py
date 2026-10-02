"""Create a post and send it on in one call (a `delivery` on create).

    python 05_create_and_deliver.py <account_id> --caption "Hi" --at 2026-10-06T09:00:00+02:00
    python 05_create_and_deliver.py <account_id> --caption "Hi" --queue

A refusal can come before the draft is made (a past time, a first comment a channel can't
take) or after (missing media, the daily cap). In the second case the draft exists, and a
retry with the SAME idempotency key reuses it instead of making another.
"""

import argparse

from client import ApiError, BrightBean, new_idempotency_key, show

parser = argparse.ArgumentParser()
parser.add_argument("accounts", nargs="+")
parser.add_argument("--caption", required=True)
when = parser.add_mutually_exclusive_group(required=True)
when.add_argument("--at", help="ISO 8601 WITH offset, e.g. 2026-10-06T09:00:00+02:00")
when.add_argument("--queue", action="store_true")
args = parser.parse_args()

delivery = {"mode": "at", "at": args.at} if args.at else {"mode": "queue"}
body = {"accounts": args.accounts, "caption": args.caption, "delivery": delivery}
key = new_idempotency_key("create-and-deliver")

bb = BrightBean()
try:
    result = bb.post("/posts/", body, idempotency_key=key)
except ApiError as e:
    print(f"Refused: {e.detail}")
    if e.code == "platform_quota":
        print(f"The earliest time that fits: {e.body.get('available_at')}")
    print(f"If a draft was made before the refusal, retrying with Idempotency-Key {key} reuses it.")
    raise SystemExit(1)

show(result)
print(f"\nPost {result['post']['id']}: routed {result['routed']}")
for ch in result["post"]["channels"]:
    print(f"  {ch['platform']} @{ch['handle']}: {ch['status']} {ch['scheduledAt'] or ''}")
