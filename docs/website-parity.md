# Website parity

The Loenhart Health website (Astro) implements the lab-notebook direction in
its own stylesheets: `src/styles/global.css`, `forms.css` and `admin.css`. This
package now carries the same values. This note lists what the website should
replace with imports from the package, so the site and the training app read
from one source. It is a follow-up list; nothing here changes the website.

## Import

Replace the five Fontsource imports and the `@theme` block at the top of
`global.css` with:

```css
@import 'tailwindcss';
@import '@loenhart/design/fonts.css';
@import '@loenhart/design/loenhart.css';
@import '@loenhart/design/tailwind.css';
```

The Tailwind bridge exposes the same utility names the site already uses
(`bg-ink`, `text-on-ink-muted`, `border-paper-line`, `text-pen`, `font-serif`,
`font-mono`...), so templates need no edits. Keep the font preloads in the base
layout; they point at the same Fontsource files.

## Value map

| Website (`global.css` `@theme`) | Value | Package token |
|---|---|---|
| `--color-ink` | `#0a1526` | `--ink` (and `--background`) |
| `--color-ink-raised` | `#0f1f37` | `--ink-raised` (and `--panel`, `--card-bg`) |
| `--color-ink-line` | `rgb(214 226 243 / 0.14)` | `--ink-line` (and `--line`) |
| `--color-ink-line-strong` | `rgb(214 226 243 / 0.42)` | `--ink-line-strong` (and `--line-strong`) |
| `--color-on-ink` | `#eef2f8` | `--on-ink` (and `--foreground`) |
| `--color-on-ink-muted` | `#a9b9cd` | `--on-ink-muted` (and `--muted`) |
| `--color-paper` | `#f5f0e7` | `--paper` |
| `--color-paper-raised` | `#fbf8f2` | `--paper-raised` |
| `--color-paper-line` | `rgb(26 34 48 / 0.12)` | `--paper-line` |
| `--color-paper-line-strong` | `rgb(26 34 48 / 0.45)` | `--paper-line-strong` |
| `--color-on-paper` | `#18202d` | `--on-paper` |
| `--color-on-paper-muted` | `#545e6d` | `--on-paper-muted` |
| `--color-pen` | `#e46b78` | `--pen` (and `--brand-red`, `--focus-ring`) |
| `--color-pen-ink` | `#a3303d` | `--pen-ink` (and `--btn-primary-bg`) |
| `.btn-primary:hover` | `#8c2733` | `--pen-ink-hover` |
| `--color-data` | `#6f9fd0` | `--data` (and `--brand-blue-soft`, `--status-ok`) |
| `--color-data-paper` | `#2f5f8f` | `--data-paper` |
| admin amber | `#f5d38f` | `--caution` |
| `--font-serif` | Newsreader Variable | `--font-brand-display` |
| `--font-sans` | IBM Plex Sans Variable | `--font-brand-sans` |
| `--font-mono` | IBM Plex Mono | `--font-brand-mono` (`--font-mono` adds fallbacks) |
| grid line | `rgb(214 226 243 / 0.05)`, 48px | `--ink-grid`, `--grid-size` |
| `.page-title` size | `clamp(2.5rem, 6.4vw, 5.25rem)` | `--text-3xl` |
| `.section-title` size | `clamp(1.85rem, 3.6vw, 2.75rem)` | `--text-2xl` |
| body size | `1.0625rem` | `--text-md` |

## Rules the website can delete

Once the package is imported, these `global.css` rules duplicate it and can go:
`.surface-ink`, `.surface-grid`, `.surface-paper`, `.lede`, `.body-copy`,
`.label`, `.fig-no`, `.pill` (with `::before`), `.text-link`, `.btn-primary`,
`.btn-secondary`, `.card`, `.callout-panel`, `.embed-shell` (including the
`aria-pressed` / `aria-checked` selected state), `.spec-row`, `.ruled`, every
`.surface-paper .x` variant (the package re-colours primitives inside
`.surface-paper` through tokens), `:focus-visible`, and the reduced-motion
block.

From `forms.css`: `.field` (base, hover, focus, placeholder, textarea),
`.list-marker`, `.status-error`, `.status-success`, `.notice-warning`;
`form legend` maps to `.form-section > legend`.

From `admin.css`: the compact control sizes map to `.field-compact` and a
`--btn-*` override in an `.admin` scope; `.admin-note--warning` maps to
`.notice-warning`, `.admin-note--danger` to `.status-error`.

## Keep site-local

- Element styles (`h1`–`h3` serif and weight, `p { text-wrap: pretty }`, body
  font size and line height, `scroll-behavior: smooth`). The package styles
  only `html` and `body` basics, because the app is denser than the site.
- `.page-title` and `.section-title` sizes: the package sets the face, weight
  and tracking but not the size, so the app can size its own headings. Use
  `font-size: var(--text-3xl)` / `var(--text-2xl)` site-side.
- `select.field` chevron, `input[type=file].field`, checkbox `accent-color`,
  and the `.embed-shell.bg-white\/10` bridge for the ported pre-screen. These
  can move into the package later if the app needs them.
- The `.admin-chat` Tailwind bridges.
- `@source` lines for the ported components.

## Differences to resolve

1. **`.meta-copy`.** The site sets it as a mono, uppercase label; the package
   keeps it as muted sentence text, because the app uses it on full sentences
   (helper text, empty states) where uppercase mono would hurt reading. The
   site's readout uses should move to `.label` (same look); then the site can
   drop its `.meta-copy` override.
2. **Field placeholder contrast.** The site's placeholder,
   `rgb(169 185 205 / 0.6)`, measures 3.97:1 on its field. The package uses
   `/ 0.75` (5.48:1). Adopt the package value.
3. **Field boundary on paper.** `--paper-line-strong` (0.45) gives 2.74:1 on
   `--paper-raised`, under the 3:1 non-text minimum for an input boundary. The
   package's `.surface-paper` fields use `rgb(26 34 48 / 0.55)` (3.62:1). The
   site has no paper fields today; use the package's if it adds any.
4. **Desktop field size.** The site's `.field` is `1rem`; the package's is
   `0.95rem` on desktop and floored at 16px on touch. Both meet the touch rule;
   pick one when the site switches.
5. **Focus offset.** The site's global ring is offset 3px with a 2px radius;
   the package uses 3px on primitives and 2px on bare focusable elements.
6. **`.card` position.** The site's `.card` is `position: relative`; the
   package's is not (only `.card-interactive` is). Add it site-side where an
   absolutely positioned child needs it.
