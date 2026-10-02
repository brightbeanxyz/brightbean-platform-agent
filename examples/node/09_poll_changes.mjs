// Two ways to watch for changes cheaply.
//   node 09_poll_changes.mjs --post <post_id>   wait for one post to settle (ETag / 304)
//   node 09_poll_changes.mjs --feed             print every change across posts (updatedSince)
import { setTimeout as sleep } from "node:timers/promises";
import { BrightBean, parseArgs, usage } from "./client.mjs";

const { flags } = parseArgs();
const every = Number(flags.every ?? 15) * 1000;
if (!flags.post && !flags.feed) usage("usage: node 09_poll_changes.mjs --post <id> | --feed [--every SECONDS]");
const bb = new BrightBean();
const SETTLED = new Set(["draft", "published", "failed"]);

if (flags.post) {
  let etag;
  for (;;) {
    const res = await bb.request("GET", `/posts/${flags.post}`, { etag });
    if (res.status === 304) console.log("  (unchanged)");
    else {
      etag = res.headers.get("etag") ?? undefined;
      const post = await res.json();
      console.log(`${post.status}: ` + post.channels.map((c) => `${c.platform}=${c.status}`).join(", "));
      if (post.channels.every((c) => SETTLED.has(c.status))) {
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
  }
}
