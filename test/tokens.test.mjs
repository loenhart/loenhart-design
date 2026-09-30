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

// iOS zooms the page when a text control under 16px takes focus, and the zoom
// persists after navigation. Every text-entry primitive with a desktop size
// must be floored at 16px by a touch media rule placed AFTER that desktop size:
// the override has equal specificity, so source order is what makes it win.
const TOUCH_QUERY = /pointer:\s*coarse/;

// Top-level rules and @media blocks, in source order.
const blocksIn = (css) => {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (depth && j < css.length) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith('@media')) out.push({ media: prelude, rules: blocksIn(body), at: open });
    else out.push({ selectors: prelude.split(',').map((x) => x.trim()), body, at: open });
    i = j;
  }
  return out;
};
const fontSize = (body) => (body.match(/font-size\s*:\s*([^;]+)/) || [])[1]?.trim();
// Smallest size the value can resolve to, in px, with a 16px root.
const floorPx = (v) => {
  const max = v.match(/^max\((.*)\)$/);
  if (max) return Math.max(...max[1].split(',').map((a) => floorPx(a.trim())));
  const m = v.match(/^([\d.]+)(px|rem|em)$/);
  if (!m) return NaN;
  return m[2] === 'px' ? +m[1] : +m[1] * 16;
};

const assertTouchFloor = (file, wanted) => {
  const blocks = blocksIn(stripComments(read(file)));
  const problems = [];
  for (const sel of wanted) {
    const desktop = blocks.filter((b) => b.selectors?.includes(sel) && fontSize(b.body));
    const lastDesktop = Math.max(-1, ...desktop.map((b) => b.at));
    const floors = blocks
      .filter((b) => b.media && TOUCH_QUERY.test(b.media))
      .flatMap((b) => b.rules.filter((r) => r.selectors?.includes(sel) && fontSize(r.body)).map((r) => ({ ...r, at: b.at })));
    if (!floors.length) { problems.push(`${sel}: no touch font-size rule`); continue; }
    const winner = floors[floors.length - 1];
    if (winner.at < lastDesktop) problems.push(`${sel}: touch rule precedes the desktop size, so it loses`);
    const px = floorPx(fontSize(winner.body));
    if (!(px >= 16)) problems.push(`${sel}: touch font-size ${fontSize(winner.body)} is under 16px`);
  }
  assert.deepEqual(problems, [], problems.join('; '));
};

check('text-entry primitives are at least 16px on touch screens', () => {
  const controls = stripComments(read('src/primitives/controls.css'));
  const sized = blocksIn(controls)
    .filter((b) => b.selectors && fontSize(b.body))
    .flatMap((b) => b.selectors)
    .filter((sel) => /^\.field(-[\w-]+)?$/.test(sel) && sel !== '.field-invalid');
  assert.ok(sized.includes('.field') && sized.includes('.field-compact'), `found ${sized}`);
  assertTouchFloor('src/primitives/controls.css', sized);
});

check('bare text controls are at least 16px on touch screens', () => {
  const blocks = blocksIn(stripComments(read('src/base.css')));
  const touch = blocks.filter((b) => b.media && TOUCH_QUERY.test(b.media)).flatMap((b) => b.rules);
  const covered = touch.filter((r) => fontSize(r.body) && floorPx(fontSize(r.body)) >= 16).flatMap((r) => r.selectors);
  for (const el of ['input', 'select', 'textarea']) {
    assert.ok(covered.some((s) => s === el || s.startsWith(`${el}:`)), `base.css does not floor ${el}`);
  }
});

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
