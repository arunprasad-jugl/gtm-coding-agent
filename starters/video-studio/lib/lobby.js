/* ---------------------------------------------------------------
   lobby.js — the reception set.

   One set, built once, framed many ways. It's laid out across the full
   0–100% space rather than composed for a single framing; cinema.js
   shots() zooms into regions of it, so the same build gives a wide, a
   desk close-up, the key rack and a clock insert — and both halves of
   the film cut to the identical frame.

   Props are picked for how fast they say "hotel at night": the key rack,
   the service bell, the desk phone, the wall clock, a back-office door
   left ajar (the one person on shift is in there). No figures.
   --------------------------------------------------------------- */

window.__lobby = function lobby(el, { name = "MAPLE SUITES" } = {}) {
  el.innerHTML = `
  <div class="set">
    <div class="wall"></div>
    <div class="wall-glow"></div>

    ${keyRack()}

    <div class="door">
      <div class="door-leaf"><div class="panel a"></div><div class="panel b"></div><div class="knob"></div></div>
      <div class="door-gap"></div>
      <div class="door-plate">STAFF ONLY</div>
    </div>
    <div class="door-spill"></div>

    <div class="sign"><div class="sign-name"></div><div class="sign-sub">RECEPTION</div></div>

    ${clock()}

    <div class="window">
      <div class="city"></div>
      <div class="rain"></div>
      <div class="mullion v"></div>
      <div class="mullion h"></div>
    </div>

    <div class="pendant"><div class="cord"></div><div class="shade"></div><div class="beam"></div></div>

    <div class="counter-face"></div>
    <div class="counter"></div>
    <div class="pool"></div>

    <div class="tent"><span>PLEASE RING<br>FOR SERVICE</span></div>
    ${bell()}
    ${deskPhone()}
    <div class="ledger"><div class="pages"></div></div>

    ${trolley()}
    ${palm()}
  </div>`;
  el.querySelector(".sign-name").textContent = name;
  el.classList.add("lobby");
};

/** Point the clock's hands at a time of day, in seconds since midnight. */
window.__lobbyClock = function setClock(el, secs) {
  const s = secs % 60, m = (secs / 60) % 60, h = (secs / 3600) % 12;
  const set = (cls, deg) => el.querySelector(cls)?.setAttribute("transform", `rotate(${deg.toFixed(2)} 50 50)`);
  set(".c-hour", h * 30);
  set(".c-min", m * 6);
  set(".c-sec", Math.floor(s) * 6);   // the second hand ticks, it doesn't sweep
};

function keyRack() {
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const room = 401 + r * 6 + c;
      // A key in its cubby means that room is empty tonight.
      cells.push(`<div class="cubby" data-room="${room}"><span class="no">${room}</span><span class="fob"></span></div>`);
    }
  }
  return `<div class="rack"><div class="rack-grid">${cells.join("")}</div></div>`;
}

function clock() {
  const ticks = [...Array(12)].map((_, i) =>
    `<line class="c-tick" x1="50" y1="8" x2="50" y2="${i % 3 === 0 ? 16 : 13}" transform="rotate(${i * 30} 50 50)"/>`
  ).join("");
  return `
  <div class="clock">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" class="c-face"/>
      ${ticks}
      <line class="c-hour" x1="50" y1="54" x2="50" y2="27"/>
      <line class="c-min"  x1="50" y1="56" x2="50" y2="15"/>
      <line class="c-sec"  x1="50" y1="60" x2="50" y2="13"/>
      <circle cx="50" cy="50" r="46" class="c-rim"/>
      <circle cx="50" cy="50" r="2.6" class="c-pin"/>
    </svg>
  </div>`;
}

function bell() {
  return `
  <div class="bell-prop">
    <svg viewBox="0 0 120 100" aria-hidden="true">
      <defs>
        <linearGradient id="propGold" x1="20" y1="15" x2="100" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#fbe7b2"/><stop offset=".45" stop-color="#d4af6a"/><stop offset="1" stop-color="#7d5a24"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="24" r="7" fill="url(#propGold)"/>
      <path d="M24 74a36 33 0 0 1 72 0z" fill="url(#propGold)"/>
      <rect x="14" y="74" width="92" height="11" rx="5.5" fill="url(#propGold)"/>
      <ellipse cx="46" cy="56" rx="7" ry="11" fill="#fff" opacity=".28"/>
    </svg>
  </div>`;
}

function deskPhone() {
  const keys = [0, 1, 2].map((r) => [0, 1, 2].map((c) =>
    `<rect class="p-key" x="${76 + c * 11}" y="${36 + r * 8}" width="8" height="5.5" rx="1.4"/>`).join("")).join("");
  return `
  <div class="phone">
    <svg viewBox="0 0 120 70" aria-hidden="true">
      <path class="p-base" d="M8 30 Q10 24 18 24 H102 Q110 24 112 30 L116 60 Q116 66 110 66 H10 Q4 66 4 60 Z"/>
      <rect class="p-screen" x="20" y="36" width="46" height="18" rx="2"/>
      <text class="p-text" x="43" y="48.5" text-anchor="middle">LINE 1</text>
      ${keys}
      <circle class="p-led" cx="106" cy="31" r="2.4"/>
      <path class="p-cord" d="M14 22 C 2 22 2 36 8 40"/>
      <path class="p-handset" d="M8 12 Q8 4 18 4 H102 Q112 4 112 12 V16 Q112 22 104 22 H90 Q84 22 82 17 L80 14 H40 L38 17 Q36 22 30 22 H16 Q8 22 8 16 Z"/>
    </svg>
  </div>`;
}

function trolley() {
  return `
  <div class="trolley">
    <svg viewBox="0 0 100 170" aria-hidden="true">
      <defs>
        <linearGradient id="brass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#6e4f22"/><stop offset=".5" stop-color="#e2bd78"/><stop offset="1" stop-color="#6e4f22"/>
        </linearGradient>
      </defs>
      <path d="M10 130 V22 Q10 6 26 6 H74 Q90 6 90 22 V130" fill="none" stroke="url(#brass)" stroke-width="5"/>
      <rect x="4" y="126" width="92" height="8" rx="3" fill="url(#brass)"/>
      <rect x="14" y="92" width="44" height="34" rx="3" fill="#3a2718"/>
      <rect x="20" y="60" width="34" height="32" rx="3" fill="#5a3a22"/>
      <rect x="60" y="100" width="26" height="26" rx="3" fill="#2d1f14"/>
      <circle cx="18" cy="152" r="10" fill="#1a120b" stroke="#b58e4c" stroke-width="2.5"/>
      <circle cx="82" cy="152" r="10" fill="#1a120b" stroke="#b58e4c" stroke-width="2.5"/>
    </svg>
  </div>`;
}

function palm() {
  const fronds = [...Array(9)].map((_, i) => {
    const a = -150 + i * 15;
    return `<path d="M50 48 Q ${50 + 26} ${48 - 6} ${50 + 44} 48 Q ${50 + 26} ${48 + 5} 50 48 Z" transform="rotate(${a} 50 48)"/>`;
  }).join("");
  return `<div class="palm"><svg viewBox="0 0 100 150" aria-hidden="true">
      <g class="fronds">${fronds}</g>
      <path class="trunk" d="M47 48 Q50 96 47 128 L55 128 Q57 96 53 48 Z"/>
      <path class="pot" d="M30 124 H70 L65 148 H35 Z"/>
    </svg></div>`;
}
