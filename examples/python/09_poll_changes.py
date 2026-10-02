"""Two ways to watch for changes cheaply.

    python 09_poll_changes.py --post <post_id>    # wait for one post to settle (ETag / 304)
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
SETTLED = {"draft", "published", "failed"}

if args.post:
    etag = None
    while True:
        response = bb.request("GET", f"/posts/{args.post}", etag=etag)
        if response.status_code == 304:
            print("  (unchanged)")
        else:
            etag = response.headers.get("ETag")
            post = response.json()
            states = {ch["status"] for ch in post["channels"]}
            print(f"{post['status']}: " + ", ".join(f"{c['platform']}={c['status']}" for c in post["channels"]))
            if states <= SETTLED:
                for ch in post["channels"]:
                    print(f"  {ch['platform']} @{ch['handle']}: {ch['status']} {ch['url'] or ch['error'] or ''}")
                break
        time.sleep(args.every)
else:
    first = bb.get("/posts/", limit=1)
    since = first["serverTime"]
    print(f"Watching for changes after {since} (Ctrl-C to stop)")
    seen: dict[str, str] = {}
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
