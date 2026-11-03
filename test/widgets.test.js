import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, widgets, inline } from '../scripts/build-widgets.mjs';

test('the widgets carry the current library (npm run widgets)', () => {
  for (const { name, path } of widgets()) {
    const html = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(html, build(html, name), path + ' is out of step: run npm run widgets');
  }
});

test('the inlined library runs as a classic script', () => {
  const FXSessions = new Function(inline('sessions') + '\nreturn FXSessions;')();
  assert.equal(FXSessions.SESSIONS.length, 4);
  assert.deepEqual(FXSessions.openAt(Date.parse('2026-01-14T14:00Z')), ['london', 'newyork']);
});

test('the widgets credit Forexia by name only, with via', () => {
  for (const f of ['sessions', 'strength']) {
    const html = readFileSync(new URL(`../widgets/${f}.html`, import.meta.url), 'utf8');
    const credit = html.match(/<a href="(https:\/\/forexiapro\.com\/[^"]*)"[^>]*>(?:<span[^>]*>F<\/span>)?([^<]*)<\/a>/);
    assert.ok(credit, f);
    assert.match(credit[1], /\?via=strength-sessions$/);
    assert.equal(credit[2], 'Forexia');
  }
});
