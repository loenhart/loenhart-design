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
// stylesheet broke in a consuming app, overriding the brand font everywhere.
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


// ---------------------------------------------------------------------------
// Token resolution.
//
// A brand's effective token set is core.css overlaid with its brand file, in
// import order. Values are resolved the way the browser does it for :root:
// var() chains are followed to a literal, and a cycle or a dangling reference
// is a failure.

const CORE = tokensIn(read('src/tokens/core.css'));
const brandTokens = (brand) => ({ ...CORE, ...tokensIn(read(`src/tokens/${brand}`)) });

// Replace each var(--x[, fallback]) with x's value, innermost first.
const resolveValue = (value, map, seen = new Set()) => {
  let out = value;
  for (let guard = 0; guard < 50; guard++) {
    const m = out.match(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/);
    if (!m) return out;
    const [whole, name, fallback] = m;
    let sub;
    if (name in map) {
      if (seen.has(name)) throw new Error(`cycle through ${name}`);
      sub = resolveValue(map[name], map, new Set([...seen, name]));
    } else if (fallback !== undefined) {
      sub = fallback.trim();
    } else {
      throw new Error(`undefined ${name}`);
    }
    out = out.replace(whole, sub);
  }
  throw new Error(`too deep: ${value}`);
};
const resolveAll = (map) =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [k, resolveValue(v, map, new Set([k]))]));

// Declarations inside a selector block of a primitives file (for scoped
// surfaces such as .surface-paper).
const scopeTokens = (file, selector) => {
  const blocks = blocksIn(stripComments(read(file)));
  const hit = blocks.filter((b) => b.selectors?.includes(selector));
  return Object.assign({}, ...hit.map((b) => tokensIn(b.body)));
};
// A scope re-declares some tokens; everything else is inherited already
// resolved from :root. That is how custom properties compute.
const resolveScope = (rootResolved, scope) => resolveAll({ ...rootResolved, ...scope });

const RESOLVED = Object.fromEntries(brands.map((b) => [b, resolveAll(brandTokens(b))]));

for (const brand of brands) {
  check(`${brand}: every token resolves to a value (no cycles, no dangling var())`, () => {
    const problems = [];
    const map = brandTokens(brand);
    for (const [k, v] of Object.entries(map)) {
      try { resolveValue(v, map, new Set([k])); } catch (e) { problems.push(`${k}: ${e.message}`); }
    }
    assert.deepEqual(problems, [], problems.join('; '));
  });
}

// Every var() a stylesheet in this package reads must exist in every brand,
// or be read with a fallback. Otherwise a primitive silently loses a property.
const PACKAGE_CSS = (() => {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.css')) out.push(rel);
    }
  };
  walk('src');
  return out;
})();

check('every var() the package reads is defined in every brand', () => {
  const missing = new Set();
  for (const file of PACKAGE_CSS) {
    if (file === 'src/tailwind.css') continue; // Tailwind's own namespace
    const css = stripComments(read(file));
    for (const [, name, hasFallback] of css.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
      if (hasFallback) continue;
      for (const brand of brands) if (!(name in RESOLVED[brand])) missing.add(`${name} (${brand}, ${file})`);
    }
  }
  assert.deepEqual([...missing], [], [...missing].join('; '));
});

// ---------------------------------------------------------------------------
// Consumers.
//
// The custom properties the training web app reads, collected from its
// stylesheets. Several were written with fallbacks for tokens that did not
// exist, so the fallback (sometimes an off-brand colour) was what rendered.
// Every one must now come from the package. Set CONSUMER_SRC to a consumer's
// src directory to scan it live instead of trusting this list.
const TRAINING_APP_TOKENS = [
  '--accent', '--background-deep', '--brand-blue-deep', '--brand-blue-soft',
  '--brand-blue-strong', '--brand-red-strong', '--color-accent', '--color-success',
  '--color-surface', '--color-surface-muted', '--color-text', '--color-text-muted',
  '--color-warning', '--danger', '--font-brand-display', '--font-brand-mono',
  '--font-brand-sans', '--font-mono', '--foreground', '--line', '--line-strong',
  '--muted', '--panel', '--panel-contrast', '--panel-soft', '--panel-strong',
  '--radius-2', '--radius-sm', '--shadow', '--soft', '--space-1', '--space-10',
  '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8',
  '--text',
];

const scanConsumer = (dir) => {
  const found = new Set();
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
      if (!/\.(css|js|jsx|ts|tsx)$/.test(entry.name)) continue;
      for (const [, name] of stripComments(readFileSync(full, 'utf8')).matchAll(/var\(\s*(--[\w-]+)/g)) found.add(name);
    }
  };
  walk(dir);
  return [...found].sort();
};

const consumerTokens = process.env.CONSUMER_SRC ? scanConsumer(process.env.CONSUMER_SRC) : TRAINING_APP_TOKENS;

for (const brand of ['brand-loenhart.css', 'brand-argonauts.css']) {
  check(`${brand}: every token the training app references exists`, () => {
    const missing = consumerTokens.filter((t) => !(t in RESOLVED[brand]));
    assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`);
  });
}

// The class names consumers already use must keep existing, so a restyle never
// strands markup.
const LEGACY_CLASSES = [
  'card', 'card-interactive', 'callout-panel', 'embed-shell', 'pill', 'surface-badge',
  'btn-primary', 'btn-secondary', 'btn-ghost', 'text-link', 'icon-button',
  'field', 'field-compact', 'field-invalid', 'page-title', 'section-title',
  'body-copy', 'meta-copy', 'kicker', 'mono', 'status-error', 'status-success',
  'notice-warning', 'list-marker', 'sr-only',
];
const APP_CLASSES = [
  'surface-ink', 'surface-paper', 'surface-grid', 'label', 'fig-no', 'lede', 'spec-row', 'ruled',
  'data-table', 'table-scroll', 'form-row', 'form-label', 'form-hint', 'form-grid',
  'tabs', 'tab', 'segmented', 'segment', 'toast', 'toast-stack', 'status-dot', 'status-info',
  'app-nav', 'app-nav-brand', 'app-nav-link', 'skip-link',
];
check('legacy and app class names are all defined', () => {
  const all = PACKAGE_CSS.map((f) => stripComments(read(f))).join('\n');
  const missing = [...LEGACY_CLASSES, ...APP_CLASSES].filter(
    (c) => !new RegExp(`\\.${c}(?![\\w-])`).test(all));
  assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Argonauts keeps its look.
//
// The lab-notebook rework must not reach the Argonauts brand: its surfaces,
// its type and its primitives resolve to what they were before.
check('argonauts brand still resolves to its own surfaces, type and buttons', () => {
  const a = RESOLVED['brand-argonauts.css'];
  assert.equal(a['--background'], '#051C3E');
  assert.equal(a['--argos-blue'], '#5F90B2');
  assert.equal(a['--font-brand-sans'], "'Manrope'");
  assert.equal(a['--font-brand-display'], "'Cormorant Garamond'");
  assert.match(a['--btn-primary-bg'], /^linear-gradient\(135deg, #5F90B2,/);
  assert.match(a['--card-bg'], /^linear-gradient/);
  assert.equal(a['--brand-red'], '#c94659');
  assert.match(a['--brand-backdrop'], /#051C3E/);
});

check('argonauts.css entry point still imports every primitive', () => {
  const entry = read('src/argonauts.css');
  for (const f of readdirSync(join(root, 'src/primitives'))) {
    assert.ok(entry.includes(`primitives/${f}`), `argonauts.css does not import ${f}`);
  }
  assert.ok(read('src/loenhart.css').includes('primitives/navigation.css'));
});

// ---------------------------------------------------------------------------
// Contrast (WCAG 2.x), computed from the token values.

const parseColor = (v) => {
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  m = v.match(/^rgba?\(([^)]*)\)$/i);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  if (v === 'white' || v === '#fff') return [255, 255, 255, 1];
  throw new Error(`not a plain colour: ${v}`);
};
// Composite a possibly translucent colour over an opaque one.
const over = (top, bottom) => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
};
const luminance = ([r, g, b]) =>
  [r, g, b].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (fg, bg) => {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// [foreground token, background token(s) innermost first, minimum, why].
// Backgrounds after the first are what a translucent background sits on.
const LAB_PAIRS = [
  // Documented in the website's design direction.
  ['--pen', ['--ink'], 5.2, 'small red text on ink'],
  ['--pen', ['--ink-raised'], 5.2, 'small red text on a raised ink panel'],
  ['--pen-ink', ['--paper'], 6.0, 'red on paper'],
  ['--on-paper-muted', ['--paper'], 5.7, 'muted text on paper'],
  ['--btn-primary-color', ['--btn-primary-bg'], 6.8, 'white on the primary button'],
  ['--btn-primary-color', ['--btn-primary-bg-hover'], 4.5, 'white on the hovered primary button'],
  // Body text on every surface in the ink ramp.
  ...['--background', '--panel', '--panel-strong', '--panel-soft', '--panel-contrast'].flatMap((bg) => [
    ['--foreground', [bg], 7, `foreground on ${bg}`],
    ['--muted', [bg], 4.5, `muted on ${bg}`],
    ['--soft', [bg], 4.5, `soft on ${bg}`],
    ['--brand-red-strong', [bg], 4.5, `pen text on ${bg}`],
    ['--brand-blue-soft', [bg], 4.5, `data-blue text on ${bg}`],
    ['--status-warn', [bg], 4.5, `caution text on ${bg}`],
    ['--focus-ring', [bg], 3, `focus ring on ${bg}`],
  ]),
  ['--kicker-color', ['--panel'], 4.5, 'kicker on a panel'],
  ['--status-error-color', ['--status-error-bg', '--panel'], 4.5, 'error message'],
  ['--status-success-color', ['--status-success-bg', '--panel'], 4.5, 'success message'],
  ['--notice-warning-color', ['--notice-warning-bg', '--panel'], 4.5, 'warning notice'],
  ['--callout-color', ['--callout-bg', '--panel'], 4.5, 'callout text'],
  ['--field-color', ['--field-bg', '--panel'], 4.5, 'field text'],
  ['--field-placeholder', ['--field-bg', '--panel'], 4.5, 'field placeholder'],
  ['--field-border', ['--panel'], 3, 'field boundary (non-text)'],
  ['--btn-secondary-color', ['--panel'], 4.5, 'secondary button text'],
  ['--btn-ghost-color', ['--panel'], 4.5, 'ghost button text'],
  ['--icon-btn-color', ['--panel'], 4.5, 'icon button glyph'],
];
// The same checks inside a .surface-paper region.
const PAPER_PAIRS = [
  ...['--paper', '--paper-raised'].flatMap((bg) => [
    ['--foreground', [bg], 7, `foreground on ${bg}`],
    ['--muted', [bg], 4.5, `muted on ${bg}`],
    ['--soft', [bg], 4.5, `soft on ${bg}`],
    ['--brand-red-strong', [bg], 4.5, `pen text on ${bg}`],
    ['--brand-blue-soft', [bg], 4.5, `data-blue text on ${bg}`],
    ['--status-warn', [bg], 4.5, `caution text on ${bg}`],
    ['--focus-ring', [bg], 3, `focus ring on ${bg}`],
  ]),
  ['--status-error-color', ['--status-error-bg', '--paper'], 4.5, 'error message on paper'],
  ['--status-success-color', ['--status-success-bg', '--paper'], 4.5, 'success message on paper'],
  ['--notice-warning-color', ['--notice-warning-bg', '--paper'], 4.5, 'warning notice on paper'],
  ['--callout-color', ['--callout-bg', '--paper'], 4.5, 'callout on paper'],
  ['--field-color', ['--field-bg', '--paper'], 4.5, 'field text on paper'],
  ['--field-placeholder', ['--field-bg', '--paper'], 4.5, 'placeholder on paper'],
  ['--field-border', ['--paper-raised'], 3, 'field boundary on paper (non-text)'],
  ['--btn-secondary-color', ['--paper'], 4.5, 'secondary button on paper'],
  ['--btn-ghost-color', ['--paper'], 4.5, 'ghost button on paper'],
];

const checkPairs = (label, map, pairs) => {
  check(`${label}: WCAG AA contrast for ${pairs.length} documented pairs`, () => {
    const problems = [];
    for (const [fgTok, bgToks, min, why] of pairs) {
      try {
        const layers = bgToks.map((t) => parseColor(map[t]));
        let bg = layers[layers.length - 1];
        if (bg[3] !== 1) throw new Error(`${bgToks.at(-1)} must be opaque`);
        for (let i = layers.length - 2; i >= 0; i--) bg = over(layers[i], bg);
        const fg = over(parseColor(map[fgTok]), bg);
        const r = ratio(fg, bg);
        if (r < min) problems.push(`${why}: ${fgTok} on ${bgToks.join(' over ')} = ${r.toFixed(2)} < ${min}`);
      } catch (e) {
        problems.push(`${why}: ${e.message}`);
      }
    }
    assert.deepEqual(problems, [], problems.join('\n       '));
  });
};

const LAB = RESOLVED['brand-loenhart.css'];
checkPairs('lab-notebook ink', LAB, LAB_PAIRS);
checkPairs('lab-notebook paper', resolveScope(LAB, scopeTokens('src/primitives/surfaces.css', '.surface-paper')), PAPER_PAIRS);
// Regions nest: an ink section inside a paper one must read as ink again,
// and the app nav must stay legible on paper.
const PAPER_SCOPE = scopeTokens('src/primitives/surfaces.css', '.surface-paper');
const INK_SCOPE = scopeTokens('src/primitives/surfaces.css', '.surface-ink');
check('.surface-ink restates every token .surface-paper changes', () => {
  const missing = Object.keys(PAPER_SCOPE).filter((k) => !(k in INK_SCOPE));
  assert.deepEqual(missing, [], `restate in .surface-ink: ${missing.join(', ')}`);
});
checkPairs('ink inside paper', resolveScope(resolveScope(LAB, PAPER_SCOPE), INK_SCOPE), LAB_PAIRS);
checkPairs('nav on paper', resolveScope(LAB, PAPER_SCOPE), [
  ['--foreground', ['--nav-bg', '--paper'], 7, 'nav brand/link on paper nav'],
  ['--muted', ['--nav-bg', '--paper'], 4.5, 'nav muted link on paper nav'],
]);
checkPairs('nav on ink', LAB, [
  ['--foreground', ['--nav-bg', '--ink'], 7, 'nav brand/link on ink nav'],
  ['--muted', ['--nav-bg', '--ink'], 4.5, 'nav muted link on ink nav'],
]);

// Inside a surface region colours must not depend on the brand: every
// colour-bearing token resolves the same on Argonauts as on Loenhart.
const COLOUR_TOKEN = /(bg|border|shadow|color|filter|sheen|glow|selection|^--brand-|edge|ring|marker-bg|underline$)/;
for (const [label, scope] of [['.surface-paper', PAPER_SCOPE], ['.surface-ink', INK_SCOPE]]) {
  check(`${label}: colours are brand-independent`, () => {
    const lab = resolveScope(LAB, scope);
    const argo = resolveScope(RESOLVED['brand-argonauts.css'], scope);
    const differ = Object.keys(lab).filter((k) => COLOUR_TOKEN.test(k) && k in argo && lab[k] !== argo[k]);
    assert.deepEqual(differ, [], `restate in ${label}: ${differ.join(', ')}`);
  });
}
// The same contrast pairs hold for an Argonauts page using a paper region.
checkPairs('argonauts paper', resolveScope(RESOLVED['brand-argonauts.css'], PAPER_SCOPE), PAPER_PAIRS);

// Sticky first cells repaint the row's selection state over their opaque fill.
check('sticky first cell keeps the selected-row edge and tint', () => {
  const css = stripComments(read('src/primitives/tables.css'));
  const sel = blocksIn(css).find((b) => /has-sticky-first[^{]*aria-selected[^{]*> :first-child/.test(b.selectors || ''));
  assert.ok(sel, 'no rule repaints the selected state on the sticky first cell');
  assert.match(sel.body, /--table-row-selected/);
  assert.match(sel.body, /box-shadow:\s*inset/);
  // th scope=row cells are pinned too, so the repaint must not be td-only.
  assert.ok(!/td:first-child/.test(sel.selectors), 'repaint must cover th row headers');
});

// The documented radio form of the segmented control must show its state.
check('segment shows selected and focus state for a checked native radio', () => {
  const css = stripComments(read('src/primitives/navigation.css'));
  const active = blocksIn(css).find((b) => b.selectors?.includes('.segment.is-selected'));
  assert.ok(active?.selectors.includes('.segment-input:checked + .segment'), 'selected rule must cover :checked radios');
  const focus = blocksIn(css).find((b) => b.selectors?.includes('.segment:focus-visible'));
  assert.ok(focus?.selectors.includes('.segment-input:focus-visible + .segment'), 'focus rule must cover a focused radio');
});

// One unsupported selector drops its whole rule list in older browsers, so
// the package does not use :has() at all.
check('no :has() selectors (an unsupported one discards its whole rule)', () => {
  const offenders = PACKAGE_CSS.filter((f) => /:has\(/.test(stripComments(read(f))));
  assert.deepEqual(offenders, []);
});

// .table-scroll is the sticky header's scroll container; without a height cap
// the header scrolls away with the page.
check('.table-scroll caps its height so the sticky header stays pinned', () => {
  const css = stripComments(read('src/primitives/tables.css'));
  const box = blocksIn(css).find((b) => b.selectors?.length === 1 && b.selectors[0] === '.table-scroll');
  assert.match(box.body, /max-height:\s*var\(--table-scroll-max-height\)/);
  assert.match(box.body, /overflow:\s*auto/);
});

// Pinned table cells paint over scrolled content, so their background must
// end in an opaque layer in every brand (Argonauts' --panel is translucent).
check('sticky table cells are opaque in every brand', () => {
  const css = stripComments(read('src/primitives/tables.css'));
  for (const b of blocksIn(css).filter((x) => /position:\s*sticky/.test(x.body))) {
    assert.match(b.body, /background:\s*var\(--table-sticky-bg\)/, `${b.selectors}: use --table-sticky-bg`);
  }
  for (const brand of brands) {
    assert.match(brandTokens(brand)['--table-sticky-bg'] ?? '', /,\s*var\(--background\)\s*$/, `${brand}: --table-sticky-bg must end on --background`);
    assert.equal(parseColor(RESOLVED[brand]['--background'])[3], 1, `${brand}: --background must be opaque`);
  }
});

checkPairs('argonauts', RESOLVED['brand-argonauts.css'], [
  ['--foreground', ['--background'], 7, 'foreground on Night Sky'],
  ['--muted', ['--background'], 4.5, 'muted on Night Sky'],
  ['--soft', ['--background'], 4.5, 'soft on Night Sky'],
]);

// A .surface-* region restates tokens; any root alias that reads one of those
// tokens resolved at :root, so the region must restate the alias as well or it
// keeps the ink value on paper.
check('.surface-paper restates every alias that depends on a token it changes', () => {
  const lab = brandTokens('brand-loenhart.css');
  const scope = scopeTokens('src/primitives/surfaces.css', '.surface-paper');
  const changed = new Set(Object.keys(scope));
  // Transitive dependents of the changed tokens.
  const dependsOnChanged = (name, seen = new Set()) => {
    if (seen.has(name)) return false;
    seen.add(name);
    for (const [, ref] of (lab[name] || '').matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (changed.has(ref) || dependsOnChanged(ref, seen)) return true;
    }
    return false;
  };
  const stale = Object.keys(lab).filter((k) => !changed.has(k) && dependsOnChanged(k));
  assert.deepEqual(stale, [], `restate in .surface-paper: ${stale.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Self-hosting and privacy.

check('no third-party URLs (font CDNs or otherwise) in any stylesheet', () => {
  const offenders = [];
  for (const file of PACKAGE_CSS) {
    const raw = read(file);
    if (/fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/i.test(raw)) offenders.push(`${file}: font CDN`);
    const css = stripComments(raw);
    for (const [u] of css.matchAll(/(?:https?:)?\/\/[\w.-]+\.[a-z]{2,}[^\s'")]*/gi)) offenders.push(`${file}: ${u}`);
    for (const [, target] of css.matchAll(/@import\s+(?:url\()?\s*['"]?([^'");\s]+)/g)) {
      if (!target.startsWith('./') && !target.startsWith('../') && !target.startsWith('@fontsource')) {
        offenders.push(`${file}: @import ${target}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('; '));
});

check('fonts come from declared, OFL-licensed Fontsource packages', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = pkg.dependencies || {};
  for (const name of Object.keys(deps)) assert.match(name, /^@fontsource(-variable)?\//, `unexpected dependency ${name}`);
  for (const file of ['src/fonts/loenhart.css', 'src/fonts/argonauts.css']) {
    for (const [, mod] of stripComments(read(file)).matchAll(/@import\s+'(@fontsource[^/]*\/[^/]+)\//g)) {
      assert.ok(mod in deps, `${file} imports ${mod} but package.json does not depend on it`);
    }
  }
  // fonts.css is the back-compatible entry point: it must keep loading every
  // brand's faces, or a consumer of one brand silently falls back.
  const entry = stripComments(read('src/fonts.css'));
  for (const f of ['./fonts/loenhart.css', './fonts/argonauts.css']) {
    assert.ok(entry.includes(`'${f}'`), `fonts.css must import ${f}`);
  }
  const argoFonts = stripComments(read('src/fonts/argonauts.css'));
  assert.match(argoFonts, /@fontsource\/manrope\//, 'Argonauts body face (Manrope) must be loaded');
  assert.match(argoFonts, /@fontsource\/cormorant-garamond\//, 'Argonauts display face (Cormorant Garamond) must be loaded');
  const argo = RESOLVED['brand-argonauts.css'];
  assert.match(argo['--font-brand-sans'], /Manrope/);
  assert.match(argo['--font-brand-display'], /Cormorant Garamond/);
  const lab = RESOLVED['brand-loenhart.css'];
  assert.match(lab['--font-brand-display'], /Newsreader/);
  assert.match(lab['--font-brand-sans'], /IBM Plex Sans/);
  assert.match(lab['--font-brand-mono'], /IBM Plex Mono/);
});

// ---------------------------------------------------------------------------
// Motifs and motion.

check('the grid motif is opt-in, never on the page backdrop', () => {
  const lab = RESOLVED['brand-loenhart.css'];
  assert.doesNotMatch(lab['--brand-backdrop'], /gradient/);
  const blocks = blocksIn(stripComments(read('src/primitives/surfaces.css')));
  const grid = blocks.find((b) => b.selectors?.includes('.surface-grid') && /background-image/.test(b.body));
  assert.ok(grid, '.surface-grid must draw the grid');
});

check('reduced motion is honoured in base.css and the primitives', () => {
  const base = blocksIn(stripComments(read('src/base.css')));
  const rm = base.filter((b) => b.media && /prefers-reduced-motion:\s*reduce/.test(b.media));
  assert.ok(rm.some((b) => b.rules.some((r) => r.selectors.includes('*') && /transition-duration/.test(r.body))),
    'base.css must shorten transitions under prefers-reduced-motion');
  assert.match(read('src/primitives/a11y.css'), /prefers-reduced-motion:\s*reduce/);
});

check('every interactive primitive has a focus-visible style', () => {
  const all = PACKAGE_CSS.map((f) => stripComments(read(f))).join('\n');
  for (const c of ['btn-primary', 'btn-secondary', 'btn-ghost', 'icon-button', 'field', 'text-link',
                   'tab', 'segment', 'app-nav-link', 'table-scroll']) {
    assert.ok(new RegExp(`\\.${c}:focus-visible`).test(all), `.${c} has no :focus-visible rule`);
  }
});

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
