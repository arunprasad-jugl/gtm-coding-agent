/* ---------------------------------------------------------------
   fonts.js — pull the webfonts in brand.config.json onto disk.

   Optional but recommended. A render that fetches fonts over the
   network can silently fall back to a system face when the request is
   slow, blocked or proxied — and you won't notice until the video is
   already posted. Local files make every render identical and let you
   work offline.

     node fonts.js          # -> lib/fonts/*.woff2 + lib/fonts.css

   brand.js prefers lib/fonts.css when it exists and falls back to the
   CDN URL when it doesn't, so this is safe to skip or to re-run.
   --------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "brand.config.json"), "utf8"));

if (!cfg.fontUrl) {
  console.log("brand.config.json has no fontUrl — using the system font stack, nothing to download.");
  process.exit(0);
}

// Google Fonts serves woff2 only to browser-looking clients; the default
// Node UA gets the much larger ttf payload.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const outDir = path.join(ROOT, "lib", "fonts");
fs.mkdirSync(outDir, { recursive: true });

console.log("fetching " + cfg.fontUrl);
const res = await fetch(cfg.fontUrl, { headers: { "User-Agent": UA } });
if (!res.ok) {
  console.error(`error: font stylesheet request failed (${res.status}).`);
  process.exit(1);
}
let css = await res.text();

const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]))];
if (!urls.length) {
  console.error("error: no font files referenced in that stylesheet.");
  process.exit(1);
}

let downloaded = 0;
for (const url of urls) {
  const file = path.basename(new URL(url).pathname);
  const dest = path.join(outDir, file);

  if (!fs.existsSync(dest)) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) {
      console.error(`  ! ${file} failed (${r.status})`);
      continue;
    }
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    downloaded++;
  }
  // Rewrite to a path relative to lib/fonts.css.
  css = css.split(url).join("fonts/" + file);
}

fs.writeFileSync(path.join(ROOT, "lib", "fonts.css"), css);

const bytes = fs.readdirSync(outDir).reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
console.log(
  `✓ ${urls.length} font file(s) (${downloaded} new) → lib/fonts/  ${(bytes / 1024).toFixed(0)} KB\n` +
  `  lib/fonts.css written. Renders are now offline-safe.`
);
