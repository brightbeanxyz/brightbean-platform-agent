// Unschedule a post back to a draft, and optionally delete it.
//   node 06_cancel_and_delete.mjs <post_id> [--delete]
import { BrightBean, newIdempotencyKey, parseArgs, usage } from "./client.mjs";

const { flags, positional } = parseArgs(process.argv.slice(2), { booleans: ["delete"] });
const [postId] = positional;
if (!postId) usage("usage: node 06_cancel_and_delete.mjs <post_id> [--delete]");

const bb = new BrightBean();
const post = await bb.get(`/posts/${postId}`);
console.log(`Post ${post.id} is ${post.status}`);
if (["scheduled", "queued", "failed", "on_hold"].includes(post.status)) {
  const r = await bb.post(`/posts/${postId}/cancel`, {}, { idempotencyKey: newIdempotencyKey("cancel") });
  console.log(`Cancelled: now ${r.post.status}`);
} else if (post.status === "pending_approval") {
  const r = await bb.post(`/posts/${postId}/withdraw`, {});
  console.log(`Withdrawn from Review: now ${r.post.status}`);
}
if (flags.delete) {
  await bb.delete(`/posts/${postId}`);
  console.log("Deleted.");
}
