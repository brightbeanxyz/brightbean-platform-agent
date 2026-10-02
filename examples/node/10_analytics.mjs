// Read analytics for a channel and/or a post. Needs view_analytics.
//   node 10_analytics.mjs --account <account_id>
//   node 10_analytics.mjs --post <post_id>
// A missing metric key means the network doesn't report it: show "n/a", not 0.
import { BrightBean, parseArgs, usage } from "./client.mjs";

const { flags } = parseArgs();
if (!flags.account && !flags.post) usage("usage: node 10_analytics.mjs --account <id> | --post <id>");
const bb = new BrightBean();

if (flags.account) {
  const { data } = await bb.get(`/analytics/accounts/${flags.account}`); // 30-day window
  if (!data.length) console.log("No channel snapshots yet.");
  else {
    console.log(`Channel, 30 days, as of ${data[0].capturedAt}:`);
    for (const [k, v] of Object.entries(data[0].metrics).sort()) console.log(`  ${k.padEnd(22)} ${v}`);
  }
}
if (flags.post) {
  const { data } = await bb.get(`/analytics/posts/${flags.post}`);
  for (const ch of data) {
    console.log(`${ch.platform} (${ch.accountId}):`);
    if (!ch.snapshots.length) {
      console.log("  no numbers yet");
      continue;
    }
    console.log(`  as of ${ch.snapshots[0].capturedAt}`);
    for (const [k, v] of Object.entries(ch.snapshots[0].metrics).sort()) console.log(`  ${k.padEnd(22)} ${v}`);
  }
}
