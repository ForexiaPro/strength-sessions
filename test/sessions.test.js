import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  offsetMinutes, zonedToUtc, wallClock, marketOpen, marketWeeks,
  sessionIntervals, openAt, nextOpen, status, overlaps,
} from '../src/sessions.js';

const U = (s) => Date.parse(s);
const iso = (d) => new Date(d).toISOString();

test('offsets follow daylight saving through Intl', () => {
  assert.equal(offsetMinutes(U('2026-07-15T12:00Z'), 'Europe/London'), 60);
  assert.equal(offsetMinutes(U('2026-01-15T12:00Z'), 'Europe/London'), 0);
  assert.equal(offsetMinutes(U('2026-07-15T12:00Z'), 'America/New_York'), -240);
  assert.equal(offsetMinutes(U('2026-01-15T12:00Z'), 'America/New_York'), -300);
  assert.equal(offsetMinutes(U('2026-01-15T12:00Z'), 'Australia/Sydney'), 660);
  assert.equal(offsetMinutes(U('2026-07-15T12:00Z'), 'Australia/Sydney'), 600);
  assert.equal(offsetMinutes(U('2026-07-15T12:00Z'), 'Asia/Tokyo'), 540);
});

test('zonedToUtc and wallClock round-trip', () => {
  const t = zonedToUtc(2026, 3, 30, 8, 0, 'Europe/London');
  assert.equal(iso(t), '2026-03-30T07:00:00.000Z');
  const w = wallClock(t, 'Europe/London');
  assert.deepEqual([w.y, w.m, w.d, w.h, w.mi, w.wd], [2026, 3, 30, 8, 0, 1]);
});

test('London and New York open an hour earlier in UTC in summer', () => {
  const [lw] = sessionIntervals('london', U('2026-01-14T00:00Z'), U('2026-01-14T23:59Z'));
  assert.equal(iso(lw.start), '2026-01-14T08:00:00.000Z');
  assert.equal(iso(lw.end), '2026-01-14T17:00:00.000Z');
  const [ls] = sessionIntervals('london', U('2026-07-15T00:00Z'), U('2026-07-15T23:59Z'));
  assert.equal(iso(ls.start), '2026-07-15T07:00:00.000Z');
  const [nw] = sessionIntervals('newyork', U('2026-01-14T00:00Z'), U('2026-01-14T23:59Z'));
  assert.equal(iso(nw.start), '2026-01-14T13:00:00.000Z');
  const [ns] = sessionIntervals('newyork', U('2026-07-15T00:00Z'), U('2026-07-15T23:59Z'));
  assert.equal(iso(ns.start), '2026-07-15T12:00:00.000Z');
});

test('Sydney opens the evening before in UTC, later in the southern winter', () => {
  const jan = sessionIntervals('sydney', U('2026-01-13T12:00Z'), U('2026-01-14T12:00Z'));
  assert.equal(iso(jan[0].start), '2026-01-13T20:00:00.000Z'); // Wed 14 Jan 07:00 AEDT
  const jul = sessionIntervals('sydney', U('2026-07-14T12:00Z'), U('2026-07-15T12:00Z'));
  assert.equal(iso(jul[0].start), '2026-07-14T21:00:00.000Z'); // Wed 15 Jul 07:00 AEST
});

test('Tokyo never moves', () => {
  for (const d of ['2026-01-14', '2026-07-15']) {
    const [t] = sessionIntervals('tokyo', U(d + 'T00:00Z'), U(d + 'T12:00Z'));
    assert.equal(iso(t.start), d + 'T00:00:00.000Z');
    assert.equal(iso(t.end), d + 'T09:00:00.000Z');
  }
});

test('the market week is Sunday 17:00 to Friday 17:00 New York', () => {
  assert.equal(marketOpen(U('2026-11-07T12:00Z')), false); // Saturday
  assert.equal(marketOpen(U('2026-11-08T21:30Z')), false); // Sunday 16:30 EST
  assert.equal(marketOpen(U('2026-11-08T22:30Z')), true); // Sunday 17:30 EST
  assert.equal(marketOpen(U('2026-11-06T21:59Z')), true); // Friday 16:59 EST
  assert.equal(marketOpen(U('2026-11-06T22:00Z')), false);
  const [w] = marketWeeks(U('2026-07-15T00:00Z'), U('2026-07-15T00:01Z'));
  assert.equal(iso(w.start), '2026-07-12T21:00:00.000Z');
  assert.equal(iso(w.end), '2026-07-17T21:00:00.000Z');
});

test('no session opens at the weekend', () => {
  assert.deepEqual(openAt(U('2026-11-07T12:00Z')), []);
  assert.deepEqual(sessionIntervals('london', U('2026-11-07T00:00Z'), U('2026-11-08T23:59Z')), []);
});

test("Sydney's Monday waits for the market to open", () => {
  // Monday 9 Nov 07:00 AEDT is Sunday 20:00 UTC; the market opens 22:00 UTC
  const [s] = sessionIntervals('sydney', U('2026-11-08T12:00Z'), U('2026-11-09T12:00Z'));
  assert.equal(iso(s.start), '2026-11-08T22:00:00.000Z');
  assert.equal(iso(s.end), '2026-11-09T05:00:00.000Z');
  assert.equal(iso(nextOpen('sydney', U('2026-11-08T21:00Z'))), '2026-11-08T22:00:00.000Z');
});

test('openAt, nextOpen and status', () => {
  assert.deepEqual(openAt(U('2026-01-14T14:00Z')), ['london', 'newyork']);
  assert.deepEqual(openAt(U('2026-01-14T07:00Z')), ['tokyo']);
  assert.equal(iso(nextOpen('london', U('2026-01-14T14:00Z'))), '2026-01-15T08:00:00.000Z');
  assert.equal(iso(nextOpen('london', U('2026-01-16T18:00Z'))), '2026-01-19T08:00:00.000Z'); // Friday to Monday
  const st = status(U('2026-01-14T14:05Z'));
  const ld = st.find((s) => s.id === 'london');
  assert.equal(ld.open, true);
  assert.equal(ld.local, '14:05');
  assert.equal(iso(ld.end), '2026-01-14T17:00:00.000Z');
  const ty = st.find((s) => s.id === 'tokyo');
  assert.equal(ty.open, false);
  assert.equal(iso(ty.start), '2026-01-15T00:00:00.000Z');
  assert.equal(ty.local, '23:05');
});

test('overlaps: London and New York, and the weeks the clocks disagree', () => {
  const w = overlaps(U('2026-01-14T00:00Z'), U('2026-01-15T00:00Z'));
  const ln = w.find((o) => o.ids.join() === 'london,newyork');
  assert.equal(iso(ln.start), '2026-01-14T13:00:00.000Z');
  assert.equal(iso(ln.end), '2026-01-14T17:00:00.000Z');
  // 9-27 March 2026: New York is on summer time, London is not
  const m = overlaps(U('2026-03-18T00:00Z'), U('2026-03-19T00:00Z')).find((o) => o.ids.join() === 'london,newyork');
  assert.equal(iso(m.start), '2026-03-18T12:00:00.000Z');
  assert.equal(iso(m.end), '2026-03-18T17:00:00.000Z');
  // Tokyo and London in the northern summer: 07:00 to 09:00 UTC
  const tl = overlaps(U('2026-07-15T00:00Z'), U('2026-07-16T00:00Z')).find((o) => o.ids.join() === 'tokyo,london');
  assert.equal(iso(tl.start), '2026-07-15T07:00:00.000Z');
  assert.equal(iso(tl.end), '2026-07-15T09:00:00.000Z');
});
