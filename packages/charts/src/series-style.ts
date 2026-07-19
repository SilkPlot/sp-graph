/**
 * Per-series presentation — which colour and which dash pattern series `i` gets
 * when the caller supplies none.
 *
 * ## Why this does not import `@silkplot/theme`
 *
 * The theme package already computes exactly this, as `seriesChannel(i)`. This
 * file does not call it, and that is a deliberate application of "prefer a
 * contract to a dependency": the seam between a chart and its theme is the CSS
 * CUSTOM PROPERTY, not a function import. A chart that imported the theme to
 * learn a colour would drag the palette tables, the contrast machinery, and
 * `d3-scale-chromatic` into the bundle of every consumer who wanted a line —
 * to obtain a string it can write directly. Bundle size is a budget, and the
 * whole point of resolving colour through custom properties is that the chart
 * never needs to know what the colour IS.
 *
 * What that leaves is one genuinely shared fact — how many entries the palette
 * has, which sets where indices wrap. That is duplicated here, and duplication
 * is exactly what silently diverges. So it is pinned by a test that DOES import
 * the theme (a devDependency, absent from the shipped bundle) and asserts these
 * constants still agree with it. The production path keeps the contract; the
 * test keeps them honest. See `series-style.test.tsx`.
 *
 * ## Why indices wrap rather than run out
 *
 * A 22-series chart is a stated requirement and the palette holds eight. Wrapping
 * gives repeated colours; NOT wrapping gives `var(--sp-cat-19)`, which resolves
 * to nothing and falls back to `currentColor` — turning fourteen series into one
 * indistinguishable colour. Repetition is recoverable because the dash pattern
 * and the caller's own labels still separate them; an unresolved token is not.
 */

/**
 * Entries in the theme's categorical palette. Mirrors `categoricalPalette.length`
 * and is pinned to it by test rather than by import — see the note above.
 */
export const SERIES_PALETTE_SIZE = 8;

/** Dash patterns available. Index 0 is solid, so a single series is not gratuitously dashed. */
export const SERIES_DASH_COUNT = 8;

export interface ResolvedSeriesStyle {
  stroke: string;
  strokeWidth: number;
  /** `stroke-dasharray` value, or undefined when the series is solid. */
  dash: string | undefined;
  /** Fill colour for an area mark. Undefined means the series draws no fill. */
  fill: string | undefined;
  fillOpacity: number;
}

/** Wrap an index into a palette, tolerating negatives. */
function wrap(i: number, size: number): number {
  return ((i % size) + size) % size;
}

/**
 * The token reference for series `i`'s colour.
 *
 * Written as a `var()` reference rather than a literal so the series follows the
 * scheme × contrast cascade (ADR-0004) instead of freezing one surface's palette
 * into the markup. The `currentColor` fallback matters for a consumer who ships
 * no theme at all: they get a visible chart in the inherited colour rather than
 * an invisible one.
 */
export function seriesColorToken(i: number): string {
  return `var(--sp-cat-${wrap(i, SERIES_PALETTE_SIZE)}, currentColor)`;
}

/**
 * The token reference for series `i`'s dash pattern.
 *
 * The redundant non-colour channel ADR-0005 §5 requires: "colour can encode but
 * never uniquely encode". Two series a colour-blind reader cannot separate by
 * hue are still separable by dash. Index 0 resolves to `none`, so the ordinary
 * single-series chart is solid.
 */
export function seriesDashToken(i: number): string {
  return `var(--sp-cat-dash-${wrap(i, SERIES_DASH_COUNT)}, none)`;
}

/**
 * Resolve one series' presentation: the caller's style wins, per property, over
 * the index-derived default.
 *
 * Per PROPERTY rather than per object, so a caller who sets only `stroke` keeps
 * the dash channel that makes their chart readable without colour. Taking the
 * whole object as an override would silently discard the accessibility channel
 * the moment anyone picked a brand colour, which is the most likely thing a
 * caller does.
 */
export function resolveSeriesStyle(
  style: {
    stroke?: string;
    strokeWidth?: number;
    dash?: readonly number[];
    fill?: string;
  } | undefined,
  index: number,
  options: { area: boolean; fillOpacity?: number } = { area: false },
): ResolvedSeriesStyle {
  const stroke = style?.stroke ?? seriesColorToken(index);
  return {
    stroke,
    strokeWidth: style?.strokeWidth ?? 1.5,
    dash: style?.dash === undefined ? seriesDashToken(index) : style.dash.join(" "),
    // An area fill defaults to the series' own stroke colour, so the fill and
    // the line it sits under cannot disagree about which series they belong to.
    // A non-area chart gets no fill at all rather than a transparent one — an
    // element that paints nothing is still an element to lay out and hit-test.
    fill: options.area ? (style?.fill ?? stroke) : undefined,
    fillOpacity: options.fillOpacity ?? 0.2,
  };
}
