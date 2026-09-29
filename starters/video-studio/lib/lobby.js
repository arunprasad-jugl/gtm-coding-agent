/* ---------------------------------------------------------------
   lobby.js — the environment, built once and reused.

   Both halves of the film open on this exact component with the exact
   same parameters. That is the point: the match cut only works if the
   second act is framed identically to the first, down to the pixel, so
   the only thing that changes is the outcome.

   Abstract on purpose — light, depth and silhouette, no attempt at
   photography. Drawn people would undercut everything around them.
   --------------------------------------------------------------- */

window.__lobby = function lobby(el, { lit = false } = {}) {
  el.innerHTML = `
  <div class="camera">
    <div class="layer back">
      <div class="wall"></div>
      <div class="corridor"></div>
    </div>

    <div class="layer mid">
      <div class="backbar"></div>
      <div class="column"></div>
    </div>

    <div class="layer front">
      <div class="desk"></div>
      <div class="pool"></div>
      <div class="phone ${lit ? "lit" : ""}">
        <div class="handset"></div>
        <div class="phone-screen"></div>
      </div>
      <div class="plant"></div>
    </div>
  </div>`;

  el.classList.add("lobby");
};
