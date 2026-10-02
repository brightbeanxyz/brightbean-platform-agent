// Show what an Idempotency-Key does: a retry never creates a second post.
// Creates ONE draft (and deletes it at the end).
//   node 07_idempotent_retry.mjs <account_id>
import { setTimeout as sleep } from "node:timers/promises";
import { ApiError, BrightBean, newIdempotencyKey, parseArgs, usage } from "./client.mjs";

const [accountId] = parseArgs().positional;
if (!accountId) usage("usage: node 07_idempotent_retry.mjs <account_id>");

const bb = new BrightBean();
const key = newIdempotencyKey("demo");
const body = { accounts: [accountId], caption: "Idempotency demo (safe to delete)" };

// The retry loop to copy: same key + same body on every attempt.
async function createWithRetries(body, key, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await bb.post("/posts/", body, { idempotencyKey: key });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.code === "idempotency_in_flight") await sleep(1000);
      else if (e.status === 429) await sleep(1000 * Number(e.retryAfter ?? 60));
      else if (e.status >= 500) await sleep(1000 * 2 ** attempt);
      else throw e; // 4xx: fix the request instead of retrying
    }
  }
  throw new Error("gave up");
}

const first = await createWithRetries(body, key);
const second = await createWithRetries(body, key);
console.log(`first:  ${first.post.id}`);
console.log(`second: ${second.post.id}  (same post: ${first.post.id === second.post.id})`);
try {
  await bb.post("/posts/", { ...body, caption: "something else" }, { idempotencyKey: key });
} catch (e) {
  console.log(`same key, different body -> HTTP ${e.status} ${e.code}: ${e.detail}`);
}
await bb.delete(`/posts/${first.post.id}`);
console.log("cleaned up (draft deleted)");
