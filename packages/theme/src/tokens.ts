/**
 * Design tokens — the single source of truth for SilkPlot's visual language.
 *
 * Tokens are exposed two ways: as a plain typed object (import into TS) and as
 * a CSS string of custom properties (drop into a `<style>`). Palette ramps wrap
 * `d3-scale-chromatic` so branding stays in tokens, not hard-coded in charts.
 *
 * Accessibility is part of the token contract (SR-001):
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
  tokens.categorical.forEach((c, i) => lines.push(`${CSS_PREFIX}-cat-${i}: ${c};`));
  return lines;
}

/**
 * Emit the full token CSS: base `:root` custom properties plus dark,
 * high-contrast, and reduced-motion media overrides.
 */
export function tokensToCss(): string {
  const base = flattenVars()
    .map((l) => `  ${l}`)
    .join("\n");

  return `:root {
${base}
}

/* Dark variant */
@media (prefers-color-scheme: dark) {
  :root {
    ${CSS_PREFIX}-color-surface: #14161a;
    ${CSS_PREFIX}-color-text: #e7eaf0;
    ${CSS_PREFIX}-color-muted: #98a2b3;
    ${CSS_PREFIX}-color-grid: #2a2f3a;
    ${CSS_PREFIX}-color-axis: #667085;
    ${CSS_PREFIX}-color-cursor: #cbd2dd;
  }
}

/* High-contrast variant — stronger separation, brighter focus ring */
@media (prefers-contrast: more) {
  :root {
    ${CSS_PREFIX}-color-text: #000000;
    ${CSS_PREFIX}-color-grid: #000000;
    ${CSS_PREFIX}-color-axis: #000000;
    ${CSS_PREFIX}-color-focus-ring: #0033cc;
  }
}

/* Reduced motion — collapse all timings to instant */
@media (prefers-reduced-motion: reduce) {
  :root {
    ${CSS_PREFIX}-motion-fast: 0ms;
    ${CSS_PREFIX}-motion-base: 0ms;
    ${CSS_PREFIX}-motion-slow: 0ms;
  }
}
`;
}

/** Read a token CSS variable reference, e.g. `cssVar("color-text")`. */
export function cssVar(name: string): string {
  return `var(${CSS_PREFIX}-${name})`;
}
