/* ---------------------------------------------------------------
   brand.js — loads brand.config.json and applies it to the page.

   1. every key in `theme` becomes a CSS variable: --brand-<key>
   2. `fontUrl` is injected as a stylesheet
   3. [data-brand="path.to.value"] elements get their text filled in
   4. window.__brand / window.__brandReady are exposed for scenes
      that need to build markup (lists, stat blocks) from config

   Works identically in the browser preview and under the recorder,
   so what you see while iterating is what gets captured.
   --------------------------------------------------------------- */

window.__brandReady = (async () => {
  const res = await fetch("../brand.config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("brand.config.json not found (" + res.status + ")");
  const cfg = await res.json();
  window.__brand = cfg;

  // 1. theme -> CSS variables
  const root = document.documentElement;
  for (const [key, value] of Object.entries(cfg.theme || {})) {
    root.style.setProperty("--brand-" + key, String(value));
  }

  // 2. webfont — prefer the local copy from `node fonts.js`, so a render
  //    never silently falls back because the network was slow or proxied.
  //    Probe by actually loading it: a HEAD request gets aborted by Chromium
  //    often enough that it's useless as an existence check, and a <link>
  //    has to be resolved relative to lib/ anyway for its url() references.
  const usedLocal = await loadStylesheet("../lib/fonts.css");
  if (!usedLocal && cfg.fontUrl) {
    const usedCdn = await loadStylesheet(cfg.fontUrl);
    if (!usedCdn) console.warn("[brand] no webfont loaded — falling back to the system stack");
  }

  // The fetch can resolve before <body> is parsed, so wait for the DOM
  // before touching elements.
  if (document.readyState === "loading") {
    await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
  }

  // 3. declarative text: <h1 data-brand="brand.name">
  for (const el of document.querySelectorAll("[data-brand]")) {
    const value = get(cfg, el.getAttribute("data-brand"));
    if (value === undefined || value === null) {
      console.warn("[brand] no value at", el.getAttribute("data-brand"));
      continue;
    }
    el.textContent = String(value);
  }

  // Under the recorder, __scene/__video/__narration are injected before any
  // page script runs. Opened straight in the browser (preview, or just double
  // clicking the file) they aren't, so resolve them from the query string.
  const q = new URLSearchParams(location.search);
  if (!window.__scene && q.has("video")) {
    const video = (cfg.videos || []).find((v) => v.id === q.get("video"));
    const scene = video?.scenes?.[Number(q.get("scene") || 0)];
    window.__video = { id: video?.id, title: video?.title };
    window.__scene = scene?.data ?? {};
    window.__narration = window.__narration ?? [];

    // Pick up the real voice timings too, so captions, cuts and cues preview
    // exactly where the recorder will put them.
    const voiced = await fetch("../out/voice/manifest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const name = scene?.file?.replace(/\.html$/, "");
    const spoken = voiced?.videos?.[video?.id]?.scenes?.find((x) => x.name === name);
    if (spoken) {
      window.__narration = spoken.lines;
      window.__sceneDuration = Math.max(spoken.duration, scene.minDuration ?? 0);
    }
  }

  return cfg;
})();

function get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
window.__brandGet = get;

/** Append a stylesheet and report whether it actually loaded. */
function loadStylesheet(href) {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.addEventListener("load", () => resolve(true), { once: true });
    link.addEventListener("error", () => { link.remove(); resolve(false); }, { once: true });
    setTimeout(() => resolve(false), 8000);
    document.head.appendChild(link);
  });
}
