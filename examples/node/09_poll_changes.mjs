// Two ways to watch for changes cheaply.
//   node 09_poll_changes.mjs --post <post_id>   wait until a post has gone out (ETag / 304)
//   node 09_poll_changes.mjs --feed             print every change across posts (updatedSince)
import { setTimeout as sleep } from "node:timers/promises";
import { BrightBean, parseArgs, usage } from "./client.mjs";

const { flags } = parseArgs(process.argv.slice(2), { booleans: ["feed"] });
const every = Number(flags.every ?? 15) * 1000;
if (!flags.post && !flags.feed) usage("usage: node 09_poll_changes.mjs --post <id> | --feed [--every SECONDS]");
const bb = new BrightBean();

// Still on its way: waiting in Review, approved, held, queued, scheduled or publishing.
// Judge by the POST's status too: while a post waits in Review its channels still read "draft".
const WAITING_POST = new Set(["pending_approval", "approved", "on_hold", "queued", "scheduled", "publishing"]);
const WAITING_CHANNEL = new Set(["queued", "scheduled", "publishing"]);
const settled = (post) => !WAITING_POST.has(post.status) && !post.channels.some((c) => WAITING_CHANNEL.has(c.status));

if (flags.post) {
  let etag;
  for (;;) {
    const res = await bb.request("GET", `/posts/${flags.post}`, { etag });
    if (res.status === 304) console.log("  (unchanged)");
    else {
      etag = res.headers.get("etag") ?? undefined;
      const post = await res.json();
      // A 200 doesn't prove a change (see reference/polling.md): judge by the content.
      console.log(`${post.status}: ` + post.channels.map((c) => `${c.platform}=${c.status}`).join(", "));
      if (post.status === "pending_approval") console.log("  waiting for someone to approve it in BrightBean Review");
      if (settled(post)) {
        for (const c of post.channels) console.log(`  ${c.platform} @${c.handle}: ${c.status} ${c.url ?? c.error ?? ""}`);
        break;
      }
    }
    await sleep(every);
  }
} else {
  let since = (await bb.get("/posts/", { limit: 1 })).serverTime;
  console.log(`Watching for changes after ${since} (Ctrl-C to stop)`);
  const seen = new Map();
  for (;;) {
    await sleep(every);
    let cursor;
    let page;
    do {
      page = await bb.get("/posts/", { updatedSince: since, cursor });
      for (const post of page.data) {
        if (seen.get(post.id) !== post.updatedAt) {
          // serverTime overlaps by 30 s: de-duplicate
          seen.set(post.id, post.updatedAt);
          console.log(`${post.updatedAt}  ${post.id}  ${post.status}`);
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    since = page.serverTime;
    // Only changes after `since` can come back, so older entries are no longer needed.
    // (Both are the server's ISO-8601 UTC strings, which sort as text.)
    for (const [id, at] of seen) if (at < since) seen.delete(id);
  }
}
