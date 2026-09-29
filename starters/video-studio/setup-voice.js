/* ---------------------------------------------------------------
   setup-voice.js — fetch the Piper voice named in brand.config.json.

   Piper is a local neural TTS: no API key, no per-character billing,
   no audio leaving the machine. Models are ~60-110 MB and cached in
   voices/ after the first run.

     node setup-voice.js            # the configured voice
     node setup-voice.js --list     # what else is available
   --------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "brand.config.json"), "utf8"));
const BASE = "https://github.com/rhasspy/piper/releases/download/v0.0.2";

const VOICES = {
  "en-us-ryan-high":     "Male, warm and measured. Good for founder/brand narration.",
  "en-us-ryan-medium":   "Male, same voice, smaller and faster to synthesize.",
  "en-us-libritts-high": "Multi-speaker (904), volunteer readers — accents vary. 22 kHz.",
  "en-us-amy-low":       "Female, American, light and friendly. 16 kHz.",
  "en-us-kathleen-low":  "Female, American, calm and even. 16 kHz.",
  "en-us-lessac-medium": "Female, American, professional narrator. 16 kHz.",
  "en-us-danny-low":     "Male, American, casual. Good for a bit part.",
};

if (process.argv.includes("--list")) {
  console.log("\nAvailable voices (set voice.model in brand.config.json):\n");
  for (const [name, note] of Object.entries(VOICES)) {
    console.log(`  ${name.padEnd(22)} ${note}`);
  }
  console.log();
  process.exit(0);
}

// A voice named on the command line, or the configured narrator. Dialogue
// lines can name other voices; fetch those the same way.
const named = process.argv.slice(2).find((a) => !a.startsWith("--"));
const model = named || cfg.voice?.model || "en-us-ryan-high";
const dir = path.join(ROOT, "voices");
fs.mkdirSync(dir, { recursive: true });

if (fs.existsSync(path.join(dir, `${model}.onnx`))) {
  console.log(`✓ ${model} already in voices/`);
  process.exit(0);
}

console.log(`downloading ${model} …`);
await run("bash", ["-lc", `curl -sSL --max-time 600 "${BASE}/voice-${model}.tar.gz" | tar xz -C "${dir}"`]);

if (!fs.existsSync(path.join(dir, `${model}.onnx`))) {
  console.error(
    `error: "${model}" didn't download. Run \`node setup-voice.js --list\` for valid names.`
  );
  process.exit(1);
}

const mb = (fs.statSync(path.join(dir, `${model}.onnx`)).size / 1e6).toFixed(0);
console.log(`✓ voices/${model}.onnx (${mb} MB)\n  Next: node voice.js`);

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: "inherit" });
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} exited ${c}`))));
  });
}
