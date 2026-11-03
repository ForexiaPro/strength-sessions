import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAJORS, PAIRS, splitPair, strength, strengthFromCandles, normaliseSeries, closeAt } from '../src/strength.js';

test('28 pairs, each major in 7 of them', () => {
  assert.equal(PAIRS.length, 28);
  assert.equal(new Set(PAIRS).size, 28);
  for (const c of MAJORS) assert.equal(PAIRS.filter((p) => splitPair(p).includes(c)).length, 7, c);
});

test('splitPair reads broker symbols', () => {
  assert.deepEqual(splitPair('EUR/USD'), ['EUR', 'USD']);
  assert.deepEqual(splitPair('EURUSD.m'), ['EUR', 'USD']);
  assert.deepEqual(splitPair('frxGBPJPY'), ['GBP', 'JPY']);
  assert.deepEqual(splitPair('usdcad_i'), ['USD', 'CAD']);
  assert.equal(splitPair('XAUUSD'), null);
  assert.equal(splitPair('USDTRY'), null);
});

test('a change counts for the base and against the quote', () => {
  const r = strength({ EURUSD: 0.4 }, { currencies: ['EUR', 'USD'] });
  assert.deepEqual(r.currencies.EUR, { strength: 10, change: 0.4, pairs: 1 });
  assert.deepEqual(r.currencies.USD, { strength: 0, change: -0.4, pairs: 1 });
  assert.deepEqual(r.rank, ['EUR', 'USD']);
});

test('one currency rising against all: it is 10, the rest tie at 0', () => {
  // USD +1% against everything, the other crosses unchanged
  const changes = {};
  for (const p of PAIRS) {
    const [b, q] = splitPair(p);
    changes[p] = b === 'USD' ? 1 : q === 'USD' ? -1 : 0;
  }
  const r = strength(changes);
  assert.equal(r.currencies.USD.strength, 10);
  assert.equal(r.currencies.USD.change, 1);
  assert.equal(r.rank[0], 'USD');
  for (const c of MAJORS.filter((c) => c !== 'USD')) {
    assert.equal(r.currencies[c].strength, 0, c);
    assert.equal(r.currencies[c].pairs, 7);
  }
});

test('all unchanged: every currency is 5', () => {
  const r = strength(Object.fromEntries(PAIRS.map((p) => [p, 0])));
  for (const c of MAJORS) assert.equal(r.currencies[c].strength, 5);
});

test('a scale in between', () => {
  const r = strength({ EURUSD: 1, USDJPY: 1 }, { currencies: ['EUR', 'USD', 'JPY'] });
  // EUR +1, USD (-1 + 1)/2 = 0, JPY -1
  assert.equal(r.currencies.EUR.strength, 10);
  assert.equal(r.currencies.USD.strength, 5);
  assert.equal(r.currencies.JPY.strength, 0);
});

test('candles in the usual shapes', () => {
  const s = normaliseSeries([
    [1700003600, 1, 1, 1, 1.1],
    { time: '2023-11-14T22:13:20Z', close: '1.0' },
    { t: 1700007200000, c: 1.2 },
    { date: '2023-11-15 01:13:20', close: 1.3 },
  ]);
  assert.deepEqual(s.map((x) => x.c), [1.0, 1.1, 1.2, 1.3]);
  assert.equal(closeAt(s, 1700005000000).c, 1.1);
  assert.equal(closeAt(s, 1), null);
});

test('strengthFromCandles measures every pair to the same moment', () => {
  const h = 36e5, t0 = Date.UTC(2026, 10, 2, 0);
  const eur = [], jpy = [];
  for (let i = 0; i <= 30; i++) {
    eur.push({ t: t0 + i * h, c: 1 + i * 0.001 }); // EUR/USD up
    jpy.push({ t: t0 + i * h, c: 150 });
  }
  jpy.push({ t: t0 + 31 * h, c: 160 }); // after EUR/USD's last candle: not counted
  const r = strengthFromCandles({ EURUSD: eur, USDJPY: jpy, XAUUSD: eur }, { hours: 24, currencies: ['EUR', 'USD', 'JPY'] });
  assert.equal(r.at, new Date(t0 + 30 * h).toISOString());
  assert.equal(r.from, new Date(t0 + 6 * h).toISOString());
  assert.deepEqual(r.rank, ['EUR', 'JPY', 'USD']);
  assert.equal(r.currencies.EUR.change, Math.round((1.03 / 1.006 - 1) * 1e6) / 1e4);
  // a window longer than the history leaves the pairs out
  assert.deepEqual(strengthFromCandles({ EURUSD: eur }, { hours: 48 }).rank, []);
});
