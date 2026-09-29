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
     node voice.js --video front-desk
   --------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
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

const manifest = { model: v.model, leadIn, gap, tail, videos: {} };

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
    let cursor = leadIn * 1000;

    for (let i = 0; i < lines.length; i++) {
      const wav = path.join(dir, `${name}-${String(i + 1).padStart(2, "0")}.wav`);
      await speak(lines[i], wav);
      const dur = await durationMs(wav);
      clips.push({ text: lines[i], file: path.relative(ROOT, wav), start: Math.round(cursor), duration: dur });
      cursor += dur + gap * 1000;
    }

    // Drop the trailing gap, then add the tail pad.
    const duration = Math.round(cursor - gap * 1000 + tail * 1000);
    manifest.videos[video.id].scenes.push({ name, duration, silent: false, lines: clips });

    const words = lines.join(" ").split(/\s+/).length;
    console.log(
      `  \x1b[32m✓\x1b[0m ${name.padEnd(22)} ${(duration / 1000).toFixed(1)}s  ` +
      `${lines.length} line(s), ${words} words`
    );
  }

  const total = manifest.videos[video.id].scenes.reduce((n, s) => n + s.duration, 0);
  console.log(`  total ${(total / 1000).toFixed(1)}s`);
}

fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n→ out/voice/manifest.json\nNext: node record.js`);

/* -------------------------------------------------------------------- */

function speak(text, outFile) {
  return new Promise((resolve, reject) => {
    const p = spawn("python3", [
      "-m", "piper",
      "-m", model,
      "-f", outFile,
      "--length-scale", String(lengthScale),
      "--sentence-silence", String(sentenceSilence),
      "--volume", String(v.volume ?? 1.0),
      // LibriTTS and other multi-speaker models carry hundreds of voices in
      // one file; without -s you get speaker 0 whatever you picked.
      ...(v.speaker != null ? ["-s", String(v.speaker)] : []),
    ], { stdio: ["pipe", "ignore", "pipe"] });

    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) =>
      reject(new Error(`could not run piper (${e.message}). Install it with: pip install piper-tts`))
    );
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`piper exited ${c}\n${err.trim()}`))));

    p.stdin.end(text);
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

/** Narration may be one string, or an array of lines to pace separately. */
function toLines(narration) {
  if (!narration) return [];
  return (Array.isArray(narration) ? narration : [narration])
    .map((s) => String(s).trim())
    .filter(Boolean);
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
