/* ---------------------------------------------------------------
   sound.js — synthesize the sound design into sfx/*.wav.

   No sample library here, so every cue is generated. The important
   one is `ring`: North American ringback is genuinely 440 Hz + 480 Hz
   on a 2-seconds-on, 4-seconds-off cadence, band-limited to the
   telephone range. Getting that exactly right is most of why the cold
   open reads as a real phone call rather than a sound effect.

     node sound.js            # -> sfx/*.wav
     node sound.js --list
   --------------------------------------------------------------- */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, "sfx");
const SR = 48000;

const CUES = {
  // One 2s ring burst. The cadence comes from placing copies 6s apart.
  ring: {
    note: "Ringback: 440+480 Hz, telephone band",
    filters: [
      `sine=f=440:d=2:r=${SR}`,
      `sine=f=480:d=2:r=${SR}`,
    ],
    chain: "[0][1]amix=inputs=2:normalize=0," +
           "highpass=f=300,lowpass=f=3400," +           // telephone band
           "afade=t=in:d=0.015,afade=t=out:st=1.97:d=0.03," +
           "volume=0.5",
  },

  // Room tone: the sound of an empty lobby at night.
  room: {
    note: "Room tone, 40s bed",
    filters: [`anoisesrc=d=40:c=pink:a=0.05:r=${SR}`],
    chain: "[0]lowpass=f=780,highpass=f=40,volume=0.9",
  },

  // Low tension bed. Two close tones beat against each other slowly.
  drone: {
    note: "Tension drone, 40s bed",
    filters: [
      `sine=f=55:d=40:r=${SR}`,
      `sine=f=82.41:d=40:r=${SR}`,
      `sine=f=110:d=40:r=${SR}`,
    ],
    chain: "[0][1][2]amix=inputs=3:normalize=0,tremolo=f=0.11:d=0.35," +
           "lowpass=f=320,afade=t=in:d=2,volume=0.55",
  },

  // The moment HotelBell picks up. Rising two-note, warm.
  connect: {
    note: "Answer chime, rising",
    filters: [
      `sine=f=659.25:d=1.4:r=${SR}`,
      `sine=f=987.77:d=1.4:r=${SR}`,
    ],
    chain: "[0]afade=t=out:st=0:d=0.5,volume=0.32[a];" +
           "[1]adelay=180|180,afade=t=out:st=0.18:d=1.1,volume=0.26[b];" +
           "[a][b]amix=inputs=2:normalize=0",
  },

  // Booking written to the PMS. Short, soft, mechanical.
  confirm: {
    note: "Confirmation blip",
    filters: [`sine=f=1320:d=0.35:r=${SR}`, `sine=f=1760:d=0.35:r=${SR}`],
    chain: "[0][1]amix=inputs=2:normalize=0," +
           "afade=t=out:st=0.02:d=0.3,volume=0.22",
  },

  // Warm sustained triad for the resolution half. Where the drone sat under
  // the problem, this sits under the fix.
  pad: {
    note: "Warm pad, 40s bed",
    filters: [
      `sine=f=174.61:d=40:r=${SR}`,
      `sine=f=220:d=40:r=${SR}`,
      `sine=f=261.63:d=40:r=${SR}`,
      `sine=f=349.23:d=40:r=${SR}`,
    ],
    chain: "[0][1][2][3]amix=inputs=4:normalize=0,tremolo=f=0.1:d=0.18," +
           "lowpass=f=900,afade=t=in:d=3,volume=0.5",
  },

  // A line of the transcript landing. Soft, not a keyboard click.
  tick: {
    note: "Transcript line lands",
    filters: [`sine=f=880:d=0.22:r=${SR}`, `sine=f=1174.66:d=0.22:r=${SR}`],
    chain: "[0][1]amix=inputs=2:normalize=0," +
           "afade=t=out:st=0.01:d=0.2,volume=0.12",
  },

  // Rain against the lobby window. High hiss for the drops, low wash under.
  rain: {
    note: "Rain on glass, 40s bed",
    filters: [`anoisesrc=d=40:c=white:a=0.5:r=${SR}`, `anoisesrc=d=40:c=pink:a=0.4:r=${SR}`],
    chain: "[0]highpass=f=1800,lowpass=f=9000,volume=0.2[h];" +
           "[1]lowpass=f=600,volume=0.32[l];" +
           "[h][l]amix=inputs=2:normalize=0,tremolo=f=0.4:d=0.15",
  },

  // A phone notification. Two notes, deliberately generic.
  ping: {
    note: "Notification ping",
    filters: [`sine=f=1318.51:d=0.5:r=${SR}`, `sine=f=1760:d=0.6:r=${SR}`],
    chain: "[0]afade=t=out:st=0:d=0.35,volume=0.22[a];" +
           "[1]adelay=110|110,afade=t=out:st=0.11:d=0.45,volume=0.2[b];" +
           "[a][b]amix=inputs=2:normalize=0",
  },

  // Time running backwards to 11:46. A falling sweep over a noise swoosh.
  rewind: {
    note: "Rewind swoop",
    filters: [`aevalsrc=exprs='0.35*sin(2*PI*(2200*t-700*t*t))':d=1.3:s=${SR}`,
              `anoisesrc=d=1.3:c=white:a=0.3:r=${SR}`],
    chain: "[0]afade=t=in:d=0.05,afade=t=out:st=0.85:d=0.45[c];" +
           "[1]bandpass=f=2500:width_type=h:w=2200,afade=t=in:d=0.1,afade=t=out:st=0.25:d=1.05,volume=0.55[n];" +
           "[c][n]amix=inputs=2:normalize=0,volume=0.6",
  },

  // Room 412's key coming off its hook.
  keys: {
    note: "Key jingle",
    filters: [`sine=f=2637:d=0.5:r=${SR}`, `sine=f=3520:d=0.5:r=${SR}`,
              `sine=f=4186:d=0.5:r=${SR}`, `sine=f=5274:d=0.4:r=${SR}`,
              `anoisesrc=d=0.3:c=white:a=0.6:r=${SR}`],
    chain: "[0]afade=t=out:st=0:d=0.3,volume=0.12[a];" +
           "[1]adelay=45|45,afade=t=out:st=0.045:d=0.3,volume=0.1[b];" +
           "[2]adelay=95|95,afade=t=out:st=0.095:d=0.28,volume=0.09[c];" +
           "[3]adelay=150|150,afade=t=out:st=0.15:d=0.22,volume=0.08[d];" +
           "[4]highpass=f=5000,afade=t=out:st=0:d=0.12,volume=0.25[e];" +
           "[a][b][c][d][e]amix=inputs=5:normalize=0",
  },

  // The cut to morning. A soft hit, not a cymbal.
  impact: {
    note: "Scene-change hit",
    filters: [`anoisesrc=d=1.6:c=brown:a=0.9:r=${SR}`, `sine=f=48:d=1.6:r=${SR}`],
    chain: "[0]lowpass=f=420,afade=t=out:st=0:d=1.5[n];" +
           "[1]afade=t=out:st=0:d=1.2,volume=0.7[s];" +
           "[n][s]amix=inputs=2:normalize=0,volume=0.5",
  },
};

if (process.argv.includes("--list")) {
  for (const [name, c] of Object.entries(CUES)) console.log(`  ${name.padEnd(10)} ${c.note}`);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });

for (const [name, cue] of Object.entries(CUES)) {
  const file = path.join(OUT, `${name}.wav`);
  await ffmpeg([
    "-y",
    ...cue.filters.flatMap((f) => ["-f", "lavfi", "-i", f]),
    "-filter_complex", cue.chain,
    "-ar", String(SR), "-ac", "1",
    file,
  ]);
  const secs = (fs.statSync(file).size / (SR * 2)).toFixed(2);
  console.log(`  ✓ sfx/${name}.wav  ${secs}s  — ${cue.note}`);
}

console.log(`\n${Object.keys(CUES).length} cues → sfx/`);

function ffmpeg(argv) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...argv],
      { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}\n${err.trim()}`))));
  });
}
