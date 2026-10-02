# Uploading media

A post points at media by id (`mediaAssetIds`). You can't attach a URL. Upload the file
first, then use the asset id it returns.

| Route | Size | Where |
|---|---|---|
| **Small file, one call** | up to 20 MB | MCP only: `social_upload_media` with the file as base64 |
| **Any file, in parts** | images/gifs ≤ 64 MiB, videos ≤ 3 GiB | REST `/api/v1/media/uploads…` or the three MCP large-upload tools |

Both need the `upload_media` permission. The parts route accepts PNG, JPEG, WebP, GIF,
MP4, MOV and WebM. The server checks the file's actual bytes, and a file that isn't what
`mediaType` says is refused at the end.

## Small file (MCP)

```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"social_upload_media","arguments":{
  "mediaType":"image","bytesBase64":"iVBORw0KGgo…","altText":"Our new logo","idempotencyKey":"logo-upload-1"}}}
```

The second text item is `{"mediaAssetId": "…", "processingStatus": "…"}`.

## Any file, in parts (REST)

Parts are 64 MiB (`partSize`). A 200 MiB video is 4 parts. The file bytes go **straight to
storage** with presigned URLs. They never pass through the API.

### 1. Start

```http
POST /api/v1/media/uploads
Authorization: Bearer bb_live_...
Idempotency-Key: upload-launch-video-1
Content-Type: application/json

{ "mediaType": "video", "sizeBytes": 209715200, "altText": "Launch teaser" }
```

```jsonc
// 201
{
  "mediaAssetId": "a1b2c3d4-…",   // ← the id for everything that follows, and for mediaAssetIds
  "r2Key": "…", "uploadId": "…",   // internal; you don't need these
  "partSize": 67108864,
  "partCount": 4,
  "urls": [ { "partNumber": 1, "url": "https://…r2.cloudflarestorage.com/…" }, … ]   // up to 8
}
```

Limits:
- Images and gifs can be up to 64 MiB; videos up to 3 GiB. Over that is a 422.
- A workspace can have at most 25 unfinished uploads at once.

### 2. PUT each part

Part *n* holds bytes `(n-1)·partSize` up to `n·partSize`. The last part is smaller. PUT the
raw bytes to that part's URL:

```bash
curl -sS -X PUT --data-binary @part-1.bin "<url for part 1>" -D - -o /dev/null | grep -i '^etag'
```

- **Don't send `Authorization`** to these URLs. They are presigned storage URLs, not API
  routes. No `Content-Type` is needed.
- **Keep the `ETag` response header** of every part. You need them all at the end. Keep the
  quotes; they are fine.
- **URLs expire after 15 minutes.** Ask for more as you go (step 3), not all up front.
- A failed part PUT can simply be retried. Fetch a new URL if it expired.

### 3. More part URLs (only if `partCount` > 8, or a URL expired)

```http
POST /api/v1/media/uploads/a1b2c3d4-…/parts
{ "fromPart": 9, "count": 16 }
```

→ `{ "urls": [ { "partNumber": 9, "url": "…" }, … ] }`. At most 16 at a time.

The path id is the **`mediaAssetId`**. This call counts toward the read limit.

### 4. Complete

```http
POST /api/v1/media/uploads/a1b2c3d4-…/complete
{ "parts": [ { "partNumber": 1, "etag": "\"3858f62230ac3c915f300c664312c11f\"" }, … ],
  "durationSec": 42.5, "width": 1080, "height": 1920 }
```

→ **200** with the media asset. Its `id` equals `mediaAssetId`; put it in a post's
`mediaAssetIds`.
- `durationSec`, `width` and `height` are optional, but give them when you know them.
- Calling `complete` twice is safe: the second call returns the finished asset.
- A 422 here means the bytes weren't a supported image or video, or didn't match
  `mediaType`. The upload is discarded; start again.
- A 503 `unavailable` is a passing storage failure. Repeat the same call.

An upload that is never completed is cleaned up within 24 hours. A post that names an
unfinished asset is refused: `one or more media uploads haven't finished…`.

## Any file, in parts (MCP)

The same steps with tools. The PUTs in step 2 are still plain HTTP to the URLs.

1. `social_request_media_upload` with `{mediaType, sizeBytes, altText?, idempotencyKey?}`.
2. PUT each part, keeping the ETags.
3. `social_sign_upload_parts` with `{uploadId: <mediaAssetId>, fromPart, count}`.
4. `social_finalize_media_upload` with `{uploadId: <mediaAssetId>, parts: [{partNumber, etag}], …}`.

⚠️ In the MCP tools the argument is *called* `uploadId`, but it takes the **`mediaAssetId`**.
The `uploadId` field the first call returns is internal.

## Full scripts

- Python: [`examples/python/08_upload_media.py`](../examples/python/08_upload_media.py)
- Node: [`examples/node/08_upload_media.mjs`](../examples/node/08_upload_media.mjs)
- Shell: [`examples/shell/08_upload_media.sh`](../examples/shell/08_upload_media.sh)
