/* Minimal stroke icons for feature rows. window.__icon("mobile") -> SVG. */
const PATHS = {
  transfer: '<path d="M3 17h10a4 4 0 0 0 4-4V6"/><path d="m14 9 3-3-3-3"/><path d="M3 7h6"/>',
  mobile:   '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  record:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
  transcript:'<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h5"/>',
  pms:      '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  phone:    '<path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.2 2 2 0 0 1 5.5 3Z"/>',
  check:    '<path d="m4 12.5 5.5 5.5L20 6"/>',
};

window.__icon = function icon(name) {
  const d = PATHS[name] || PATHS.check;
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
};
