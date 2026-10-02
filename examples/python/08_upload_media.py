"""Upload a file with the presigned multipart flow, then print its mediaAssetId.

    python 08_upload_media.py ./photo.jpg
    python 08_upload_media.py ./clip.mp4 --alt "Launch teaser"

Use the printed id in a post's mediaAssetIds (03_create_draft.py --media <id>).
"""

import argparse
import os

import requests

from client import BrightBean, new_idempotency_key, show

parser = argparse.ArgumentParser()
parser.add_argument("path")
parser.add_argument("--alt", help="alt text")
args = parser.parse_args()

# The file types BrightBean accepts. Anything else is refused only at `complete`, after
# every byte has been sent, so check first.
MEDIA_TYPE_BY_EXTENSION = {
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
    ".gif": "gif",
    ".mp4": "video", ".mov": "video", ".webm": "video",
}
extension = os.path.splitext(args.path)[1].lower()
media_type = MEDIA_TYPE_BY_EXTENSION.get(extension)
if media_type is None:
    raise SystemExit(f"{extension or 'this file'} isn't accepted. Use one of: {', '.join(MEDIA_TYPE_BY_EXTENSION)}")
size = os.path.getsize(args.path)

bb = BrightBean()

# 1. Start: the answer holds the first (up to 8) part URLs.
start = {"mediaType": media_type, "sizeBytes": size}
if args.alt:
    start["altText"] = args.alt
plan = bb.post("/media/uploads", start, idempotency_key=new_idempotency_key("upload"))
asset_id, part_size, part_count = plan["mediaAssetId"], plan["partSize"], plan["partCount"]
urls = {u["partNumber"]: u["url"] for u in plan["urls"]}
print(f"{args.path}: {size} bytes, {part_count} part(s) of {part_size} bytes, asset {asset_id}")

# 2. PUT each part straight to storage. No Authorization header: the URL is presigned.
parts = []
with open(args.path, "rb") as f:
    for number in range(1, part_count + 1):
        if number not in urls:
            # 3. More URLs, up to 16 at a time. They expire after 15 minutes, so fetch as you go.
            more = bb.post(f"/media/uploads/{asset_id}/parts", {"fromPart": number, "count": 16})
            urls.update({u["partNumber"]: u["url"] for u in more["urls"]})
        chunk = f.read(part_size)
        put = requests.put(urls[number], data=chunk, timeout=300)
        put.raise_for_status()
        parts.append({"partNumber": number, "etag": put.headers["ETag"]})
        print(f"  part {number}/{part_count} uploaded")

# 4. Complete with every part's ETag.
asset = bb.post(f"/media/uploads/{asset_id}/complete", {"parts": parts})
show({k: asset.get(k) for k in ("id", "mediaType", "processingStatus", "contentType", "sizeBytes")})
print(f"\nmediaAssetId: {asset['id']}")
