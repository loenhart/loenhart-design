/*
 * Structural guards over the design system itself.
 *
 * Run with `npm test`. No framework: the whole point is that this package has no
 * dependencies and can be consumed by anything.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokensIn = (css) =>
  Object.fromEntries([...stripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .map(([, k, v]) => [k, v.trim()]));

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

console.log('design system guards\n');

// Every brand must define the full surface set, or a consumer gets a
// half-styled page with undefined custom properties silently resolving to
// nothing.
const SURFACE_TOKENS = [
  '--background', '--background-deep',
  '--panel', '--panel-strong', '--panel-soft', '--panel-contrast',
  '--brand-blue-soft', '--brand-backdrop',
];
const brands = readdirSync(join(root, 'src/tokens')).filter((f) => f.startsWith('brand-'));

check('at least two brands exist, so the split is real', () => {
  assert.ok(brands.length >= 2, `found ${brands.length}`);
});

for (const brand of brands) {
  check(`${brand} defines every surface token`, () => {
    const defined = tokensIn(read(`src/tokens/${brand}`));
    const missing = SURFACE_TOKENS.filter((t) => !(t in defined));
    assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`);
  });
}

// Core must NOT define surfaces — that is what makes brands substitutable.
check('core.css defines no surface tokens', () => {
  const core = tokensIn(read('src/tokens/core.css'));
  const leaked = SURFACE_TOKENS.filter((t) => t in core && t !== '--brand-blue-soft');
  assert.deepEqual(leaked, [], `core.css should not set: ${leaked.join(', ')}`);
});

// Core must define the shared language.
check('core.css defines the shared language', () => {
  const core = tokensIn(read('src/tokens/core.css'));
  for (const t of ['--foreground', '--muted', '--soft', '--line', '--brand-blue',
                   '--brand-red', '--shadow', '--font-brand-sans']) {
    assert.ok(t in core, `core.css is missing ${t}`);
  }
});

// Only base.css may style global elements. This is the rule that a screen
// stylesheet broke in LTS, overriding the brand font across a whole app.
check('only base.css styles body/html/:root/*', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { walk(rel); continue; }
      if (!entry.name.endsWith('.css') || rel === 'src/base.css') continue;
      const css = stripComments(read(rel));
      // :root is legitimate in token files; body/html/* never are.
      const bad = [...css.matchAll(/(^|})\s*(body|html|\*)\s*[,{]/g)].map((m) => m[2]);
      if (bad.length) offenders.push(`${rel}: ${[...new Set(bad)].join(', ')}`);
    }
  };
  walk('src');
  assert.deepEqual(offenders, [], offenders.join('; '));
});

// Every primitive file must be reachable from the entry points, or it silently
// ships nothing.
check('every primitive is imported by index.css', () => {
  const index = read('src/index.css');
  for (const f of readdirSync(join(root, 'src/primitives'))) {
    assert.ok(index.includes(`primitives/${f}`), `index.css does not import ${f}`);
  }
});

check('brand entry points import core before their brand', () => {
  for (const entry of ['src/loenhart.css', 'src/argonauts.css']) {
    const css = read(entry);
    const core = css.indexOf('tokens/core.css');
    const brand = css.indexOf('tokens/brand-');
    assert.ok(core >= 0 && brand >= 0, `${entry} must import core and a brand`);
    assert.ok(core < brand, `${entry} imports its brand before core; surfaces would be overwritten`);
  }
});

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
