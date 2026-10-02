// Create a draft. Nothing is published.
//   node 03_create_draft.mjs <account_id> [<account_id> ...] --caption "Hello" [--first-comment "..."] [--media <assetId>]
import { BrightBean, newIdempotencyKey, parseArgs, show, usage } from "./client.mjs";

const { flags, positional } = parseArgs();
if (!positional.length || typeof flags.caption !== "string") usage("usage: node 03_create_draft.mjs <account_id>... --caption TEXT");

const body = { accounts: positional, caption: flags.caption };
if (typeof flags["first-comment"] === "string") body.firstComment = flags["first-comment"];
if (typeof flags.media === "string") body.mediaAssetIds = flags.media.split(",");

const bb = new BrightBean();
const result = await bb.post("/posts/", body, { idempotencyKey: newIdempotencyKey("create-draft") });
show(result);
console.log(`\nDraft ${result.post.id} (routed: ${result.routed})`);
