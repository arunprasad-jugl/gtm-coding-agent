/* ---------------------------------------------------------------
   story.js — small shared pieces for the story scenes.
   --------------------------------------------------------------- */
window.__story = {
  /** Out-of-focus lights behind the phone. `mood` picks the palette. */
  bokeh(el, mood = "night") {
    const P = {
      night: ["#ffb35c", "#ffd9a0", "#6fa0ff", "#ff5a4e", "#ffc27a", "#8fb8ff", "#ffe2b0", "#ff9a52"],
      day:   ["#fff1d6", "#ffe0a8", "#ffffff", "#ffd6a0", "#f5e6c8", "#fff8ea", "#ffe9c4", "#ffd49a"],
    }[mood];
    const spots = [
      [8, 22, 11], [18, 70, 16], [30, 38, 9], [44, 82, 13], [58, 18, 10], [66, 64, 18],
      [78, 30, 12], [88, 76, 15], [94, 12, 9], [24, 90, 10], [52, 50, 7], [72, 92, 11],
      [4, 52, 13], [38, 8, 8],
    ];
    el.innerHTML = spots.map(([x, y, s], i) =>
      `<span style="left:${x}%;top:${y}%;width:${s}vmin;height:${s}vmin;` +
      `background:radial-gradient(circle, ${P[i % P.length]}cc 0%, ${P[i % P.length]}33 55%, transparent 70%);` +
      `opacity:${mood === "day" ? 0.55 : 0.5}"></span>`).join("");
    el.parentElement.style.background = mood === "day"
      ? "linear-gradient(180deg, #d9c9ae, #b9a483)"
      : "radial-gradient(120% 90% at 50% 100%, #1a1420, #07080c 70%)";
  },

  /** Which named phone screen is up at time t, from [[at, name], …]. */
  screens(P, schedule) {
    window.__studio.onSeek((t) => {
      let cur = schedule[0][1];
      for (const [at, name] of schedule) if (t >= at) cur = name;
      for (const [name, el] of Object.entries(P.views)) el.style.opacity = name === cur ? "1" : "0";
    });
  },

  /** Type `text` into `el` over [from, from+dur]; a pure function of t. */
  typeInto(el, text, from, dur) {
    window.__studio.onSeek((t) => {
      const p = Math.min(1, Math.max(0, (t - from) / dur));
      el.textContent = text.slice(0, Math.round(p * text.length));
    });
  },
};
