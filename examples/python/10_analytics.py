"""Read analytics for a channel and/or a post. Needs view_analytics.

    python 10_analytics.py --account <account_id>
    python 10_analytics.py --post <post_id>

A missing metric key means the network doesn't report it: show "n/a", not 0.
"""

import argparse

from client import BrightBean

parser = argparse.ArgumentParser()
parser.add_argument("--account")
parser.add_argument("--post")
args = parser.parse_args()
if not args.account and not args.post:
    parser.error("pass --account and/or --post")

bb = BrightBean()

if args.account:
    snaps = bb.get(f"/analytics/accounts/{args.account}")["data"]  # 30-day window
    if not snaps:
        print("No channel snapshots yet.")
    else:
        latest = snaps[0]
        print(f"Channel, 30 days, as of {latest['capturedAt']}:")
        for key, value in sorted(latest["metrics"].items()):
            print(f"  {key:<22} {value}")

if args.post:
    for channel in bb.get(f"/analytics/posts/{args.post}")["data"]:
        print(f"{channel['platform']} ({channel['accountId']}):")
        if not channel["snapshots"]:
            print("  no numbers yet")
            continue
        latest = channel["snapshots"][0]
        print(f"  as of {latest['capturedAt']}")
        for key, value in sorted(latest["metrics"].items()):
            print(f"  {key:<22} {value}")
