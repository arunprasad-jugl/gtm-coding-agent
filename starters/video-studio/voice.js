/* ---------------------------------------------------------------
   voice.js — synthesize the narration, then let it set the timing.

   Narrated video has to be cut to the voice, not the other way round:
   guess a scene length and the track either runs out early or gets
   clipped mid-sentence. So this runs BEFORE record.js — it speaks each
   line, measures it, and writes out/voice/manifest.json with the real
   duration of every scene. record.js records to those numbers and
   build.js lays the audio back on the same timeline.

     node setup-voice.js     # once, to fetch the model
     node voice.js           # -> out/voice/*.wav + manifest.json
     node voice.js --video maya
     node voice.js --fresh      # re-roll takes (timing moves: re-record after)
   --------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "brand.config.json"), "utf8"));
const args = parseArgs(process.argv.slice(2));

const v = cfg.voice || {};
const model = path.join(ROOT, "voices", `${v.model || "en-us-ryan-high"}.onnx`);
if (!fs.existsSync(model)) {
  console.error(`error: voice model missing.\n  Run: node setup-voice.js`);
  process.exit(1);
}

// Pacing. These are the knobs that make narration feel composed rather
// than rushed — a beat before the first word, a breath between lines, and
// a moment of quiet at the end so the cut doesn't clip the last syllable.
const lengthScale = v.lengthScale ?? 1.0;
const sentenceSilence = v.sentenceSilence ?? 0.3;
const gap = v.gap ?? 0.35;
const leadIn = v.leadIn ?? 0.5;
const tail = v.tail ?? 0.9;

const videos = selectVideos(cfg, args.video);
const outRoot = path.join(ROOT, "out", "voice");
fs.mkdirSync(outRoot, { recursive: true });


// Merge into any existing manifest: running with --video must not wipe the
// timings of the videos it didn't touch.
const manifestFile = path.join(outRoot, "manifest.json");
const previous = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, "utf8"))
  : { videos: {} };
const manifest = { model: v.model, leadIn, gap, tail, videos: { ...previous.videos } };
let fresh = 0, reused = 0;

for (const video of videos) {
  console.log(`\n\x1b[1m${video.id}\x1b[0m`);
  const dir = path.join(outRoot, video.id);
  fs.mkdirSync(dir, { recursive: true });
  manifest.videos[video.id] = { scenes: [] };

  for (const scene of video.scenes) {
    const name = scene.file.replace(/\.html$/, "");
    const lines = toLines(scene.narration);

    if (!lines.length) {
      // A scene can be deliberately silent — a title card, a logo sting.
      manifest.videos[video.id].scenes.push({ name, duration: scene.duration, silent: true, lines: [] });
      console.log(`  · ${name.padEnd(22)} (silent) ${(scene.duration / 1000).toFixed(1)}s`);
      continue;
    }

    const clips = [];
    // A scene can hold the voice back — the cold open plays sixteen seconds
    // of ringing phone before anyone says a word.
    let cursor = scene.narrationStart ?? leadIn * 1000;
    let end = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const wav = path.join(dir, `${name}-${String(i + 1).padStart(2, "0")}.wav`);
      await speakCached(line, wav);
      // A voice heard through a handset is band-limited like one.
      if (line.fx === "phone") await phoneFx(wav);
      // Then bring every line to one loudness. Different models, and the phone
      // filter above all, land at very different levels — measured before this,
      // the HotelBell agent sat 9 dB under the narrator, which on a phone
      // speaker means the product's own voice barely comes through.
      await normalize(wav, line.loudness ?? v.loudness ?? -18);
      const dur = await durationMs(wav);

      // Dialogue is placed where the picture needs it (`at`); narration
      // without one just follows the previous line.
      const start = Math.round(line.at ?? cursor + (line.gapBefore ?? 0));
      const role = line.role ?? "narrator";
      clips.push({
        text: line.text,
        // What's read on screen can differ from what's spoken: "one-nineteen"
        // is said, "$119" is shown.
        caption: line.caption ?? line.text,
        file: path.relative(ROOT, wav),
        start, duration: dur,
        role,
        label: line.label ?? null,
        sub: line.sub ?? role === "narrator",
      });
      cursor = start + dur + gap * 1000;
      end = Math.max(end, start + dur);
    }

    // Add the tail pad after whichever line finishes last. A scene may also
    // declare a floor it must hold to, for sound design or a held beat.
    const duration = Math.max(Math.round(end + (scene.tailMs ?? tail * 1000)), scene.minDuration ?? 0);
    manifest.videos[video.id].scenes.push({ name, duration, silent: false, lines: clips });

    const words = lines.map((l) => l.text).join(" ").split(/\s+/).length;
    const cast = [...new Set(lines.map((l) => l.role ?? "narrator"))].join(", ");
    console.log(
      `  \x1b[32m✓\x1b[0m ${name.padEnd(22)} ${(duration / 1000).toFixed(1)}s  ` +
      `${lines.length} line(s), ${words} words  [${cast}]`
    );
  }

  const total = manifest.videos[video.id].scenes.reduce((n, s) => n + s.duration, 0);
  console.log(`  total ${(total / 1000).toFixed(1)}s`);
}

fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
console.log(`\ntakes: ${fresh} synthesised, ${reused} reused from cache` +
  (fresh ? "  — timing changed; re-run record.js" : "  — timing unchanged"));
console.log(`\n→ out/voice/manifest.json\nNext: node record.js`);

/* -------------------------------------------------------------------- */

/**
 * Piper is not deterministic: the same line synthesised three times came out
 * at 5.96s, 5.82s and 6.12s. So every run used to re-roll every line's timing
 * and silently desync any frames already recorded against the last run.
 *
 * Takes are cached by everything that shapes them. A line is only
 * re-synthesised when its text or voice settings change, or with --fresh
 * (to re-roll a take you don't like — then re-record, since timing moves).
 * Filters and loudness are applied to a copy each run, so those can change
 * freely without disturbing timing.
 */
async function speakCached(line, outFile) {
  const voiceName = line.voice ?? v.model;
  const key = crypto.createHash("sha1").update(JSON.stringify({
    text: line.text,
    voice: voiceName,
    speaker: line.voice ? line.speaker ?? null : line.speaker ?? v.speaker ?? null,
    lengthScale: line.lengthScale ?? lengthScale,
    sentenceSilence,
    volume: v.volume ?? 1.0,
  })).digest("hex").slice(0, 16);

  const takes = path.join(outRoot, ".takes");
  fs.mkdirSync(takes, { recursive: true });
  const take = path.join(takes, `${key}.wav`);
  if (args.fresh || !fs.existsSync(take)) {
    await speak(line, take);
    fresh++;
  } else {
    reused++;
  }
  fs.copyFileSync(take, outFile);
}

function speak(line, outFile) {
  // Each line can be spoken by its own voice: the narrator, Maya, the
  // HotelBell agent, the clerk across the road.
  const voiceName = line.voice ?? v.model;
  const modelFile = path.join(ROOT, "voices", `${voiceName}.onnx`);
  if (!fs.existsSync(modelFile)) {
    return Promise.reject(new Error(`voice "${voiceName}" missing — run: node setup-voice.js ${voiceName}`));
  }
  const speaker = line.voice ? line.speaker : (line.speaker ?? v.speaker);

  return new Promise((resolve, reject) => {
    const p = spawn("python3", [
      "-m", "piper",
      "-m", modelFile,
      "-f", outFile,
      "--length-scale", String(line.lengthScale ?? lengthScale),
      "--sentence-silence", String(sentenceSilence),
      "--volume", String(v.volume ?? 1.0),
      // LibriTTS and other multi-speaker models carry hundreds of voices in
      // one file; without -s you get speaker 0 whatever you picked.
      ...(speaker != null ? ["-s", String(speaker)] : []),
    ], { stdio: ["pipe", "ignore", "pipe"] });

    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) =>
      reject(new Error(`could not run piper (${e.message}). Install it with: pip install piper-tts`))
    );
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`piper exited ${c}\n${err.trim()}`))));

    p.stdin.end(line.text);
  });
}

/** Loudness-normalise to `lufs` integrated, keeping the file's sample rate. */
function normalize(file, lufs) {
  const tmp = file.replace(/\.wav$/, ".ln.wav");
  return new Promise((resolve, reject) => {
    const probe = spawn("ffprobe", ["-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=sample_rate", "-of", "csv=p=0", file], { stdio: ["ignore", "pipe", "ignore"] });
    let rate = "";
    probe.stdout.on("data", (d) => (rate += d));
    probe.on("close", () => {
      const p = spawn("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-i", file,
        "-af", `loudnorm=I=${lufs}:TP=-2:LRA=9`,
        "-ar", rate.trim() || "22050",
        tmp,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      p.stderr.on("data", (d) => (err += d));
      p.on("error", reject);
      p.on("close", (c) => {
        if (c !== 0) return reject(new Error(`loudnorm failed\n${err.trim()}`));
        fs.renameSync(tmp, file);
        resolve();
      });
    });
  });
}

/** Telephone band + a little compression: the voice on the other end of a call. */
function phoneFx(file) {
  const tmp = file.replace(/\.wav$/, ".fx.wav");
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", file,
      "-af", "highpass=f=320,lowpass=f=3300,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,volume=1.25",
      tmp,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (c) => {
      if (c !== 0) return reject(new Error(`ffmpeg phone fx failed\n${err.trim()}`));
      fs.renameSync(tmp, file);
      resolve();
    });
  });
}

function durationMs(file) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => {
      const secs = parseFloat(out.trim());
      Number.isFinite(secs) ? resolve(Math.round(secs * 1000)) : reject(new Error(`ffprobe failed on ${file}`));
    });
  });
}

/**
 * Narration may be one string, an array of strings, or an array of line
 * objects: { text, at?, voice?, speaker?, fx?, role?, label?, sub? }.
 */
function toLines(narration) {
  if (!narration) return [];
  return (Array.isArray(narration) ? narration : [narration])
    .map((l) => (typeof l === "string" ? { text: l } : { ...l }))
    .map((l) => ({ ...l, text: String(l.text ?? "").trim() }))
    .filter((l) => l.text);
}

/** Works with a single-video config (`scenes`) or a multi-video one (`videos`). */
function selectVideos(cfg, filter) {
  const all = cfg.videos?.length ? cfg.videos : [{ id: "main", scenes: cfg.scenes }];
  const picked = filter ? all.filter((x) => x.id.includes(String(filter))) : all;
  if (!picked.length) {
    console.error(`error: no video matched --video ${filter}. Have: ${all.map((x) => x.id).join(", ")}`);
    process.exit(1);
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
