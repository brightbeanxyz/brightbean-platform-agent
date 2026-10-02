"""Two ways to watch for changes cheaply.

    python 09_poll_changes.py --post <post_id>    # wait until a post has gone out (ETag / 304)
    python 09_poll_changes.py --feed              # print every change across posts (updatedSince)
"""

import argparse
import time

from client import BrightBean

parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument("--post")
mode.add_argument("--feed", action="store_true")
parser.add_argument("--every", type=int, default=15, help="seconds between polls")
args = parser.parse_args()

bb = BrightBean()

# Still on its way: waiting in Review, approved, held, queued, scheduled or publishing.
# Judge by the POST's status too: while a post waits in Review its channels still read "draft".
WAITING_POST = {"pending_approval", "approved", "on_hold", "queued", "scheduled", "publishing"}
WAITING_CHANNEL = {"queued", "scheduled", "publishing"}


def settled(post: dict) -> bool:
    return post["status"] not in WAITING_POST and not any(
        ch["status"] in WAITING_CHANNEL for ch in post["channels"]
    )


if args.post:
    etag = None
    while True:
        response = bb.request("GET", f"/posts/{args.post}", etag=etag)
        if response.status_code == 304:
            print("  (unchanged)")
        else:
            # A 200 doesn't prove a change (see reference/polling.md): judge by the content.
            etag = response.headers.get("ETag")
            post = response.json()
            print(f"{post['status']}: " + ", ".join(f"{c['platform']}={c['status']}" for c in post["channels"]))
            if post["status"] == "pending_approval":
                print("  waiting for someone to approve it in BrightBean Review")
            if settled(post):
                for ch in post["channels"]:
                    print(f"  {ch['platform']} @{ch['handle']}: {ch['status']} {ch['url'] or ch['error'] or ''}")
                break
        time.sleep(args.every)
else:
    since = bb.get("/posts/", limit=1)["serverTime"]
    print(f"Watching for changes after {since} (Ctrl-C to stop)")
    seen: dict = {}  # post id -> updatedAt already printed
    while True:
        time.sleep(args.every)
        cursor = None
        while True:
            params = {"updatedSince": since}
            if cursor:
                params["cursor"] = cursor
            page = bb.get("/posts/", **params)
            for post in page["data"]:
                if seen.get(post["id"]) != post["updatedAt"]:  # serverTime overlaps by 30 s: de-duplicate
                    seen[post["id"]] = post["updatedAt"]
                    print(f"{post['updatedAt']}  {post['id']}  {post['status']}")
            cursor = page["nextCursor"]
            if not cursor:
                break
        since = page["serverTime"]
        # Only changes after `since` can come back, so older entries are no longer needed.
        # (Both are the server's ISO-8601 UTC strings, which sort as text.)
        seen = {pid: at for pid, at in seen.items() if at >= since}
