# Video Studio

Brand video made out of code. HTML and CSS for the picture, Playwright to
capture it, Piper for the voiceover, ffmpeg to encode. No video model, no
After Effects, no stock-footage subscription — and no per-render cost, so a
fifth revision is as cheap as the first.

```
brand.config.json   copy, colours, scenes, voice          <- edit this first
scenes/*.html       one file per scene, plain HTML + CSS
lib/                shared stylesheet, brand loader, scrub engine
voice.js            narration -> wav + the timing every scene is cut to
record.js           scenes -> numbered PNG frames
build.js            frames + voice -> mp4
preview.html        scrub any scene in the browser while you edit
```

## Setup

```bash
npm install
node fonts.js          # optional: pull webfonts local so renders are offline-safe
node setup-voice.js    # optional: ~60-120 MB neural voice, runs on CPU
node sound.js          # optional: synthesize the sound-design cues into sfx/
```

`fonts/`, `voices/` and `sfx/` are all generated and git-ignored — re-run
those three commands after a fresh clone.

`ffmpeg` must be on your PATH — `brew install ffmpeg`,
`sudo apt install ffmpeg`, or `winget install Gyan.FFmpeg`.

## Make a video

```bash
node voice.js      # speak the narration, measure it, set the scene lengths
node record.js     # capture every frame
node build.js      # encode + mux the voice
```

Output lands in `out/`: one mp4 per scene under `out/scenes/`, and the full
cut as `out/<brand>-<video>-<format>.mp4`.

While you are writing scenes, `node preview.js` serves the studio at
<http://127.0.0.1:4321> — pick a scene, drag the timeline, step frame by
frame with the arrow keys. It renders through exactly the same code path as
the recorder, so what you scrub is what you get.

Useful flags:

```bash
node record.js --scale .4 --fps 12     # quick draft, seconds not minutes
node record.js --format all            # 16:9, 9:16 and 1:1
node record.js --video front-desk      # one video from a multi-video config
node build.js --no-transition          # hard cuts instead of crossfades
node build.js --gif                    # also write a gif
node build.js --web                    # also write a <30 MiB upload copy
node build.js --web 12                 # ...to a different budget, in MiB
```

`--web` only kicks in when the master is over budget. Grain-heavy footage is
the usual reason: the film in this repo masters at ~68 MiB and needs a
two-pass `-tune grain` copy to clear a 30 MiB limit.

## How the capture works

A browser animation normally plays against wall-clock time, so recording it
means racing it: every frame the renderer is late for is a frame you lose,
and a busy laptop produces a visibly worse video than an idle one.

`lib/studio.js` detaches the page from the clock instead. Every animation is
paused, and each frame is requested at an exact timestamp:

```js
await window.__prepare(durationMs);   // fonts loaded, clock stopped
window.__seek(1234);                  // put the scene at exactly 1.234s
```

The recorder then walks `0, 1/fps, 2/fps …` and screenshots each position.
A slow machine gives you the same file as a fast one — it just takes longer.

Two rules follow from this, and both are load-bearing:

- **Every animation must hold its start and end state.** `stage.css` sets
  `animation-fill-mode: both` globally. Without it, seeking to a moment
  before an animation begins shows the element un-animated.
- **JS-driven effects must be a pure function of `t`.** Counters and canvas
  work go through `__studio.onSeek(t => …)` and compute their value from `t`
  alone — never from a frame counter or accumulated state, or scrubbing
  backwards breaks.

## Writing a scene

A scene is one HTML file. Link the shared stylesheet and the two library
scripts, then write normal markup:

```html
<link rel="stylesheet" href="../lib/stage.css">
<script src="../lib/brand.js"></script>
<script src="../lib/studio.js"></script>

<div class="stage">
  <div class="bg-glow a-drift"></div>
  <div class="kicker a-rise" style="--delay:.1s" data-brand="copy.problem_kicker"></div>
  <h1 class="a-rise" style="--delay:.35s">Something true and uncomfortable</h1>
</div>
```

- `data-brand="path.to.value"` fills text from `brand.config.json`.
- Animation classes (`a-rise`, `a-fade`, `a-blur`, `a-pop`, `a-slide`,
  `a-wipe`) are driven by `--delay` and `--dur`.
- `__studio.lines(el, ["First.", "Second."])` builds headline lines that
  ride up from behind a mask.
- `window.__narration` holds `{ text, start, duration }` for every spoken
  line in the scene, so visuals can land on the words.

Everything in `theme` becomes a CSS variable (`--brand-accent` and so on),
and the type scale is in `vmin`, so a scene laid out for 16:9 also holds up
at 9:16 and 1:1 without a separate design.

### One gotcha worth knowing

`background-clip: text` only paints glyphs that share the background's paint
layer. Put `.gradient-text` on the element that *directly* contains the text
— on a wrapper it renders invisible as soon as a descendant has
`overflow: hidden` or a transform, and a scrubbed animation always leaves a
transform applied.

## Narration

Scenes take a `narration` string or array in `brand.config.json`:

```json
{ "file": "02-problem.html", "narration": ["Your front desk is drowning.", "Every single night."] }
```

`voice.js` speaks each line locally with Piper, measures it, and writes the
real scene lengths to `out/voice/manifest.json`. `record.js` records to those
lengths and `build.js` lays each line back down at its exact offset in the
cut. Narrated video has to be cut to the voice — guess the timing and the
track either runs out early or gets clipped mid-sentence.

Pacing lives in `voice.lengthScale`, `gap`, `leadIn` and `tail`.
`node setup-voice.js --list` shows the other voices. For a music bed, point
`voice.music` at an audio file; `voice.musicGain` keeps it under the words.

Scenes with no `narration` stay silent and keep their configured duration —
useful for a logo sting or an end card.

---

## This configuration: HotelBell

`brand.config.json` is set up with the HotelBell brand and four videos, one
per solution:

| `--video`     | Solution     | The moment it opens on                         |
|---------------|--------------|------------------------------------------------|
| `reservation` | Reservation  | 11:47 PM, third ring, nobody at the desk       |
| `follow-up`   | Follow-up    | The quote you sent Tuesday, still unanswered   |
| `rfp`         | RFP Response | A 60-room RFP answered on Friday, booked Tuesday |
| `review`      | Review       | A quiet checkout that becomes a one-star       |

Each runs the same seven beats, roughly 60 seconds:

1. **Cold open** — one concrete moment, not a feature. The hook is a person
   the owner recognises, not a statistic.
2. **The cost** — what that moment is worth over a year, counted up on screen.
3. **The solution** — the bell, the name, the one-line promise.
4. **How it works** — three steps, in the operator's language.
5. **The maths** — the ROI laid out on cream, so the turn from pain to
   payoff is visible before a word is spoken.
6. **Also included** — call transfer, mobile app, recording, transcription,
   PMS integration.
7. **The close** — lockup, tagline, "Book a demo", the two trust lines.

### The ROI numbers are a model, not a measurement

The site publishes no performance statistics, so nothing here is presented
as a HotelBell result. Every figure is an arithmetic model for one 120-room
extended-stay property, shown on screen with its inputs and labelled
*"Illustrative model — replace with your own numbers"*.

Change them in one place — the `s5-roi.html` scene's `data` block for each
video, and the matching `s2-cost.html` counter:

```json
"rows": [
  { "label": "Calls missed or abandoned each week", "value": "12" },
  { "label": "That would have booked", "value": "35%" },
  { "label": "Average extended-stay value", "value": "$476" }
],
"result": { "label": "Recovered every year", "countTo": 103900, "prefix": "$" }
```

If you have real customer numbers, swap them in and drop the footnote — a
figure you can stand behind converts better than a model, and the narration
line in the same scene is right above it in the config.

### Voice

`en-us-libritts-high`, speaker 76 — chosen by synthesizing candidates and
measuring median pitch, since the two obvious female voices in the Piper
catalogue are low-quality 16 kHz models. To audition others:

```bash
node setup-voice.js --list
```

Then set `voice.model` (and `voice.speaker` for multi-speaker models like
LibriTTS) and re-run `node voice.js`.

### Rendering them

```bash
node voice.js                              # all four, ~3 min
node record.js --fps 30                    # all four at 1080p
node build.js

node record.js --video rfp --format vertical   # one video, for Reels
node record.js --video review --scale .4 --fps 12   # quick draft while editing
```

Changing narration changes scene lengths, so re-run `voice.js` before
`record.js` — otherwise the picture is cut to the old timing.
