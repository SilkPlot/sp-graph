# The SilkPlot design language

The visual identity of silkplot.com and the SilkPlot brand assets. This file
is the reference the site is styled against; where the site and this file
disagree, one of them has a bug. It governs the **page** — the charts
themselves are governed by `@silkplot/theme`'s tokens and the accessibility
guide, and nothing here overrides either.

## Register

Dark-first, dev-tool voice. The site presents in a dark register by default
because the product's audience lives in dark editors and dashboards — but
dark is the *default*, not the only mode. The theme's four scheme × contrast
combinations remain first-class: the site keeps a visible switcher, and every
page surface must hold in all four, because demonstrating the theming
contract is part of what the site sells.

## The logo

`brand/logo.svg` is the wordmark: eight letters, eight chart families, on a
shared baseline axis — a silk spline S, a lollipop i, a 3D bar l, diverging
trend lines k, a gauge P, a candlestick l, a donut o, and a data crosshair t.
The Silk half is bold ribbon-and-solid; the Plot half is thin chart linework.
`brand/mark.svg` is the S-spline alone, at a heavier stroke: it is the
favicon, the avatar, and the fallback anywhere the full wordmark would not
survive — the wordmark is not legible at 16px and is never scaled below
roughly 200px width.

Both are hand-authored SVG. Edit coordinates; do not trace, rasterize, or
auto-generate replacements. The rendered PNG assets (`og.png`,
`apple-touch-icon.png`) are produced *from* these SVGs and are regenerated,
never edited.

## The hue field

Four brand hues, exposed as custom properties in the site stylesheet:

| Token | Value | Role |
|---|---|---|
| `--sp-brand-violet` | `#8b5cf6` | anchor; axis tint |
| `--sp-brand-cyan` | `#38bdf8` | gradient mid |
| `--sp-brand-teal` | `#2dd4bf` | gradient end |
| `--sp-brand-pink` | `#e879f9` | small accents only (needle, target ring) |

The iridescent violet→cyan→teal gradient is the signature and is used for
identity moments — the logo, hero accents, key interactive states — never
for data. **The categorical chart ramps are untouchable by this document:**
they are accessibility-engineered per surface in `@silkplot/theme`, and the
brand never restyles a mark, a series colour, or an axis inside a chart.
Pure white appears only as glass specular highlights, never as a line.

## The glass material

Panels use the glass recipe, exposed as tokens so every consumer degrades
identically:

```css
background: var(--glass-bg);            /* rgba(255,255,255,.055) */
border: 1px solid var(--glass-edge);    /* rgba(255,255,255,.14)  */
backdrop-filter: blur(var(--glass-blur)) saturate(150%);
border-radius: var(--glass-radius);
box-shadow: var(--glass-highlight);     /* inset top specular     */
```

**Glass is presentation, never information.** Nothing may be communicated by
transparency, blur, or the specular. Under `prefers-contrast: more` or
`prefers-reduced-transparency: reduce` the same tokens resolve to opaque
theme surfaces with a solid border and zero blur — a consumer that styles
against the tokens degrades without writing a media query of its own. Text
on glass must meet the same contrast floor as text on a plain surface, and
that is proven on computed styles in the site's browser tests, not assumed
from the token values.

## Type

Three faces, one job each — all SIL OFL, all self-hosted:

| Stack token | Face | Role |
|---|---|---|
| `--font-display` | Space Grotesk (300–700 variable) | headings, the wordmark's typographic companions |
| `--font-body` | Geist (100–900 variable) | body text |
| `--font-mono` | Geist Mono (100–900 variable) | code, install commands, tabular annotations |

Loading rules, which exist because they supersede a recorded "no web fonts"
stance whose *reason* still binds: the site must never block first paint on
a font. Therefore: latin subsets only (~75KB total for all three), served
from `/fonts/` on the site's own origin (no third-party request), `<link
rel="preload">` for each, and `font-display: swap` so text always paints
immediately in the fallback stack. The fallbacks are the system stacks the
site used before the identity existed. Growing the subset set (more scripts,
italics) is allowed only with the budget restated here.

Licences travel with the files: `site/public/fonts/LICENSES.txt`.

## Motion

Motion is chart-led: the charts moving at their interaction budget are the
animation, and the page around them stays quiet. Page-level motion is
limited to opacity/transform transitions at 200ms or less, and everything
honours `prefers-reduced-motion: reduce` — the same rule the library's own
accessibility guide states for chart surfaces.

## Claims discipline

The identity never outruns the evidence. No performance number appears
anywhere on the site until one is measured under the frozen protocol on
named hardware; the assistive-technology statement is exactly the one in
[the accessibility guide](accessibility.md), never narrowed; and "alpha,
under construction" is stated plainly, because the honesty is the brand.
