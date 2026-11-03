#!/usr/bin/env node
// Copies the library into the widgets, so each widget stays one file:
// src/sessions.js goes between "// <lib:sessions>" and "// </lib:sessions>" in
// widgets/sessions.html, as a global FXSessions. npm test fails when a widget
// is out of step with the library (test/widgets.test.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIBS = { sessions: { src: 'src/sessions.js', global: 'FXSessions', widgets: ['widgets/sessions.html'] } };

/** The library as a classic script: one global, no import or export. */
export function inline(name) {
  const lib = LIBS[name];
  const code = readFileSync(join(root, lib.src), 'utf8');
  if (/^import /m.test(code)) throw new Error(lib.src + ' must not import: it is inlined into a widget');
  const names = [...code.matchAll(/^export (?:const|let|function) (\w+)/gm)].map((m) => m[1]);
  const body = code.replace(/^export /gm, '').trimEnd();
  return `// ${lib.src}, copied in by scripts/build-widgets.mjs: edit the library, not this\nvar ${lib.global} = (function () {\n${body}\nreturn { ${names.join(', ')} };\n})();`;
}

export function build(html, name) {
  const re = new RegExp(`(// <lib:${name}>)[\\s\\S]*?(\\n[ \\t]*// </lib:${name}>)`);
  if (!re.test(html)) throw new Error(`no <lib:${name}> markers`);
  return html.replace(re, (_, a, b) => a + '\n' + inline(name) + b);
}

export function widgets() {
  return Object.entries(LIBS).flatMap(([name, lib]) => lib.widgets.map((w) => ({ name, path: join(root, w) })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const { name, path } of widgets()) {
    const html = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    const next = build(html, name);
    writeFileSync(path, next);
    console.log(path, next === html ? 'unchanged' : 'updated');
  }
}
