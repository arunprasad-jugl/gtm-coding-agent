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
  const localFonts = await fetch("../lib/fonts.css", { method: "HEAD" })
    .then((r) => r.ok)
    .catch(() => false);
  const fontHref = localFonts ? "../lib/fonts.css" : cfg.fontUrl;

  if (fontHref) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = fontHref;
    document.head.appendChild(link);
    await new Promise((resolve) => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", resolve, { once: true }); // fall back to system stack
      setTimeout(resolve, 8000);
    });
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
  }

  return cfg;
})();

function get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
window.__brandGet = get;
