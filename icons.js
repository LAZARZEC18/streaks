// Streaks: a curated set of 24 line icons (24 x 24, drawn with currentColor) plus UI glyphs.
(function (global) {
  'use strict';
  const P = {
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    droplet: '<path d="M12 2.8l5.6 5.9a7.8 7.8 0 1 1-11.2 0z"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    activity: '<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>',
    bike: '<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17l4-7h6l3 7M9.5 10L8 6.5H6M15.5 10l-2.5 7h-3.5"/>',
    mountain: '<path d="M3 20L9.5 8l4 7 2.5-4 5 9z"/>',
    moon: '<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.6 6.6 0 0 0 10 10z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    bed: '<path d="M3 5v15M3 9h14a4 4 0 0 1 4 4v7M3 16h18"/><circle cx="7.5" cy="12.5" r="1.5"/>',
    leaf: '<path d="M11 20a7 7 0 0 1-1.2-13.9C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M3 21c0-3 1.9-5.4 5-6"/>',
    apple: '<path d="M12 7.5c-1.3-1.6-3.3-2.2-5.2-1.4C3.6 7.5 3.5 12 5 15.5S8.8 21 10.2 21c.8 0 1.2-.5 1.8-.5s1 .5 1.8.5c1.4 0 3.7-2 5.2-5.5s1.4-8-1.8-9.4c-1.9-.8-3.9-.2-5.2 1.4z"/><path d="M12 7.5c0-2 .8-3.6 2.5-4.5"/>',
    coffee: '<path d="M17 9h1.5a3 3 0 0 1 0 6H17"/><path d="M3 9h14v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M7 2.5v3M10 2.5v3M13 2.5v3"/>',
    pill: '<rect x="2.6" y="8.2" width="18.8" height="7.6" rx="3.8" transform="rotate(-45 12 12)"/><path d="M8.6 8.6l6.8 6.8"/>',
    heart: '<path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 0 0-7.1 7.1L12 21l8.4-8.3a5 5 0 0 0 0-7.1z"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01"/>',
    bulb: '<path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-4 11.6c.7.6 1 1.4 1 2.2V17h6v-.7c0-.8.3-1.6 1-2.2a6.5 6.5 0 0 0-4-11.6z"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    dollar: '<path d="M12 2.5v19M16.5 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>',
    home: '<path d="M3.5 10.5L12 3.5l8.5 7V20a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6h5v6"/>',
  };
  const LABELS = {
    check: 'Check', book: 'Book', droplet: 'Water', dumbbell: 'Weights', activity: 'Cardio', bike: 'Bike', mountain: 'Hike',
    moon: 'Sleep', sun: 'Morning', bed: 'Rest', leaf: 'Mindful', apple: 'Food', coffee: 'Coffee', pill: 'Medicine',
    heart: 'Health', smile: 'Mood', bulb: 'Learn', pen: 'Write', code: 'Code', music: 'Music', globe: 'Language',
    dollar: 'Money', phone: 'Phone', home: 'Home',
  };
  const UI = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chevronL: '<path d="M15 5l-7 7 7 7"/>',
    chevronR: '<path d="M9 5l7 7-7 7"/>',
    grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>',
    flame: '<path d="M12 3c.9 3.2 4.8 5 4.8 9.6a4.8 4.8 0 0 1-9.6 0c0-2.2 1.1-3.6 2.4-4.8.3 1.7 1.1 2.7 2.4 2.9 0-2.9.2-5.3 0-7.7z"/>',
    edit: '<path d="M4 20l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8 19z"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5l1-12M9 7V4.5h6V7"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M4 20h16"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    note: '<path d="M5 3.5h10l4 4V20a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 20z"/><path d="M14.5 3.5V8h4.5M8.5 12.5h7M8.5 16h5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    alert: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  function svg(paths, cls, sw) {
    return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }
  global.StreakIcons = {
    keys: Object.keys(P),
    label: (k) => LABELS[k] || k,
    habit: (k, cls) => svg(P[k] || P.check, cls),
    ui: (k, cls, sw) => svg(UI[k], cls, sw),
  };
})(window);
