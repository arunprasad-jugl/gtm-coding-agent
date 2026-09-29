/* ---------------------------------------------------------------
   studio.js — the scrub engine.

   Normally a browser animation plays against wall-clock time, so
   recording it means racing it: any frame the renderer is late for is
   a frame you lose. Instead we detach every animation from the clock
   and set its position by hand, one exact timestamp per frame. A slow
   machine then produces the same video as a fast one — it just takes
   longer. That is the whole trick behind the capture pipeline.

   Contract used by record.js and preview.html:
     await window.__prepare(durationMs)   -> fonts + brand loaded, clock stopped
     window.__seek(tMs)                   -> put the scene at exactly t
   --------------------------------------------------------------- */

window.__studio = {
  hooks: [],
  /** Register a JS-driven effect (counters, canvas, anything CSS can't do). */
  onSeek(fn) { this.hooks.push(fn); },

  /** Scrubbable tween. Returns the eased value at time `t`. */
  tween(t, { from = 0, to = 1, delay = 0, dur = 1000, ease = "outExpo" } = {}) {
    const p = clamp((t - delay) / dur, 0, 1);
    return from + (to - from) * EASE[ease](p);
  },

  /** True once t has passed `at`. Handy for swapping states. */
  after(t, at) { return t >= at; },

  /**
   * Build masked lines that ride up one after another.
   *   __studio.lines(el, ["Signals in.", "Meetings out."], { gradient: true })
   * `gradient` lands on the inner span, which is the only place
   * background-clip:text actually paints (see .gradient-text in stage.css).
   */
  lines(host, texts, { delay = 0.4, stagger = 0.16, dur = 1, gradient = false } = {}) {
    texts.forEach((text, i) => {
      const line = document.createElement("span");
      line.className = "line";
      line.style.setProperty("--delay", (delay + i * stagger).toFixed(3) + "s");
      line.style.setProperty("--dur", dur + "s");

      const inner = document.createElement("span");
      if (gradient) inner.className = "gradient-text";
      inner.textContent = text;

      line.appendChild(inner);
      host.appendChild(line);
    });
  },
};

const EASE = {
  linear:   (p) => p,
  outExpo:  (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  outCubic: (p) => 1 - Math.pow(1 - p, 3),
  inOut:    (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Get the page ready to be sampled. Resolves only once fonts and brand
 * tokens are applied — capturing before that bakes a fallback font into
 * the first frames.
 */
window.__prepare = async function prepare(durationMs) {
  try {
    await window.__brandReady;
  } catch (err) {
    console.error("[studio] brand load failed:", err.message);
  }

  // A scene that builds markup from config (split headlines, stat blocks)
  // sets window.__sceneReady. Wait for it, or we'd capture an empty stage.
  if (window.__sceneReady) await window.__sceneReady;

  if (durationMs) {
    // Lets `.a-out` fire near the end of the scene without hardcoding it.
    document.documentElement.style.setProperty("--scene-out", (durationMs - 500) + "ms");
  }

  // document.fonts.ready only covers faces the current text happens to use,
  // so a weight that appears mid-scene could still pop in after capture
  // started. Force every declared face of the display family to load.
  const faces = [...document.fonts].filter((f) => unquote(f.family) === primaryFamily());
  await Promise.all(faces.map((f) => f.load().catch(() => {})));
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  document.documentElement.classList.add("studio-ready");

  // Stop the clock. Anything created later is paused on first seek.
  for (const a of document.getAnimations()) a.pause();

  return {
    animations: document.getAnimations().length,
    hooks: window.__studio.hooks.length,
    // document.fonts.status goes "loaded" even when every face failed and
    // the system stack took over, so report on the actual faces instead.
    fontsLoaded: faces.length > 0 && faces.every((f) => f.status === "loaded"),
    fontFamily: primaryFamily(),
  };
};

/**
 * Put the scene at exactly `t` ms and flush styles so the next paint —
 * i.e. the screenshot — shows that moment.
 */
window.__seek = function seek(t) {
  for (const a of document.getAnimations()) {
    // Re-pause: elements added mid-scene arrive playing.
    if (a.playState !== "paused") a.pause();
    try {
      a.currentTime = t;
    } catch (_) {
      /* an animation with no timeline — nothing to seek */
    }
  }

  for (const hook of window.__studio.hooks) hook(t);

  // Force style + layout so the capture can't beat the update.
  void document.documentElement.offsetHeight;
  return t;
};

/** First family named by --brand-font-display, unquoted. */
function primaryFamily() {
  const stack = getComputedStyle(document.documentElement).getPropertyValue("--brand-font-display");
  return unquote(stack.split(",")[0] || "");
}

function unquote(s) {
  return String(s).trim().replace(/^["']|["']$/g, "");
}
