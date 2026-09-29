/* ---------------------------------------------------------------
   logo.js — the HotelBell mark, inline so it can be animated and
   inherit brand colours.

   Any element with [data-logo] gets the bell; add [data-wordmark] for
   the full "Hotel <bell> Bell" lockup. Parts are individually classed
   so scenes can stagger them (.bell-dome, .bell-knob, .bell-base,
   .bell-ring).
   --------------------------------------------------------------- */

window.__logoReady = (async () => {
  await window.__brandReady;

  for (const el of document.querySelectorAll("[data-logo]")) {
    el.innerHTML = bellSVG();
  }

  for (const el of document.querySelectorAll("[data-wordmark]")) {
    el.innerHTML =
      `<span class="wm-text">Hotel</span>` +
      `<span class="wm-bell">${bellSVG()}</span>` +
      `<span class="wm-text">Bell</span>`;
    el.classList.add("wordmark-lockup");
  }
})();

function bellSVG() {
  // A service-bell cloche: base plate, dome, knob — plus two ring arcs that
  // scenes can animate outward when the bell "sounds".
  return `
<svg class="bell" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="bellGold" x1="24" y1="18" x2="96" y2="86" gradientUnits="userSpaceOnUse">
      <stop offset="0%"  stop-color="var(--brand-gold-hi, #f2dda3)"/>
      <stop offset="48%" stop-color="var(--brand-accent, #d4af6a)"/>
      <stop offset="100%" stop-color="var(--brand-gold-lo, #9a7534)"/>
    </linearGradient>
  </defs>

  <path class="bell-ring" d="M22 40a30 30 0 0 1 8-16" stroke="url(#bellGold)" stroke-width="3.4" stroke-linecap="round"/>
  <path class="bell-ring two" d="M98 40a30 30 0 0 0-8-16" stroke="url(#bellGold)" stroke-width="3.4" stroke-linecap="round"/>

  <circle class="bell-knob" cx="60" cy="24" r="7" fill="url(#bellGold)"/>
  <path class="bell-dome" d="M24 74a36 33 0 0 1 72 0z" fill="url(#bellGold)"/>
  <rect class="bell-base" x="14" y="74" width="92" height="11" rx="5.5" fill="url(#bellGold)"/>
</svg>`;
}
