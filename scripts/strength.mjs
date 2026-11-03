#!/usr/bin/env node
// Computes data/strength.json (what widgets/strength.html shows) from candles
// you supply. Only derived values are written: each currency's 0-10 strength
// and its average percent change, per window. No price, open, high, low or
// close goes into the output, so it can be published whatever the licence of
// the candles (most data feeds do not allow their prices to be passed on).
//
//   node scripts/strength.mjs <input> [--out data/strength.json] [--windows 1,4,24,120]
//   node scripts/strength.mjs --demo      synthetic candles, marked "sample": true
//
// <input> is either
//   - a JSON file: { "EURUSD": [candles], "USDJPY": [candles], ... }
//     (or the same under a "candles" key), or
//   - a folder of files named by pair: EURUSD.csv, USDJPY.json, EUR_USD.csv ...
// A candle is [time, open, high, low, close], [time, close], or an object with
// time|t|timestamp|date and close|c. A CSV has a header row with a time column
// (time, date, datetime or timestamp) and a close column; commas, semicolons
// or tabs. Times are epoch seconds or milliseconds, or ISO 8601; an ISO time
// with no zone is read as UTC.
//
// Any timeframe works (M5, M15, H1...): a window is measured from the last
// close at or before its start to the last close at or before the end. The
// end is the earliest of the pairs' last candles, so every pair is measured
// to the same moment. Give at least the longest window of history, plus a
// weekend. Pairs other than the 28 crosses of the eight majors are ignored.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAJORS, PAIRS, splitPair, strengthFromCandles } from '../src/strength.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const demo = args.includes('--demo');
const input = args.find((a, i) => !a.startsWith('--') && !['--out', '--windows'].includes(args[i - 1]));
const out = resolve(opt('out', join(root, 'data', 'strength.json')));
const LABELS = { 1: '1 hour', 4: '4 hours', 24: '24 hours', 120: '1 week' };
const windows = String(opt('windows', '1,4,24,120')).split(',').map(Number).filter((h) => h > 0);

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = [',', ';', '\t'].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/[<>"]/g, ''));
  const ti = head.findIndex((h) => ['time', 'date', 'datetime', 'timestamp', 't', 'gmt time', 'local time'].includes(h));
  const ci = head.findIndex((h) => h === 'close' || h === 'c');
  if (ti < 0 || ci < 0) throw new Error('A CSV needs a time and a close column; found: ' + head.join(', '));
  return lines.slice(1).map((l) => {
    const f = l.split(sep);
    return { time: f[ti].trim().replace(/^"|"$/g, ''), close: f[ci] };
  });
}

function load(path) {
  if (statSync(path).isDirectory()) {
    const byPair = {};
    for (const f of readdirSync(path)) {
      const ext = extname(f).toLowerCase();
      if (ext !== '.csv' && ext !== '.json') continue;
      const pair = splitPair(basename(f, ext));
      if (!pair) continue;
      const text = readFileSync(join(path, f), 'utf8');
      byPair[pair.join('')] = ext === '.csv' ? parseCsv(text) : JSON.parse(text);
    }
    return byPair;
  }
  const j = JSON.parse(readFileSync(path, 'utf8'));
  return j.candles && !Array.isArray(j.candles) ? j.candles : j;
}

// a seeded random walk per currency against a common unit, so the crosses agree
function synthetic(hours = 24 * 10) {
  let seed = 20261102;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const level = { USD: 1, EUR: 1.08, GBP: 1.27, JPY: 1 / 150, CHF: 1.12, CAD: 0.73, AUD: 0.65, NZD: 0.59 };
  const drift = Object.fromEntries(MAJORS.map((c) => [c, (rnd() - 0.5) * 0.0006]));
  const end = Math.floor(Date.now() / 36e5) * 36e5;
  const byPair = Object.fromEntries(PAIRS.map((p) => [p, []]));
  for (let i = hours; i >= 0; i--) {
    for (const c of MAJORS) level[c] *= 1 + drift[c] + (rnd() - 0.5) * 0.002;
    for (const p of PAIRS) {
      const [b, q] = splitPair(p);
      byPair[p].push([end - i * 36e5, 0, 0, 0, level[b] / level[q]]);
    }
  }
  return byPair;
}

if (!demo && !input) {
  console.error('Usage: node scripts/strength.mjs <candles.json | folder> [--out file] [--windows 1,4,24,120]\n       node scripts/strength.mjs --demo');
  process.exit(1);
}

const byPair = demo ? synthetic() : load(resolve(input));
const found = Object.keys(byPair).filter((p) => splitPair(p));
if (found.length < 28) console.warn(`${found.length} of the 28 pairs found; each currency is averaged over the pairs it has.`);

const result = {
  name: 'Currency strength',
  generated: new Date().toISOString(),
  sample: demo,
  method: 'https://github.com/ForexiaPro/strength-sessions#the-method',
  note: 'Derived values only: each currency\'s strength (0-10 within a window) and its average percent change across its pairs. No prices.',
  currencies: MAJORS,
  windows: [],
};
for (const hours of windows) {
  const r = strengthFromCandles(byPair, { hours });
  if (!r.rank.length) {
    console.warn(`No pair has ${hours} hours of history: window left out.`);
    continue;
  }
  result.windows.push({
    id: hours === 120 ? '1w' : hours + 'h',
    label: LABELS[hours] || hours + ' hours',
    hours,
    from: r.from,
    at: r.at,
    rank: r.rank,
    strength: Object.fromEntries(r.rank.map((c) => [c, r.currencies[c].strength])),
    change: Object.fromEntries(r.rank.map((c) => [c, r.currencies[c].change])),
    pairs: Object.fromEntries(r.rank.map((c) => [c, r.currencies[c].pairs])),
  });
}
if (!result.windows.length) {
  console.error('Nothing to write: no window has enough history.');
  process.exit(1);
}
result.asOf = result.windows[0].at;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log(`${out}: ${result.windows.map((w) => `${w.id} ${w.rank[0]} strongest, ${w.rank[w.rank.length - 1]} weakest`).join('; ')}${demo ? ' (sample data)' : ''}`);
