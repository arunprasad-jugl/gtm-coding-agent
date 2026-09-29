/* ---------------------------------------------------------------
   build.js — encode recorded frames into shippable video.

   Reads out/manifest.json (record.js) and, when present,
   out/voice/manifest.json (voice.js). Produces per video and format:
     out/scenes/<video>/<format>/<scene>.mp4   one clip per scene
     out/<brand>-<video>-<format>.mp4          the full cut, with audio

     node build.js
     node build.js --video front-desk --format vertical
     node build.js --no-transition   # hard cuts instead of crossfades
     node build.js --gif
   --------------------------------------------------------------- */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "brand.config.json"), "utf8"));
const args = parseArgs(process.argv.slice(2));

const manifestPath = path.join(ROOT, "out", "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("error: out/manifest.json missing — run `node record.js` first.");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const voicePath = path.join(ROOT, "out", "voice", "manifest.json");
const voice = fs.existsSync(voicePath) ? JSON.parse(fs.readFileSync(voicePath, "utf8")) : null;

const enc = cfg.encode;
const fps = manifest.fps;
const xfade = args["no-transition"] ? 0 : (enc.transition ? Number(enc.transitionDuration) || 0 : 0);
const slug = slugify(cfg.brand.name);

await assertFfmpeg();

const videoIds = args.video
  ? Object.keys(manifest.videos).filter((id) => id.includes(String(args.video)))
  : Object.keys(manifest.videos);
if (!videoIds.length) {
  console.error(`error: no recorded video matched --video ${args.video}. Have: ${Object.keys(manifest.videos).join(", ")}`);
  process.exit(1);
}

for (const videoId of videoIds) {
  const formats = args.format
    ? String(args.format).split(",")
    : Object.keys(manifest.videos[videoId].formats);

  for (const format of formats) {
    const entry = manifest.videos[videoId].formats[format];
    if (!entry) {
      console.error(`error: ${videoId}/${format} was not recorded.`);
      process.exit(1);
    }

    console.log(`\n\x1b[1m${videoId} · ${format}\x1b[0m  ${entry.width}x${entry.height}`);
    const sceneDir = path.join(ROOT, "out", "scenes", videoId, format);
    fs.mkdirSync(sceneDir, { recursive: true });

    // --- 1. each scene's frames -> its own clip ---------------------------
    const clips = [];
    for (const scene of entry.scenes) {
      const frames = path.join(ROOT, "out", "frames", videoId, format, scene.name, "%05d.png");
      const clip = path.join(sceneDir, `${scene.name}.mp4`);
      await ffmpeg([
        "-y", "-framerate", String(fps), "-i", frames,
        "-c:v", "libx264", "-preset", enc.preset, "-crf", String(enc.crf),
        // yuv420p + even dimensions: the combination every player and social
        // upload actually accepts. Without it Safari and X show a black box.
        "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-movflags", "+faststart",
        clip,
      ]);
      clips.push({ name: scene.name, path: clip, seconds: scene.frames / fps });
      console.log(`  ✓ ${scene.name}.mp4  ${(scene.frames / fps).toFixed(1)}s`);
    }

    // --- 2. join them ----------------------------------------------------
    const final = path.join(ROOT, "out", `${slug}-${videoId}-${format}.mp4`);
    const silent = path.join(ROOT, "out", `.${slug}-${videoId}-${format}.silent.mp4`);
    const total = totalSeconds(clips, xfade);

    const track = await buildNarration(videoId, clips, total);
    const joined = track ? silent : final;

    if (clips.length === 1) {
      fs.copyFileSync(clips[0].path, joined);
    } else if (xfade > 0) {
      await ffmpeg([...clips.flatMap((c) => ["-i", c.path]), ...xfadeArgs(clips, xfade, enc), joined]);
    } else {
      const list = path.join(ROOT, "out", `.concat-${videoId}-${format}.txt`);
      fs.writeFileSync(list, clips.map((c) => `file '${c.path.replace(/'/g, "'\\''")}'`).join("\n"));
      await ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
      fs.rmSync(list, { force: true });
    }

    // --- 3. lay the audio back on ----------------------------------------
    if (track) {
      await ffmpeg([
        "-y", "-i", joined, "-i", track,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
        "-movflags", "+faststart",
        final,
      ]);
      fs.rmSync(silent, { force: true });
    }

    const mb = (fs.statSync(final).size / 1e6).toFixed(1);
    console.log(`  \x1b[32m▶\x1b[0m ${path.relative(ROOT, final)}  ${total.toFixed(1)}s  ${mb} MB${track ? "  + voice" : ""}`);

    // --- 4. optional gif --------------------------------------------------
    if (args.gif || enc.gif) {
      const gif = final.replace(/\.mp4$/, ".gif");
      const palette = path.join(ROOT, "out", ".palette.png");
      await ffmpeg(["-y", "-i", final, "-vf", "fps=15,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff", palette]);
      await ffmpeg([
        "-y", "-i", final, "-i", palette,
        "-lavfi", "fps=15,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3",
        gif,
      ]);
      fs.rmSync(palette, { force: true });
      console.log(`  \x1b[32m▶\x1b[0m ${path.relative(ROOT, gif)}  ${(fs.statSync(gif).size / 1e6).toFixed(1)} MB`);
    }
  }
}

console.log("\nDone. Files are in out/.");

/* -------------------------------------------------------------------- */

/**
 * Lay every spoken line onto one track at its absolute position in the cut.
 *
 * Each line knows its offset inside its own scene; this adds the scene's
 * start in the finished video. Crossfades overlap neighbouring clips, so
 * every transition pulls the rest of the timeline `xfade` seconds earlier —
 * miss that and the voice drifts further out of sync with every scene.
 */
async function buildNarration(videoId, clips, totalSecs) {
  const scenes = voice?.videos?.[videoId]?.scenes;
  if (!scenes) return null;

  const inputs = [];
  const filters = [];
  let offset = 0;

  for (const clip of clips) {
    const spoken = scenes.find((s) => s.name === clip.name);
    for (const line of spoken?.lines ?? []) {
      const at = Math.round((offset + line.start / 1000) * 1000);
      const i = inputs.length;
      inputs.push(path.join(ROOT, line.file));
      filters.push(`[${i}:a]adelay=${at}|${at}[a${i}]`);
    }
    offset += clip.seconds - xfade;
  }
  if (!inputs.length) return null;

  const music = cfg.voice?.music ? path.resolve(ROOT, cfg.voice.music) : null;
  if (music && !fs.existsSync(music)) {
    console.error(`error: voice.music points at "${cfg.voice.music}" but that file doesn't exist.`);
    process.exit(1);
  }

  const labels = inputs.map((_, i) => `[a${i}]`).join("");
  let chain = `${filters.join(";")};${labels}amix=inputs=${inputs.length}:normalize=0:dropout_transition=0[voice]`;
  let out = "[voice]";

  if (music) {
    const m = inputs.length;
    const gain = cfg.voice.musicGain ?? 0.18;
    const fade = Math.max(0, totalSecs - 2).toFixed(2);
    // Bed sits well under the voice and fades out with the last scene.
    chain += `;[${m}:a]volume=${gain},afade=t=out:st=${fade}:d=2[bed];[voice][bed]amix=inputs=2:normalize=0[mixed]`;
    out = "[mixed]";
  }

  // Pad with silence to the full length. amix ends with its last input, and
  // -t truncates but never extends — without apad the track is short and the
  // -shortest mux then clips the tail off the final scene.
  chain += `;${out}apad[out]`;

  const track = path.join(ROOT, "out", "voice", `${videoId}-mix.wav`);
  await ffmpeg([
    "-y",
    ...inputs.flatMap((f) => ["-i", f]),
    ...(music ? ["-stream_loop", "-1", "-i", music] : []),
    "-filter_complex", chain,
    "-map", "[out]",
    "-t", totalSecs.toFixed(3),
    "-ar", "48000", "-ac", "2",
    track,
  ]);
  return track;
}

/**
 * Build the xfade filter chain. Each crossfade overlaps its two clips, so
 * every transition shortens the result by `d` seconds and each offset has
 * to be measured against the already-shortened running total.
 */
function xfadeArgs(clips, d, enc) {
  const steps = [];
  let acc = clips[0].seconds;
  let label = "0:v";

  for (let i = 1; i < clips.length; i++) {
    const offset = Math.max(0, acc - d);
    const out = i === clips.length - 1 ? "v" : `v${i}`;
    steps.push(`[${label}][${i}:v]xfade=transition=${enc.transition}:duration=${d}:offset=${offset.toFixed(3)}[${out}]`);
    acc = acc + clips[i].seconds - d;
    label = out;
  }

  return [
    "-y",
    "-filter_complex", steps.join(";"),
    "-map", "[v]",
    "-c:v", "libx264", "-preset", enc.preset, "-crf", String(enc.crf),
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  ];
}

function totalSeconds(clips, d) {
  return clips.reduce((sum, c) => sum + c.seconds, 0) - d * (clips.length - 1);
}

function ffmpeg(argv, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...argv], {
      stdio: ["ignore", quiet ? "ignore" : "inherit", "pipe"],
    });
    let err = "";
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}\n${err.trim()}`))
    );
  });
}

async function assertFfmpeg() {
  try {
    await ffmpeg(["-version"], { quiet: true });
  } catch {
    console.error("error: ffmpeg not found on PATH.\n  macOS: brew install ffmpeg\n  Ubuntu: sudo apt install ffmpeg\n  Windows: winget install Gyan.FFmpeg");
    process.exit(1);
  }
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";
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
