// Streaks: small, crisp SVG charts with hover, tap and keyboard tooltips.
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = (n) => Math.round(n * 10) / 10;

  // ---------- shared tooltip ----------
  let tipEl = null; let tipOwner = null;
  function tip() { return tipEl || (tipEl = document.getElementById('tip')); }
  function showTip(html, x, y, owner) {
    const t = tip(); if (!t) return;
    t.innerHTML = html; t.hidden = false; tipOwner = owner || null;
    const w = t.offsetWidth; const h = t.offsetHeight;
    let left = x - w / 2; let top = y - h - 12;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    if (top < 8) top = y + 16;
    t.style.left = left + 'px'; t.style.top = top + 'px';
  }
  function hideTip(owner) {
    const t = tip(); if (!t) return;
    if (owner && tipOwner && owner !== tipOwner) return;
    t.hidden = true; tipOwner = null;
  }
  addEventListener('scroll', () => hideTip(), { passive: true });

  const widthOf = (el, fb) => Math.max(260, Math.round(el.clientWidth || fb || 520));

  function roundedTopBar(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${r1(x)} ${r1(y + h)}V${r1(y + r)}Q${r1(x)} ${r1(y)} ${r1(x + r)} ${r1(y)}H${r1(x + w - r)}Q${r1(x + w)} ${r1(y)} ${r1(x + w)} ${r1(y + r)}V${r1(y + h)}Z`;
  }

  /** Vertical bar chart of percentages.
   *  data: [{ label, full, value|null, detail }] */
  function bars(el, data, opts = {}) {
    const W = widthOf(el, opts.width); const H = opts.height || 210;
    const L = 40; const R = 8; const T = 24; const B = 30;
    const pw = W - L - R; const ph = H - T - B;
    const band = pw / data.length;
    const bw = Math.min(40, band * 0.58);
    const y = (v) => T + ph - (v / 100) * ph;
    let best = -1;
    data.forEach((d, i) => { if (d.value != null && (best < 0 || d.value > data[best].value)) best = i; });
    let s = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(opts.label || 'Bar chart')}">`;
    for (const g of [0, 25, 50, 75, 100]) {
      s += `<line class="grid${g === 0 ? ' base' : ''}" x1="${L}" x2="${W - R}" y1="${r1(y(g))}" y2="${r1(y(g))}"/>`;
      if (g % 50 === 0) s += `<text class="axis" x="${L - 10}" y="${r1(y(g) + 4)}" text-anchor="end">${g}%</text>`;
    }
    data.forEach((d, i) => {
      const cx = L + band * i + band / 2;
      const x = cx - bw / 2;
      const v = d.value;
      const aria = `${d.full}: ${v == null ? 'no data yet' : v + '%'}${d.detail ? ', ' + d.detail : ''}`;
      s += `<g class="bar${i === best ? ' best' : ''}${v == null ? ' empty' : ''}" tabindex="0" role="img" aria-label="${esc(aria)}" data-i="${i}">`;
      s += `<rect class="hit" x="${r1(L + band * i)}" y="${T}" width="${r1(band)}" height="${ph}" fill="transparent"/>`;
      s += `<rect class="bar-bg" x="${r1(x)}" y="${T}" width="${r1(bw)}" height="${ph}" rx="${Math.min(8, bw / 2)}"/>`;
      if (v != null && v > 0) s += `<path class="bar-fill" d="${roundedTopBar(x, y(v), bw, T + ph - y(v), Math.min(8, bw / 2))}"/>`;
      if (v != null) s += `<text class="bar-val" x="${r1(cx)}" y="${r1(Math.max(T - 6, y(v) - 8))}" text-anchor="middle">${v}%</text>`;
      s += `<text class="axis x" x="${r1(cx)}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text></g>`;
    });
    s += '</svg>';
    el.innerHTML = s;
    const svg = el.firstChild;
    const show = (g) => {
      const d = data[+g.dataset.i]; const r = g.querySelector('.bar-bg').getBoundingClientRect();
      svg.querySelectorAll('.bar.on').forEach((n) => n.classList.remove('on'));
      g.classList.add('on');
      showTip(`<b>${esc(d.full)}</b><span>${d.value == null ? 'No data yet' : d.value + '% done'}${d.detail ? ' · ' + esc(d.detail) : ''}</span>`, r.left + r.width / 2, r.top + (d.value == null ? r.height : r.height * (1 - d.value / 100)), svg);
    };
    const hide = () => { svg.querySelectorAll('.bar.on').forEach((n) => n.classList.remove('on')); hideTip(svg); };
    svg.querySelectorAll('.bar').forEach((g) => {
      g.addEventListener('pointerenter', () => show(g));
      g.addEventListener('pointerdown', () => show(g));
      g.addEventListener('focus', () => show(g));
      g.addEventListener('blur', hide);
    });
    svg.addEventListener('pointerleave', hide);
  }

  // Monotone cubic path through points (no overshoot above 100% or below 0%).
  function monotone(pts) {
    if (pts.length < 2) return pts.length ? `M${r1(pts[0][0])} ${r1(pts[0][1])}` : '';
    const n = pts.length; const dx = []; const m = []; const t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i]; const b = t[i + 1] / m[i]; const h = a * a + b * b;
      if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${r1(pts[i][0] + h)} ${r1(pts[i][1] + t[i] * h)} ${r1(pts[i + 1][0] - h)} ${r1(pts[i + 1][1] - t[i + 1] * h)} ${r1(pts[i + 1][0])} ${r1(pts[i + 1][1])}`;
    }
    return d;
  }

  /** Line chart of percentages over time.
   *  data: [{ label, full, value|null, detail }] */
  function line(el, data, opts = {}) {
    const W = widthOf(el, opts.width); const H = opts.height || 210;
    const L = 40; const R = 16; const T = 20; const B = 30;
    const pw = W - L - R; const ph = H - T - B;
    const step = data.length > 1 ? pw / (data.length - 1) : 0;
    const x = (i) => L + step * i;
    const y = (v) => T + ph - (v / 100) * ph;
    const gid = 'lg' + Math.random().toString(36).slice(2, 7);
    let s = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(opts.label || 'Line chart')}">`;
    s += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>`;
    for (const g of [0, 25, 50, 75, 100]) {
      s += `<line class="grid${g === 0 ? ' base' : ''}" x1="${L}" x2="${W - R}" y1="${r1(y(g))}" y2="${r1(y(g))}"/>`;
      if (g % 50 === 0) s += `<text class="axis" x="${L - 10}" y="${r1(y(g) + 4)}" text-anchor="end">${g}%</text>`;
    }
    const every = W < 420 ? 2 : 1;
    data.forEach((d, i) => {
      if ((data.length - 1 - i) % every === 0) s += `<text class="axis x" x="${r1(x(i))}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
    });
    // segments split at gaps
    const segs = []; let cur = [];
    data.forEach((d, i) => { if (d.value == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(d.value)]); });
    if (cur.length) segs.push(cur);
    for (const seg of segs) {
      const p = monotone(seg);
      if (seg.length > 1) s += `<path class="line-area" d="${p}L${r1(seg[seg.length - 1][0])} ${r1(T + ph)}L${r1(seg[0][0])} ${r1(T + ph)}Z" fill="url(#${gid})"/>`;
      s += `<path class="line-path" d="${p}"/>`;
    }
    s += `<line class="guide" x1="0" x2="0" y1="${T}" y2="${T + ph}" visibility="hidden"/>`;
    const last = data.map((d) => d.value != null).lastIndexOf(true);
    data.forEach((d, i) => {
      if (d.value == null) return;
      const aria = `${d.full}: ${d.value}%${d.detail ? ', ' + d.detail : ''}`;
      s += `<circle class="dot${i === last ? ' last' : ''}" cx="${r1(x(i))}" cy="${r1(y(d.value))}" r="${i === last ? 5 : 3.5}" tabindex="0" role="img" aria-label="${esc(aria)}" data-i="${i}"/>`;
    });
    if (!segs.length) s += `<text class="axis empty-msg" x="${W / 2}" y="${T + ph / 2}" text-anchor="middle">No check-ins yet</text>`;
    s += `<rect class="hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
    el.innerHTML = s;
    const svg = el.firstChild; const guide = svg.querySelector('.guide');
    const dots = [...svg.querySelectorAll('.dot')];
    const show = (i) => {
      const d = data[i]; if (!d || d.value == null) return;
      dots.forEach((n) => n.classList.toggle('on', +n.dataset.i === i));
      const dot = dots.find((n) => +n.dataset.i === i);
      guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('visibility', 'visible');
      const r = dot.getBoundingClientRect();
      showTip(`<b>${esc(d.full)}</b><span>${d.value}% done${d.detail ? ' · ' + esc(d.detail) : ''}</span>`, r.left + r.width / 2, r.top, svg);
    };
    const hide = () => { dots.forEach((n) => n.classList.remove('on')); guide.setAttribute('visibility', 'hidden'); hideTip(svg); };
    const nearest = (e) => {
      const b = svg.getBoundingClientRect();
      const px = ((e.clientX - b.left) / b.width) * W;
      let bi = -1; let bd = Infinity;
      data.forEach((d, i) => { if (d.value != null && Math.abs(x(i) - px) < bd) { bd = Math.abs(x(i) - px); bi = i; } });
      if (bi >= 0) show(bi);
    };
    const hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', nearest);
    hit.addEventListener('pointerdown', nearest);
    svg.addEventListener('pointerleave', hide);
    dots.forEach((n) => { n.addEventListener('focus', () => show(+n.dataset.i)); n.addEventListener('blur', hide); });
  }

  global.StreakCharts = { bars, line, showTip, hideTip, NS };
})(window);
