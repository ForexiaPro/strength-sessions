// Currency strength from pair closes: the standard method.
//
// 1. For each pair BASE/QUOTE, the percent change of its close over the
//    lookback: (close now / close then - 1) x 100.
// 2. The change counts for the base and against the quote: EUR/USD up 0.30%
//    adds +0.30 to EUR and -0.30 to USD.
// 3. Each currency's score is the average over the pairs it is in. With all
//    28 crosses of the eight majors, each currency is in 7.
// 4. The scores are rescaled to 0-10 across the currencies: the strongest is
//    10, the weakest 0, the rest in proportion between. When every score is
//    the same, every currency is 5.
//
// The 0-10 figure ranks the currencies against each other in one window; it
// is not comparable between windows or days. The average change (step 3) is
// kept beside it, in percent, for that.

export const MAJORS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];

/** The 28 crosses of the majors, in market convention (the base first). */
export const PAIRS = [
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCHF', 'USDCAD',
  'EURGBP', 'EURJPY', 'EURCHF', 'EURCAD', 'EURAUD', 'EURNZD',
  'GBPJPY', 'GBPCHF', 'GBPCAD', 'GBPAUD', 'GBPNZD',
  'AUDJPY', 'AUDCHF', 'AUDCAD', 'AUDNZD',
  'NZDJPY', 'NZDCHF', 'NZDCAD',
  'CADJPY', 'CADCHF', 'CHFJPY',
];

/**
 * The two currencies of a symbol, whatever the broker adds: 'EUR/USD',
 * 'EURUSD.m', 'frxEURUSD', 'eurusd' -> ['EUR', 'USD']. Null if none is found.
 */
export function splitPair(symbol, currencies = MAJORS) {
  const s = String(symbol).toUpperCase().replace(/[^A-Z]/g, '');
  for (let i = 0; i + 6 <= s.length; i++) {
    const a = s.slice(i, i + 3), b = s.slice(i + 3, i + 6);
    if (a !== b && currencies.includes(a) && currencies.includes(b)) return [a, b];
  }
  return null;
}

/** Percent change from one close to another. */
export function pctChange(from, to) {
  return (to / from - 1) * 100;
}

function round(x, n) {
  const k = 10 ** n;
  return Math.round(x * k) / k;
}

/**
 * Strength from each pair's percent change: { EURUSD: 0.3, USDJPY: -0.1, ... }.
 * Returns { currencies: { USD: { strength, change, pairs }, ... }, rank: [...] },
 * strength 0-10 (one decimal), change the average percent change (four
 * decimals), pairs the number of pairs it was averaged over. A currency with no
 * pair is left out.
 */
export function strength(changes, { currencies = MAJORS } = {}) {
  const sum = {}, n = {};
  for (const [sym, p] of Object.entries(changes)) {
    const pair = splitPair(sym, currencies);
    if (!pair || !Number.isFinite(p)) continue;
    const [b, q] = pair;
    sum[b] = (sum[b] || 0) + p; n[b] = (n[b] || 0) + 1;
    sum[q] = (sum[q] || 0) - p; n[q] = (n[q] || 0) + 1;
  }
  const have = currencies.filter((c) => n[c]);
  const avg = Object.fromEntries(have.map((c) => [c, sum[c] / n[c]]));
  const vals = have.map((c) => avg[c]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const out = {};
  for (const c of have) {
    const s = hi - lo < 1e-12 ? 5 : ((avg[c] - lo) / (hi - lo)) * 10;
    out[c] = { strength: round(s, 1), change: round(avg[c], 4), pairs: n[c] };
  }
  const rank = [...have].sort((a, b) => avg[b] - avg[a]);
  return { currencies: out, rank };
}

function toMs(t) {
  if (typeof t === 'number') return t < 1e11 ? t * 1000 : t; // seconds or ms
  if (t instanceof Date) return +t;
  const s = String(t).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return toMs(Number(s));
  // a time with no zone is read as UTC
  const iso = s.replace(' ', 'T');
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
}

/**
 * One pair's candles in any of the usual shapes, as [{ t (ms), c }] sorted by
 * time: [t, o, h, l, c] arrays, or objects with t|time|timestamp|date and
 * c|close.
 */
export function normaliseSeries(candles) {
  const out = [];
  for (const k of candles || []) {
    let t, c;
    if (Array.isArray(k)) { t = k[0]; c = k.length >= 5 ? k[4] : k[1]; }
    else { t = k.t ?? k.time ?? k.timestamp ?? k.date ?? k.datetime; c = k.c ?? k.close; }
    const tm = toMs(t), cl = Number(c);
    if (Number.isFinite(tm) && Number.isFinite(cl) && cl > 0) out.push({ t: tm, c: cl });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The last close at or before t, or null. Series sorted by time. */
export function closeAt(series, t) {
  let lo = 0, hi = series.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) { best = series[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

/**
 * Strength over a lookback of `hours` from candles: { EURUSD: candles, ... }.
 * `at` defaults to the earliest of the pairs' last candles, so every pair is
 * measured to the same moment. A pair whose history does not reach back to
 * the start of the window is left out. Returns strength()'s result with
 * { at, from, hours } (ISO times).
 */
export function strengthFromCandles(byPair, { hours = 24, at, currencies = MAJORS } = {}) {
  const series = {};
  for (const [sym, c] of Object.entries(byPair)) {
    if (!splitPair(sym, currencies)) continue;
    const s = normaliseSeries(c);
    if (s.length) series[sym] = s;
  }
  const syms = Object.keys(series);
  if (!syms.length) throw new Error('No candles for any pair of ' + currencies.join(', '));
  const end = at !== undefined ? toMs(at) : Math.min(...syms.map((s) => series[s][series[s].length - 1].t));
  const start = end - hours * 36e5;
  const changes = {};
  for (const s of syms) {
    const a = closeAt(series[s], start), b = closeAt(series[s], end);
    if (a && b && series[s][0].t <= start) changes[s] = pctChange(a.c, b.c);
  }
  return { at: new Date(end).toISOString(), from: new Date(start).toISOString(), hours, ...strength(changes, { currencies }) };
}
