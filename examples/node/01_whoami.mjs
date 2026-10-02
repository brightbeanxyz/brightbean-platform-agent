// Who is this key? Workspace, effective permissions and channels.
//   node 01_whoami.mjs
import { BrightBean, show } from "./client.mjs";

const bb = new BrightBean();
const me = await bb.get("/me/");
show(me);
if (!me.permissions.includes("publish_directly")) {
  console.log("\nNote: no publish_directly. Scheduling or publishing goes to Review (routed: pending_approval).");
}
