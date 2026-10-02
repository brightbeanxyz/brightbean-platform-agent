// Create a post and send it on in one call (a `delivery` on create).
//   node 05_create_and_deliver.mjs <account_id> --caption "Hi" --at 2026-10-06T09:00:00+02:00
//   node 05_create_and_deliver.mjs <account_id> --caption "Hi" --queue
// A refusal can come before the draft is made (a past time) or after (missing media, the
// daily cap). In the second case the draft exists; a retry with the SAME key reuses it.
import { ApiError, BrightBean, newIdempotencyKey, parseArgs, show, usage } from "./client.mjs";

const { flags, positional } = parseArgs(process.argv.slice(2), { booleans: ["queue"] });
const modes = [flags.at !== undefined, flags.queue].filter(Boolean).length;
if (!positional.length || typeof flags.caption !== "string" || modes !== 1) {
  usage("usage: node 05_create_and_deliver.mjs <account_id>... --caption TEXT (--at ISO | --queue), exactly one of --at / --queue");
}
if (flags.at !== undefined && !/(Z|[+-]\d\d:\d\d)$/.test(flags.at)) usage("--at needs an offset, e.g. 2026-10-06T09:00:00+02:00");
const delivery = flags.at ? { mode: "at", at: flags.at } : { mode: "queue" };
const idempotencyKey = newIdempotencyKey("create-and-deliver");
const bb = new BrightBean();
try {
  const result = await bb.post("/posts/", { accounts: positional, caption: flags.caption, delivery }, { idempotencyKey });
  show(result);
  console.log(`\nPost ${result.post.id}: routed ${result.routed}`);
  for (const ch of result.post.channels) console.log(`  ${ch.platform} @${ch.handle}: ${ch.status} ${ch.scheduledAt ?? ""}`);
} catch (e) {
  if (!(e instanceof ApiError)) throw e;
  console.log(`Refused: ${e.detail}`);
  if (e.code === "platform_quota") console.log(`The earliest time that fits: ${e.body.available_at}`);
  console.log(`If a draft was made before the refusal, retrying with Idempotency-Key ${idempotencyKey} reuses it.`);
  process.exit(1);
}
