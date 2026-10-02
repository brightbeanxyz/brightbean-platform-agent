// List the channels this key may use, with what each one can take.
//   node 02_list_accounts.mjs
import { BrightBean } from "./client.mjs";

const bb = new BrightBean();
const { data: accounts } = await bb.get("/accounts/");
if (accounts.length === 0) console.log("No channels on this key. Add channels to the key in Settings → API & MCP.");

for (const a of accounts) {
  const c = a.capabilities;
  const flags = [];
  if (a.needsReconnect) flags.push("NEEDS RECONNECT in the app");
  if (c.mediaRequired) flags.push(`needs ${c.mediaRequired}`);
  if (c.boardRequired) flags.push("needs boardId");
  if (c.title.required) flags.push("needs title");
  if (c.firstComment) flags.push("first comment ok");
  if (c.optionsKey) flags.push(`options.${c.optionsKey}`);
  console.log(`${a.id}  ${a.platform.padEnd(16)} @${a.handle.padEnd(24)} max ${c.charLimit} chars  ${flags.join(", ")}`);
  for (const q of a.queues) console.log(`    queue ${q.id}  ${q.name}`);
}
