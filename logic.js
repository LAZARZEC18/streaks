// Streaks: pure date, streak and insight logic. No DOM access here.
// Days are stored as local calendar keys "YYYY-MM-DD". "Today" comes from the
// user's local clock (getFullYear/getMonth/getDate), never from toISOString(),
// which is UTC and would be a day off for much of the day in Perth.
// Arithmetic on keys is done on the calendar itself via Date.UTC, so daylight
// saving changes can never add or lose a day.
(function (global) {
  'use strict';

  const DAY_MS = 86400000;
  const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
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
  const monthStart = (k) => k.slice(0, 8) + '01';
  /** Add n months to a "YYYY-MM-01" style key, returns the first of that month. */
  function addMonths(k, n) {
    const y = +k.slice(0, 4); const m = +k.slice(5, 7) - 1 + n;
    const d = new Date(Date.UTC(y, m, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
  }
  const daysInMonth = (k) => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).getUTCDate();
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const fmtCache = {};
  /** Format a key for people. style: 'long' | 'medium' | 'short' | 'month' | 'monthYear' | 'weekdayShort' */
  function formatKey(k, style = 'long') {
    if (!fmtCache[style]) {
      const opts = {
        long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
        medium: { weekday: 'long', day: 'numeric', month: 'long' },
        short: { day: 'numeric', month: 'short' },
        dayShort: { weekday: 'short', day: 'numeric', month: 'short' },
        month: { month: 'short' },
        monthYear: { month: 'long', year: 'numeric' },
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

  // ---------- Habit model ----------
  // v2 habit: { id, name, icon, color, type: 'check'|'count'|'weekly', goal, unit,
  //             reminder: 'HH:MM'|null, log: { key: value }, notes: { key: text },
  //             createdOn: key, archived }
  // check:  log[k] = 1 when done.
  // count:  log[k] = amount; the day is done when amount >= goal (e.g. 8 glasses).
  // weekly: log[k] = 1 when done; the week is hit when goal days are done.
  // Legacy v1 shape ({ done: [...], target: { type, times }, startedOn }) is still understood.
  const TYPES = ['check', 'count', 'weekly'];

  function shape(h) {
    let type = h.type;
    if (!TYPES.includes(type)) type = h.target && h.target.type === 'weekly' ? 'weekly' : 'check';
    let goal = 1;
    if (type === 'weekly') goal = Math.round(Number(h.goal != null ? h.goal : h.target && h.target.times)) || 3;
    if (type === 'count') goal = Math.max(1, Math.round(Number(h.goal)) || 1);
    return { type, goal };
  }
  /** Amount logged on a day (1 for a ticked yes/no day). */
  function valueOn(h, k) {
    if (h.log) return Number(h.log[k]) || 0;
    return toSet(h.done).has(k) ? 1 : 0;
  }
  /** Is the day itself complete? Count habits need the full daily goal. */
  function isDone(h, k) {
    const { type, goal } = shape(h);
    return valueOn(h, k) >= (type === 'count' ? goal : 1);
  }
  /** Sorted keys of complete days. */
  function doneKeys(h) {
    if (!h.log) return [...toSet(h.done)].sort();
    const { type, goal } = shape(h);
    const need = type === 'count' ? goal : 1;
    return Object.keys(h.log).filter((k) => (Number(h.log[k]) || 0) >= need).sort();
  }
  /** 0..1 progress for a day (partial for count habits). */
  function progressOn(h, k) {
    const { type, goal } = shape(h);
    const v = valueOn(h, k);
    if (type === 'count') return Math.min(1, v / goal);
    return v > 0 ? 1 : 0;
  }
  /** The first day this habit counts from. */
  function startOf(h, today) {
    let first = isKey(h.createdOn) ? h.createdOn : isKey(h.startedOn) ? h.startedOn : today;
    const keys = h.log ? Object.keys(h.log).filter((k) => Number(h.log[k]) > 0) : [...toSet(h.done)];
    for (const k of keys) if (k < first) first = k;
    return first;
  }

  function streaks(habit, today) {
    const { type, goal } = shape(habit);
    const keys = doneKeys(habit);
    return type === 'weekly' ? weeklyStreaks(keys, goal, today) : dailyStreaks(keys, today);
  }

  /** Completion between two keys (inclusive), clipped to the habit's start and today.
   *  Daily: done days / counted days. Weekly: done days / (times per week x weeks), capped at 100.
   *  Today only counts once it is done (unless it is the only day in the window).
   *  Returns { done, days, pct } or null when the window has no counted days. */
  function rateBetween(h, from, to, today) {
    const { type, goal } = shape(h);
    const start = startOf(h, today);
    if (from < start) from = start;
    if (to > today) to = today;
    if (from > to) return null;
    let done = 0;
    for (let k = from; k <= to; k = addDays(k, 1)) if (isDone(h, k)) done++;
    let days = diffDays(from, to) + 1;
    if (to === today && !isDone(h, today) && days > 1) days--;
    let pct;
    if (type === 'weekly') pct = Math.min(100, Math.round((done / ((goal * days) / 7)) * 100));
    else pct = Math.round((done / days) * 100);
    return { done, days, pct };
  }
  function completionRate(h, today, windowDays) {
    const r = rateBetween(h, addDays(today, -(windowDays - 1)), today, today);
    return r ? r.pct : 0;
  }
  const completion30 = (h, today) => completionRate(h, today, 30);

  /** Total complete days (check-ins) up to today. */
  function totalCheckins(h, today) {
    return doneKeys(h).filter((k) => k <= today).length;
  }
  /** Last complete day on or before today, or null. */
  function lastDone(h, today) {
    const keys = doneKeys(h).filter((k) => k <= today);
    return keys.length ? keys[keys.length - 1] : null;
  }

  /** Weekly habit state for the week containing today. */
  function weekInfo(h, today) {
    const { goal } = shape(h);
    const ws = weekStart(today);
    let count = 0;
    for (let k = ws; k <= today; k = addDays(k, 1)) if (isDone(h, k)) count++;
    const doneToday = isDone(h, today);
    const before = count - (doneToday ? 1 : 0);
    const needed = Math.max(0, goal - before);
    const daysLeft = 7 - weekday(today); // including today
    let status;
    if (doneToday) status = 'done';
    else if (needed === 0) status = 'met';
    else if (needed >= daysLeft) status = 'due';
    else status = 'optional';
    return { count, goal, doneToday, needed, daysLeft, status };
  }

  /** How a habit counts towards today's ring.
   *  Weekly habits only count when done today or when every remaining day is needed. */
  function todayStatus(h, today) {
    const { type, goal } = shape(h);
    if (type === 'weekly') {
      const w = weekInfo(h, today);
      const included = w.status === 'done' || w.status === 'due';
      return { included, progress: w.doneToday ? 1 : 0, complete: w.doneToday || w.status === 'met', week: w };
    }
    const v = valueOn(h, today);
    return { included: true, progress: type === 'count' ? Math.min(1, v / goal) : (v > 0 ? 1 : 0), complete: isDone(h, today), value: v };
  }

  /** Today's ring: { total, done, pct (0..1), allDone }. */
  function todaySummary(habits, today) {
    let total = 0; let done = 0; let sum = 0;
    for (const h of habits) {
      if (h.archived) continue;
      const s = todayStatus(h, today);
      if (!s.included) continue;
      total++; sum += s.progress; if (s.complete) done++;
    }
    return { total, done, pct: total ? sum / total : 0, allDone: total > 0 && done === total };
  }

  /** Count of habits done on each day key (legacy helper). */
  function dayCounts(habits) {
    const counts = new Map();
    for (const h of habits) for (const k of doneKeys(h)) counts.set(k, (counts.get(k) || 0) + 1);
    return counts;
  }

  /** Intensity level 0..4 for a day where `count` of `total` habits were done. */
  function level(count, total) {
    if (!count || !total) return 0;
    return Math.max(1, Math.min(4, Math.ceil((count / total) * 4)));
  }

  /** Heatmap value for one day: average progress of habits that existed that day.
   *  Returns { level, done, total, sum }. */
  function dayLevel(habits, k, today) {
    let total = 0; let sum = 0; let done = 0;
    for (const h of habits) {
      if (h.archived || startOf(h, today) > k) continue;
      total++;
      const p = progressOn(h, k);
      sum += p; if (isDone(h, k)) done++;
    }
    return { level: sum > 0 ? level(sum, total) : 0, done, total, sum };
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

  // ---------- Charts and insights ----------
  /** Completion by weekday over the last `days` days. [{ done, total, pct|null }] x 7, Mon first. */
  function weekdayRates(h, today, days = 365) {
    const out = Array.from({ length: 7 }, () => ({ done: 0, total: 0, pct: null }));
    let from = addDays(today, -(days - 1));
    const start = startOf(h, today);
    if (from < start) from = start;
    for (let k = from; k <= today; k = addDays(k, 1)) {
      const d = isDone(h, k);
      if (k === today && !d) continue;
      const w = out[weekday(k)];
      w.total++; if (d) w.done++;
    }
    for (const w of out) w.pct = w.total ? Math.round((w.done / w.total) * 100) : null;
    return out;
  }

  /** Completion for each of the last n calendar months, oldest first.
   *  [{ key: 'YYYY-MM-01', label: 'Oct', pct|null }] */
  function monthlyRates(h, today, n = 12) {
    const out = [];
    const thisMonth = monthStart(today);
    for (let i = n - 1; i >= 0; i--) {
      const m = addMonths(thisMonth, -i);
      const end = addDays(addMonths(m, 1), -1);
      const r = rateBetween(h, m, end, today);
      out.push({ key: m, label: MONTHS[monthOf(m)], pct: r ? r.pct : null });
    }
    return out;
  }

  /** Days since the habit was last completed (0 = done today). Never done counts from the day before it started. */
  function gapDays(h, today) {
    const last = lastDone(h, today);
    return diffDays(last || addDays(startOf(h, today), -1), today);
  }

  /** Insights across active habits, from real data.
   *  { consistency, bestWeekday: { weekday, name, pct, rates }, atRisk, strongest } */
  function insights(habits, today) {
    const act = habits.filter((h) => !h.archived);
    const res = { consistency: null, bestWeekday: null, atRisk: null, strongest: null, count: act.length };
    if (!act.length) return res;

    // Consistency score: average 30-day completion
    res.consistency = Math.round(act.reduce((s, h) => s + completionRate(h, today, 30), 0) / act.length);

    // Best weekday over the last 90 days, pooled across habits
    const agg = Array.from({ length: 7 }, () => ({ done: 0, total: 0 }));
    for (const h of act) {
      weekdayRates(h, today, 90).forEach((w, i) => { agg[i].done += w.done; agg[i].total += w.total; });
    }
    const rates = agg.map((w) => (w.total ? Math.round((w.done / w.total) * 100) : null));
    const observed = agg.reduce((s, w) => s + w.total, 0);
    if (observed >= 7) {
      let best = -1;
      rates.forEach((r, i) => { if (r != null && (best < 0 || r > rates[best])) best = i; });
      if (best >= 0) res.bestWeekday = { weekday: best, name: WEEKDAYS[best], pct: rates[best], rates };
    }

    // Most at risk: the daily habit left longest (2+ days), then a weekly habit that needs every day left
    let risk = null;
    for (const h of act) {
      const { type } = shape(h);
      if (type === 'weekly') continue;
      const gap = gapDays(h, today);
      if (gap < 2) continue;
      const longest = streaks(h, today).longest;
      if (!risk || gap > risk.gap || (gap === risk.gap && longest > risk.longest)) {
        risk = { id: h.id, name: h.name, kind: 'gap', gap, longest, text: `Not done for ${gap} days` };
      }
    }
    if (!risk) {
      for (const h of act) {
        if (shape(h).type !== 'weekly') continue;
        const w = weekInfo(h, today);
        if (w.status !== 'due') continue;
        const tight = w.needed - w.daysLeft;
        if (!risk || tight > risk.tight) {
          risk = {
            id: h.id, name: h.name, kind: 'weekly', tight, needed: w.needed, daysLeft: w.daysLeft,
            text: w.needed > w.daysLeft
              ? `Needs ${w.needed} more this week, only ${w.daysLeft} ${w.daysLeft === 1 ? 'day' : 'days'} left`
              : `Needs ${w.needed} more this week, with ${w.daysLeft} ${w.daysLeft === 1 ? 'day' : 'days'} left`,
          };
        }
      }
    }
    res.atRisk = risk;

    // Strongest running streak (days for daily habits, weeks for weekly)
    let strong = null;
    for (const h of act) {
      const st = streaks(h, today);
      const score = st.unit === 'week' ? st.current * 7 : st.current;
      if (st.current > 0 && (!strong || score > strong.score)) strong = { id: h.id, name: h.name, current: st.current, unit: st.unit, score };
    }
    res.strongest = strong;
    return res;
  }

  /** Month calendar cells: leading blanks so the 1st lands on its weekday (Mon first). */
  function monthGrid(firstKey) {
    const m = monthStart(firstKey);
    const lead = weekday(m);
    const n = daysInMonth(m);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 0; d < n; d++) cells.push(addDays(m, d));
    return cells;
  }

  // ---------- Import / export ----------
  const ICONS = ['check', 'book', 'droplet', 'dumbbell', 'activity', 'bike', 'mountain', 'moon', 'sun', 'bed', 'leaf', 'apple',
    'coffee', 'pill', 'heart', 'smile', 'bulb', 'pen', 'code', 'music', 'globe', 'dollar', 'phone', 'home'];
  const COLORS = ['amber', 'coral', 'green', 'blue', 'indigo', 'pink'];
  const uid = () => Math.random().toString(36).slice(2, 10);

  /** Validate and normalise imported data. Returns { habits } or { error }. */
  function normaliseImport(data) {
    const list = Array.isArray(data) ? data : data && data.habits;
    if (!Array.isArray(list)) return { error: 'That file is not a Streaks backup. Export one from Streaks first, then import it here.' };
    if (!list.length) return { error: 'That backup has no habits in it, so there was nothing to import.' };
    if (list.length > 200) return { error: 'That backup has more than 200 habits, which Streaks does not support.' };
    const habits = [];
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (!h || typeof h !== 'object' || typeof h.name !== 'string' || !h.name.trim()) {
        return { error: `Habit ${i + 1} in the file has no name, so nothing was imported. Export a fresh backup and try again.` };
      }
      let type = TYPES.includes(h.type) ? h.type : (h.target && h.target.type === 'weekly' ? 'weekly' : 'check');
      let goal = 1;
      if (type === 'weekly') {
        goal = Math.round(Number(h.goal != null ? h.goal : h.target && h.target.times));
        if (!(goal >= 1 && goal <= 7)) { type = 'check'; goal = 1; }
      } else if (type === 'count') {
        goal = Math.round(Number(h.goal));
        if (!(goal >= 1)) goal = 1;
        if (goal > 999) goal = 999;
      }
      const log = {};
      if (h.log && typeof h.log === 'object' && !Array.isArray(h.log)) {
        for (const [k, v] of Object.entries(h.log)) {
          const n = Math.round(Number(v));
          if (isKey(k) && n > 0) log[k] = type === 'count' ? Math.min(n, 9999) : 1;
        }
      } else if (Array.isArray(h.done)) {
        for (const k of h.done) if (isKey(k)) log[k] = 1;
      }
      const notes = {};
      if (h.notes && typeof h.notes === 'object' && !Array.isArray(h.notes)) {
        for (const [k, v] of Object.entries(h.notes)) {
          if (isKey(k) && typeof v === 'string' && v.trim()) notes[k] = v.trim().slice(0, 500);
        }
      }
      const keys = Object.keys(log).sort();
      habits.push({
        id: typeof h.id === 'string' && h.id ? h.id.slice(0, 40) : uid(),
        name: h.name.trim().slice(0, 40),
        icon: ICONS.includes(h.icon) ? h.icon : 'check',
        color: COLORS.includes(h.color) ? h.color : 'amber',
        type, goal,
        unit: type === 'count' && typeof h.unit === 'string' ? h.unit.trim().slice(0, 16) : '',
        reminder: typeof h.reminder === 'string' && TIME_RE.test(h.reminder) ? h.reminder : null,
        log, notes,
        createdOn: isKey(h.createdOn) ? h.createdOn : isKey(h.startedOn) ? h.startedOn : (keys[0] || null),
        archived: !!h.archived,
      });
    }
    const seen = new Set();
    for (const h of habits) { while (seen.has(h.id)) h.id += 'x'; seen.add(h.id); }
    return { habits };
  }

  function exportData(habits, today) {
    return { app: 'streaks', version: 2, exportedOn: today, habits };
  }

  // ---------- Example data ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Five habits with about 200 days of plausible history, relative to `today`.
   *  Today: Read and Morning walk done, water at 5 of 8, Meditate not done for 3 days,
   *  Gym on track with 2 sessions in the last week. */
  function example(today) {
    const r = rng(20261030);
    const days = 200;
    const start = addDays(today, -(days - 1));
    const mk = (id, name, icon, color, type, goal, unit, reminder, createdOn) =>
      ({ id, name, icon, color, type, goal, unit, reminder, log: {}, notes: {}, createdOn, archived: false });
    const read = mk('ex-read', 'Read 20 pages', 'book', 'indigo', 'check', 1, '', '21:00', start);
    const water = mk('ex-water', 'Drink water', 'droplet', 'blue', 'count', 8, 'glasses', null, start);
    const gym = mk('ex-gym', 'Gym', 'dumbbell', 'coral', 'weekly', 3, '', '17:30', start);
    const med = mk('ex-med', 'Meditate 10 min', 'leaf', 'green', 'check', 1, '', '07:00', addDays(start, 20));
    const walk = mk('ex-walk', 'Morning walk', 'sun', 'amber', 'check', 1, '', null, addDays(start, 60));

    for (let i = 0; i < days; i++) {
      const k = addDays(start, i);
      const wd = weekday(k);
      const age = i / days; // habits get easier over time
      const weekend = wd >= 5;
      if (r() < 0.66 + age * 0.22 - (wd === 4 ? 0.12 : 0)) read.log[k] = 1;
      let glasses = Math.round(6.4 + age * 1.8 + (r() - 0.45) * 4 - (weekend ? 0.8 : 0));
      if (glasses > 0) water.log[k] = Math.min(11, glasses);
      if ([0, 2, 4].includes(wd) ? r() < 0.82 : r() < (wd === 5 ? 0.25 : 0.06)) gym.log[k] = 1;
      if (k >= med.createdOn && !(i > 100 && i < 110) && r() < 0.62 + age * 0.2 - (weekend ? 0.15 : 0)) med.log[k] = 1;
      if (k >= walk.createdOn && r() < (weekend ? 0.6 : 0.84)) walk.log[k] = 1;
    }
    // A clean recent run for Read and Walk, ending today
    for (let i = 0; i < 18; i++) read.log[addDays(today, -i)] = 1;
    for (let i = 0; i < 9; i++) walk.log[addDays(today, -i)] = 1;
    walk.log[addDays(today, -9)] = undefined;
    // Water: last 6 days hit the goal, today in progress
    for (let i = 1; i <= 6; i++) water.log[addDays(today, -i)] = 8 + (i % 3 === 0 ? 1 : 0);
    water.log[today] = 5;
    // Meditate slipped: last done 3 days ago, after a 5-day run
    for (let i = 0; i < 3; i++) delete med.log[addDays(today, -i)];
    for (let i = 3; i < 8; i++) med.log[addDays(today, -i)] = 1;
    // Gym: every full week of the last 6 hits 3 sessions; this week so far depends on the weekday
    const ws = weekStart(today);
    for (let w = 1; w <= 6; w++) {
      const mon = addDays(ws, -7 * w);
      for (let d = 0; d < 7; d++) delete gym.log[addDays(mon, d)];
      for (const d of (w % 2 ? [0, 2, 4] : [0, 3, 5])) gym.log[addDays(mon, d)] = 1;
    }
    for (let d = 0; d < 7; d++) delete gym.log[addDays(ws, d)];
    for (const d of [0, 2]) if (addDays(ws, d) < today) gym.log[addDays(ws, d)] = 1;

    for (const h of [read, water, gym, med, walk]) {
      for (const k of Object.keys(h.log)) if (!h.log[k] || k > today) delete h.log[k];
    }
    const note = (h, n, text) => { const k = addDays(today, -n); if (k >= h.createdOn) h.notes[k] = text; };
    note(read, 41, 'Finished Project Hail Mary. Starting Dune next.');
    note(read, 3, 'Read on the train, 30 pages.');
    note(gym, 18, 'New bench PR, 80 kg for 5.');
    note(gym, 60, 'Deload week, kept it light.');
    note(med, 62, 'Tried the body-scan session. Much calmer afterwards.');
    note(med, 103, 'Away for the long weekend, skipped a few days.');
    note(water, 9, 'Hot day, 34 degrees. Easy to hit it.');
    note(walk, 25, 'Kings Park loop before work.');
    return [read, water, gym, med, walk];
  }

  global.StreakLogic = {
    DAY_MS, MONTHS, WEEKDAYS, TYPES, ICONS, COLORS, TIME_RE,
    keyOf, todayKey, isKey, addDays, diffDays, weekday, weekStart, monthStart, addMonths, daysInMonth, formatKey,
    dailyStreaks, weeklyStreaks, weekCounts, streaks, completion30, completionRate, rateBetween,
    shape, valueOn, isDone, doneKeys, progressOn, startOf, totalCheckins, lastDone, gapDays,
    weekInfo, todayStatus, todaySummary, dayCounts, level, dayLevel, gridRange,
    weekdayRates, monthlyRates, insights, monthGrid, normaliseImport, exportData, example,
  };
})(typeof window !== 'undefined' ? window : globalThis);
