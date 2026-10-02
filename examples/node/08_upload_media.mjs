// Upload a file with the presigned multipart flow, then print its mediaAssetId.
//   node 08_upload_media.mjs ./photo.jpg [--alt "Alt text"]
import { open, stat } from "node:fs/promises";
import { extname } from "node:path";
import { BrightBean, newIdempotencyKey, parseArgs, show, usage } from "./client.mjs";

const { flags, positional } = parseArgs();
const [path] = positional;
if (!path) usage("usage: node 08_upload_media.mjs <file> [--alt TEXT]");

const ext = extname(path).toLowerCase();
const mediaType = ext === ".gif" ? "gif" : [".mp4", ".mov", ".webm"].includes(ext) ? "video" : "image";
const { size } = await stat(path);
const bb = new BrightBean();

// 1. Start: the answer holds the first (up to 8) part URLs.
const start = { mediaType, sizeBytes: size, ...(typeof flags.alt === "string" ? { altText: flags.alt } : {}) };
const plan = await bb.post("/media/uploads", start, { idempotencyKey: newIdempotencyKey("upload") });
const { mediaAssetId, partSize, partCount } = plan;
const urls = new Map(plan.urls.map((u) => [u.partNumber, u.url]));
console.log(`${path}: ${size} bytes, ${partCount} part(s) of ${partSize} bytes, asset ${mediaAssetId}`);

// 2. PUT each part straight to storage. No Authorization header: the URL is presigned.
const file = await open(path, "r");
const parts = [];
try {
  for (let n = 1; n <= partCount; n++) {
    if (!urls.has(n)) {
      // 3. More URLs, up to 16 at a time. They expire after 15 minutes, so fetch as you go.
      const more = await bb.post(`/media/uploads/${mediaAssetId}/parts`, { fromPart: n, count: 16 });
      for (const u of more.urls) urls.set(u.partNumber, u.url);
    }
    const buffer = Buffer.alloc(Math.min(partSize, size - (n - 1) * partSize));
    await file.read(buffer, 0, buffer.length, (n - 1) * partSize);
    const put = await fetch(urls.get(n), { method: "PUT", body: buffer });
    if (!put.ok) throw new Error(`part ${n}: HTTP ${put.status} ${await put.text()}`);
    parts.push({ partNumber: n, etag: put.headers.get("etag") });
    console.log(`  part ${n}/${partCount} uploaded`);
  }
} finally {
  await file.close();
}

// 4. Complete with every part's ETag.
const asset = await bb.post(`/media/uploads/${mediaAssetId}/complete`, { parts });
show({ id: asset.id, mediaType: asset.mediaType, processingStatus: asset.processingStatus, sizeBytes: asset.sizeBytes });
console.log(`\nmediaAssetId: ${asset.id}`);
