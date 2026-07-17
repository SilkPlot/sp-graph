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

const HIGH_CONTRAST_COLORS: ColorOverrides = {
  text: "#000000",
  grid: "#000000",
  axis: "#000000",
  focusRing: "#0033cc",
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
 * Emit the full token CSS: base `:root` custom properties plus the dark,
 * high-contrast, and reduced-motion variants.
 *
 * Colour scheme is selectable two ways, because it is a product decision as
 * much as a user preference — an app with its own light/dark toggle must be
 * able to make charts follow it, and the only alternative would be for every
 * such consumer to restate this palette in their own stylesheet.
 *
 * Contrast and motion are deliberately NOT given the same opt-in. They are
 * accessibility preferences the user agent owns: an app overriding
 * `prefers-reduced-motion` would be reintroducing motion for someone who asked
 * for less of it. They follow the user, and nothing else.
 */
export function tokensToCss(): string {
  const base = flattenVars()
    .map((l) => `  ${l}`)
    .join("\n");

  return `:root {
${base}
}

/* Dark variant — follows the user agent unless the consumer forces light. */
@media (prefers-color-scheme: dark) {
  :root:not([${THEME_ATTR}="light"]) {
${colorOverrideVars(DARK_COLORS, "    ")}
  }
}

/* Dark variant — explicit opt-in. Matches any element, so a consumer can theme
   a subtree, not just the document. */
[${THEME_ATTR}="dark"] {
${colorOverrideVars(DARK_COLORS, "  ")}
}

/* High-contrast variant — stronger separation, brighter focus ring */
@media (prefers-contrast: more) {
  :root {
${colorOverrideVars(HIGH_CONTRAST_COLORS, "    ")}
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
