/* ---------------------------------------------------------------
   record.js — turn each scene into a folder of numbered frames.

   Not a screen recording. The page's clock is stopped and every frame
   is requested by timestamp, so the output is exactly fps * duration
   frames with no dropped or duplicated ones, whatever the machine is
   doing at the time.

   If out/voice/manifest.json exists, scene lengths come from the
   narration rather than from brand.config.json — the picture is cut to
   the voice. Scenes can read window.__narration to sync visuals to it.

     node record.js                       # every video, default format
     node record.js --video maya
     node record.js --format all          # landscape + vertical + square
     node record.js --scene st3           # scenes matching "st3"
     node record.js --jobs 3              # parallel workers (default: cores - 1, max 3)
     node record.js --chunk 240           # frames per unit of work
     node record.js --png                 # lossless frames (slower)
     node record.js --scale .5 --fps 8    # fast draft
   --------------------------------------------------------------- */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
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

// Frame format. Profiling a 1080p frame: seeking costs ~3 ms, the screenshot
// 700–1500 ms, and most of that is PNG compression. JPEG at high quality is
// ~3x faster and invisible after the 4:2:0 H.264 encode that follows anyway.
const frameCfg = cfg.render.frames ?? { type: "jpeg", quality: 94 };
const frameType = args.png ? "png" : frameCfg.type;
const frameExt = frameType === "jpeg" ? "jpg" : "png";

// Parallelism. One browser per worker: same-origin pages inside a single
// browser can end up sharing a renderer process and serialise anyway.
const jobs = Math.max(1, Number(args.jobs ?? cfg.render.jobs ?? Math.min(3, os.cpus().length - 1)));

for (const f of formats) {
  if (!cfg.render.formats[f]) fail(`unknown format "${f}". Known: ${Object.keys(cfg.render.formats).join(", ")}`);
}

const voice = readVoiceManifest();
const videos = selectVideos(cfg, args.video, args.scene);

// Flatten into one queue of frame ranges. Every frame is independent — the
// page is seeked, not played — so a long scene can be split across workers
// instead of pinning one worker while the rest sit idle.
const CHUNK = Number(args.chunk ?? 240);
const queue = [];
const sceneInfo = new Map();
for (const video of videos) {
  for (const format of formats) {
    for (const scene of video.scenes) {
      const name = scene.file.replace(/\.html$/, "");
      const spoken = voice?.videos?.[video.id]?.scenes?.find((s) => s.name === name);
      // Narration normally sets the length, but a scene built around sound
      // design or a held beat needs a floor the voice can't shorten.
      const duration = Math.max(spoken?.duration ?? scene.duration, scene.minDuration ?? 0);
      const frames = Math.round((duration / 1000) * fps);
      const key = `${video.id}|${format}|${name}`;
      const dir = path.join(ROOT, "out", "frames", video.id, format, name);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      sceneInfo.set(key, { name, frames, duration, dir, spoken, done: 0, t0: 0, label: `${video.id}/${format}/${name}` });
      for (let from = 0; from < frames; from += CHUNK) {
        queue.push({ video, format, scene, key, from, to: Math.min(frames, from + CHUNK) });
      }
    }
  }
}

const server = await startServer(ROOT);
const browsers = await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, () =>
    chromium.launch({
      // Playwright's own Chromium by default. Set CHROMIUM_PATH to point at an
      // existing install instead (CI images, sandboxes, corporate machines).
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],
    })
  )
);

console.log(`${sceneInfo.size} scene(s) in ${queue.length} chunk(s) · ${formats.join(", ")} · ${fps}fps · ` +
            `${frameType} · ${browsers.length} worker(s)\n`);

const results = new Map();   // "video|format|scene" -> manifest scene entry
const started = Date.now();
let totalFrames = 0;

try {
  let next = 0;
  await Promise.all(browsers.map(async (browser) => {
    while (next < queue.length) {
      const job = queue[next++];
      await renderChunk(browser, job);
    }
  }));

  writeManifest();
  const secs = (Date.now() - started) / 1000;
  console.log(`\nRecorded ${totalFrames} frames in ${secs.toFixed(1)}s ` +
              `(${Math.round(totalFrames / (secs / 60))}/min) → out/frames/`);
  console.log("Next: node build.js");
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  await server.close();
}

/* -------------------------------------------------------------------- */

async function renderChunk(browser, { video, format, scene, key, from, to }) {
  const info = sceneInfo.get(key);
  const spec = cfg.render.formats[format];
  const width = Math.round(spec.width * scale);
  const height = Math.round(spec.height * scale);
  if (!info.t0) info.t0 = Date.now();

  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
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

  // Give the scene its narration timings before any of its code runs, so
  // captions and beats can be built against the real voice track.
  await page.addInitScript(
    ([lines, dur, data, vid]) => {
      window.__narration = lines;
      window.__sceneDuration = dur;
      window.__scene = data;   // this scene's copy, from brand.config.json
      window.__video = vid;    // which of the videos we're rendering
    },
    [info.spoken?.lines ?? [], info.duration, scene.data ?? {}, { id: video.id, title: video.title ?? video.id }]
  );

  await page.goto(`${server.url}/scenes/${scene.file}`, { waitUntil: "load" });
  const prep = await page.evaluate((d) => window.__prepare(d), info.duration);

  for (let i = from; i < to; i++) {
    await page.evaluate((t) => window.__seek(t), (i * 1000) / fps);
    await page.screenshot({
      path: path.join(info.dir, `${String(i + 1).padStart(5, "0")}.${frameExt}`),
      type: frameType,
      ...(frameType === "jpeg" ? { quality: frameCfg.quality ?? 94 } : {}),
      animations: "allow", // never "disabled" — it jumps every animation to its end state
      caret: "hide",
    });
  }
  await context.close();

  totalFrames += to - from;
  info.done += to - from;
  if (problems.length) info.problems = [...(info.problems ?? []), ...problems];
  if (!prep.fontsLoaded) info.fontWarn = true;

  if (info.done === info.frames) {
    const secs = ((Date.now() - info.t0) / 1000).toFixed(1);
    const warn = [
      info.problems?.length ? `errors: ${[...new Set(info.problems)].join(" | ")}` : "",
      info.fontWarn ? "webfont not loaded" : "",
    ].filter(Boolean).join("; ");
    console.log(
      `  \x1b[32m✓\x1b[0m ${info.label.padEnd(34)} ${String(info.frames).padStart(4)}f  ` +
      `${(info.duration / 1000).toFixed(1)}s  ${secs}s${warn ? `  \x1b[33m! ${warn}\x1b[0m` : ""}`
    );
    results.set(key, { name: info.name, frames: info.frames, duration: info.duration, ext: frameExt, width, height });
  }
}

function writeManifest() {
  // Merge into any existing manifest: recording one video or one scene must
  // not drop the others, or build.js can no longer find their frames.
  const file = path.join(ROOT, "out", "manifest.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { videos: {} };
  const manifest = { fps, scale, createdAt: new Date().toISOString(), videos: { ...prev.videos } };

  for (const video of videos) {
    const all = (cfg.videos?.length ? cfg.videos : [{ id: "main", scenes: cfg.scenes }]).find((v) => v.id === video.id);
    manifest.videos[video.id] = manifest.videos[video.id] ?? { formats: {} };
    for (const format of formats) {
      const before = prev.videos?.[video.id]?.formats?.[format]?.scenes ?? [];
      const scenes = [];
      let dims = null;
      // Keep config order; take the fresh render where there is one.
      for (const sc of all.scenes) {
        const name = sc.file.replace(/\.html$/, "");
        const fresh = results.get(`${video.id}|${format}|${name}`);
        const old = before.find((s) => s.name === name);
        const e = fresh ?? old;
        if (!e) continue;
        dims = dims ?? (fresh ? { width: fresh.width, height: fresh.height } : null);
        scenes.push({ name: e.name, frames: e.frames, duration: e.duration, ext: e.ext ?? "png" });
      }
      const spec = cfg.render.formats[format];
      manifest.videos[video.id].formats[format] = {
        width: dims?.width ?? Math.round(spec.width * scale),
        height: dims?.height ?? Math.round(spec.height * scale),
        scenes,
      };
    }
  }
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}

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
