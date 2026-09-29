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

  Object.assign(window.__cinema, {
    /**
     * Hard cuts between views, each framed by the point it's centred on.
     *
     *   shots({ lobby: {el, cam}, phone: {el, cam} }, [
     *     { at: 0,    view: "phone" },
     *     { at: 4200, view: "lobby", center: [44, 52], zoom: [2.5, 2.65] },
     *   ])
     *
     * transform-origin alone keeps the origin where it already sits on
     * screen, so a close-up of something near the edge stays near the edge.
     * Translating the centre point to 50%/50% as well is what actually
     * frames it. zoom is [start, end] — every shot pushes in slightly,
     * because a locked-off frame reads as a slide, not a film.
     */
    shots(views, list) {
      const sorted = [...list].sort((a, b) => a.at - b.at);
      window.__studio.onSeek((t) => {
        let i = 0;
        for (let k = 0; k < sorted.length; k++) if (t >= sorted[k].at) i = k;
        const shot = sorted[i];
        const end = sorted[i + 1]?.at ?? (window.__sceneDuration || shot.at + 4000);

        for (const [name, v] of Object.entries(views)) {
          const on = name === shot.view;
          v.el.style.opacity = on ? "1" : "0";
          v.el.style.visibility = on ? "visible" : "hidden";
        }

        const v = views[shot.view];
        if (!v?.cam) return;
        const [cx, cy] = shot.center ?? [50, 50];
        const [z0, z1] = shot.zoom ?? [1, 1.035];
        const p = clamp((t - shot.at) / Math.max(1, end - shot.at), 0, 1);
        const z = z0 + (z1 - z0) * p;
        v.cam.style.transformOrigin = `${cx}% ${cy}%`;
        v.cam.style.transform = `translate(${50 - cx}%, ${50 - cy}%) scale(${z.toFixed(4)})`;
      });
    },

    /**
     * Burned-in subtitles for lines flagged `sub`. Most LinkedIn video autoplays
     * muted, so anything the story depends on has to be readable too.
     */
    subtitles(el, lines = window.__narration || []) {
      if (!el) return;
      const shown = lines.filter((l) => l.sub);
      window.__studio.onSeek((t) => {
        const line = shown.find((l) => t >= l.start - 80 && t < l.start + l.duration + 250);
        el.textContent = line ? (line.label ? `${line.label}  ` : "") + (line.caption ?? line.text) : "";
        el.style.opacity = line ? "1" : "0";
        el.style.visibility = line ? "visible" : "hidden";
      });
    },

    /** Fade and lift `el` in at `at` ms; optionally out again at `until`. */
    appear(el, at, { dur = 420, y = 1.2, until = Infinity, outDur = 260 } = {}) {
      if (!el) return;
      window.__studio.onSeek((t) => {
        const pin = clamp((t - at) / dur, 0, 1);
        const pout = until === Infinity ? 0 : clamp((t - until) / outDur, 0, 1);
        const e = 1 - Math.pow(1 - pin, 3);
        el.style.opacity = String(e * (1 - pout));
        el.style.transform = `translateY(${((1 - e) * y).toFixed(3)}vmin)`;
      });
    },

    /** Tiny deterministic shake while `active(t)` — a desk phone on a hard ring. */
    jitter(el, active, amp = 0.12) {
      if (!el) return;
      window.__studio.onSeek((t) => {
        if (!active(t)) { el.style.translate = "0 0"; return; }
        const f = Math.floor(t / 33);
        el.style.translate = `${((hash(f) - .5) * amp).toFixed(3)}vmin ${((hash(f + 31) - .5) * amp).toFixed(3)}vmin`;
      });
    },
  });

  function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
})();
