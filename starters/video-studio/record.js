/* ---------------------------------------------------------------
   record.js — turn each scene into a folder of numbered PNG frames.

   Not a screen recording. The page's clock is stopped and every frame
   is requested by timestamp, so the output is exactly fps * duration
   frames with no dropped or duplicated ones, whatever the machine is
   doing at the time.

   If out/voice/manifest.json exists, scene lengths come from the
   narration rather than from brand.config.json — the picture is cut to
   the voice. Scenes can read window.__narration to sync visuals to it.

     node record.js                       # every video, default format
     node record.js --video front-desk
     node record.js --format all          # landscape + vertical + square
     node record.js --scene 03            # scenes matching "03"
     node record.js --fps 60
     node record.js --scale .5            # fast, low-res draft
   --------------------------------------------------------------- */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./lib/server.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "brand.config.json"), "utf8"));
const args = parseArgs(process.argv.slice(2));

const fps = Number(args.fps ?? cfg.render.fps);
const scale = Number(args.scale ?? 1);
const formats =
  args.format === "all"
    ? Object.keys(cfg.render.formats)
    : (args.format ? String(args.format).split(",") : cfg.render.defaultFormats);

for (const f of formats) {
  if (!cfg.render.formats[f]) fail(`unknown format "${f}". Known: ${Object.keys(cfg.render.formats).join(", ")}`);
}

const voice = readVoiceManifest();
const videos = selectVideos(cfg, args.video, args.scene);

const server = await startServer(ROOT);
const browser = await chromium.launch({
  // Playwright's own Chromium by default. Set CHROMIUM_PATH to point at an
  // existing install instead (CI images, sandboxes, corporate machines).
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],
});

const manifest = { fps, scale, createdAt: new Date().toISOString(), videos: {} };
const started = Date.now();

try {
  for (const video of videos) {
    console.log(`\n\x1b[1m\x1b[7m ${video.id} \x1b[0m`);
    manifest.videos[video.id] = { formats: {} };

    for (const format of formats) {
      const spec = cfg.render.formats[format];
      const width = Math.round(spec.width * scale);
      const height = Math.round(spec.height * scale);
      console.log(`\n  ${format}  ${width}x${height} @ ${fps}fps`);

      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        reducedMotion: "no-preference",
      });

      const entry = { width, height, scenes: [] };
      manifest.videos[video.id].formats[format] = entry;

      for (const scene of video.scenes) {
        const name = scene.file.replace(/\.html$/, "");
        const spoken = voice?.videos?.[video.id]?.scenes?.find((s) => s.name === name);
        const duration = spoken?.duration ?? scene.duration;

        const dir = path.join(ROOT, "out", "frames", video.id, format, name);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });

        const page = await context.newPage();
        const problems = [];
        // Chromium asks for /favicon.ico on the first page of a context and logs
        // the 404 with the URL in location(), not in the message text.
        const noise = /favicon|ERR_CERT_AUTHORITY_INVALID/;
        page.on("console", (m) => {
          if (m.type() !== "error") return;
          const where = m.location()?.url || "";
          if (noise.test(m.text()) || noise.test(where)) return;
          problems.push(m.text());
        });
        page.on("pageerror", (e) => problems.push(e.message));

        // Give the scene its narration timings before any of its code runs,
        // so captions and beats can be built against the real voice track.
        await page.addInitScript(
          ([lines, dur, data, video]) => {
            window.__narration = lines;
            window.__sceneDuration = dur;
            window.__scene = data;   // this scene's copy, from brand.config.json
            window.__video = video;  // which of the videos we're rendering
          },
          [spoken?.lines ?? [], duration, scene.data ?? {}, { id: video.id, title: video.title ?? video.id }]
        );

        await page.goto(`${server.url}/scenes/${scene.file}`, { waitUntil: "load" });
        const info = await page.evaluate((d) => window.__prepare(d), duration);

        if (problems.length) console.warn(`    ! ${name}: ${problems.join(" | ")}`);
        if (!info.fontsLoaded) console.warn(`    ! ${name}: webfont not loaded, using fallback`);

        const frames = Math.round((duration / 1000) * fps);
        const t0 = Date.now();

        for (let i = 0; i < frames; i++) {
          await page.evaluate((t) => window.__seek(t), (i * 1000) / fps);
          await page.screenshot({
            path: path.join(dir, String(i + 1).padStart(5, "0") + ".png"),
            animations: "allow", // never "disabled" — it jumps every animation to its end state
            caret: "hide",
          });
          if (i % 20 === 0 || i === frames - 1) progress(name, i + 1, frames);
        }

        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        process.stdout.write(
          `\r    \x1b[32m✓\x1b[0m ${name.padEnd(22)} ${String(frames).padStart(4)}f  ` +
          `${(duration / 1000).toFixed(1)}s  (${info.animations} anims, ${info.hooks} hooks, ${secs}s)` +
          " ".repeat(8) + "\n"
        );

        entry.scenes.push({ name, frames, duration });
        await page.close();
      }

      await context.close();
    }
  }

  fs.writeFileSync(path.join(ROOT, "out", "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nRecorded in ${((Date.now() - started) / 1000).toFixed(1)}s → out/frames/`);
  console.log("Next: node build.js");
} finally {
  await browser.close();
  await server.close();
}

/* -------------------------------------------------------------------- */

function readVoiceManifest() {
  const file = path.join(ROOT, "out", "voice", "manifest.json");
  if (!fs.existsSync(file)) {
    console.log("note: no narration found — using durations from brand.config.json.");
    console.log("      Run `node voice.js` first to cut the picture to the voice.");
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Works with a single-video config (`scenes`) or a multi-video one (`videos`). */
function selectVideos(cfg, videoFilter, sceneFilter) {
  const all = cfg.videos?.length ? cfg.videos : [{ id: "main", scenes: cfg.scenes }];
  let picked = videoFilter ? all.filter((v) => v.id.includes(String(videoFilter))) : all;
  if (!picked.length) fail(`no video matched --video ${videoFilter}. Have: ${all.map((v) => v.id).join(", ")}`);

  if (sceneFilter) {
    picked = picked
      .map((v) => ({ ...v, scenes: v.scenes.filter((s) => s.file.includes(String(sceneFilter))) }))
      .filter((v) => v.scenes.length);
    if (!picked.length) fail(`no scenes matched --scene ${sceneFilter}`);
  }
  return picked;
}

function progress(label, done, total) {
  const width = 22;
  const filled = Math.round((done / total) * width);
  process.stdout.write(
    `\r    ${label.padEnd(22)} [${"█".repeat(filled)}${"·".repeat(width - filled)}] ${done}/${total}`
  );
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? (i++, next) : true;
  }
  return out;
}

function fail(msg) {
  console.error("error: " + msg);
  process.exit(1);
}
