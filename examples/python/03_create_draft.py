"""Create a draft. Nothing is published.

    python 03_create_draft.py <account_id> [<account_id> ...] --caption "Hello"
"""

import argparse

from client import BrightBean, new_idempotency_key, show

parser = argparse.ArgumentParser()
parser.add_argument("accounts", nargs="+", help="channel ids from 02_list_accounts.py")
parser.add_argument("--caption", required=True)
parser.add_argument("--first-comment")
parser.add_argument("--media", nargs="*", default=[], help="mediaAssetIds from 08_upload_media.py")
args = parser.parse_args()

body = {"accounts": args.accounts, "caption": args.caption}
if args.first_comment:
    body["firstComment"] = args.first_comment
if args.media:
    body["mediaAssetIds"] = args.media

bb = BrightBean()
result = bb.post("/posts/", body, idempotency_key=new_idempotency_key("create-draft"))
show(result)
print(f"\nDraft {result['post']['id']} (routed: {result['routed']})")
