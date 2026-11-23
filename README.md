# @loenhart/design

The shared design system for Loenhart Health properties: tokens, primitives, and
per-brand surfaces. Framework-agnostic CSS — it works in Create React App,
Astro, Next.js, Tailwind 4, or a plain HTML page.

The Loenhart Health brand uses the **lab notebook** direction:

- **Ink** (deep navy) is the lab — data, tools, dense app screens. It is the
  default surface.
- **Paper** (warm off-white) is the notebook — reading and explanation. Opt in
  per region with `.surface-paper`.
- **Red is the coach's annotation pen** — markers, figure numbers, focus rings,
  the one primary button. Never a large fill.
- **Newsreader** for headings, **IBM Plex Sans** for text, **IBM Plex Mono**
  for labels and figures. Self-hosted, see [Fonts](#fonts).
- A faint **measurement grid** is available as `.surface-grid`, never on by
  default.

## Why this exists

Before this package, the same token set was **copy-pasted into three
codebases**. Comparing them found most tokens byte-identical and a handful
already divergent. Some of that divergence was deliberate — one property
overrides the surface layer for its own brand — but nothing recorded which
differences were intentional and which were drift.

That is the split this package formalises:

- **core** — the defaults for the shared language (text colours, hairlines,
  the blue and red ramps, shadow, type stack), the lab-notebook palette (`--ink`,
  `--paper`, `--pen`, `--data`...), the scales (`--space-*`, `--radius-*`,
  `--text-*`), and a **component token** for every visual decision a primitive
  makes (`--card-bg`, `--btn-primary-bg`, `--field-radius`...).
- **brand** — the surfaces (background, the panel ramp, the backdrop), plus any
  shared-language or component tokens the brand restates. `brand-loenhart.css`
  restates many of them to express the lab notebook; `brand-argonauts.css`
  restates none, so it keeps the original look exactly.
- **primitives** — the classes built from the tokens: `card`, `btn-*`,
  `field`, `pill`, `status-*`, plus app primitives (tables, form rows, tabs,
  segmented control, toasts, app bar). Written once, so a fix reaches every
  property. A primitive never hard-codes a colour; restyling is a token change.

Token and class **names are stable**. The lab-notebook rework changed values,
not names, so markup and stylesheets written against the earlier look keep
working.

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

### Astro (or any Vite project)

```css
/* src/styles/global.css */
@import 'tailwindcss';
@import '@loenhart/design/fonts.css';
@import '@loenhart/design/loenhart.css';
@import '@loenhart/design/tailwind.css';
```

### Next.js + Tailwind 4

```css
/* app/globals.css */
@import 'tailwindcss';
@import '@loenhart/design/loenhart.css';
@import '@loenhart/design/tailwind.css';
```

`fonts.css` needs a bundler: its `@import`s are bare npm specifiers, which a
browser cannot resolve from a stylesheet served as is. The other entry points
use relative imports and work anywhere.

Either import `fonts.css` as above, or load the same faces with the framework's
font loader and keep the family names the brand tokens use.

## Fonts

`fonts.css` imports every brand's faces from Fontsource packages, which are
dependencies of this package. A browser downloads only the families a page
uses; to ship one brand's files only, import `fonts/loenhart.css` or
`fonts/argonauts.css` instead. The Loenhart faces:

| Face | Package | Role |
|---|---|---|
| Newsreader (variable, optical size) | `@fontsource-variable/newsreader` | headings |
| IBM Plex Sans (variable, weight) | `@fontsource-variable/ibm-plex-sans` | text |
| IBM Plex Mono 400 / 500 | `@fontsource/ibm-plex-mono` | labels, data |

All of them are under the SIL Open Font License 1.1; the licence text ships in
each package. The consumer's bundler copies the woff2 files into its own build,
so fonts are served from the site's own origin. **Nothing loads from a
third-party font CDN** — `npm test` fails on any such URL. Fontsource was
chosen over committing woff2 files here so updates and licence files come from
one maintained source and the website and the app load byte-identical files.

The Argonauts faces are Manrope 400–800 (`@fontsource/manrope`) and Cormorant
Garamond 500–700 (`@fontsource/cormorant-garamond`), in `fonts/argonauts.css`.

## Surfaces

```html
<section class="surface-grid">  <!-- ink + measurement grid: heroes, data -->
<section class="surface-ink">   <!-- plain ink -->
<article class="surface-paper"> <!-- paper: reading, explanation -->
```

Each region restates the scope-dependent tokens, so every primitive inside it
re-colours on its own: a `.card`, `.btn-secondary` or `.field` inside
`.surface-paper` is a paper card, outline and field with no modifier class.

## App primitives

For dense app screens, in the same idiom:

- **Tables** — `.table-scroll` > `table.data-table`; `.num` cells are mono,
  tabular and right-aligned; `.is-dense`, `.has-sticky-first`;
  `tr[aria-selected="true"]` gets the pen edge.
- **Forms** — `.form-row` (`.form-label`, `.form-unit`, `.form-hint`,
  `.form-error`), `.form-grid`, `.form-section` (a fieldset with a pen legend),
  `.form-actions`.
- **Navigation** — `.app-nav` / `.app-nav-brand` / `.app-nav-link`
  (`aria-current="page"` gets the pen underline); `.tabs` / `.tab`
  (`aria-selected`); `.segmented` / `.segment` (`aria-pressed`).
- **Feedback** — `.status-error`, `.status-success`, `.status-info`,
  `.notice-warning`; `.status-dot[data-state]`; `.toast-stack` > `.toast[data-tone]`.
- **Type** — `.label` (mono readout), `.fig-no` (pen figure number), `.lede`,
  `.spec-row`, `.ruled`.
- **A11y** — `.sr-only`, `.skip-link`.

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

**2. Red marks things; it does not fill them.**

Red is the annotation pen: focus rings, markers, figure numbers, error edges.
The one exception is the primary button. The hierarchy is `.btn-primary` (the
one main action) → `.btn-secondary` (the alternative) → `.btn-ghost` (quiet).
In the lab-notebook brand the primary is the pen-red fill and the secondary a
hairline outline; in the original look the primary is blue and the secondary
red. Either way, one `.btn-primary` per view.

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

**6. Contrast is computed, not eyeballed.**

`npm test` computes WCAG AA ratios from the token values for every documented
pair (text on each ink panel, pen on ink and paper, white on the primary
button, status messages, field text and placeholder, focus rings). Change a
colour and the test tells you if a pair dropped below AA.

**7. Motion is optional.**

Under `prefers-reduced-motion: reduce`, `base.css` makes every transition and
animation effectively instant and the primitives drop their hover lifts.

## What is deliberately not here

- **Layout.** Containers, grids and page rhythm stay in each app; they differ too
  much to share usefully.
- **Site chrome.** Marketing headers and footers are per-property; `.app-nav`
  is a starting point for app shells, not a site header.
- **Marketing-only surfaces.** `hero-shell` and `hero-stat` live in the site that
  needs them; the apps do not have heroes.
- **Components.** This ships CSS, not React. The apps are on different framework
  versions, and a shared component library would force them to move together.

## Tests

```bash
npm test
```

Structural guards, no framework and no dependencies: every brand defines the
full surface set and core defines none of them; every token resolves (no
cycles, no dangling `var()`); every `var()` the package reads exists in every
brand; every token the training app references exists (set `CONSUMER_SRC` to a
consumer's `src` directory to scan it live); the legacy class names still
exist; the Argonauts brand still resolves to its own surfaces, type and
buttons; WCAG AA contrast for the documented pairs on ink and on paper;
`.surface-paper` restates every alias that depends on a token it changes; no
third-party URLs or font CDNs; fonts come from declared Fontsource packages;
the grid motif is opt-in; reduced motion is honoured; every interactive
primitive has a focus style; only `base.css` touches global elements; and
text-entry controls are floored at 16px on touch screens.

## Adding a brand

1. Copy `src/tokens/brand-loenhart.css` to `src/tokens/brand-<name>.css`.
2. Change the surfaces. Restate shared-language or component tokens only where
   the brand genuinely differs; anything you leave out keeps core's default.
3. Add a convenience entry point mirroring `src/loenhart.css`.
4. Add the export to `package.json`.
5. `npm test` will fail if the brand is missing any surface token.
