// Forex sessions in their own time zones.
//
// Each session is a span of local hours in its city's IANA zone, so daylight
// saving is handled by Intl (the runtime's time zone database), never by a
// table of offsets. London moves from 08:00 UTC to 07:00 UTC at the end of
// March, New York from 13:00 UTC to 12:00 UTC in the middle of March, Sydney
// the other way round in October, Tokyo never.
//
// The market week runs from Sunday 17:00 to Friday 17:00 New York time. A
// session is only open inside that week: Sydney's Monday morning starts before
// New York's Sunday 17:00 in the northern winter, so it opens with the market.
//
// Times are milliseconds since the epoch or Date objects going in; Date
// objects coming out.

export const SESSIONS = [
  { id: 'sydney', name: 'Sydney', zone: 'Australia/Sydney', open: '07:00', close: '16:00', currencies: ['AUD', 'NZD'] },
  { id: 'tokyo', name: 'Tokyo', zone: 'Asia/Tokyo', open: '09:00', close: '18:00', currencies: ['JPY'] },
  { id: 'london', name: 'London', zone: 'Europe/London', open: '08:00', close: '17:00', currencies: ['GBP', 'EUR', 'CHF'] },
  { id: 'newyork', name: 'New York', zone: 'America/New_York', open: '08:00', close: '17:00', currencies: ['USD', 'CAD'] },
];

export const MARKET_WEEK = { zone: 'America/New_York', open: { day: 0, time: '17:00' }, close: { day: 5, time: '17:00' } };

const DAY = 864e5;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmts = {};

function ms(t) {
  return t === undefined ? Date.now() : +t;
}

function hm(s) {
  const [h, m] = s.split(':').map(Number);
  return { h, m };
}

/** The wall clock in a zone at an instant: { y, m (1-12), d, h, mi, s, wd (0 = Sunday) }. */
export function wallClock(t, zone) {
  let f = fmts[zone];
  if (!f) {
    f = fmts[zone] = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
  const o = {};
  for (const p of f.formatToParts(new Date(ms(t)))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: WD.indexOf(o.weekday) };
}

/** Minutes the zone is ahead of UTC at an instant (London in July: 60). */
export function offsetMinutes(t, zone) {
  const at = Math.floor(ms(t) / 1000) * 1000;
  const w = wallClock(at, zone);
  return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - at) / 6e4);
}

/** The instant (ms) a wall-clock time happens in a zone. */
export function zonedToUtc(y, m, d, h, mi, zone) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetMinutes(guess, zone) * 6e4;
  t = guess - offsetMinutes(t, zone) * 6e4;
  return t;
}

// local calendar dates in a zone covering [from, to], a day either side
function localDates(from, to, zone) {
  const a = wallClock(from - DAY, zone);
  const b = wallClock(to + DAY, zone);
  const out = [];
  for (let u = Date.UTC(a.y, a.m - 1, a.d); u <= Date.UTC(b.y, b.m - 1, b.d); u += DAY) {
    const x = new Date(u);
    out.push({ y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), wd: x.getUTCDay() });
  }
  return out;
}

/** The market weeks (Sunday 17:00 to Friday 17:00 New York) touching [from, to], as { start, end } in ms. */
export function marketWeeks(from, to) {
  const { zone, open, close } = MARKET_WEEK;
  const o = hm(open.time), c = hm(close.time);
  const out = [];
  for (const day of localDates(ms(from) - 7 * DAY, ms(to), zone)) {
    if (day.wd !== open.day) continue;
    const start = zonedToUtc(day.y, day.m, day.d, o.h, o.m, zone);
    const fri = new Date(Date.UTC(day.y, day.m - 1, day.d) + (close.day - open.day) * DAY);
    const end = zonedToUtc(fri.getUTCFullYear(), fri.getUTCMonth() + 1, fri.getUTCDate(), c.h, c.m, zone);
    if (end > ms(from) && start < ms(to)) out.push({ start, end });
  }
  return out;
}

/** Is the forex market open (inside the market week) at t? */
export function marketOpen(t) {
  const at = ms(t);
  return marketWeeks(at, at + 1).some((w) => w.start <= at && at < w.end);
}

function find(id) {
  const s = typeof id === 'string' ? SESSIONS.find((x) => x.id === id) : id;
  if (!s) throw new Error('Unknown session: ' + id);
  return s;
}

/**
 * Every time a session is open between from and to, clipped to the market week:
 * [{ id, name, start: Date, end: Date }], in order.
 */
export function sessionIntervals(id, from, to) {
  const s = find(id);
  const a = ms(from), b = ms(to);
  const o = hm(s.open), c = hm(s.close);
  const weeks = marketWeeks(a - 2 * DAY, b + 2 * DAY);
  const out = [];
  for (const day of localDates(a, b, s.zone)) {
    if (day.wd === 0 || day.wd === 6) continue;
    const start = zonedToUtc(day.y, day.m, day.d, o.h, o.m, s.zone);
    let end = zonedToUtc(day.y, day.m, day.d, c.h, c.m, s.zone);
    if (end <= start) end += DAY;
    for (const w of weeks) {
      const x = Math.max(start, w.start), y = Math.min(end, w.end);
      if (x < y && y > a && x < b) out.push({ id: s.id, name: s.name, start: new Date(x), end: new Date(y) });
    }
  }
  return out.sort((p, q) => p.start - q.start);
}

/** Every session's intervals between from and to, in order of opening. */
export function intervals(from, to, sessions = SESSIONS) {
  return sessions.flatMap((s) => sessionIntervals(s, from, to)).sort((p, q) => p.start - q.start || p.end - q.end);
}

/** The ids of the sessions open at t. */
export function openAt(t, sessions = SESSIONS) {
  const at = ms(t);
  return sessions.filter((s) => sessionIntervals(s, at, at + 1).some((i) => i.start <= at && at < i.end)).map((s) => s.id);
}

/** When a session next opens after t (a Date). If it is open now, its next opening after this one. */
export function nextOpen(id, t) {
  const at = ms(t);
  const next = sessionIntervals(id, at, at + 10 * DAY).find((i) => +i.start > at);
  return next ? next.start : null;
}

/**
 * Each session at t: { id, name, zone, currencies, open, start, end, nextOpen, local }.
 * When open, start and end are this session's; when closed, the next one's.
 * local is the wall clock in the session's city ("14:05").
 */
export function status(t, sessions = SESSIONS) {
  const at = ms(t);
  return sessions.map((s) => {
    const list = sessionIntervals(s, at - DAY, at + 10 * DAY);
    const now = list.find((i) => i.start <= at && at < i.end);
    const next = list.find((i) => +i.start > at);
    const w = wallClock(at, s.zone);
    const pick = now || next;
    return {
      id: s.id, name: s.name, zone: s.zone, currencies: s.currencies, open: !!now,
      start: pick ? pick.start : null, end: pick ? pick.end : null,
      nextOpen: next ? next.start : null,
      local: String(w.h).padStart(2, '0') + ':' + String(w.mi).padStart(2, '0'),
    };
  });
}

/**
 * The spans between from and to when two or more sessions are open at once:
 * [{ ids: ['london', 'newyork'], start: Date, end: Date }].
 */
export function overlaps(from, to, sessions = SESSIONS) {
  const edges = [];
  for (const i of intervals(from, to, sessions)) {
    edges.push([+i.start, 1, i.id], [+i.end, -1, i.id]);
  }
  edges.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const open = new Set();
  const out = [];
  let prev = null;
  for (const [t, kind, id] of edges) {
    if (prev !== null && t > prev && open.size >= 2) {
      const ids = sessions.map((s) => s.id).filter((x) => open.has(x));
      const last = out[out.length - 1];
      if (last && +last.end === prev && last.ids.join() === ids.join()) last.end = new Date(t);
      else out.push({ ids, start: new Date(prev), end: new Date(t) });
    }
    if (kind === 1) open.add(id);
    else open.delete(id);
    prev = t;
  }
  return out.filter((o) => o.end > ms(from) && o.start < ms(to));
}
