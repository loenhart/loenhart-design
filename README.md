# @loenhart/design

The shared design system for Loenhart Health properties: tokens, primitives, and
per-brand surfaces. Framework-agnostic CSS — it works in Create React App,
Next.js, Tailwind 4, or a plain HTML page.

## Why this exists

Before this package, the same token set was **copy-pasted into three
codebases**. Comparing them found most tokens byte-identical and a handful
already divergent. Some of that divergence was deliberate — one property
overrides the surface layer for its own brand — but nothing recorded which
differences were intentional and which were drift.

That is the split this package formalises:

- **core** — the shared language. Text colours, hairlines, the blue and red
  ramps, shadow, type stack. Identical everywhere. If a property needs to change
  one of these, it does not belong in core.
- **brand** — surfaces only. Background, the panel ramp, the backdrop gradient,
  and the light end of the blue ramp. This is the one axis that legitimately
  varies.
- **primitives** — the components built from both: `card`, `btn-*`, `field`,
  `pill`, `status-*`. Written once, so a fix reaches every property.

## Install

No registry. Consume it directly from git:

```bash
npm install github:loenhart/loenhart-design
```

Or, while developing locally:

```bash
npm install file:../loenhart-design
```

## Use

### Plain CSS (Create React App, or any bundler)

```css
/* src/index.css */
@import '@loenhart/design/fonts.css';
@import '@loenhart/design/loenhart.css';
```

### Next.js + Tailwind 4

```css
/* app/globals.css */
@import 'tailwindcss';
@import '@loenhart/design/loenhart.css';
@import '@loenhart/design/tailwind.css';
```

Load the faces with `next/font` rather than `fonts.css`, and set
`--font-brand-sans` / `--font-brand-display` from the generated variables.

### A different brand

```css
@import '@loenhart/design/argonauts.css';
```

### Mixing your own tokens with a brand

```css
@import '@loenhart/design';                    /* core + primitives, no surfaces */
@import '@loenhart/design/brands/loenhart.css'; /* surfaces — must come after */
```

## The rules

**1. Only `base.css` may style `body`, `html` or `*`.**

CSS is global. A screen-level stylesheet that sets a `body` rule applies on every
route, whichever component imported it. This is not hypothetical — a screen sheet
declaring

```css
body { background-color: #406fa1; font-family: 'Helvetica Neue', ...; }
```

lands after the design tokens in the bundle and **overrides the brand font across
the entire application**. It is invisible in per-screen previews, which load only
the sheets for the screen under test.

Enforce it with a test in each consuming app. `npm test` here checks the same
rule inside this package.

**2. Red is an accent, not a primary.**

`.btn-secondary` is red. It is the *alternative* action. Using it for the main
action on a screen makes the secondary treatment the loudest thing on the page.

The hierarchy is `.btn-primary` (blue) → `.btn-secondary` (red) → `.btn-ghost`
(quiet). Red otherwise appears in focus rings, list markers, warning states and
destructive hovers.

**3. Namespace screen-specific classes.**

Generic names like `.exercise-card` or `.form-row` collide across stylesheets in
a global cascade: a class named `.exercise-card` on one screen will silently
restyle a different screen's `.exercise-card`. Prefix screen classes
(`.picker-card`, `.session-card`) and reserve unprefixed names for this package.

**4. A card that contains form controls should not lift on hover.**

`.card:hover` shifts the surface. Under a fingertip mid-entry that is worse than
static. Set `transform: none` on those.

**5. Text-entry controls are at least 16px on touch screens.**

iOS Safari, and every in-app web view on iOS, zooms the page when a text control
smaller than 16px takes focus — and the zoom stays after the field loses focus,
leaving the layout wider than the screen. `.field`, `.field-compact` and bare
`input` / `select` / `textarea` are floored at 16px under
`(max-width: 639px), (pointer: coarse)`; desktop keeps the smaller sizes.

Don't fix this with `maximum-scale=1` in the viewport meta: outside Safari (on
Android, and in iOS web views) it also disables pinch-zoom, which is an
accessibility regression. If a consumer gives an input
its own `font-size`, that rule needs the same touch floor.

## What is deliberately not here

- **Layout.** Containers, grids and page rhythm stay in each app; they differ too
  much to share usefully.
- **Navigation.** Header and footer are per-property.
- **Marketing-only surfaces.** `hero-shell` and `hero-stat` live in the site that
  needs them; the apps do not have heroes.
- **Components.** This ships CSS, not React. The apps are on different framework
  versions, and a shared component library would force them to move together.

## Tests

```bash
npm test
```

Structural guards, no framework: every brand defines the full surface set, core
defines none of them, only `base.css` touches global elements, every primitive is
reachable from the entry points, brand files import after core, and text-entry
controls are floored at 16px on touch screens.

## Adding a brand

1. Copy `src/tokens/brand-loenhart.css` to `src/tokens/brand-<name>.css`.
2. Change the surfaces. Leave everything else alone — if you find yourself
   editing the blue or red ramp, it is a core change and needs discussing.
3. Add a convenience entry point mirroring `src/loenhart.css`.
4. Add the export to `package.json`.
5. `npm test` will fail if the brand is missing any surface token.
