/**
 * Design tokens — the single source of truth for SilkPlot's visual language.
 *
 * Tokens are exposed two ways: as a plain typed object (import into TS) and as
 * a CSS string of custom properties (drop into a `<style>`). Palette ramps wrap
 * `d3-scale-chromatic` so branding stays in tokens, not hard-coded in charts.
 *
 * Accessibility is part of the token contract:
 *   - categorical series must vary by more than color (stroke/marker/label);
 *   - focus ring and cursor lines target >= 3:1 non-text contrast;
 *   - dark + high-contrast variants are first-class;
 *   - motion honors `prefers-reduced-motion`.
 */
import { interpolateViridis } from "d3-scale-chromatic";

/** Sample `n` evenly-spaced colors from a sequential interpolator [0, 1]. */
function sampleRamp(interpolator: (t: number) => string, n: number): string[] {
  if (n <= 1) return [interpolator(0.5)];
  return Array.from({ length: n }, (_, i) => interpolator(i / (n - 1)));
}

/**
 * ── Categorical series palettes ────────────────────────────────────────────
 *
 * A series line or marker is a MEANINGFUL graphic — its perception is required
 * to read the chart — so it takes the 3:1 non-text contrast floor against the
 * surface it is drawn on (ADR-0005 §5). That single sentence is why there are
 * four palettes here instead of one array.
 *
 * The previous palette was Tableau 10 emitted once on `:root`. Measured against
 * the surfaces it actually renders on, five of its ten colours fail the floor on
 * white — `#edc949` at 1.61:1, `#76b7b2` at 2.29:1, `#ff9da7` at 1.98:1,
 * `#bab0ab` at 2.12:1, `#f28e2c` at 2.42:1. A palette that is legible on one
 * surface and not the other cannot be a single constant, for exactly the reason
 * `HIGH_CONTRAST_COLORS` could not be: contrast is a relationship between a
 * colour and a background, not a property of the colour.
 *
 * So the categorical ramp joins the scheme × contrast cascade the semantic
 * colours already use. All four are derived from the same eight Okabe-Ito hues —
 * a CVD-safe set — scaled toward black (light surfaces) or white (dark surfaces)
 * until each clears its target, so hue identity is preserved across every
 * variant while luminance moves to keep the floor. Targets are 3.5:1 normal
 * (margin over the 3:1 floor) and 5.0:1 under `prefers-contrast: more`.
 *
 * Colour is still never the ONLY channel: `seriesDashPatterns` and
 * `seriesMarkerShapes` carry the same series identity redundantly, and callers
 * are expected to direct-label. See `seriesChannel`.
 */

/** Series palette for a LIGHT surface (#ffffff). Every entry ≥ 3.5:1 on white. */
const CATEGORICAL_LIGHT: readonly string[] = [
  "#b77e00", // orange       3.50:1
  "#4590bb", // sky blue     3.52:1
  "#009c72", // green        3.50:1
  "#928b28", // yellow/olive 3.53:1
  "#0072b2", // blue         5.19:1
  "#d55e00", // vermillion   3.87:1
  "#bd709b", // purple       3.53:1
  "#7f7f7f", // neutral      4.00:1
];

/** Series palette for a DARK surface (#14161a). Every entry ≥ 3.5:1 on dark. */
const CATEGORICAL_DARK: readonly string[] = [
  "#e69f00", //  8.04:1
  "#56b4e9", //  7.85:1
  "#009e73", //  5.29:1
  "#f0e442", // 13.70:1
  "#0173b2", //  3.53:1
  "#d55e00", //  4.68:1
  "#cc79a7", //  5.92:1
  "#7f7f7f", //  4.52:1
];

/** Light surface under `prefers-contrast: more`. Every entry ≥ 5:1 on white. */
const CATEGORICAL_LIGHT_HIGH_CONTRAST: readonly string[] = [
  "#946600", // 5.05:1
  "#387598", // 5.04:1
  "#007f5d", // 5.01:1
  "#777121", // 5.04:1
  "#0072b2", // 5.19:1
  "#b75100", // 5.01:1
  "#9a5b7e", // 5.03:1
  "#6f6f6f", // 5.02:1
];

/** Dark surface under `prefers-contrast: more`. Every entry ≥ 5:1 on dark. */
const CATEGORICAL_DARK_HIGH_CONTRAST: readonly string[] = [
  "#e69f00", //  8.04:1
  "#56b4e9", //  7.85:1
  "#009e73", //  5.29:1
  "#f0e442", // 13.70:1
  "#348fc2", //  5.05:1
  "#d7670e", //  5.03:1
  "#cc79a7", //  5.92:1
  "#878787", //  5.04:1
];

/**
 * The base categorical palette — the light-surface set, because light is the
 * base scheme. The dark and high-contrast sets override it through the cascade.
 */
export const categoricalPalette: readonly string[] = CATEGORICAL_LIGHT;

/**
 * ── Non-colour series channels ─────────────────────────────────────────────
 *
 * "Colour can encode but never uniquely encode" (ADR-0005 §5). These are the
 * redundant channels that make that true: a stroke dash pattern and a marker
 * shape per series index, so a reader who cannot separate two hues can still
 * separate two series. They are deliberately index-aligned with the categorical
 * palettes — `seriesChannel(i)` returns all three together so a caller cannot
 * pick a colour and forget the rest.
 *
 * Dash patterns are `stroke-dasharray` values; index 0 is solid so the common
 * single-series case is not gratuitously dashed. They carry no contrast burden
 * of their own and so are scheme-independent — one set, emitted once.
 */
export const seriesDashPatterns: readonly string[] = [
  "none", // solid
  "6 3",
  "2 3",
  "10 4 2 4",
  "8 3 2 3 2 3",
  "1 4",
  "12 4",
  "4 2 1 2",
];

/** Marker shapes, index-aligned with the categorical palettes. */
export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "cross";

export const seriesMarkerShapes: readonly MarkerShape[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "cross",
  "circle",
  "square",
  "triangle",
];

/** The full, redundant identity of one series: colour AND dash AND shape. */
export interface SeriesChannel {
  /** Series index, wrapped into palette length. */
  index: number;
  /** `var(--sp-cat-N)` — resolves per scheme × contrast through the cascade. */
  color: string;
  /** `var(--sp-cat-dash-N)` — a `stroke-dasharray` value. */
  dash: string;
  /** Marker shape name; pass to `markerPath` to get SVG path data. */
  shape: MarkerShape;
}

/**
 * Every channel that identifies series `i`, as token references rather than
 * literal colours — so a series drawn from this follows the scheme and contrast
 * cascade instead of freezing one surface's palette into the markup.
 *
 * Indices wrap, so a caller with more series than palette entries degrades to
 * repeated colours rather than `undefined`; at that point shape and dash are
 * what still separate them, which is the argument for having them at all.
 */
export function seriesChannel(i: number): SeriesChannel {
  const n = categoricalPalette.length;
  const index = ((i % n) + n) % n;
  return {
    index,
    color: cssVar(`cat-${index}`),
    dash: cssVar(`cat-dash-${index}`),
    shape: seriesMarkerShapes[index % seriesMarkerShapes.length]!,
  };
}

/**
 * SVG path data for a marker of `shape`, centred on (cx, cy) with radius `r`.
 *
 * Shapes are drawn to roughly equal visual weight rather than equal bounding
 * box: a triangle inscribed in the same circle as a square reads noticeably
 * smaller, so it is scaled up. The point of the marker is discriminability, and
 * a shape channel nobody can tell apart is not a channel.
 */
export function markerPath(shape: MarkerShape, cx: number, cy: number, r: number): string {
  switch (shape) {
    case "square": {
      const s = r * 0.89; // equal-area with the circle
      return `M${cx - s},${cy - s}H${cx + s}V${cy + s}H${cx - s}Z`;
    }
    case "triangle": {
      const s = r * 1.35;
      const h = (s * Math.sqrt(3)) / 2;
      return `M${cx},${cy - h * 0.75}L${cx + s},${cy + h * 0.55}H${cx - s}Z`;
    }
    case "diamond": {
      const s = r * 1.25;
      return `M${cx},${cy - s}L${cx + s},${cy}L${cx},${cy + s}L${cx - s},${cy}Z`;
    }
    case "cross": {
      const a = r * 1.3;
      const b = r * 0.42;
      return (
        `M${cx - b},${cy - a}H${cx + b}V${cy - b}H${cx + a}V${cy + b}` +
        `H${cx + b}V${cy + a}H${cx - b}V${cy + b}H${cx - a}V${cy - b}H${cx - b}Z`
      );
    }
    default: {
      // A circle as a path, so every marker is the same element type and a
      // caller can swap shapes without swapping tag names.
      return (
        `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`
      );
    }
  }
}

/** Sequential ramp sampler (Viridis) for heatmaps and continuous encodings. */
export function sequentialRamp(steps: number): string[] {
  return sampleRamp(interpolateViridis, steps);
}

export interface Tokens {
  /** 4px-based spacing scale. */
  space: Record<"xs" | "sm" | "md" | "lg" | "xl", string>;
  /** Corner radii. */
  radius: Record<"sm" | "md" | "lg" | "pill", string>;
  /** Type sizes (chart labels, axis ticks, titles). */
  fontSize: Record<"xs" | "sm" | "md" | "lg", string>;
  /** Motion timings; collapse to 0ms under reduced-motion (see toCss). */
  motion: Record<"fast" | "base" | "slow", string>;
  /** Semantic colors for light mode (overridden for dark/high-contrast in CSS). */
  color: {
    surface: string;
    text: string;
    muted: string;
    grid: string;
    axis: string;
    focusRing: string;
    cursor: string;
  };
  categorical: readonly string[];
}

export const tokens: Tokens = {
  space: { xs: "2px", sm: "4px", md: "8px", lg: "16px", xl: "24px" },
  radius: { sm: "2px", md: "4px", lg: "8px", pill: "9999px" },
  fontSize: { xs: "10px", sm: "11px", md: "13px", lg: "16px" },
  motion: { fast: "120ms", base: "220ms", slow: "400ms" },
  color: {
    surface: "#ffffff",
    text: "#16181d",
    muted: "#5b616e",
    grid: "#e4e7ec",
    axis: "#98a2b3",
    focusRing: "#2563eb",
    cursor: "#475467",
  },
  categorical: categoricalPalette,
};

/** Namespace for the generated CSS custom properties. */
export const CSS_PREFIX = "--sp";

/** Attribute a consumer sets to force a colour scheme: `dark` or `light`. */
export const THEME_ATTR = "data-sp-theme";

/**
 * Colour overrides per variant, declared once and emitted wherever the variant
 * applies. The dark set is rendered into two selectors — the `prefers-color-scheme`
 * media query and the explicit `[data-sp-theme="dark"]` opt-in — and a second copy
 * would eventually drift from this one without anything failing to say so.
 *
 * Values are deliberately unchanged from the original single-selector emission.
 */
type ColorOverrides = Partial<Record<keyof Tokens["color"], string>>;

const DARK_COLORS: ColorOverrides = {
  surface: "#14161a",
  text: "#e7eaf0",
  muted: "#98a2b3",
  grid: "#2a2f3a",
  axis: "#667085",
  cursor: "#cbd2dd",
};

/**
 * Light forced explicitly — the base palette, re-declared so a
 * `[data-sp-theme="light"]` island inside a dark document restores light
 * rather than inheriting the surrounding dark. Generated from `tokens.color`,
 * so it is the same single source as the base `:root`, never a second copy to
 * drift.
 */
const LIGHT_COLORS: ColorOverrides = { ...tokens.color };

/**
 * High contrast on a LIGHT surface. Text/grid/axis go to pure black (21:1 on
 * white) and the focus ring to a saturated blue (8.95:1 on white). This palette
 * is only ever emitted where the resolved scheme is light — see `tokensToCss`.
 */
const HIGH_CONTRAST_COLORS: ColorOverrides = {
  text: "#000000",
  grid: "#000000",
  axis: "#000000",
  focusRing: "#0033cc",
};

/**
 * High contrast on a DARK surface — the palette that was structurally missing.
 * `HIGH_CONTRAST_COLORS` is light-only: its `#000000` text is 21:1 on white but
 * 1.16:1 on the dark surface `#14161a`, i.e. invisible. So dark high-contrast
 * needs its own values, verified against `#14161a`, arranged as a DESCENDING
 * legibility ladder so the ordering itself encodes hierarchy —
 * text > muted > axis ≈ focus > grid — with each rung still clearing its floor:
 *
 *   text        #ffffff  18.11:1  (AAA)
 *   muted       #98a2b3   7.03:1  (INHERITED from DARK_COLORS — not re-declared)
 *   focus       #4d8dff   5.67:1  (non-text ≥ 3:1)
 *   axis        #808a9c   5.20:1  (non-text ≥ 3:1)
 *   grid        #626a7a   3.33:1  (the faintest MEANINGFUL line — below axis,
 *                                  not competing with it)
 *
 * This is a minimal DELTA over `DARK_COLORS`: it overrides ONLY the four rungs
 * that differ, and lets everything else fall through the cascade to dark-normal.
 * `muted` is not listed — the dark-normal `#98a2b3` (7.03:1) already sits exactly
 * one step below primary text, so re-declaring it would be a second place
 * deciding one value; it inherits, the same way `surface` (#14161a) and `cursor`
 * (#cbd2dd, 11.9:1) do. `grid` is promoted from near-invisible decoration to a
 * legible line — a request for MORE contrast is not honoured by a faint gridline
 * — but kept the faintest meaningful rung so it does not fight the axis. `focus`
 * replaces `#0033cc`, only 2.02:1 on dark, below the 3:1 non-text floor exactly
 * when the user asked contrast to go UP.
 */
const DARK_HIGH_CONTRAST_COLORS: ColorOverrides = {
  text: "#ffffff",
  grid: "#626a7a",
  axis: "#808a9c",
  focusRing: "#4d8dff",
};

/** camelCase -> kebab-case so `focusRing` becomes the CSS var `focus-ring`. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function flattenVars(): string[] {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(tokens.space)) lines.push(`${CSS_PREFIX}-space-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(tokens.radius)) lines.push(`${CSS_PREFIX}-radius-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(tokens.fontSize)) lines.push(`${CSS_PREFIX}-font-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(tokens.motion)) lines.push(`${CSS_PREFIX}-motion-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(tokens.color)) lines.push(`${CSS_PREFIX}-color-${kebab(k)}: ${v};`);
  tokens.categorical.forEach((c, i) => {
    lines.push(`${CSS_PREFIX}-cat-${i}: ${c};`);
  });
  seriesDashPatterns.forEach((d, i) => {
    lines.push(`${CSS_PREFIX}-cat-dash-${i}: ${d};`);
  });
  return lines;
}

/** Render a variant's colour overrides as indented custom-property lines. */
function colorOverrideVars(overrides: ColorOverrides, indent: string): string {
  return Object.entries(overrides)
    .map(([k, v]) => `${indent}${CSS_PREFIX}-color-${kebab(k)}: ${v};`)
    .join("\n");
}

/** Render a variant's categorical palette as indented `--sp-cat-N` lines. */
function categoricalVars(palette: readonly string[], indent: string): string {
  return palette.map((c, i) => `${indent}${CSS_PREFIX}-cat-${i}: ${c};`).join("\n");
}

/**
 * One variant's complete colour story: the semantic overrides AND the series
 * palette that has to be legible on the surface those overrides establish.
 *
 * They are emitted together because they are one decision. Emitting the dark
 * surface without the dark series palette is precisely the defect this fixes —
 * a legible background with illegible data drawn on it.
 */
function variantVars(
  colors: ColorOverrides,
  palette: readonly string[],
  indent: string,
): string {
  return `${colorOverrideVars(colors, indent)}\n${categoricalVars(palette, indent)}`;
}

/**
 * The class a consumer puts on any element that can receive keyboard focus, to
 * opt into the library's visible focus treatment.
 */
export const FOCUS_CLASS = "sp-focusable";

/**
 * The visible-focus treatment, as a standalone stylesheet.
 *
 * "Removing the user-agent outline before a proven `:focus-visible` replacement
 * is active is not acceptable" (ADR-0005 §5). This is that replacement, and it
 * is emitted as part of `tokensToCss()` rather than left as an optional import,
 * because the whole ecosystem lesson behind the contract is that optional
 * accessibility ships as absent accessibility.
 *
 * The treatment is an outline plus a halo, and the halo is the part that does
 * the work. `outline-offset` alone leaves the ring sitting directly on whatever
 * the element overlaps — for a chart that is gridlines, series strokes, and
 * axis labels, none of which the ring is guaranteed to contrast against. A
 * `box-shadow` ring of exactly the offset width fills that gap with the SURFACE
 * colour, so the focus ring is always drawn against the one colour the palette
 * guarantees a ratio against: `--sp-color-focus-ring` clears 3:1 on the surface
 * in all four scheme × contrast combinations, and the halo is what makes the
 * surface the actual adjacent colour rather than a coincidence.
 *
 * Three further deliberate choices:
 *
 *  - `outline` is used, not a border or a shadow alone, so the indicator does
 *    not change layout and survives forced-colors mode (where the user agent
 *    repaints outlines and ignores box-shadows — the halo degrades, the ring
 *    does not).
 *  - `:focus:not(:focus-visible)` is the ONLY place `outline: none` appears, and
 *    it can only match when the replacement is already proven present in the
 *    same sheet. There is no bare outline suppression to inherit.
 *  - there is NO transition. An earlier draft eased `outline-color` over
 *    `--sp-motion-fast`, which reduced-motion would have collapsed to `0ms`
 *    correctly — but the browser tests caught what that costs everyone else:
 *    `outline-color` transitions FROM its initial `currentColor`, so for the
 *    first frames after focus the ring is painted in the TEXT colour rather than
 *    the focus colour, and a computed-style read during that window returns
 *    18.11:1 against the dark surface instead of the token's 5.67:1. The ratio
 *    happened to still clear 3:1, which is precisely why this would have
 *    survived review. A focus indicator has nothing to gain from easing and a
 *    correctness guarantee to lose, so it appears instantly, at full contrast,
 *    in the token colour, under every motion preference.
 */
export function focusVisibleCss(): string {
  return `/* ── Visible focus ──────────────────────────────────────────────────────────
   The replacement required before any outline may be removed. */

.${FOCUS_CLASS}:focus-visible {
  outline: 3px solid ${cssVar("color-focus-ring")};
  outline-offset: 2px;
  /* Halo: fills the outline offset with the surface colour, so the ring is
     always adjacent to the colour it is guaranteed to contrast against. */
  box-shadow: 0 0 0 2px ${cssVar("color-surface")};
  border-radius: ${cssVar("radius-sm")};
}

/* The only outline suppression in the sheet, and it cannot apply anywhere the
   rule above has not already provided a replacement. */
.${FOCUS_CLASS}:focus:not(:focus-visible) {
  outline: none;
}
`;
}

/**
 * Emit the full token CSS: base `:root` custom properties plus the colour-scheme,
 * high-contrast, and reduced-motion variants.
 *
 * The design problem this function solves is that scheme and contrast are
 * SEPARATE axes that must resolve as COMBINATIONS. The matrix is
 * {light, dark} × {normal, high-contrast}, and each cell must be reachable
 * through the OS media query, an explicit `[data-sp-theme]`, and a themed
 * subtree. A naïve "one high-contrast block on `:root`" (the previous shape)
 * silently mixes axes: on a dark surface it either discards the contrast request
 * or paints a light-only high-contrast palette (`#000000` text) onto dark, which
 * is invisible. Both are wrong for the same reason — the high-contrast palette
 * has to know which scheme it is contrasting.
 *
 * The structure below makes the combination first-class WITHOUT a specificity
 * war. Each high-contrast block MIRRORS a colour-scheme block: identical
 * selector, plus `and (prefers-contrast: more)`, emitted AFTER every scheme
 * block. Identical selector means identical specificity and the exact same
 * matched elements as its normal twin; later source order means it wins over
 * that twin whenever contrast is active. So the light high-contrast palette can
 * only ever apply where the light scheme applies, and likewise for dark — the
 * increased-contrast preference survives every dark path instead of being
 * dropped or mis-painted.
 *
 * Colour scheme is selectable two ways, because it is a product decision as much
 * as a user preference — an app with its own light/dark toggle must be able to
 * make charts follow it. Contrast and motion are deliberately NOT given that
 * opt-in: they are accessibility preferences the user agent owns (an app
 * overriding `prefers-reduced-motion` would reintroduce motion for someone who
 * asked for less), so they are media-only and never a `data-sp-*` attribute.
 */
export function tokensToCss(): string {
  const base = flattenVars()
    .map((l) => `  ${l}`)
    .join("\n");

  return `:root {
${base}
}

/* ── Colour scheme ──────────────────────────────────────────────────────────
   Light is the base above. Dark is reached three ways and all are generated
   from one source object, so automatic and forced can never disagree. */

/* Dark — follows the user agent unless the consumer forces light. */
@media (prefers-color-scheme: dark) {
  :root:not([${THEME_ATTR}="light"]) {
${variantVars(DARK_COLORS, CATEGORICAL_DARK, "    ")}
  }
}

/* Dark — explicit opt-in. Matches any element, so a consumer can theme a
   subtree, not just the document. */
[${THEME_ATTR}="dark"] {
${variantVars(DARK_COLORS, CATEGORICAL_DARK, "  ")}
}

/* Light — explicit opt-in, so a forced-light subtree inside a dark document
   restores light rather than inheriting the surrounding dark. */
[${THEME_ATTR}="light"] {
${variantVars(LIGHT_COLORS, CATEGORICAL_LIGHT, "  ")}
}

/* ── High contrast (prefers-contrast: more) ─────────────────────────────────
   Each block mirrors a colour-scheme block above — same selector, plus the
   contrast media — and is emitted after all of them. Light-contrast blocks come
   first so a dark-contrast block that ties on specificity wins on source order
   for an element that is dark by attribute under a light OS. */

/* Light high-contrast — root default / forced-light root. */
@media (prefers-contrast: more) {
  :root {
${variantVars(HIGH_CONTRAST_COLORS, CATEGORICAL_LIGHT_HIGH_CONTRAST, "    ")}
  }
}

/* Light high-contrast — forced-light subtree. */
@media (prefers-contrast: more) {
  [${THEME_ATTR}="light"] {
${variantVars(HIGH_CONTRAST_COLORS, CATEGORICAL_LIGHT_HIGH_CONTRAST, "    ")}
  }
}

/* Dark high-contrast — OS dark, unless the consumer forces light. */
@media (prefers-color-scheme: dark) and (prefers-contrast: more) {
  :root:not([${THEME_ATTR}="light"]) {
${variantVars(DARK_HIGH_CONTRAST_COLORS, CATEGORICAL_DARK_HIGH_CONTRAST, "    ")}
  }
}

/* Dark high-contrast — explicit dark on any element (document or subtree). */
@media (prefers-contrast: more) {
  [${THEME_ATTR}="dark"] {
${variantVars(DARK_HIGH_CONTRAST_COLORS, CATEGORICAL_DARK_HIGH_CONTRAST, "    ")}
  }
}

/* Reduced motion — collapse all timings to instant */
@media (prefers-reduced-motion: reduce) {
  :root {
${Object.keys(tokens.motion)
  .map((k) => `    ${CSS_PREFIX}-motion-${kebab(k)}: 0ms;`)
  .join("\n")}
  }
}

${focusVisibleCss()}`;
}

/**
 * Build a token CSS variable reference, e.g. `cssVar("color-text")`.
 *
 * Pass a `fallback` wherever the stylesheet from `tokensToCss()` might not be
 * loaded: `@silkplot/theme` is optional, and a `var()` naming an undefined
 * property is invalid at computed-value time — for an inherited property like
 * `stroke` that silently resolves to the parent's value rather than to nothing
 * visible, which is a hard defect to see and a harder one to attribute.
 */
export function cssVar(name: string, fallback?: string): string {
  const ref = `${CSS_PREFIX}-${name}`;
  return fallback === undefined ? `var(${ref})` : `var(${ref}, ${fallback})`;
}
