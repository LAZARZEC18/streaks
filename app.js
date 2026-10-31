// Streaks app: UI on top of StreakLogic (pure), StreakIcons and StreakCharts.
(function () {
  'use strict';
  const S = window.StreakLogic; const I = window.StreakIcons; const C = window.StreakCharts;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = ZL.esc;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = () => 'h' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const COLOR_NAMES = { amber: 'Amber', coral: 'Coral', green: 'Green', blue: 'Blue', indigo: 'Indigo', pink: 'Pink' };
  const hvars = (h) => `--h:var(--c-${h.color});--h-on:var(--on-${h.color});--h-ink:var(--ink-${h.color})`;

  // ---------- state ----------
  let T = S.todayKey();
  const state = { habits: [] };
  const ui = { view: 'today', detailId: null, calMonth: S.monthStart(T), selDay: T, heatDay: null, heatFocus: null,
    filter: ZL.store.get('filter', 'all') };

  function fixCreated(habits) {
    for (const h of habits) if (!S.isKey(h.createdOn)) h.createdOn = Object.keys(h.log).sort()[0] || T;
    return habits;
  }
  function load() {
    const d = ZL.store.get('data', null);
    if (d && Array.isArray(d.habits)) {
      if (!d.habits.length) return [];
      const r = S.normaliseImport(d);
      if (r.habits) return fixCreated(r.habits);
    }
    // One-time migration from Streaks v1
    try {
      const raw = localStorage.getItem('streaks:v1');
      if (raw) {
        const r = S.normaliseImport(JSON.parse(raw));
        if (r.habits) { migrated = r.habits.length; return fixCreated(r.habits); }
      }
    } catch (e) { /* ignore */ }
    return [];
  }
  let migrated = 0;
  state.habits = load();
  if (migrated) ZL.store.set('data', { version: 2, habits: state.habits });

  const active = () => state.habits.filter((h) => !h.archived);
  const archived = () => state.habits.filter((h) => h.archived);
  const byId = (id) => state.habits.find((h) => h.id === id);

  let savedOk = true;
  function save() {
    savedOk = ZL.store.set('data', { version: 2, habits: state.habits });
    const st = $('#status');
    st.classList.remove('flash'); void st.offsetWidth; st.classList.add('flash');
  }

  // ---------- mutations ----------
  function setValue(h, k, v) {
    v = Math.max(0, Math.min(9999, Math.round(v)));
    if (h.type !== 'count') v = v ? 1 : 0;
    if (v) h.log[k] = v; else delete h.log[k];
  }
  /** Toggle a day complete or empty. Returns the new done state. */
  function toggleDay(h, k) {
    const was = S.isDone(h, k);
    setValue(h, k, was ? 0 : (h.type === 'count' ? h.goal : 1));
    return !was;
  }
  function streakText(h) {
    const st = S.streaks(h, T);
    return st.unit === 'week' ? plural(st.current, 'week') : plural(st.current, 'day');
  }
  function commit(msg, opts) {
    save();
    render();
    if (msg) ZL.toast(msg, opts);
  }
  function moveTo(id, index) {
    const act = active(); const from = act.findIndex((h) => h.id === id);
    if (from < 0) return;
    index = Math.max(0, Math.min(act.length - 1, index));
    if (index === from) return;
    const [h] = act.splice(from, 1); act.splice(index, 0, h);
    state.habits = [...act, ...archived()];
    commit(`Moved ${h.name} to position ${index + 1}`);
  }
  function archiveHabit(id) {
    const h = byId(id); if (!h) return;
    h.archived = true;
    if (ui.detailId === id) closeDetail(true);
    if (ui.filter === id) setFilter('all');
    commit(`${h.name} archived`, { action: { label: 'Undo', fn: () => { h.archived = false; commit(`${h.name} restored`); } } });
  }
  function restoreHabit(id) {
    const h = byId(id); if (!h) return;
    h.archived = false;
    // restored habits go to the end of the active list
    state.habits = [...active().filter((x) => x !== h), h, ...archived()];
    commit(`${h.name} restored`);
  }
  function deleteHabit(id) {
    const i = state.habits.findIndex((h) => h.id === id); if (i < 0) return;
    const [h] = state.habits.splice(i, 1);
    if (ui.detailId === id) closeDetail(true);
    if (ui.filter === id) setFilter('all');
    commit(`${h.name} deleted`, { action: { label: 'Undo', fn: () => { state.habits.splice(Math.min(i, state.habits.length), 0, h); commit(`${h.name} is back, with its history`); } } });
  }

  // ---------- today ----------
  function typeLabel(h) {
    if (h.type === 'count') return `${h.goal} ${h.unit || 'a day'}${h.unit ? ' a day' : ''}`;
    if (h.type === 'weekly') return `${h.goal} ${h.goal === 1 ? 'time' : 'times'} a week`;
    return 'Every day';
  }
  function fmtTime(t) {
    if (!t) return '';
    const [hh, mm] = t.split(':').map(Number);
    const ap = hh >= 12 ? 'pm' : 'am'; const h12 = hh % 12 || 12;
    return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
  }
  function rowMeta(h) {
    const st = S.streaks(h, T);
    const parts = [];
    if (h.type === 'weekly') {
      const w = S.weekInfo(h, T);
      const label = { done: 'Done today', met: 'Goal met this week', due: 'Due today', optional: 'Optional today' }[w.status];
      parts.push(`${w.count} of ${w.goal} this week`, label);
    } else if (h.type === 'count') {
      parts.push(`${S.valueOn(h, T)} of ${h.goal}${h.unit ? ' ' + h.unit : ''}`);
    }
    if (st.current > 0) parts.push(`<span class="streak-chip">${I.ui('flame', 'ic flame')}${st.unit === 'week' ? plural(st.current, 'week') : plural(st.current, 'day')}</span>`);
    else if (h.type !== 'weekly') {
      const gap = S.gapDays(h, T);
      parts.push(S.lastDone(h, T) ? (gap >= 2 ? `Not done for ${gap} days` : 'Streak starts today') : 'Start a streak today');
    }
    return parts.map((x) => (x.startsWith('<span') ? x : `<span>${x}</span>`)).join('<span class="sep" aria-hidden="true">·</span>');
  }
  function checkLabel(h) {
    if (h.type === 'count') return `Add one to ${h.name}. ${S.valueOn(h, T)} of ${h.goal} today.`;
    return S.isDone(h, T) ? `${h.name}, done today. Tap to undo.` : `Check off ${h.name} for today`;
  }
  function rowHtml(h) {
    const ts = S.todayStatus(h, T);
    const done = S.isDone(h, T);
    const prog = h.type === 'count' ? ts.progress : (done ? 1 : 0);
    const cls = ['habit-row', 'type-' + h.type, done ? 'is-done' : '', h.type === 'weekly' && !ts.included && !ts.complete ? 'is-optional' : '', h.type === 'weekly' && ts.complete && !done ? 'is-met' : ''].join(' ');
    const v = S.valueOn(h, T);
    return `<li class="${cls}" data-id="${esc(h.id)}" style="${hvars(h)}">
      <button type="button" class="check-btn" data-act="check" aria-pressed="${done}" aria-label="${esc(checkLabel(h))}">
        <svg class="cb-ring" viewBox="0 0 56 56" aria-hidden="true"><circle class="cb-track" cx="28" cy="28" r="25"/><circle class="cb-prog" cx="28" cy="28" r="25" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${(100 - prog * 100).toFixed(1)}"/></svg>
        <span class="cb-icon">${I.habit(h.icon)}</span>
        <span class="cb-tick">${I.ui('tick', 'ic', 2.6)}</span>
      </button>
      <button type="button" class="habit-main" data-act="open" aria-label="${esc(h.name)}: open calendar, notes and stats">
        <span class="h-name">${esc(h.name)}</span>
        <span class="h-meta">${rowMeta(h)}</span>
        ${h.type === 'count' ? `<span class="h-bar" aria-hidden="true"><i style="width:${(ts.progress * 100).toFixed(1)}%"></i></span>` : ''}
      </button>
      ${h.type === 'count' ? `<div class="stepper" role="group" aria-label="Adjust ${esc(h.name)}">
        <button type="button" class="step" data-act="minus" aria-label="One less ${esc(h.unit || h.name)}" ${v ? '' : 'disabled'}>${I.ui('minus', 'ic', 2.4)}</button>
        <output class="step-val num" aria-live="polite">${v}<small>/${h.goal}</small></output>
        <button type="button" class="step" data-act="plus" aria-label="One more ${esc(h.unit || h.name)}">${I.ui('plus', 'ic', 2.4)}</button>
      </div>` : ''}
      <button type="button" class="row-icon grip" data-act="grip" aria-label="Reorder ${esc(h.name)}. Drag, or press the up and down arrow keys.">${I.ui('grip')}</button>
      <button type="button" class="row-icon more" data-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="More options for ${esc(h.name)}">${I.ui('more')}</button>
    </li>`;
  }

  function renderToday() {
    const act = active();
    const sum = S.todaySummary(state.habits, T);
    // ring
    const pct = Math.round(sum.pct * 100);
    $('#ring-fill').style.strokeDashoffset = String(100 - sum.pct * 100);
    $('#ring-fill').classList.toggle('zero', sum.pct === 0);
    $('#ring-pct').textContent = sum.total ? pct + '%' : (act.length ? 'Rest' : '0%');
    $('#ring-sub').textContent = sum.total ? `${sum.done} of ${sum.total} done` : (act.length ? 'nothing due' : 'no habits yet');
    $('#ring-label').setAttribute('aria-label', sum.total ? `${pct}% of today's habits done, ${sum.done} of ${sum.total}` : 'Nothing due today');
    $('#today-hero').classList.toggle('all-done', sum.allDone);
    $('#today-weekday').textContent = S.WEEKDAYS[S.weekday(T)];
    $('#today-date').textContent = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(+T.slice(0, 4), +T.slice(5, 7) - 1, +T.slice(8))));
    let line;
    if (!act.length) line = 'Add your first habit to get started.';
    else if (sum.allDone) line = 'Everything is done. See you tomorrow.';
    else if (!sum.total) line = 'Nothing is due today. Weekly goals are on track.';
    else {
      const left = sum.total - sum.done;
      const opt = act.filter((h) => h.type === 'weekly' && S.todayStatus(h, T).week.status === 'optional');
      line = `${plural(left, 'habit')} to go.` + (opt.length ? ` ${opt.map((h) => h.name).join(', ')} ${opt.length === 1 ? 'is' : 'are'} optional today.` : '');
    }
    $('#today-line').textContent = line;
    // list
    const list = $('#habit-list');
    list.innerHTML = act.map(rowHtml).join('');
    list.hidden = !act.length;
    $('#today-empty').hidden = act.length > 0;
    // archived
    const arc = archived();
    $('#archived').hidden = !arc.length;
    $('#archived-label').textContent = `Archived (${arc.length})`;
    $('#archived-list').innerHTML = arc.map((h) => `<li style="${hvars(h)}" data-id="${esc(h.id)}">
      <span class="habit-tile sm">${I.habit(h.icon)}</span><span class="arc-name">${esc(h.name)}<small>${esc(typeLabel(h))} · ${plural(S.totalCheckins(h, T), 'check-in')}</small></span>
      <button type="button" class="zl-btn zl-btn-secondary zl-btn-sm" data-act="restore">${I.ui('restore')}Restore</button>
      <button type="button" class="zl-btn zl-btn-danger zl-btn-sm" data-act="delete">Delete</button></li>`).join('');
    // app bar
    $('#status').innerHTML = act.length
      ? `<span>${sum.total ? `${sum.done} of ${sum.total} done today` : 'Nothing due today'}</span><span class="saved">${savedOk ? 'Saved' : 'Not saved: storage is full or blocked'}</span>`
      : `<span>No habits yet</span>`;
    $('#btn-export').disabled = !state.habits.length;
  }

  // ---------- check-off ----------
  function afterRow(id, sel, cls) {
    const row = $(`.habit-row[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    const el = sel ? $(sel, row) : row;
    if (el) { el.focus({ preventScroll: true }); if (cls) el.classList.add(cls); }
  }
  function checkToday(id, delta) {
    const h = byId(id); if (!h) return;
    const before = S.todaySummary(state.habits, T).allDone;
    const wasDone = S.isDone(h, T);
    if (h.type === 'count') setValue(h, T, S.valueOn(h, T) + (delta == null ? 1 : delta));
    else toggleDay(h, T);
    const nowDone = S.isDone(h, T);
    save(); render();
    const sel = delta == null ? '.check-btn' : (delta > 0 ? '[data-act="plus"]' : '[data-act="minus"]');
    afterRow(id, delta != null && !S.valueOn(h, T) ? '.check-btn' : sel, nowDone && !wasDone ? 'pop' : (delta != null ? 'bump' : ''));
    if (nowDone && !wasDone) {
      const row = $(`.habit-row[data-id="${CSS.escape(id)}"]`); if (row) row.classList.add('just-done');
    }
    const after = S.todaySummary(state.habits, T);
    let msg;
    if (h.type === 'count') {
      const v = S.valueOn(h, T);
      msg = nowDone && !wasDone ? `${h.name}: goal reached, ${v} ${h.unit || ''}`.trim() : `${h.name}: ${v} of ${h.goal}${h.unit ? ' ' + h.unit : ''}`;
    } else if (nowDone) msg = `${h.name} done. ${streakText(h)} streak`;
    else msg = `${h.name} unchecked for today`;
    if (!before && after.allDone) {
      celebrate();
      ZL.toast(`All ${plural(after.total, 'habit')} done today. Nice work.`, { duration: 4200 });
    } else ZL.toast(msg, { action: h.type === 'count' ? undefined : { label: 'Undo', fn: () => { toggleDay(h, T); commit(`${h.name} undone`); } } });
  }

  // Confetti from the progress ring. Skipped entirely under reduced motion.
  function celebrate() {
    if (reduce()) return;
    const cv = document.createElement('canvas'); cv.className = 'confetti'; cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const cols = ['amber', 'coral', 'green', 'blue', 'indigo', 'pink'].map((c) => css.getPropertyValue('--c-' + c).trim() || '#F59E0B');
    const r = $('#ring').getBoundingClientRect();
    const ox = r.left + r.width / 2; const oy = r.top + r.height / 2;
    const parts = Array.from({ length: 140 }, () => {
      const a = Math.random() * Math.PI * 2; const sp = 4 + Math.random() * 8;
      return { x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, w: 5 + Math.random() * 5, h: 8 + Math.random() * 6,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, c: cols[(Math.random() * cols.length) | 0], round: Math.random() < 0.3 };
    });
    const t0 = performance.now(); const dur = 1900;
    (function frame(t) {
      const k = (t - t0) / dur;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.22; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 7); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (k < 1) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }

  // ---------- row menu ----------
  let menuFor = null;
  function openMenu(btn, id) {
    const m = $('#row-menu'); const h = byId(id); const act = active(); const i = act.indexOf(h);
    menuFor = { btn, id };
    m.innerHTML = [
      ['edit', 'edit', 'Edit'], ['up', 'up', 'Move up', i === 0], ['down', 'down', 'Move down', i === act.length - 1],
      ['archive', 'archive', 'Archive'], ['delete', 'trash', 'Delete', false, true],
    ].map(([a, ic, label, dis, danger]) => `<button type="button" role="menuitem" data-m="${a}" ${dis ? 'disabled' : ''} class="${danger ? 'danger' : ''}">${I.ui(ic)}${label}</button>`).join('');
    m.hidden = false; btn.setAttribute('aria-expanded', 'true');
    const r = btn.getBoundingClientRect(); const mw = m.offsetWidth; const mh = m.offsetHeight;
    let top = r.bottom + 6; if (top + mh > innerHeight - 8) top = r.top - mh - 6;
    m.style.top = top + 'px'; m.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
    $('button:not([disabled])', m).focus();
  }
  function closeMenu(refocus) {
    const m = $('#row-menu'); if (m.hidden) return;
    m.hidden = true;
    if (menuFor) { menuFor.btn.setAttribute('aria-expanded', 'false'); if (refocus) menuFor.btn.focus(); }
    menuFor = null;
  }
  $('#row-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]'); if (!b || !menuFor) return;
    const { id } = menuFor; const a = b.dataset.m;
    closeMenu(false);
    const i = active().findIndex((h) => h.id === id);
    if (a === 'edit') openEditor(byId(id));
    if (a === 'up') { moveTo(id, i - 1); afterRow(id, '[data-act="menu"]'); }
    if (a === 'down') { moveTo(id, i + 1); afterRow(id, '[data-act="menu"]'); }
    if (a === 'archive') archiveHabit(id);
    if (a === 'delete') deleteHabit(id);
  });
  $('#row-menu').addEventListener('keydown', (e) => {
    const items = $$('#row-menu button:not([disabled])'); const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(true); }
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#row-menu, [data-act="menu"]')) closeMenu(false); });
  addEventListener('resize', () => closeMenu(false));

  // ---------- drag to reorder ----------
  function startDrag(e, handle) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const list = $('#habit-list'); const row = handle.closest('.habit-row');
    const rows = $$('.habit-row', list); const idx = rows.indexOf(row);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 8;
    const startY = e.clientY; let target = idx; let moved = false;
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    row.classList.add('dragging'); list.classList.add('sorting');
    const onMove = (ev) => {
      const dy = ev.clientY - startY; if (Math.abs(dy) > 4) moved = true;
      const min = rects[0].top - rects[idx].top; const max = rects[rects.length - 1].top - rects[idx].top;
      const cdy = Math.max(min - 12, Math.min(max + 12, dy));
      row.style.transform = `translateY(${cdy}px)`;
      const mid = rects[idx].top + rects[idx].height / 2 + cdy;
      target = 0;
      rects.forEach((r, i) => { if (i !== idx && mid > r.top + r.height / 2) target++; });
      const shift = rects[idx].height + gap;
      rows.forEach((r, i) => {
        if (i === idx) return;
        let t = 0;
        if (idx < target && i > idx && i <= target) t = -shift;
        if (idx > target && i < idx && i >= target) t = shift;
        r.style.transform = t ? `translateY(${t}px)` : '';
      });
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp); handle.removeEventListener('pointercancel', onUp);
      rows.forEach((r) => { r.style.transform = ''; });
      row.classList.remove('dragging'); list.classList.remove('sorting');
      if (moved && target !== idx) { const id = row.dataset.id; moveTo(id, target); afterRow(id, '.grip'); }
      else if (!moved) ZL.toast('Drag the handle to reorder, or focus it and use the arrow keys', { type: 'info' });
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp); handle.addEventListener('pointercancel', onUp);
  }

  const listEl = $('#habit-list');
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.habit-row').dataset.id; const a = b.dataset.act;
    if (a === 'check') checkToday(id);
    if (a === 'plus') checkToday(id, 1);
    if (a === 'minus') checkToday(id, -1);
    if (a === 'open') openDetail(id);
    if (a === 'menu') { if (menuFor && menuFor.id === id) closeMenu(true); else openMenu(b, id); }
    if (a === 'grip' && e.detail === 0) ZL.toast('Use the up and down arrow keys to move this habit', { type: 'info' });
  });
  listEl.addEventListener('pointerdown', (e) => { const g = e.target.closest('.grip'); if (g) startDrag(e, g); });
  listEl.addEventListener('keydown', (e) => {
    const g = e.target.closest('.grip'); if (!g) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const id = g.closest('.habit-row').dataset.id; const i = active().findIndex((h) => h.id === id);
    moveTo(id, i + (e.key === 'ArrowUp' ? -1 : 1)); afterRow(id, '.grip');
  });
  $('#archived-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('li').dataset.id;
    if (b.dataset.act === 'restore') restoreHabit(id);
    if (b.dataset.act === 'delete') deleteHabit(id);
  });

  // ---------- insights ----------
  function renderInsights() {
    const box = $('#ins-body');
    const ins = S.insights(state.habits, T);
    if (!ins.count) {
      box.innerHTML = `<div class="ins-empty">${I.ui('sparkle')}<p>Insights appear here once you have a habit and a few days of check-ins.</p></div>`;
      return;
    }
    const grade = (n) => (n >= 85 ? 'Excellent' : n >= 70 ? 'Strong' : n >= 50 ? 'Building' : 'Getting started');
    const c = ins.consistency;
    let html = `<div class="ins-card ins-score" id="ins-consistency">
      <div class="ins-top"><span class="ins-label">Consistency score</span><span class="zl-badge">${grade(c)}</span></div>
      <div class="ins-big num">${c}<small>/100</small></div>
      <div class="ins-meter" aria-hidden="true"><i style="width:${c}%"></i></div>
      <p>Average completion over the last 30 days across ${plural(ins.count, 'habit')}.</p></div>`;
    const b = ins.bestWeekday;
    html += `<div class="ins-card" id="ins-weekday"><span class="ins-label">Best weekday</span>`;
    if (b) {
      const max = Math.max(...b.rates.map((r) => r || 0), 1);
      html += `<div class="ins-big sm">${b.name}</div>
        <div class="ins-spark" aria-hidden="true">${b.rates.map((r, i) => `<span class="${i === b.weekday ? 'best' : ''}"><i style="height:${Math.max(6, ((r || 0) / max) * 100)}%"></i><em>${'MTWTFSS'[i]}</em></span>`).join('')}</div>
        <p>${b.pct}% of check-ins done on ${b.name}s over the last 90 days.</p>`;
    } else html += `<div class="ins-big sm muted">Not yet</div><p>Check in for a week to see which day suits you best.</p>`;
    html += `</div>`;
    const r = ins.atRisk;
    html += `<div class="ins-card ${r ? 'risk' : 'calm'}" id="ins-risk"><span class="ins-label">Most at risk</span>`;
    if (r) {
      const h = byId(r.id);
      html += `<div class="ins-risk-row" style="${hvars(h)}"><span class="habit-tile sm">${I.habit(h.icon)}</span><div><b>${esc(r.name)}</b><p>${esc(r.text)}</p></div></div>
        <button type="button" class="zl-btn zl-btn-secondary zl-btn-sm" data-ins="${h.type === 'check' ? 'check' : 'open'}" data-id="${esc(h.id)}">${h.type === 'check' ? 'Check in now' : 'Open habit'}</button>`;
    } else html += `<div class="ins-big sm">Nothing</div><p>Every daily habit was done in the last day, and weekly goals are on track.</p>`;
    html += `</div>`;
    const s = ins.strongest;
    html += `<div class="ins-card" id="ins-streak"><span class="ins-label">Longest running streak</span>`;
    if (s) html += `<div class="ins-big sm">${I.ui('flame', 'ic flame')}${s.unit === 'week' ? plural(s.current, 'week') : plural(s.current, 'day')}</div><p>${esc(s.name)}. Keep it going.</p>`;
    else html += `<div class="ins-big sm muted">None yet</div><p>Check something off today to start one.</p>`;
    html += `</div>`;
    box.innerHTML = html;
  }
  $('#ins-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ins]'); if (!b) return;
    if (b.dataset.ins === 'check') checkToday(b.dataset.id); else openDetail(b.dataset.id);
  });

  // ---------- year heatmap ----------
  const WEEKS = 53;
  function setFilter(v) {
    ui.filter = v; ZL.store.set('filter', v);
    const sel = $('#heat-filter'); if (sel.value !== v) sel.value = v;
  }
  function heatHabits() {
    if (ui.filter === 'all') return active();
    const h = byId(ui.filter);
    return h && !h.archived ? [h] : active();
  }
  function heatInfo(k) {
    const hs = heatHabits();
    if (ui.filter !== 'all' && hs.length === 1) {
      const h = hs[0]; const p = S.progressOn(h, k); const v = S.valueOn(h, k);
      const pre = S.startOf(h, T) > k;
      const lvl = p >= 1 ? 4 : p > 0 ? Math.max(1, Math.min(3, Math.ceil(p * 4) - 1 || 1)) : 0;
      const text = pre ? 'Before this habit started' : h.type === 'count' ? `${v} of ${h.goal}${h.unit ? ' ' + h.unit : ''}${p >= 1 ? ', goal reached' : ''}` : (v ? 'Done' : 'Not done');
      return { level: lvl, text, note: !!h.notes[k] };
    }
    const d = S.dayLevel(hs, k, T);
    return { level: d.level, text: d.total ? `${d.done} of ${plural(d.total, 'habit')} done` : 'No habits yet', note: hs.some((h) => h.notes[k]) };
  }
  function renderHeat() {
    const sel = $('#heat-filter');
    const act = active();
    if (ui.filter !== 'all' && !act.some((h) => h.id === ui.filter)) setFilter('all');
    sel.innerHTML = `<option value="all">All habits</option>` + act.map((h) => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('');
    sel.value = ui.filter;
    const one = ui.filter !== 'all' ? byId(ui.filter) : null;
    $('#heat').setAttribute('style', one ? hvars(one) : '');
    const g = S.gridRange(T, WEEKS);
    $('#heat-months').innerHTML = g.months.map((m) => `<span style="grid-column:${m.col + 1}">${m.label}</span>`).join('');
    const focusKey = ui.heatFocus && ui.heatFocus <= T ? ui.heatFocus : T;
    let html = ''; let checkins = 0; let activeDays = 0;
    for (let c = 0; c < WEEKS; c++) {
      for (let r = 0; r < 7; r++) {
        const k = S.addDays(g.start, c * 7 + r);
        if (k > T) { html += `<span class="cell future" aria-hidden="true"></span>`; continue; }
        const info = heatInfo(k);
        if (info.level) activeDays++;
        html += `<button type="button" class="cell l${info.level}${k === T ? ' today' : ''}${k === ui.heatDay ? ' sel' : ''}" data-key="${k}" tabindex="${k === focusKey ? 0 : -1}" aria-label="${esc(S.formatKey(k, 'long'))}: ${esc(info.text)}${info.note ? ', has a note' : ''}${k === T ? ', today' : ''}"></button>`;
      }
    }
    for (const h of heatHabits()) checkins += S.doneKeys(h).filter((k) => k >= g.start && k <= T).length;
    $('#heat-grid').innerHTML = html;
    $('#heat-grid').setAttribute('role', 'group');
    $('#heat-summary').textContent = !act.length ? 'Your check-ins will fill this in, one square a day.'
      : one ? `${plural(checkins, 'check-in')} in the last year · ${streakText(one)} streak · ${S.completionRate(one, T, 365)}% done`
        : `${plural(checkins, 'check-in')} and ${plural(activeDays, 'active day')} in the last year`;
    renderHeatDay();
  }
  function scrollHeatToEnd() { const s = $('#heat-scroll'); s.scrollLeft = s.scrollWidth; }

  function renderHeatDay() {
    const k = ui.heatDay; const box = $('#heat-day');
    if (!k) { box.hidden = true; return; }
    const hs = heatHabits();
    box.hidden = false;
    box.innerHTML = `<div class="hd-head"><div><p class="de-kicker">${k === T ? 'Today' : plural(S.diffDays(k, T), 'day') + ' ago'}</p><h4>${esc(S.formatKey(k, 'long'))}</h4></div>
      <button type="button" class="zl-iconbtn" id="hd-close" aria-label="Close this day">${I.ui('close')}</button></div>
      ${hs.length ? `<ul class="hd-list">${hs.map((h) => {
        const v = S.valueOn(h, k); const done = S.isDone(h, k);
        const ctl = h.type === 'count'
          ? `<div class="stepper sm" role="group" aria-label="${esc(h.name)} on this day"><button type="button" class="step" data-hd="minus" aria-label="One less" ${v ? '' : 'disabled'}>${I.ui('minus', 'ic', 2.4)}</button><output class="step-val num">${v}<small>/${h.goal}</small></output><button type="button" class="step" data-hd="plus" aria-label="One more">${I.ui('plus', 'ic', 2.4)}</button></div>`
          : `<button type="button" class="day-toggle" data-hd="toggle" aria-pressed="${done}">${done ? I.ui('tick', 'ic', 2.6) + 'Done' : 'Not done'}</button>`;
        return `<li data-id="${esc(h.id)}" style="${hvars(h)}"><span class="habit-tile sm">${I.habit(h.icon)}</span><span class="hd-name">${esc(h.name)}${h.notes[k] ? `<small>${esc(h.notes[k])}</small>` : ''}</span>${ctl}</li>`;
      }).join('')}</ul>` : '<p class="zl-hint">Add a habit to start filling in days.</p>'}`;
  }
  function openHeatDay(k) {
    ui.heatDay = ui.heatDay === k ? null : k; ui.heatFocus = k;
    $$('#heat-grid .cell.sel').forEach((c) => c.classList.remove('sel'));
    const cell = $(`#heat-grid .cell[data-key="${k}"]`);
    if (ui.heatDay && cell) cell.classList.add('sel');
    renderHeatDay();
  }
  const heatGrid = $('#heat-grid');
  heatGrid.addEventListener('click', (e) => { const c = e.target.closest('.cell[data-key]'); if (c) openHeatDay(c.dataset.key); });
  const cellTip = (c) => {
    const k = c.dataset.key; const info = heatInfo(k); const r = c.getBoundingClientRect();
    C.showTip(`<b>${esc(S.formatKey(k, 'dayShort'))}${k === T ? ' · Today' : ''}</b><span>${esc(info.text)}${info.note ? ' · note' : ''}</span>`, r.left + r.width / 2, r.top, heatGrid);
  };
  heatGrid.addEventListener('pointerover', (e) => { const c = e.target.closest('.cell[data-key]'); if (c) cellTip(c); });
  heatGrid.addEventListener('pointerleave', () => C.hideTip(heatGrid));
  heatGrid.addEventListener('focusin', (e) => { const c = e.target.closest('.cell[data-key]'); if (c) cellTip(c); });
  heatGrid.addEventListener('focusout', () => C.hideTip(heatGrid));
  heatGrid.addEventListener('keydown', (e) => {
    const c = e.target.closest('.cell[data-key]'); if (!c) return;
    const d = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const k = S.addDays(c.dataset.key, d);
    const n = $(`#heat-grid .cell[data-key="${k}"]`);
    if (n) { c.tabIndex = -1; n.tabIndex = 0; n.focus(); ui.heatFocus = k; }
  });
  $('#heat-filter').addEventListener('change', (e) => {
    setFilter(e.target.value); renderHeat();
    const h = byId(ui.filter);
    ZL.toast(h ? `Showing ${h.name} only` : 'Showing all habits', { type: 'info' });
  });
  $('#heat-day').addEventListener('click', (e) => {
    if (e.target.closest('#hd-close')) { const k = ui.heatDay; ui.heatDay = null; renderHeat(); const c = $(`#heat-grid .cell[data-key="${k}"]`); if (c) c.focus(); return; }
    const b = e.target.closest('[data-hd]'); if (!b) return;
    const h = byId(b.closest('li').dataset.id); const k = ui.heatDay;
    const when = k === T ? 'today' : S.formatKey(k, 'short');
    if (b.dataset.hd === 'toggle') { const on = toggleDay(h, k); commit(on ? `${h.name} marked done for ${when}` : `${h.name} cleared for ${when}`); }
    else {
      setValue(h, k, S.valueOn(h, k) + (b.dataset.hd === 'plus' ? 1 : -1));
      commit(`${h.name}: ${S.valueOn(h, k)} of ${h.goal} on ${when}`);
    }
    const again = $(`#heat-day li[data-id="${CSS.escape(h.id)}"] [data-hd="${b.dataset.hd}"]`) || $(`#heat-day li[data-id="${CSS.escape(h.id)}"] [data-hd]`);
    if (again && !again.disabled) again.focus();
  });

  // ---------- habit detail ----------
  function openDetail(id, opts = {}) {
    const h = byId(id); if (!h) return;
    closeMenu(false);
    ui.view = 'detail'; ui.detailId = id; ui.calMonth = S.monthStart(T); ui.selDay = T;
    $('#view-today').hidden = true; $('#view-detail').hidden = false;
    renderDetail();
    renderBar();
    if (!opts.noFocus) {
      const top = $('#app-frame').getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.5) $('#app-frame').scrollIntoView({ block: 'start', behavior: reduce() ? 'auto' : 'smooth' });
      $('#detail-back').focus({ preventScroll: true });
    }
  }
  function closeDetail(silent, opts = {}) {
    if (ui.view !== 'detail') return;
    const id = ui.detailId;
    ui.view = 'today'; ui.detailId = null;
    $('#view-detail').hidden = true; $('#view-today').hidden = false;
    C.hideTip();
    renderBar();
    if (!silent && !opts.noFocus) afterRow(id, '.habit-main');
  }
  function renderBar() {
    const h = ui.view === 'detail' ? byId(ui.detailId) : null;
    $('#bar-title').textContent = h ? h.name : 'Today';
  }

  function rateRow(label, pct) {
    return `<span class="rate-l">${label}</span><span class="rate-bar" aria-hidden="true"><i style="width:${pct}%"></i></span><b class="num">${pct}%</b>`;
  }
  function renderDetail() {
    const h = byId(ui.detailId);
    if (!h) { closeDetail(true); return; }
    const v = $('#view-detail');
    v.setAttribute('style', hvars(h));
    $('#d-icon').innerHTML = I.habit(h.icon);
    $('#d-name').textContent = h.name;
    const start = S.startOf(h, T);
    $('#d-meta').textContent = [typeLabel(h), h.reminder ? `Reminder at ${fmtTime(h.reminder)}` : '', `Since ${S.formatKey(start, 'short')} ${start.slice(0, 4)}`].filter(Boolean).join(' · ');
    const st = S.streaks(h, T);
    const unit = st.unit === 'week' ? 'week' : 'day';
    $('#d-current').textContent = st.current;
    $('#d-current-unit').textContent = (st.current === 1 ? unit : unit + 's') + (st.current && !st.aliveToday ? (unit === 'day' ? ', today still open' : ', this week in progress') : '');
    $('#d-longest').textContent = st.longest;
    $('#d-longest-unit').textContent = st.longest === 1 ? unit : unit + 's';
    $('#d-total').textContent = S.totalCheckins(h, T);
    $('#d-r30').innerHTML = rateRow('30 days', S.completionRate(h, T, 30));
    $('#d-r90').innerHTML = rateRow('90 days', S.completionRate(h, T, 90));
    $('#d-r365').innerHTML = rateRow('1 year', S.completionRate(h, T, 365));
    renderCalendar(h);
    renderDayEditor(h);
    renderCharts(h);
    renderNotes(h);
  }

  function calBounds(h) {
    const first = S.monthStart(S.startOf(h, T));
    const yearBack = S.addMonths(S.monthStart(T), -11);
    return { min: first < yearBack ? first : yearBack, max: S.monthStart(T) };
  }
  function renderCalendar(h) {
    const m = ui.calMonth; const b = calBounds(h);
    $('#cal-label').textContent = S.formatKey(m, 'monthYear');
    $('#cal-prev').disabled = m <= b.min; $('#cal-next').disabled = m >= b.max;
    const start = S.startOf(h, T);
    const cells = S.monthGrid(m);
    $('#cal-grid').innerHTML = cells.map((k) => {
      if (!k) return '<span class="day blank" aria-hidden="true"></span>';
      const future = k > T; const done = S.isDone(h, k); const p = S.progressOn(h, k); const val = S.valueOn(h, k);
      const cls = ['day', done ? 'done' : '', !done && p > 0 ? 'partial' : '', k === T ? 'today' : '', k === ui.selDay ? 'sel' : '', future ? 'future' : '', k < start ? 'pre' : '', h.notes[k] ? 'has-note' : ''].join(' ');
      const state = future ? 'future day' : h.type === 'count' ? `${val} of ${h.goal}${done ? ', goal reached' : ''}` : (done ? 'done' : 'not done');
      return `<button type="button" class="${cls}" data-key="${k}" ${future ? 'disabled' : ''} tabindex="${k === ui.selDay ? 0 : -1}" aria-pressed="${k === ui.selDay}" aria-label="${esc(S.formatKey(k, 'medium'))}: ${state}${h.notes[k] ? ', has a note' : ''}" style="--p:${(p * 100).toFixed(0)}%"><span>${+k.slice(8)}</span></button>`;
    }).join('');
    $('#cal-hint').textContent = h.type === 'count'
      ? 'Select a day to set its count below. Tap it again to fill it to the goal or clear it.'
      : 'Select a day, then tap it again to check it off or clear it. Notes go below.';
  }
  function renderDayEditor(h) {
    const k = ui.selDay;
    $('#de-kicker').textContent = k === T ? 'Today' : S.diffDays(k, T) === 1 ? 'Yesterday' : 'Selected day';
    $('#de-title').textContent = S.formatKey(k, 'medium');
    const v = S.valueOn(h, k); const done = S.isDone(h, k);
    $('#de-control').innerHTML = h.type === 'count'
      ? `<div class="stepper lg" role="group" aria-label="${esc(h.name)} on ${esc(S.formatKey(k, 'medium'))}">
          <button type="button" class="step" data-de="minus" aria-label="One less" ${v ? '' : 'disabled'}>${I.ui('minus', 'ic', 2.4)}</button>
          <output class="step-val num" id="de-val" aria-live="polite">${v}<small>/${h.goal}${h.unit ? ' ' + esc(h.unit) : ''}</small></output>
          <button type="button" class="step" data-de="plus" aria-label="One more">${I.ui('plus', 'ic', 2.4)}</button></div>
        <button type="button" class="zl-btn zl-btn-ghost zl-btn-sm" data-de="fill">${done ? 'Clear day' : 'Fill to goal'}</button>`
      : `<button type="button" class="de-toggle" data-de="toggle" aria-pressed="${done}">${I.ui('tick', 'ic', 2.6)}<span>${done ? 'Done' : 'Mark as done'}</span></button>`;
    const note = h.notes[k] || '';
    const ta = $('#de-note');
    if (document.activeElement !== ta || ta.dataset.key !== k) { ta.value = note; ta.dataset.key = k; }
    $('#de-clear').hidden = !note;
    $('#de-save').textContent = note ? 'Update note' : 'Save note';
  }
  function dayAction(h, k, act) {
    const when = k === T ? 'today' : S.formatKey(k, 'short');
    if (act === 'toggle' || act === 'fill') {
      const on = toggleDay(h, k);
      commit(on ? `${h.name} marked done for ${when}` : `${h.name} cleared for ${when}`);
    } else {
      setValue(h, k, S.valueOn(h, k) + (act === 'plus' ? 1 : -1));
      commit(`${h.name}: ${S.valueOn(h, k)} of ${h.goal} on ${when}`);
    }
  }
  $('#cal-grid').addEventListener('click', (e) => {
    const d = e.target.closest('.day[data-key]'); if (!d || d.disabled) return;
    const h = byId(ui.detailId); const k = d.dataset.key;
    if (ui.selDay === k) dayAction(h, k, h.type === 'count' ? 'fill' : 'toggle');
    else { ui.selDay = k; renderCalendar(h); renderDayEditor(h); }
    const n = $(`#cal-grid .day[data-key="${k}"]`); if (n) n.focus();
  });
  $('#cal-grid').addEventListener('keydown', (e) => {
    const d = e.target.closest('.day[data-key]'); if (!d) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!step) return;
    e.preventDefault();
    const k = S.addDays(d.dataset.key, step); if (k > T) return;
    const h = byId(ui.detailId);
    ui.selDay = k;
    if (S.monthStart(k) !== ui.calMonth) { const b = calBounds(h); if (S.monthStart(k) < b.min) return; ui.calMonth = S.monthStart(k); }
    renderCalendar(h); renderDayEditor(h);
    const n = $(`#cal-grid .day[data-key="${k}"]`); if (n) n.focus();
  });
  function shiftMonth(n) {
    const h = byId(ui.detailId); ui.calMonth = S.addMonths(ui.calMonth, n);
    const last = S.addDays(S.addMonths(ui.calMonth, 1), -1);
    ui.selDay = ui.calMonth === S.monthStart(T) ? T : (last > T ? T : last);
    renderCalendar(h); renderDayEditor(h);
  }
  $('#cal-prev').addEventListener('click', () => shiftMonth(-1));
  $('#cal-next').addEventListener('click', () => shiftMonth(1));
  $('#de-control').addEventListener('click', (e) => {
    const b = e.target.closest('[data-de]'); if (!b) return;
    dayAction(byId(ui.detailId), ui.selDay, b.dataset.de);
    const again = $(`#de-control [data-de="${b.dataset.de}"]`) || $('#de-control [data-de]'); if (again && !again.disabled) again.focus();
  });
  $('#de-save').addEventListener('click', () => {
    const h = byId(ui.detailId); const k = ui.selDay; const text = $('#de-note').value.trim().slice(0, 500);
    const had = !!h.notes[k];
    if (!text) {
      if (had) { delete h.notes[k]; commit(`Note removed from ${S.formatKey(k, 'short')}`); }
      else ZL.toast('Write something first, then save the note', { type: 'info' });
      return;
    }
    h.notes[k] = text;
    $('#de-note').blur();
    commit(had ? `Note updated for ${S.formatKey(k, 'short')}` : `Note saved for ${S.formatKey(k, 'short')}`);
  });
  $('#de-clear').addEventListener('click', () => {
    const h = byId(ui.detailId); const k = ui.selDay; const old = h.notes[k];
    delete h.notes[k]; $('#de-note').value = '';
    commit(`Note removed from ${S.formatKey(k, 'short')}`, { action: { label: 'Undo', fn: () => { h.notes[k] = old; commit('Note restored'); } } });
  });

  function renderCharts(h) {
    const wk = S.weekdayRates(h, T, 365);
    C.bars($('#chart-weekday'), wk.map((w, i) => ({ label: S.WEEKDAYS[i].slice(0, 3), full: S.WEEKDAYS[i], value: w.pct, detail: w.total ? `${w.done} of ${w.total} ${S.WEEKDAYS[i]}s` : '' })),
      { label: `${h.name}: completion by weekday` });
    $('#wk-sub').textContent = h.type === 'weekly' ? 'Share of each weekday you checked in' : 'Completion on each weekday, last year';
    const mo = S.monthlyRates(h, T, 12);
    C.line($('#chart-months'), mo.map((m) => ({ label: m.label, full: S.formatKey(m.key, 'monthYear'), value: m.pct })),
      { label: `${h.name}: completion for each of the last 12 months` });
  }
  function renderNotes(h) {
    const keys = Object.keys(h.notes).sort().reverse();
    $('#notes-sub').textContent = keys.length ? plural(keys.length, 'note') : '';
    $('#d-notes').innerHTML = keys.length ? keys.map((k) => `<li><button type="button" class="note-date" data-note="${k}">${esc(S.formatKey(k, 'dayShort'))}${k.slice(0, 4) !== T.slice(0, 4) ? ' ' + k.slice(0, 4) : ''}</button><p>${esc(h.notes[k])}</p></li>`).join('')
      : `<li class="notes-empty">${I.ui('note')}<p>No notes yet. Select a day on the calendar and write one.</p></li>`;
  }
  $('#d-notes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-note]'); if (!b) return;
    const h = byId(ui.detailId); const k = b.dataset.note;
    ui.selDay = k; ui.calMonth = S.monthStart(k);
    renderCalendar(h); renderDayEditor(h);
    $('.cal').scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
    const n = $(`#cal-grid .day[data-key="${k}"]`); if (n) n.focus({ preventScroll: true });
  });
  $('#detail-back').addEventListener('click', () => closeDetail(false));
  $('#d-edit').addEventListener('click', () => openEditor(byId(ui.detailId)));
  $('#d-archive').addEventListener('click', () => { const id = ui.detailId; closeDetail(true); archiveHabit(id); });
  $('#d-delete').addEventListener('click', () => { const id = ui.detailId; closeDetail(true); deleteHabit(id); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.view === 'detail' && !document.querySelector('dialog[open]') && !$('.zl-tour-card') && $('#row-menu').hidden) closeDetail(false);
  });
  if ('ResizeObserver' in window) {
    let lastW = 0;
    new ResizeObserver(() => {
      const w = $('#chart-weekday').clientWidth;
      if (ui.view === 'detail' && w && Math.abs(w - lastW) > 4 && byId(ui.detailId)) { lastW = w; renderCharts(byId(ui.detailId)); }
    }).observe($('#view-detail'));
  }

  // ---------- habit editor ----------
  const dlg = $('#editor');
  const ed = { id: null, type: 'check', icon: 'check', color: 'amber', times: 3, iconTouched: false };
  const SUGGEST = [
    [/read|book|page/, 'book'], [/water|drink|hydrat/, 'droplet'], [/gym|lift|weight|strength|push.?up/, 'dumbbell'],
    [/run|cardio|jog|swim/, 'activity'], [/bike|cycl|ride/, 'bike'], [/hike|climb|trail/, 'mountain'],
    [/sleep|lights out|bedtime/, 'moon'], [/nap|rest/, 'bed'], [/walk|morning|sun/, 'sun'], [/meditat|breath|yoga|mindful|stretch/, 'leaf'],
    [/eat|fruit|veg|cook|meal|food/, 'apple'], [/coffee|caffeine|tea/, 'coffee'], [/vitamin|pill|med|supplement/, 'pill'],
    [/journal|write|diary/, 'pen'], [/code|program|leetcode|github/, 'code'], [/music|guitar|piano|practi[cs]e/, 'music'],
    [/spanish|french|serbian|language|duolingo/, 'globe'], [/save|money|budget|spend/, 'dollar'], [/phone|screen|social/, 'phone'],
    [/clean|tidy|chore|dishes/, 'home'], [/floss|teeth|smile|gratitude|mood/, 'smile'], [/learn|study|revise|lecture/, 'bulb'], [/heart|health|steps/, 'heart'],
  ];
  const TYPE_HINT = {
    check: 'Done or not done, once a day.',
    count: 'Count up to a daily goal, like 8 glasses of water. The day is done when you reach it.',
    weekly: 'Hit a target each week, Monday to Sunday. Rest days never break the streak.',
  };
  function buildPickers() {
    $('#ed-icons').innerHTML = I.keys.map((k) => `<button type="button" role="radio" class="pick-icon" data-icon="${k}" aria-checked="false" aria-label="${esc(I.label(k))}" tabindex="-1">${I.habit(k)}</button>`).join('');
    $('#ed-colors').innerHTML = S.COLORS.map((c) => `<button type="button" role="radio" class="pick-color" data-color="${c}" aria-checked="false" aria-label="${COLOR_NAMES[c]}" tabindex="-1" style="--h:var(--c-${c});--h-on:var(--on-${c})"><span>${I.ui('tick', 'ic', 2.8)}</span></button>`).join('');
    $('#ed-times').innerHTML = [1, 2, 3, 4, 5, 6, 7].map((n) => `<button type="button" data-times="${n}" aria-pressed="false" aria-label="${n} ${n === 1 ? 'time' : 'times'} a week">${n}</button>`).join('');
    $('#ed-x').innerHTML = I.ui('close');
  }
  function syncEditor() {
    $$('#ed-type button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === ed.type)));
    $('#ed-type-hint').textContent = TYPE_HINT[ed.type];
    $('#ed-count-row').hidden = ed.type !== 'count';
    $('#ed-weekly-row').hidden = ed.type !== 'weekly';
    $$('#ed-times button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.times === ed.times)));
    $$('#ed-icons .pick-icon').forEach((b) => { const on = b.dataset.icon === ed.icon; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    $$('#ed-colors .pick-color').forEach((b) => { const on = b.dataset.color === ed.color; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    $('#ed-icons').setAttribute('style', `--h:var(--c-${ed.color});--h-on:var(--on-${ed.color})`);
    $('#ed-time-row').hidden = !$('#ed-remind').checked;
  }
  function setErr(input, errEl, msg) {
    const e = $(errEl); e.textContent = msg || ''; e.hidden = !msg;
    $(input).setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function openEditor(h) {
    closeMenu(false);
    ed.id = h ? h.id : null; ed.type = h ? h.type : 'check'; ed.icon = h ? h.icon : 'check';
    const used = active().map((x) => x.color);
    ed.color = h ? h.color : (S.COLORS.find((c) => !used.includes(c)) || 'amber');
    ed.times = h && h.type === 'weekly' ? h.goal : 3; ed.iconTouched = !!h;
    $('#ed-title').textContent = h ? 'Edit habit' : 'New habit';
    $('#ed-save').textContent = h ? 'Save changes' : 'Add habit';
    $('#ed-name').value = h ? h.name : '';
    $('#ed-goal').value = h && h.type === 'count' ? h.goal : 8;
    $('#ed-unit').value = h && h.type === 'count' ? h.unit : '';
    $('#ed-remind').checked = !!(h && h.reminder);
    $('#ed-time').value = (h && h.reminder) || '08:00';
    setErr('#ed-name', '#ed-name-err', ''); setErr('#ed-goal', '#ed-goal-err', '');
    syncEditor();
    dlg.showModal();
    $('#ed-name').focus();
  }
  $('#ed-name').addEventListener('input', () => {
    setErr('#ed-name', '#ed-name-err', '');
    if (ed.iconTouched) return;
    const n = $('#ed-name').value.toLowerCase();
    const hit = SUGGEST.find(([re]) => re.test(n));
    ed.icon = hit ? hit[1] : 'check'; syncEditor();
  });
  $('#ed-goal').addEventListener('input', () => setErr('#ed-goal', '#ed-goal-err', ''));
  $('#ed-type').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (b) { ed.type = b.dataset.type; syncEditor(); } });
  $('#ed-times').addEventListener('click', (e) => { const b = e.target.closest('[data-times]'); if (b) { ed.times = +b.dataset.times; syncEditor(); } });
  function radioKeys(box, attr, set) {
    box.addEventListener('click', (e) => { const b = e.target.closest(`[data-${attr}]`); if (b) { set(b.dataset[attr]); syncEditor(); b.focus(); } });
    box.addEventListener('keydown', (e) => {
      const items = $$(`[data-${attr}]`, box); const i = items.indexOf(document.activeElement); if (i < 0) return;
      const cols = Math.max(1, Math.round(box.clientWidth / (items[0].offsetWidth + 8)));
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]; if (!d) return;
      e.preventDefault();
      const n = items[Math.max(0, Math.min(items.length - 1, i + d))];
      set(n.dataset[attr]); syncEditor(); n.focus();
    });
  }
  radioKeys($('#ed-icons'), 'icon', (v) => { ed.icon = v; ed.iconTouched = true; });
  radioKeys($('#ed-colors'), 'color', (v) => { ed.color = v; });
  $('#ed-remind').addEventListener('change', () => {
    syncEditor();
    if ($('#ed-remind').checked && 'Notification' in window && Notification.permission === 'default') requestNotif();
  });
  const closeEditor = () => dlg.close();
  $('#ed-cancel').addEventListener('click', closeEditor);
  $('#ed-x').addEventListener('click', closeEditor);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeEditor(); });
  $('#ed-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#ed-name').value.trim();
    let bad = false;
    if (!name) { setErr('#ed-name', '#ed-name-err', 'Give the habit a name, like "Read 20 pages".'); bad = true; }
    else if (active().some((h) => h.id !== ed.id && h.name.toLowerCase() === name.toLowerCase())) {
      setErr('#ed-name', '#ed-name-err', `You already have a habit called "${name}". Pick a different name.`); bad = true;
    }
    let goal = 1;
    if (ed.type === 'count') {
      goal = Number($('#ed-goal').value);
      if (!Number.isInteger(goal) || goal < 1 || goal > 999) { setErr('#ed-goal', '#ed-goal-err', 'Enter a whole number from 1 to 999.'); bad = true; }
    }
    if (ed.type === 'weekly') goal = ed.times;
    if (bad) { (($('#ed-name').getAttribute('aria-invalid') === 'true') ? $('#ed-name') : $('#ed-goal')).focus(); return; }
    const reminder = $('#ed-remind').checked && S.TIME_RE.test($('#ed-time').value) ? $('#ed-time').value : null;
    const unit = ed.type === 'count' ? $('#ed-unit').value.trim().slice(0, 16) : '';
    if (ed.id) {
      const h = byId(ed.id);
      if (h.type !== ed.type || h.goal !== goal) {
        // Keep history meaningful when the type or goal changes: complete days stay complete.
        const doneSet = new Set(S.doneKeys(h)); const old = { ...h.log }; h.log = {};
        for (const k of Object.keys(old)) {
          if (ed.type === 'count') h.log[k] = h.type === 'count' ? old[k] : goal;
          else if (doneSet.has(k)) h.log[k] = 1;
        }
      }
      Object.assign(h, { name, icon: ed.icon, color: ed.color, type: ed.type, goal, unit, reminder });
      dlg.close();
      commit(`Changes to ${name} saved`);
    } else {
      const h = { id: uid(), name, icon: ed.icon, color: ed.color, type: ed.type, goal, unit, reminder, log: {}, notes: {}, createdOn: T, archived: false };
      state.habits = [...active(), h, ...archived()];
      dlg.close();
      commit(`${name} added${reminder ? `, reminder at ${fmtTime(reminder)}` : ''}`);
      afterRow(h.id, '.check-btn', 'arrive');
    }
  });

  // ---------- reminders ----------
  function notifState() { return 'Notification' in window ? Notification.permission : 'unsupported'; }
  function renderReminders() {
    const s = notifState(); const n = active().filter((h) => h.reminder).length;
    const withRem = n ? ` ${plural(n, 'habit has', 'habits have')} a reminder.` : ' Add a time to a habit in its editor.';
    const txt = {
      granted: 'Notifications are on.' + withRem,
      default: 'Notifications are off. Without them you get an alert on this page instead.' + (n ? ` ${plural(n, 'habit has', 'habits have')} a reminder.` : ''),
      denied: 'Notifications are blocked for this site. Allow them in your browser settings to get them; until then you get an alert on this page.',
      unsupported: 'This browser does not support notifications, so reminders show as an alert on this page.',
    }[s];
    $('#notif-state').textContent = txt;
    const b = $('#btn-notif');
    b.hidden = s === 'denied' || s === 'unsupported';
    b.textContent = s === 'granted' ? 'Send a test' : 'Turn on notifications';
    $('#reminders').classList.toggle('on', s === 'granted');
  }
  function requestNotif() {
    if (!('Notification' in window)) { ZL.toast('This browser does not support notifications', { type: 'bad' }); return Promise.resolve('unsupported'); }
    return Promise.resolve(Notification.requestPermission()).then((p) => {
      renderReminders();
      if (p === 'granted') ZL.toast('Notifications are on');
      else if (p === 'denied') ZL.toast('Notifications were blocked. You can allow them in your browser settings.', { type: 'bad' });
      else ZL.toast('Notifications are still off', { type: 'info' });
      return p;
    });
  }
  function notify(title, body, tag) {
    if (notifState() === 'granted') {
      try {
        const n = new Notification(title, { body, tag });
        n.onclick = () => { focus(); n.close(); };
        return;
      } catch (e) { /* fall through to an in-page alert */ }
    }
    ZL.toast(`${title}. ${body}`, { type: 'info', duration: 8000 });
  }
  $('#btn-notif').addEventListener('click', () => {
    if (notifState() === 'granted') { notify('Streaks reminder test', 'This is how your reminders will look.', 'streaks-test'); ZL.toast('Test notification sent'); }
    else requestNotif();
  });
  function checkReminders() {
    const now = new Date(); const mins = now.getHours() * 60 + now.getMinutes();
    const fired = ZL.store.get('fired', {});
    let changed = false;
    for (const h of active()) {
      if (!h.reminder || fired[h.id] === T) continue;
      const [hh, mm] = h.reminder.split(':').map(Number); const at = hh * 60 + mm;
      if (mins < at || mins >= at + 120) continue;
      fired[h.id] = T; changed = true;
      const ts = S.todayStatus(h, T);
      if (ts.complete) continue;
      notify(`Time for ${h.name}`, h.type === 'count' ? `${S.valueOn(h, T)} of ${h.goal}${h.unit ? ' ' + h.unit : ''} so far today.` : `Keep your ${streakText(h)} streak going.`, 'streaks-' + h.id);
    }
    if (changed) ZL.store.set('fired', fired);
  }

  // ---------- backup ----------
  $('#btn-export').addEventListener('click', () => {
    if (!state.habits.length) { ZL.toast('Nothing to export yet', { type: 'info' }); return; }
    const blob = new Blob([JSON.stringify(S.exportData(state.habits, T), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `streaks-backup-${T}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    ZL.toast(`Backup downloaded: ${plural(state.habits.length, 'habit')}`);
  });
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  function importError(msg) { const e = $('#import-error'); e.textContent = msg || ''; e.hidden = !msg; }
  $('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    importError('');
    let data;
    try { data = JSON.parse(await f.text()); } catch (err) {
      importError(`"${f.name}" is not valid JSON. Choose a .json backup exported from Streaks.`);
      ZL.toast('Import failed', { type: 'bad' }); return;
    }
    const r = S.normaliseImport(data);
    if (r.error) { importError(r.error); ZL.toast('Import failed', { type: 'bad' }); return; }
    if (state.habits.length) {
      const ok = await ZL.confirm({ title: 'Replace your habits?', body: `This replaces your ${plural(state.habits.length, 'habit')} with the ${plural(r.habits.length, 'habit')} in "${f.name}". Export first if you want to keep what you have.`, confirmLabel: 'Replace', danger: true });
      if (!ok) { ZL.toast('Import cancelled', { type: 'info' }); return; }
    }
    state.habits = fixCreated(r.habits);
    closeDetail(true); ui.heatDay = null;
    commit(`Imported ${plural(r.habits.length, 'habit')}`);
  });

  // ---------- example ----------
  async function loadExample() {
    if (state.habits.length) {
      const ok = await ZL.confirm({ title: 'Replace with the example?', body: `This replaces your ${plural(state.habits.length, 'habit')} with five example habits and about 200 days of history. Export a backup first if you want to keep them.`, confirmLabel: 'Load example', danger: true });
      if (!ok) return;
    }
    state.habits = S.example(T);
    closeDetail(true); ui.heatDay = null; setFilter('all');
    commit('Example loaded: 5 habits with about 200 days of history');
    scrollHeatToEnd();
  }
  $('#btn-example').addEventListener('click', loadExample);
  $('#empty-example').addEventListener('click', loadExample);
  $('#btn-new').addEventListener('click', () => openEditor(null));
  $('#empty-new').addEventListener('click', () => openEditor(null));

  // ---------- render all ----------
  function render() {
    renderToday();
    renderInsights();
    renderHeat();
    if (ui.view === 'detail') renderDetail();
    renderBar();
    renderReminders();
  }

  // Features tile: a small deterministic heatmap
  (function miniHeat() {
    const box = $('#mini-heat'); if (!box) return;
    let a = 7; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    let html = '';
    for (let c = 0; c < 30; c++) for (let d = 0; d < 7; d++) {
      const p = 0.35 + c / 50 - (d >= 5 ? 0.2 : 0);
      const v = r(); const l = v < p * 0.5 ? 4 : v < p * 0.8 ? 3 : v < p ? 2 : v < p + 0.15 ? 1 : 0;
      html += `<i class="l${l}"></i>`;
    }
    box.innerHTML = html;
  })();

  $('#back-ic').innerHTML = I.ui('chevronL', 'ic', 2.4);
  $('#cal-prev').innerHTML = I.ui('chevronL', 'ic', 2.4);
  $('#cal-next').innerHTML = I.ui('chevronR', 'ic', 2.4);
  $('#rem-icon').innerHTML = I.ui('bell');
  $('#bak-icon').innerHTML = I.ui('download');
  buildPickers();
  render();
  scrollHeatToEnd();
  if (migrated) ZL.toast(`Brought over ${plural(migrated, 'habit')} from the previous version of Streaks`);

  // Day rollover and reminders
  function tick() {
    const k = S.todayKey();
    if (k !== T) { T = k; if (ui.selDay > T || ui.view !== 'detail') ui.selDay = T; render(); }
    checkReminders();
  }
  setInterval(tick, 20000);
  setTimeout(checkReminders, 1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  // ---------- guided tour ----------
  const firstRow = () => $('#habit-list .habit-row .check-btn');
  const toToday = () => { if (ui.view === 'detail') closeDetail(true); };
  ZL.tour([
    { el: '#today-hero', before: toToday, title: 'Today at a glance', body: 'The ring fills as you check things off. Weekly habits join it on the days they are due.' },
    { get el() { return firstRow() || $('#today-empty'); }, before: toToday, title: 'Check off a habit',
      get body() { return firstRow() ? 'Tap the circle to tick a habit off. Count habits go up by one with each tap, or use minus and plus.' : 'Your habits appear here. Tap the circle to tick one off; count habits get minus and plus buttons.'; } },
    { el: '#btn-new', before: toToday, title: 'Add a habit', body: 'Choose yes or no, a daily count, or a number of times a week. Then pick an icon, a colour and an optional reminder.' },
    { el: '#heat', before: toToday, title: 'Your year', body: 'Every square is a day, brighter when more got done. Filter to one habit, or select a day to fix a missed check-in.' },
    { get el() { return active().length ? $('#view-detail .detail-grid') : $('#btn-example'); },
      before: () => { if (active().length) openDetail(active()[0].id, { noFocus: true }); },
      title: 'Habit details',
      get body() { return active().length ? 'Each habit has a calendar, notes, streaks and charts. Select a day to change it or add a note.' : 'Tap a habit\'s name for its calendar, notes, streaks and charts. Load the example to try it with months of data.'; } },
    { el: '#insights', before: toToday, title: 'Insights', body: 'Your best weekday, a consistency score and the habit most at risk, worked out from your check-ins.' },
    { el: '#backup', before: toToday, title: 'Back up your data', body: 'Everything stays in this browser. Export a JSON backup to keep a copy or move to another device.' },
  ]);

  // test hook (read-only)
  window.StreaksApp = { state, ui, today: () => T, openDetail, closeDetail };
})();
