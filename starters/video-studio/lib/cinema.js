/* ---------------------------------------------------------------
   cinema.js — film helpers. Everything here stays a pure function of
   t so the whole thing still scrubs frame by frame.
   --------------------------------------------------------------- */

(function () {
window.__cinema = {
  /** Tie the camera push to the scene length so it never stops early. */
  camera(ms = window.__sceneDuration || 10000) {
    document.documentElement.style.setProperty("--cam-dur", ms + "ms");
  },

  /**
   * Film grain. A real grain plate would be a video; this repositions one
   * noise tile per frame instead, which at 30fps is indistinguishable and
   * costs nothing. Deterministic from the frame index, so scrubbing back
   * gives the identical frame.
   */
  grain(el, fps = 30) {
    if (!el) return;
    window.__studio.onSeek((t) => {
      const f = Math.floor(t / (1000 / fps));
      el.style.backgroundPosition =
        `${(hash(f) * 220).toFixed(1)}px ${(hash(f + 977) * 220).toFixed(1)}px`;
    });
  },

  /**
   * Running timecode. `base` is "HH:MM:SS"; it advances in real time from
   * there, which is what makes the replay's matching timestamp land.
   */
  timecode(el, base = "23:47:02", { rate = 1 } = {}) {
    if (!el) return;
    const [h, m, s] = base.split(":").map(Number);
    const start = h * 3600 + m * 60 + s;
    window.__studio.onSeek((t) => {
      const total = Math.floor(start + (t / 1000) * rate);
      el.textContent = [
        Math.floor(total / 3600) % 24,
        Math.floor(total / 60) % 60,
        total % 60,
      ].map((n) => String(n).padStart(2, "0")).join(":");
    });
  },

  /**
   * Type `text` into `el` between `from` and `from + dur`, then hold.
   * Character count is derived from t, never incremented, or scrubbing
   * backwards would leave the tail behind.
   */
  type(el, text, { from = 0, dur = 1800, caret = true } = {}) {
    if (!el) return;
    const body = document.createElement("span");
    const bar = document.createElement("span");
    bar.className = "caret";
    bar.innerHTML = "&nbsp;";
    el.append(body, bar);

    window.__studio.onSeek((t) => {
      const p = clamp((t - from) / dur, 0, 1);
      const n = Math.round(p * text.length);
      body.textContent = text.slice(0, n);
      // Caret blinks while typing, disappears once the line is finished.
      const blink = p > 0 && p < 1 && Math.floor(t / 420) % 2 === 0;
      bar.style.opacity = caret && (blink || (p > 0 && p < 1)) ? "1" : "0";
    });
  },

  /** Show `el` only between `from` and `to` (ms). */
  window(el, from, to = Infinity) {
    if (!el) return;
    window.__studio.onSeek((t) => {
      el.style.opacity = t >= from && t < to ? "1" : "0";
    });
  },

  /** Light up ring markers as each ring actually sounds. */
  rings(el, times, { hold = 2000 } = {}) {
    if (!el) return;
    const marks = [...el.querySelectorAll(".r")];
    window.__studio.onSeek((t) => {
      marks.forEach((m, i) => {
        const at = times[i];
        m.classList.toggle("on", at != null && t >= at && t < at + hold);
      });
    });
  },
};

  function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
})();
