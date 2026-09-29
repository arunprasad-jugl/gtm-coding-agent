/* ---------------------------------------------------------------
   phone.js — Maya's phone. A generic modern smartphone, dark mode.

   The story is told on this screen as much as in the lobby: the
   notification, the search, the call timer, the confirmation. That also
   makes the film work muted, which is how most feed video is watched.

   Every builder returns the elements a scene needs to drive; all timing
   stays in the scene's seek hooks so it scrubs.
   --------------------------------------------------------------- */

(function () {
  const I = {
    phone: '<path d="M6.6 2.5h2.9l1.4 3.9-1.9 1.4a11 11 0 0 0 5.2 5.2l1.4-1.9 3.9 1.4v2.9a2 2 0 0 1-2.2 2A15.8 15.8 0 0 1 4.6 4.7a2 2 0 0 1 2-2.2Z" fill="currentColor"/>',
    end:   '<path d="M3 13.2c4.9-4.3 13.1-4.3 18 0l-1.7 2.6-3.6-1.1-.3-2.5a13 13 0 0 0-6.8 0l-.3 2.5-3.6 1.1Z" fill="currentColor"/>',
    mute:  '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm-6 8a6 6 0 0 0 12 0M12 17v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    keypad:'<g fill="currentColor">' + [0,1,2].map(r=>[0,1,2].map(c=>`<circle cx="${6+c*6}" cy="${5+r*6}" r="1.6"/>`).join("")).join("") + '<circle cx="12" cy="23" r="1.6"/></g>',
    speaker:'<path d="M4 9h4l5-4v14l-5-4H4Z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    add:   '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    video: '<rect x="3" y="7" width="12" height="10" rx="2" fill="currentColor"/><path d="m15 11 6-3.5v9L15 13Z" fill="currentColor"/>',
    person:'<circle cx="12" cy="8.5" r="4" fill="currentColor"/><path d="M4 21a8 8 0 0 1 16 0Z" fill="currentColor"/>',
    back:  '<path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    search:'<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    pin:   '<path d="M12 2a7 7 0 0 1 7 7c0 5.2-7 13-7 13S5 14.2 5 9a7 7 0 0 1 7-7Z" fill="currentColor"/><circle cx="12" cy="9" r="2.6" fill="#111"/>',
    star:  '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="currentColor"/>',
    bed:   '<path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    brief: '<rect x="3" y="7" width="18" height="12" rx="2" fill="currentColor"/><path d="M9 7V5h6v2" fill="none" stroke="#fff" stroke-width="1.8"/>',
    cc:    '<rect x="2.5" y="5" width="19" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 10.2a2.3 2.3 0 1 0 0 3.6M16.5 10.2a2.3 2.3 0 1 0 0 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };
  const icon = (n, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ""}</svg>`;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  window.__phone = {
    icon,

    /** The device itself. Returns { root, screen, clock, views(name) }. */
    device(el) {
      el.innerHTML = `
      <div class="device-wrap"><div class="device">
        <div class="btn-side a"></div><div class="btn-side b"></div><div class="btn-side c"></div>
        <div class="screen">
          <div class="statusbar">
            <span class="sb-time">11:46</span>
            <span class="sb-icons">
              <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx=".8"/><rect x="5" y="5.5" width="3" height="6.5" rx=".8"/><rect x="10" y="3" width="3" height="9" rx=".8"/><rect x="15" y="0" width="3" height="12" rx=".8" opacity=".35"/></svg>
              <svg viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0Zm-4.6-4.7a6.6 6.6 0 0 1 9.2 0l1.5-1.6a8.8 8.8 0 0 0-12.2 0Zm-3-3.1a10.8 10.8 0 0 1 15.2 0L17 2.1a13 13 0 0 0-18 0Z" transform="translate(-.5 0)"/></svg>
              <svg viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".45"/><rect x="2.2" y="2.2" width="11" height="7.6" rx="1.6"/><rect x="23.5" y="4" width="1.8" height="4" rx=".9" opacity=".45"/></svg>
            </span>
          </div>
          <div class="island"></div>
          <div class="views"></div>
          <div class="banners"></div>
          <div class="glare"></div>
        </div>
      </div></div>`;

      const screen = el.querySelector(".screen");
      const viewsEl = el.querySelector(".views");
      const views = {};
      return {
        root: el.querySelector(".device-wrap"),
        device: el.querySelector(".device"),
        screen,
        clock: el.querySelector(".sb-time"),
        banners: el.querySelector(".banners"),
        view(name) {
          if (!views[name]) {
            const v = document.createElement("div");
            v.className = "pview pv-" + name;
            viewsEl.appendChild(v);
            views[name] = v;
          }
          return views[name];
        },
        views,
      };
    },

    lock(v, { time, date, wallpaper = "night" }) {
      v.classList.add("wall-" + wallpaper);
      v.innerHTML = `
        <div class="lk-date">${esc(date)}</div>
        <div class="lk-time">${esc(time)}</div>
        <div class="lk-notifs"></div>
        <div class="lk-bottom"><span></span><span></span></div>`;
      return { notifs: v.querySelector(".lk-notifs") };
    },

    /** A notification card. `into` is a container; returns the card. */
    notif(into, { app, appIcon = "brief", appColor = "#3a7bfd", title, body, when = "now" }) {
      const n = document.createElement("div");
      n.className = "notif";
      n.innerHTML = `
        <div class="nf-icon" style="background:${appColor}">${icon(appIcon)}</div>
        <div class="nf-main">
          <div class="nf-head"><span class="nf-app">${esc(app)}</span><span class="nf-when">${esc(when)}</span></div>
          <div class="nf-title">${esc(title)}</div>
          <div class="nf-body">${esc(body)}</div>
        </div>`;
      into.appendChild(n);
      return n;
    },

    thread(v, { name, initials, color = "#6b7280", sub = "Text Message" }) {
      v.innerHTML = `
        <div class="th-head">
          ${icon("back", "ic th-back")}
          <div class="th-who">
            <div class="th-av" style="background:${color}">${esc(initials)}</div>
            <div class="th-name">${esc(name)}</div>
          </div>
        </div>
        <div class="th-sub">${esc(sub)}</div>
        <div class="th-msgs"></div>`;
      const msgs = v.querySelector(".th-msgs");
      return {
        /** Add a bubble; returns it so the scene can time its entrance. */
        say(from, text) {
          const b = document.createElement("div");
          b.className = "bub " + (from === "me" ? "me" : "them");
          b.textContent = text;
          msgs.appendChild(b);
          return b;
        },
        typing(from = "them") {
          const b = document.createElement("div");
          b.className = "bub typing " + (from === "me" ? "me" : "them");
          b.innerHTML = "<i></i><i></i><i></i>";
          msgs.appendChild(b);
          return b;
        },
      };
    },

    search(v, { results }) {
      v.innerHTML = `
        <div class="sr-map">
          <div class="road r1"></div><div class="road r2"></div><div class="road r3"></div><div class="road r4"></div>
          <div class="park"></div>
          <div class="mpin p1">${icon("pin")}</div>
          <div class="mpin p2">${icon("pin")}</div>
          <div class="hosp">H</div>
        </div>
        <div class="sr-sheet">
          <div class="sr-grab"></div>
          <div class="sr-field">${icon("search")}<span class="sr-q"></span><span class="sr-caret"></span></div>
          <div class="sr-results"></div>
        </div>`;
      const list = v.querySelector(".sr-results");
      const cards = results.map((r) => {
        const c = document.createElement("div");
        c.className = "sr-card";
        c.innerHTML = `
          <div class="sr-top">
            <div class="sr-name">${esc(r.name)}</div>
            <div class="sr-call">${icon("phone")}<span>Call</span></div>
          </div>
          <div class="sr-meta"><span class="sr-stars">${icon("star")}${esc(r.rating)}</span>
            <span class="sr-dot">·</span><span>${esc(r.kind)}</span><span class="sr-dot">·</span><span>${esc(r.dist)}</span></div>
          <div class="sr-open">${esc(r.note)}</div>`;
        list.appendChild(c);
        return c;
      });
      return { query: v.querySelector(".sr-q"), caret: v.querySelector(".sr-caret"), cards };
    },

    call(v, { name, initials }) {
      v.innerHTML = `
        <div class="cl-bg"></div>
        <div class="cl-top">
          <div class="cl-av">${esc(initials)}</div>
          <div class="cl-name">${esc(name)}</div>
          <div class="cl-status">calling…</div>
        </div>
        <div class="cl-pad">
          ${["mute", "keypad", "speaker", "add", "video", "person"].map((n) =>
            `<div class="cl-btn"><div class="cl-round">${icon(n)}</div><span>${{
              mute: "mute", keypad: "keypad", speaker: "speaker", add: "add call", video: "video", person: "contacts",
            }[n]}</span></div>`).join("")}
        </div>
        <div class="cl-end">${icon("end")}</div>`;
      return { status: v.querySelector(".cl-status"), name: v.querySelector(".cl-name"), av: v.querySelector(".cl-av") };
    },

    /** In-call screen with live captions — the replay's conversation. */
    live(v, { name, initials }) {
      v.innerHTML = `
        <div class="cl-bg live"></div>
        <div class="lv-top">
          <div class="lv-av">${esc(initials)}</div>
          <div>
            <div class="lv-name">${esc(name)}</div>
            <div class="lv-status"><i></i><span class="lv-timer">00:00</span></div>
          </div>
        </div>
        <div class="lv-label">${icon("cc")}<span>Live captions</span></div>
        <div class="lv-lines"></div>
        <div class="cl-end small">${icon("end")}</div>`;
      const lines = v.querySelector(".lv-lines");
      return {
        timer: v.querySelector(".lv-timer"),
        line(who, label) {
          const row = document.createElement("div");
          row.className = "lv-line " + who;
          row.innerHTML = `<div class="lv-who"></div><div class="lv-text"></div>`;
          row.querySelector(".lv-who").textContent = label;
          lines.appendChild(row);
          return { row, text: row.querySelector(".lv-text") };
        },
      };
    },

    /** A tap: a soft ring that blooms at `at` over the element. */
    tap(target, at, host) {
      const r = document.createElement("div");
      r.className = "tap";
      host.appendChild(r);
      window.__studio.onSeek((t) => {
        const p = (t - at) / 520;
        if (p < 0 || p > 1) { r.style.opacity = "0"; return; }
        // Layout offsets, not getBoundingClientRect: the device is rotated in
        // 3D, so client rects come back in projected screen space while the
        // ring is positioned in the screen's own flat coordinates.
        let x = target.offsetWidth / 2, y = target.offsetHeight / 2, n = target;
        while (n && n !== host) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
        r.style.left = x + "px";
        r.style.top = y + "px";
        r.style.opacity = String(0.55 * (1 - p));
        r.style.transform = `translate(-50%, -50%) scale(${0.6 + p * 0.9})`;
      });
      return r;
    },
  };
})();
