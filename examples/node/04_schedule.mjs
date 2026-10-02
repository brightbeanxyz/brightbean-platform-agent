// Schedule a draft for a time, or put it in its channels' queue. Needs publish_directly;
// without it pass --submit and the request goes to Review instead.
//   node 04_schedule.mjs <post_id> --at 2026-10-06T09:00:00+02:00
//   node 04_schedule.mjs <post_id> --queue
//   node 04_schedule.mjs <post_id> --at 2026-10-06T09:00:00+02:00 --submit
import { BrightBean, newIdempotencyKey, parseArgs, show, usage } from "./client.mjs";

const { flags, positional } = parseArgs(process.argv.slice(2), { booleans: ["queue", "prioritise", "submit"] });
const [postId] = positional;
const modes = [flags.at !== undefined, flags.queue, flags.prioritise].filter(Boolean).length;
if (!postId || modes !== 1) usage("usage: node 04_schedule.mjs <post_id> (--at ISO | --queue | --prioritise) [--submit], exactly one of --at / --queue / --prioritise");
if (typeof flags.at === "string" && !/(Z|[+-]\d\d:\d\d)$/.test(flags.at)) usage("--at needs an offset, e.g. 2026-10-06T09:00:00+02:00");

const delivery = flags.at ? { mode: "at", at: flags.at } : { mode: flags.queue ? "queue" : "prioritise" };
const bb = new BrightBean();
const idempotencyKey = newIdempotencyKey("schedule");
const result = flags.submit
  ? await bb.post(`/posts/${postId}/submit`, { delivery }, { idempotencyKey })
  : await bb.post(`/posts/${postId}/schedule`, delivery, { idempotencyKey });
show(result);
console.log(`\nrouted: ${result.routed}`);
if (result.routed === "pending_approval") console.log("Sent to Review: it goes out once someone approves it in BrightBean.");
