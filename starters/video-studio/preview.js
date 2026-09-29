/* Live preview server. Edit a scene, hit refresh, scrub the timeline —
   what you see here is frame-for-frame what record.js will capture. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./lib/server.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 4321);
const server = await startServer(ROOT, port);

console.log(`\n  Video studio preview → \x1b[36m${server.url}\x1b[0m\n  Ctrl-C to stop.\n`);
