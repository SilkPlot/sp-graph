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
import { schemeTableau10 } from "d3-scale-chromatic";
import { interpolateViridis } from "d3-scale-chromatic";

/** Sample `n` evenly-spaced colors from a sequential interpolator [0, 1]. */
function sampleRamp(interpolator: (t: number) => string, n: number): string[] {
  if (n <= 1) return [interpolator(0.5)];
  return Array.from({ length: n }, (_, i) => interpolator(i / (n - 1)));
}

/** Categorical, CVD-aware series palette (Tableau 10). */
export const categoricalPalette: readonly string[] = [...schemeTableau10];

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
  return lines;
}

/** Render a variant's colour overrides as indented custom-property lines. */
function colorOverrideVars(overrides: ColorOverrides, indent: string): string {
  return Object.entries(overrides)
    .map(([k, v]) => `${indent}${CSS_PREFIX}-color-${kebab(k)}: ${v};`)
    .join("\n");
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
${colorOverrideVars(DARK_COLORS, "    ")}
  }
}

/* Dark — explicit opt-in. Matches any element, so a consumer can theme a
   subtree, not just the document. */
[${THEME_ATTR}="dark"] {
${colorOverrideVars(DARK_COLORS, "  ")}
}

/* Light — explicit opt-in, so a forced-light subtree inside a dark document
   restores light rather than inheriting the surrounding dark. */
[${THEME_ATTR}="light"] {
${colorOverrideVars(LIGHT_COLORS, "  ")}
}

/* ── High contrast (prefers-contrast: more) ─────────────────────────────────
   Each block mirrors a colour-scheme block above — same selector, plus the
   contrast media — and is emitted after all of them. Light-contrast blocks come
   first so a dark-contrast block that ties on specificity wins on source order
   for an element that is dark by attribute under a light OS. */

/* Light high-contrast — root default / forced-light root. */
@media (prefers-contrast: more) {
  :root {
${colorOverrideVars(HIGH_CONTRAST_COLORS, "    ")}
  }
}

/* Light high-contrast — forced-light subtree. */
@media (prefers-contrast: more) {
  [${THEME_ATTR}="light"] {
${colorOverrideVars(HIGH_CONTRAST_COLORS, "    ")}
  }
}

/* Dark high-contrast — OS dark, unless the consumer forces light. */
@media (prefers-color-scheme: dark) and (prefers-contrast: more) {
  :root:not([${THEME_ATTR}="light"]) {
${colorOverrideVars(DARK_HIGH_CONTRAST_COLORS, "    ")}
  }
}

/* Dark high-contrast — explicit dark on any element (document or subtree). */
@media (prefers-contrast: more) {
  [${THEME_ATTR}="dark"] {
${colorOverrideVars(DARK_HIGH_CONTRAST_COLORS, "    ")}
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
`;
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
