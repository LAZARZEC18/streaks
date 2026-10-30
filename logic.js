// Streaks: pure date and streak logic.
// Days are stored as local calendar keys "YYYY-MM-DD". "Today" comes from the
// user's local clock (getFullYear/getMonth/getDate), never from toISOString(),
// which is UTC and would be a day off for much of the day in Perth.
// Arithmetic on keys is done on the calendar itself via Date.UTC, so daylight
// saving changes can never add or lose a day.
(function (global) {
  'use strict';

  const DAY_MS = 86400000;
  const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const pad = (n) => String(n).padStart(2, '0');

  /** Local calendar key for a Date (defaults to now). */
  function keyOf(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const todayKey = (now = new Date()) => keyOf(now);

  function isKey(k) {
    const m = KEY_RE.exec(k || '');
    if (!m) return false;
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
  }
  function utc(k) {
    const m = KEY_RE.exec(k);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  function fromUtc(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const addDays = (k, n) => fromUtc(utc(k) + n * DAY_MS);
  const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / DAY_MS);
  /** 0 = Monday ... 6 = Sunday (weeks start on Monday, as in Australia). */
  const weekday = (k) => (new Date(utc(k)).getUTCDay() + 6) % 7;
  const weekStart = (k) => addDays(k, -weekday(k));
  const monthOf = (k) => +k.slice(5, 7) - 1;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const fmtCache = {};
  /** Format a key for people. style: 'long' | 'short' | 'weekday' | 'month' */
  function formatKey(k, style = 'long') {
    if (!fmtCache[style]) {
      const opts = {
        long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
        medium: { weekday: 'long', day: 'numeric', month: 'long' },
        short: { day: 'numeric', month: 'short' },
        month: { month: 'short' },
      }[style];
      fmtCache[style] = new Intl.DateTimeFormat('en-AU', { ...opts, timeZone: 'UTC' });
    }
    return fmtCache[style].format(new Date(utc(k)));
  }

  const toSet = (done) => (done instanceof Set ? done : new Set(done || []));

  /** Daily habit: consecutive days. Today not being done yet does NOT break
   *  a streak that ran through yesterday; it simply isn't counted yet. */
  function dailyStreaks(done, today) {
    const set = toSet(done);
    let current = 0;
    let k = set.has(today) ? today : addDays(today, -1);
    while (set.has(k)) { current++; k = addDays(k, -1); }

    const keys = [...set].filter((x) => x <= today).sort();
    let longest = 0; let run = 0; let prev = null;
    for (const x of keys) {
      run = prev && diffDays(prev, x) === 1 ? run + 1 : 1;
      if (run > longest) longest = run;
      prev = x;
    }
    return { current, longest: Math.max(longest, current), unit: 'day', aliveToday: set.has(today) };
  }

  /** Map of week-start key -> number of days done that week (up to today). */
  function weekCounts(done, today) {
    const counts = new Map();
    for (const k of toSet(done)) {
      if (k > today) continue;
      const w = weekStart(k);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    return counts;
  }

  /** "X times per week" habit: consecutive weeks (Mon to Sun) where the target was hit.
   *  The current week only counts once its target is hit, and never breaks the streak
   *  while it is still in progress. */
  function weeklyStreaks(done, times, today) {
    const counts = weekCounts(done, today);
    const thisWeek = weekStart(today);
    const hit = (w) => (counts.get(w) || 0) >= times;
    let current = 0;
    let w = hit(thisWeek) ? thisWeek : addDays(thisWeek, -7);
    while (hit(w)) { current++; w = addDays(w, -7); }

    let longest = 0; let run = 0;
    if (counts.size) {
      const first = [...counts.keys()].sort()[0];
      for (let x = first; x <= thisWeek; x = addDays(x, 7)) {
        if (hit(x)) { run++; if (run > longest) longest = run; } else if (x !== thisWeek) run = 0;
      }
    }
    return {
      current, longest: Math.max(longest, current), unit: 'week',
      thisWeek: counts.get(thisWeek) || 0, aliveToday: hit(thisWeek),
    };
  }

  function streaks(habit, today) {
    return habit.target?.type === 'weekly'
      ? weeklyStreaks(habit.done, habit.target.times, today)
      : dailyStreaks(habit.done, today);
  }

  /** Completion over the last 30 days, as a whole percent.
   *  Daily: days done / days counted. Weekly: days done / (times per week x weeks), capped at 100.
   *  Days before the habit started are not counted, and today only counts once it is done. */
  function completion30(habit, today) {
    const set = toSet(habit.done);
    let first = habit.startedOn && isKey(habit.startedOn) ? habit.startedOn : today;
    for (const k of set) if (k < first) first = k;
    const windowStart = addDays(today, -29);
    const from = first > windowStart ? first : windowStart;
    if (from > today) return 0;
    let doneCount = 0;
    for (let k = from; k <= today; k = addDays(k, 1)) if (set.has(k)) doneCount++;
    let days = diffDays(from, today) + 1;
    if (!set.has(today) && days > 1) days--;
    if (habit.target?.type === 'weekly') {
      const expected = (habit.target.times * days) / 7;
      return Math.min(100, Math.round((doneCount / expected) * 100));
    }
    return Math.round((doneCount / days) * 100);
  }

  /** Count of habits done on each day key. */
  function dayCounts(habits) {
    const counts = new Map();
    for (const h of habits) for (const k of toSet(h.done)) counts.set(k, (counts.get(k) || 0) + 1);
    return counts;
  }

  /** Intensity level 0..4 for a day where `count` of `total` habits were done. */
  function level(count, total) {
    if (!count || !total) return 0;
    return Math.max(1, Math.min(4, Math.ceil((count / total) * 4)));
  }

  /** Columns of a heatmap ending on the week that contains today.
   *  Returns { start, weeks, months: [{col, label}] } where start is a Monday. */
  function gridRange(today, weeks) {
    const start = addDays(weekStart(today), -(weeks - 1) * 7);
    const months = [];
    let lastMonth = -1;
    for (let c = 0; c < weeks; c++) {
      const colStart = addDays(start, c * 7);
      const m = monthOf(colStart);
      if (m !== lastMonth) {
        months.push({ col: c, key: colStart, label: MONTHS[m] });
        lastMonth = m;
      }
    }
    // Drop a first label that would collide with the next one
    if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();
    return { start, weeks, months };
  }

  /** Validate and normalise imported data. Returns { habits } or { error }. */
  function normaliseImport(data) {
    const list = Array.isArray(data) ? data : data?.habits;
    if (!Array.isArray(list)) return { error: 'That file is not a Streaks backup. Export one from Streaks first, then import it here.' };
    const habits = [];
    for (const h of list) {
      if (!h || typeof h.name !== 'string' || !h.name.trim()) return { error: 'One of the habits in the file has no name, so nothing was imported.' };
      const times = Math.round(Number(h.target?.times));
      const target = h.target?.type === 'weekly' && times >= 1 && times <= 7 ? { type: 'weekly', times } : { type: 'daily' };
      const done = [...new Set((Array.isArray(h.done) ? h.done : []).filter(isKey))].sort();
      habits.push({
        id: typeof h.id === 'string' && h.id ? h.id : Math.random().toString(36).slice(2, 10),
        name: h.name.trim().slice(0, 40),
        emoji: typeof h.emoji === 'string' && h.emoji.length <= 8 ? h.emoji : '✅',
        target,
        done,
        startedOn: isKey(h.startedOn) ? h.startedOn : done[0],
        archived: !!h.archived,
      });
    }
    const seen = new Set();
    for (const h of habits) { while (seen.has(h.id)) h.id += 'x'; seen.add(h.id); }
    return { habits };
  }

  global.StreakLogic = {
    keyOf, todayKey, isKey, addDays, diffDays, weekday, weekStart, formatKey,
    dailyStreaks, weeklyStreaks, weekCounts, streaks, completion30, dayCounts, level, gridRange, normaliseImport,
  };
})(typeof window !== 'undefined' ? window : globalThis);
