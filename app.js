(function () {
  'use strict';
  const S = window.StreakLogic;
  const STORE_KEY = 'streaks:v1';
  const THEME_KEY = 'streaks:theme';
  const YEAR_WEEKS = 53;
  const MINI_WEEKS = 12;
  const EMOJIS = ['💧', '📚', '🏃', '🧘', '💪', '🥗', '😴', '✍️', '🎸', '🧹', '💊', '🌱', '📵', '🧠', '☀️', '🦷'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TICK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5l2.3 2.3L9.5 3.8"/></svg>';

  // ---------- State ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const r = S.normaliseImport(JSON.parse(raw));
        if (r.habits) return { habits: r.habits };
      }
    } catch (e) { /* storage blocked or corrupt: start empty */ }
    return { habits: [] };
  }
  let state = load();
  let sets = new Map(); // habit id -> Set of done keys (kept in sync with habit.done)
  const setOf = (h) => {
    let s = sets.get(h.id);
    if (!s) { s = new Set(h.done); sets.set(h.id, s); }
    return s;
  };
  function save() {
    for (const h of state.habits) h.done = [...setOf(h)].sort();
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, habits: state.habits })); } catch (e) { /* in-memory only */ }
  }
  function replaceHabits(habits) {
    state.habits = habits;
    sets = new Map();
  }
  const active = () => state.habits.filter((h) => !h.archived);
  const byId = (id) => state.habits.find((h) => h.id === id);

  let today = S.todayKey();
  let selectedDay = null;
  let editingId = null;
  let openMenuId = null;

  // ---------- Theme ----------
  const themeBtn = $('#theme-toggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');
  function syncThemeUi() {
    const t = currentTheme();
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    $('#theme-color').setAttribute('content', t === 'dark' ? '#0F161D' : '#F3F5F7');
  }
  themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    syncThemeUi();
  });
  systemDark.addEventListener?.('change', syncThemeUi);
  syncThemeUi();

  // ---------- Toast ----------
  const toast = $('#toast');
  let toastTimer;
  function showToast(msg, action) {
    toast.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-action'; b.textContent = action.label;
      b.addEventListener('click', () => { action.run(); hideToast(); });
      toast.append(b);
    }
    toast.style.paddingRight = action ? '' : '18px';
    toast.classList.add('show');
    toast.style.pointerEvents = action ? 'auto' : 'none';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 6000 : 2400);
  }
  function hideToast() { toast.classList.remove('show'); toast.style.pointerEvents = 'none'; }

  // ---------- Toggling ----------
  function toggle(habitId, key) {
    const h = byId(habitId);
    if (!h || key > today) return false;
    const s = setOf(h);
    if (s.has(key)) s.delete(key); else s.add(key);
    if (!h.startedOn || key < h.startedOn) h.startedOn = key;
    save();
    return s.has(key);
  }

  // ---------- Year heatmap ----------
  const heatGrid = $('#heat-grid');
  let yearRange = null;
  let focusKey = null;

  function buildYear() {
    yearRange = S.gridRange(today, YEAR_WEEKS);
    const months = $('#heat-months');
    months.innerHTML = yearRange.months
      .filter((m, i, arr) => !(i === 0 && arr[1] && arr[1].col - m.col < 3))
      .map((m) => `<span style="grid-column:${m.col + 1}">${m.label}</span>`).join('');
    const frag = document.createDocumentFragment();
    for (let i = 0; i < YEAR_WEEKS * 7; i++) {
      const k = S.addDays(yearRange.start, i);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.dataset.key = k;
      b.tabIndex = -1;
      if (k > today) { b.classList.add('future'); b.setAttribute('aria-hidden', 'true'); b.disabled = true; }
      if (k === today) b.classList.add('today');
      frag.append(b);
    }
    heatGrid.replaceChildren(frag);
    if (!focusKey || focusKey > today || focusKey < yearRange.start) focusKey = today;
  }

  function updateYear() {
    const list = active();
    const total = list.length;
    const counts = new Map();
    for (const h of list) for (const k of setOf(h)) counts.set(k, (counts.get(k) || 0) + 1);
    let checkins = 0; let perfect = 0;
    for (const cell of heatGrid.children) {
      const k = cell.dataset.key;
      if (k > today) continue;
      const c = counts.get(k) || 0;
      checkins += c;
      if (total && c >= total) perfect++;
      const lvl = S.level(c, total);
      cell.className = `cell l${lvl}${k === today ? ' today' : ''}${k === selectedDay ? ' selected' : ''}`;
      cell.tabIndex = k === focusKey ? 0 : -1;
      const date = S.formatKey(k, 'long');
      const label = total ? `${date}: ${c} of ${total} habit${total === 1 ? '' : 's'} done` : `${date}: no habits yet`;
      cell.setAttribute('aria-label', label + (k === today ? ', today' : ''));
      cell.dataset.tip = total ? `<b>${c} of ${total}</b> on ${S.formatKey(k, 'medium')}` : `${S.formatKey(k, 'medium')}`;
      cell.setAttribute('aria-pressed', String(k === selectedDay));
    }
    const doneToday = counts.get(today) || 0;
    $('#today-num').innerHTML = `${doneToday}<span class="of">/${total}</span>`;
    $('#today-label').textContent = total ? (doneToday === total ? 'all done today' : 'done today') : 'habits so far';
    $('#year-summary').textContent = total
      ? `${checkins.toLocaleString('en-AU')} check-ins in the past year, ${perfect} perfect day${perfect === 1 ? '' : 's'}.`
      : 'Add a habit below and your year fills in here.';
  }

  heatGrid.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || cell.disabled) return;
    focusKey = cell.dataset.key;
    selectedDay = selectedDay === cell.dataset.key ? null : cell.dataset.key;
    renderDayPanel();
    updateYear();
  });
  heatGrid.addEventListener('keydown', (e) => {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7, Home: null, End: null }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    if (e.target.dataset?.key) focusKey = e.target.dataset.key;
    let next = e.key === 'Home' ? yearRange.start : e.key === 'End' ? today : S.addDays(focusKey, step);
    if (next > today) next = today;
    if (next < yearRange.start) next = yearRange.start;
    focusKey = next;
    for (const c of heatGrid.children) c.tabIndex = c.dataset.key === next ? 0 : -1;
    const cell = heatGrid.querySelector(`[data-key="${next}"]`);
    cell.focus();
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  // ---------- Day panel ----------
  const dayPanel = $('#day-panel');
  function renderDayPanel() {
    if (!selectedDay) { dayPanel.hidden = true; $('#day-hint').hidden = false; return; }
    const list = active();
    dayPanel.hidden = false;
    $('#day-hint').hidden = true;
    const title = selectedDay === today ? `Today, ${S.formatKey(selectedDay, 'medium')}` : S.formatKey(selectedDay, 'long');
    dayPanel.innerHTML = `
      <div class="day-panel-head">
        <h3>${esc(title)}</h3>
        <button type="button" class="pill ghost close-btn" id="day-close">Close</button>
      </div>
      ${list.length ? `<div class="day-toggles">${list.map((h) => {
        const on = setOf(h).has(selectedDay);
        return `<button type="button" class="toggle-chip" data-habit="${h.id}" aria-pressed="${on}" data-focus="day-${h.id}">
          <span class="tick">${TICK}</span><span class="emoji" aria-hidden="true">${esc(h.emoji)}</span>${esc(h.name)}</button>`;
      }).join('')}</div>` : '<p class="muted">Add a habit first, then you can tick off any day here.</p>'}`;
  }
  dayPanel.addEventListener('click', (e) => {
    if (e.target.closest('#day-close')) {
      const k = selectedDay;
      selectedDay = null; renderDayPanel(); updateYear();
      heatGrid.querySelector(`[data-key="${k}"]`)?.focus();
      return;
    }
    const chip = e.target.closest('.toggle-chip');
    if (!chip) return;
    toggle(chip.dataset.habit, selectedDay);
    renderAll();
  });

  // ---------- Tooltip ----------
  const tip = $('#tip');
  let tipCell = null;
  function showTip(cell) {
    if (!cell?.dataset.tip) return;
    tipCell = cell;
    tip.innerHTML = cell.dataset.tip;
    tip.classList.add('show');
    const r = cell.getBoundingClientRect();
    const tw = tip.offsetWidth; const th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(x, document.documentElement.clientWidth - tw - 8));
    let y = r.top - th - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  }
  function hideTip() { tip.classList.remove('show'); tipCell = null; }
  document.addEventListener('pointerover', (e) => {
    const cell = e.target.closest?.('.cell');
    if (cell && e.pointerType !== 'touch') showTip(cell); else if (tipCell) hideTip();
  });
  document.addEventListener('focusin', (e) => { if (e.target.classList?.contains('cell')) showTip(e.target); else hideTip(); });
  document.addEventListener('scroll', hideTip, true);
  document.addEventListener('pointerleave', hideTip);

  // ---------- Habit list ----------
  function targetText(h, st) {
    if (h.target.type === 'weekly') {
      const t = h.target.times;
      return `${t} time${t === 1 ? '' : 's'} a week, ${Math.min(st.thisWeek, 99)} done this week`;
    }
    return 'Every day';
  }
  function miniGrid(h) {
    const range = S.gridRange(today, MINI_WEEKS);
    const s = setOf(h);
    let html = '';
    for (let i = 0; i < MINI_WEEKS * 7; i++) {
      const k = S.addDays(range.start, i);
      if (k > today) { html += '<span class="cell future" aria-hidden="true"></span>'; continue; }
      const on = s.has(k);
      const date = S.formatKey(k, 'long');
      html += `<button type="button" class="cell${on ? ' on' : ''}${k === today ? ' today' : ''}" data-habit="${h.id}" data-key="${k}" data-focus="mini-${h.id}-${k}"
        aria-pressed="${on}" aria-label="${esc(h.name)}, ${date}${k === today ? ', today' : ''}: ${on ? 'done' : 'not done'}"
        data-tip="${esc(`<b>${on ? 'Done' : 'Not done'}</b> on ${S.formatKey(k, 'medium')}`)}" tabindex="${k === today ? 0 : -1}"></button>`;
    }
    return `<div class="mini" role="group" aria-label="${esc(h.name)}: last 12 weeks. Use arrow keys to move between days.">${html}</div>`;
  }
  function streakStat(st) {
    const unit = st.unit === 'week' ? (st.current === 1 ? 'wk' : 'wks') : (st.current === 1 ? 'day' : 'days');
    return `<b>${st.current}<small>${unit}</small></b>`;
  }
  function renderHabits() {
    const list = active();
    const ol = $('#habits');
    if (!list.length) {
      ol.innerHTML = `<li class="empty">${state.habits.length ? 'All your habits are archived. Add a new one or restore one below.' : 'No habits yet. Add one you want to do every day or a few times a week, or load the example to see how it looks.'}</li>`;
    } else {
      ol.innerHTML = list.map((h, i) => {
        const st = S.streaks({ ...h, done: setOf(h) }, today);
        const pct = S.completion30({ ...h, done: setOf(h) }, today);
        const doneToday = setOf(h).has(today);
        const longestUnit = st.unit === 'week' ? 'wks' : 'days';
        return `<li class="habit" data-id="${h.id}">
          <div class="h-info">
            <span class="h-emoji emoji" aria-hidden="true">${esc(h.emoji)}</span>
            <div><h3 class="h-name">${esc(h.name)}</h3><span class="h-target">${targetText(h, st)}</span></div>
          </div>
          <div class="h-stats">
            <div class="stat${st.current ? ' hot' : ''}">${streakStat(st)}<span>Current streak</span></div>
            <div class="stat"><b>${st.longest}<small>${longestUnit}</small></b><span>Longest</span></div>
            <div class="stat"><b>${pct}<small>%</small></b><span>Last 30 days</span></div>
          </div>
          <div class="h-mini">${miniGrid(h)}</div>
          <div class="h-actions">
            <button type="button" class="done-btn" data-habit="${h.id}" data-focus="done-${h.id}" aria-pressed="${doneToday}"
              aria-label="${esc(h.name)}: done today"><span class="tick">${TICK}</span>Done today</button>
            <button type="button" class="icon-btn more-btn" data-habit="${h.id}" data-focus="more-${h.id}" aria-haspopup="true"
              aria-expanded="${openMenuId === h.id}" aria-label="More actions for ${esc(h.name)}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>
            ${openMenuId === h.id ? `<div class="menu" role="group" aria-label="Actions for ${esc(h.name)}">
              <button type="button" data-act="edit" data-habit="${h.id}">Rename or edit</button>
              <button type="button" data-act="up" data-habit="${h.id}" ${i === 0 ? 'disabled' : ''}>Move up</button>
              <button type="button" data-act="down" data-habit="${h.id}" ${i === list.length - 1 ? 'disabled' : ''}>Move down</button>
              <button type="button" data-act="archive" data-habit="${h.id}">Archive</button>
              <hr>
              <button type="button" class="danger" data-act="delete" data-habit="${h.id}">Delete habit</button>
            </div>` : ''}
          </div>
        </li>`;
      }).join('');
    }

    const archived = state.habits.filter((h) => h.archived);
    $('#archived').hidden = !archived.length;
    $('#archived-sum').textContent = `Archived (${archived.length})`;
    $('#archived-list').innerHTML = archived.map((h) => `
      <li><span class="emoji" aria-hidden="true">${esc(h.emoji)}</span><span class="a-name">${esc(h.name)}</span>
        <button type="button" class="pill ghost" data-act="restore" data-habit="${h.id}">Restore</button>
        <button type="button" class="pill ghost danger" data-act="delete" data-habit="${h.id}">Delete</button></li>`).join('');
  }

  function moveHabit(id, dir) {
    const list = active();
    const i = list.findIndex((h) => h.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = state.habits.indexOf(list[i]);
    const b = state.habits.indexOf(list[j]);
    [state.habits[a], state.habits[b]] = [state.habits[b], state.habits[a]];
    save();
  }

  function deleteHabit(id) {
    const idx = state.habits.findIndex((h) => h.id === id);
    if (idx < 0) return;
    const [h] = state.habits.splice(idx, 1);
    const doneSet = setOf(h);
    sets.delete(id);
    save();
    renderAll();
    showToast(`Deleted ${h.name}.`, {
      label: 'Undo',
      run: () => { state.habits.splice(idx, 0, h); sets.set(h.id, doneSet); save(); renderAll(); },
    });
  }

  function onHabitAction(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.habit;
    if (btn.classList.contains('done-btn')) {
      const on = toggle(id, today);
      renderAll({ focus: `done-${id}` });
      const nb = document.querySelector(`[data-focus="done-${id}"]`);
      if (on && nb && !reduceMotion()) nb.classList.add('pop');
      return;
    }
    if (btn.classList.contains('cell')) {
      toggle(id, btn.dataset.key);
      renderAll({ focus: btn.dataset.focus });
      return;
    }
    if (btn.classList.contains('more-btn')) {
      openMenuId = openMenuId === id ? null : id;
      renderHabits();
      if (openMenuId) $(`.menu button:not(:disabled)`)?.focus();
      else document.querySelector(`[data-focus="more-${id}"]`)?.focus();
      return;
    }
    const act = btn.dataset.act;
    if (!act) return;
    const h = byId(id);
    openMenuId = null;
    if (act === 'edit') { renderHabits(); openForm(h); return; }
    if (act === 'up' || act === 'down') {
      moveHabit(id, act === 'up' ? -1 : 1);
      openMenuId = id;
      renderAll();
      const still = $(`.menu [data-act="${act}"]:not(:disabled)`) || $(`.menu button:not(:disabled)`);
      still?.focus();
      return;
    }
    if (act === 'archive') {
      h.archived = true; save(); if (selectedDay) renderDayPanel(); renderAll();
      showToast(`Archived ${h.name}. Find it under Archived.`, { label: 'Undo', run: () => { h.archived = false; save(); renderAll(); } });
      return;
    }
    if (act === 'restore') { h.archived = false; save(); renderAll(); showToast(`Restored ${h.name}.`); return; }
    if (act === 'delete') deleteHabit(id);
  }
  $('#habits').addEventListener('click', onHabitAction);
  $('#archived-list').addEventListener('click', onHabitAction);

  // Arrow keys inside a mini grid
  $('#habits').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openMenuId) {
      const id = openMenuId; openMenuId = null; renderHabits();
      document.querySelector(`[data-focus="more-${id}"]`)?.focus();
      return;
    }
    const cell = e.target.closest('.mini .cell');
    if (!cell) return;
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = cell.parentElement.querySelector(`[data-key="${S.addDays(cell.dataset.key, step)}"]`);
    if (next) { cell.tabIndex = -1; next.tabIndex = 0; next.focus(); }
  });
  document.addEventListener('click', (e) => {
    if (openMenuId && !e.target.closest('.h-actions')) { openMenuId = null; renderHabits(); }
  });

  // ---------- Add / edit form ----------
  const form = $('#habit-form');
  const nameIn = $('#h-name');
  $('#emoji-pick').innerHTML = EMOJIS.map((em, i) =>
    `<label><input type="radio" name="emoji" value="${em}" ${i === 0 ? 'checked' : ''} aria-label="${em}"><span class="emoji" aria-hidden="true">${em}</span></label>`
  ).join('');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'ttype') $('#times-wrap').hidden = e.target.value !== 'weekly';
  });
  function openForm(h) {
    editingId = h ? h.id : null;
    form.hidden = false;
    $('#add-open').hidden = true;
    $('#add-open').setAttribute('aria-expanded', 'true');
    $('#form-title').textContent = h ? `Edit ${h.name}` : 'New habit';
    $('#form-submit').textContent = h ? 'Save changes' : 'Add habit';
    nameIn.value = h ? h.name : '';
    const em = h ? h.emoji : EMOJIS[active().length % EMOJIS.length];
    let radio = form.querySelector(`input[name="emoji"][value="${em}"]`);
    if (!radio) radio = form.querySelector('input[name="emoji"]');
    radio.checked = true;
    const weekly = h?.target.type === 'weekly';
    form.querySelector(`input[name="ttype"][value="${weekly ? 'weekly' : 'daily'}"]`).checked = true;
    $('#times-wrap').hidden = !weekly;
    $('#h-times').value = String(weekly ? h.target.times : 3);
    $('#form-error').textContent = '';
    nameIn.removeAttribute('aria-invalid');
    form.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    nameIn.focus({ preventScroll: true });
  }
  function closeForm() {
    form.hidden = true;
    $('#add-open').hidden = false;
    $('#add-open').setAttribute('aria-expanded', 'false');
    const id = editingId;
    editingId = null;
    (id && document.querySelector(`[data-focus="more-${id}"]`)) ? document.querySelector(`[data-focus="more-${id}"]`).focus() : $('#add-open').focus();
  }
  $('#add-open').addEventListener('click', () => openForm(null));
  $('#form-cancel').addEventListener('click', closeForm);
  form.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeForm(); });
  nameIn.addEventListener('input', () => { $('#form-error').textContent = ''; nameIn.removeAttribute('aria-invalid'); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameIn.value.trim().replace(/\s+/g, ' ');
    if (!name) {
      $('#form-error').textContent = 'Give the habit a name, like Read 20 pages.';
      nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); return;
    }
    const clash = active().find((h) => h.name.toLowerCase() === name.toLowerCase() && h.id !== editingId);
    if (clash) {
      $('#form-error').textContent = `You already track ${clash.name}. Pick a different name.`;
      nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); return;
    }
    const emoji = form.querySelector('input[name="emoji"]:checked').value;
    const weekly = form.querySelector('input[name="ttype"]:checked').value === 'weekly';
    const target = weekly ? { type: 'weekly', times: Number($('#h-times').value) } : { type: 'daily' };
    let focusId;
    if (editingId) {
      const h = byId(editingId);
      Object.assign(h, { name, emoji, target });
      focusId = h.id;
      showToast('Saved changes.');
    } else {
      const h = { id: uid(), name, emoji, target, done: [], startedOn: today, archived: false };
      state.habits.push(h);
      focusId = h.id;
    }
    save();
    editingId = null;
    form.hidden = true;
    $('#add-open').hidden = false;
    $('#add-open').setAttribute('aria-expanded', 'false');
    renderAll({ focus: `done-${focusId}` });
  });

  // ---------- Export / import ----------
  const ioErr = $('#io-error');
  $('#export-btn').addEventListener('click', () => {
    save();
    ioErr.textContent = '';
    if (!state.habits.length) { ioErr.textContent = 'There is nothing to export yet. Add a habit first.'; return; }
    const data = { app: 'streaks', version: 1, exportedAt: new Date().toISOString(), habits: state.habits };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `streaks-backup-${today}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('Backup downloaded.');
  });
  $('#import-btn').addEventListener('click', () => { ioErr.textContent = ''; $('#import-file').click(); });
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch (err) {
      ioErr.textContent = `${file.name} isn't valid JSON. Choose a backup file exported from Streaks.`; return;
    }
    const r = S.normaliseImport(data);
    if (r.error) { ioErr.textContent = r.error; return; }
    const before = state.habits; const beforeSets = sets;
    save();
    replaceHabits(r.habits);
    selectedDay = null;
    save(); renderAll();
    showToast(`Imported ${r.habits.length} habit${r.habits.length === 1 ? '' : 's'}.`, {
      label: 'Undo', run: () => { state.habits = before; sets = beforeSets; save(); renderAll(); },
    });
  });

  // ---------- Example ----------
  function exampleHabits() {
    let seed = 20261030;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const days = 120;
    const start = S.addDays(today, -(days - 1));
    const mk = (name, emoji, target, startOffset, pick) => {
      const done = [];
      for (let i = startOffset; i < days; i++) {
        const k = S.addDays(start, i);
        if (pick(k, days - 1 - i)) done.push(k);
      }
      return { id: uid(), name, emoji, target, done, startedOn: S.addDays(start, startOffset), archived: false };
    };
    // ago = days before today (0 = today)
    const water = mk('Drink 2 litres of water', '💧', { type: 'daily' }, 0, (k, ago) =>
      ago <= 26 ? true : ago === 27 ? false : rnd() < 0.86);
    const read = mk('Read 20 pages', '📚', { type: 'daily' }, 0, (k, ago) => {
      if (ago <= 8) return true;
      if (ago === 9) return false;
      const wd = S.weekday(k);
      return rnd() < (wd >= 5 ? 0.55 : 0.82);
    });
    const thisWeekStart = S.weekStart(today);
    const run = mk('Go for a run', '🏃', { type: 'weekly', times: 3 }, 0, (k, ago) => {
      const wd = S.weekday(k);
      const wk = S.diffDays(k, thisWeekStart) / 7; // weeks before this one, fractional
      if (k >= thisWeekStart) return ago > 0 && (wd === 0 || wd === 2);
      if (wk > 9 && wk <= 10) return wd === 1; // a missed week, breaks the older streak
      return [0, 2, 5].includes(wd) ? rnd() < 0.93 : rnd() < 0.08;
    });
    const meditate = mk('Meditate for 10 minutes', '🧘', { type: 'daily' }, 52, (k, ago) => {
      if (ago === 0) return false;
      if (ago <= 4) return true;
      if (ago === 5) return false;
      return rnd() < 0.64;
    });
    // Guarantee every past full week of running hit 3, apart from the deliberate missed one
    const runSet = new Set(run.done);
    for (let w = S.addDays(thisWeekStart, -7); w >= start; w = S.addDays(w, -7)) {
      const wk = S.diffDays(w, thisWeekStart) / 7;
      if (wk === 10) continue;
      let count = 0;
      for (let d = 0; d < 7; d++) if (runSet.has(S.addDays(w, d))) count++;
      for (const d of [6, 3, 1]) { if (count >= 3) break; const k = S.addDays(w, d); if (k >= start && !runSet.has(k)) { runSet.add(k); count++; } }
    }
    run.done = [...runSet].sort();
    return [water, read, run, meditate];
  }
  $('#example-btn').addEventListener('click', () => {
    const before = state.habits; const beforeSets = sets;
    replaceHabits(exampleHabits());
    selectedDay = null; openMenuId = null;
    save(); renderAll();
    scrollHeatToEnd();
    showToast('Loaded 4 example habits.', before.length ? {
      label: 'Undo', run: () => { state.habits = before; sets = beforeSets; save(); renderAll(); },
    } : undefined);
  });

  // ---------- Render ----------
  function renderAll(opts = {}) {
    const focusAttr = opts.focus || document.activeElement?.dataset?.focus;
    updateYear();
    renderHabits();
    if (selectedDay) renderDayPanel();
    if (focusAttr) document.querySelector(`[data-focus="${focusAttr}"]`)?.focus({ preventScroll: true });
  }
  function scrollHeatToEnd() {
    const sc = $('#heat-scroll');
    sc.scrollLeft = sc.scrollWidth;
  }

  // Roll over to a new day if the app is left open past midnight
  function checkDate() {
    const now = S.todayKey();
    if (now === today) return;
    today = now;
    if (selectedDay && selectedDay > today) selectedDay = null;
    buildYear();
    renderAll();
    scrollHeatToEnd();
  }
  setInterval(checkDate, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDate(); });
  window.addEventListener('focus', checkDate);

  buildYear();
  renderAll();
  scrollHeatToEnd();
  window.addEventListener('resize', () => { hideTip(); });
})();
