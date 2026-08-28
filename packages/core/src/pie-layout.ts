/**
 * Pie layout — polar part-to-whole, as data.
 *
 * There is no DOM here. Charts paint the slices; they do not re-derive angles,
 * percents, or the hole. Donut is this same layout with a hole: Plotly `hole`
 * in (0, 1] cuts an inner radius, and `hole` 0 is a pie.
 *
 * Colour is a render concern. The non-colour channels are a fill-pattern index
 * (aligned with the categorical palette) and the slice label, so colour cannot
 * uniquely encode.
 */
import { pie as d3Pie, arc as d3Arc } from "d3-shape";
import type { ActivePoint, ActivePointIndex } from "./active-point";
import { SERIES_PALETTE_SIZE } from "./series-style";

/** One observation. Non-positive and non-finite values do not become slices. */
export interface PieObservation {
  label: string;
  value: number;
}

/** The public datum a hover, selection, or table row carries. */
export interface PieDatum {
  label: string;
  value: number;
  /** Share of the included total, in `[0, 1]`. */
  percent: number;
}

/**
 * One included slice, in data space: angles and percent, no pixels.
 *
 * Angles are radians, 0 at 12 o'clock, increasing clockwise — d3-shape's
 * convention, which is also Plotly's default start.
 */
export interface PiePart extends PieDatum {
  /** Index into the caller's observation array (ADR-0008 §5). */
  sourceIndex: number;
  startAngle: number;
  endAngle: number;
  /** Fill-pattern slot, wrapped into `PIE_PATTERN_COUNT`. */
  pattern: number;
}

export interface LayoutPieOptions {
  width: number;
  height: number;
  /**
   * Plotly `hole`: fraction of the outer radius to cut out.
   * `0` (default) is a pie; `(0, 1]` is a donut. Non-finite and negative
   * values collapse to 0; values above 1 clamp to 1.
   */
  hole?: number;
}

/** One painted slice, in inner-plot pixels. Path `d` is centred at (0, 0). */
export interface PieSlice extends PiePart {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  centroid: { x: number; y: number };
  d: string;
}

export interface PieLayout {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  hole: number;
  slices: readonly PieSlice[];
}

/** Pattern slots; matches the categorical palette so colour and pattern wrap together. */
export const PIE_PATTERN_COUNT = SERIES_PALETTE_SIZE;

/** Default Plotly-style donut hole when the donut view is given no `hole`. */
export const DEFAULT_DONUT_HOLE = 0.5;

const TAU = Math.PI * 2;
const FULL_SLICE = TAU - 1e-12;

interface Eligible {
  label: string;
  value: number;
  sourceIndex: number;
}

/** Wrap an index into the pattern catalog, including negatives. */
export function piePatternIndex(i: number): number {
  return ((i % PIE_PATTERN_COUNT) + PIE_PATTERN_COUNT) % PIE_PATTERN_COUNT;
}

/**
 * Clamp a Plotly `hole` into `[0, 1]`. Absent, non-finite, or negative → 0 (pie).
 */
export function pieHole(hole: number | undefined): number {
  if (hole === undefined || !Number.isFinite(hole) || hole <= 0) return 0;
  return hole > 1 ? 1 : hole;
}

/**
 * Hole for the named donut view: `(0, 1]`, default `DEFAULT_DONUT_HOLE`.
 * `0` and absent are not a donut, so they take the default rather than becoming a pie.
 */
export function resolveDonutHole(hole: number | undefined): number {
  const clamped = pieHole(hole);
  return clamped > 0 ? clamped : DEFAULT_DONUT_HOLE;
}

function eligibleOf(observations: readonly PieObservation[]): Eligible[] {
  const eligible: Eligible[] = [];
  for (let i = 0; i < observations.length; i += 1) {
    const observation = observations[i] as PieObservation;
    if (!Number.isFinite(observation.value) || observation.value <= 0) continue;
    eligible.push({
      label: observation.label,
      value: observation.value,
      sourceIndex: i,
    });
  }
  return eligible;
}

/**
 * Include only positive finite values, in caller order. Percents sum to 1.
 *
 * d3-pie's default value-sort is disabled: order is the caller's, the same
 * rule ranked categories already keep. Zero-angle leftovers are dropped
 * before the generator runs, so they never become keyboard or hover targets.
 */
export function computePie(observations: readonly PieObservation[]): readonly PiePart[] {
  const eligible = eligibleOf(observations);
  let total = 0;
  for (const item of eligible) total += item.value;
  if (!(total > 0)) return [];

  const arcs = d3Pie<Eligible>()
    .value((d) => d.value)
    .sortValues(null)(eligible);

  const parts: PiePart[] = [];
  for (let i = 0; i < arcs.length; i += 1) {
    const arc = arcs[i];
    if (arc === undefined) continue;
    parts.push({
      label: arc.data.label,
      value: arc.data.value,
      percent: arc.data.value / total,
      sourceIndex: arc.data.sourceIndex,
      startAngle: arc.startAngle,
      endAngle: arc.endAngle,
      pattern: piePatternIndex(i),
    });
  }
  return parts;
}

function pieRadii(options: LayoutPieOptions): {
  cx: number;
  cy: number;
  hole: number;
  innerRadius: number;
  outerRadius: number;
} {
  const hole = pieHole(options.hole);
  const cx = options.width / 2;
  const cy = options.height / 2;
  const outerRadius = Math.max(0, Math.min(options.width, options.height) / 2);
  return { cx, cy, hole, outerRadius, innerRadius: hole * outerRadius };
}

/**
 * Map computed parts onto a plot rectangle. Donut vs pie is only `hole`.
 */
export function layoutPie(parts: readonly PiePart[], options: LayoutPieOptions): PieLayout {
  const { cx, cy, hole, innerRadius, outerRadius } = pieRadii(options);
  const generator = d3Arc<PiePart>()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius)
    .startAngle((d) => d.startAngle)
    .endAngle((d) => d.endAngle);

  const slices: PieSlice[] = [];
  for (const part of parts) {
    const d = generator(part) ?? "";
    const [mx, my] = generator.centroid(part);
    slices.push({
      ...part,
      cx,
      cy,
      innerRadius,
      outerRadius,
      centroid: { x: cx + (mx ?? 0), y: cy + (my ?? 0) },
      d,
    });
  }
  return { cx, cy, innerRadius, outerRadius, hole, slices };
}

/** Compute then layout in one step — what a chart paints. */
export function layoutPieFromObservations(
  observations: readonly PieObservation[],
  options: LayoutPieOptions,
): PieLayout {
  return layoutPie(computePie(observations), options);
}

/** Angle in d3-arc space: 0 at 12 o'clock, clockwise, in `[0, 2π)`. */
export function piePointAngle(dx: number, dy: number): number {
  // `atan2(+0, -0)` is π. The pie origin is not 6 o'clock; pin it to 12.
  if (dx === 0 && dy === 0) return 0;
  const angle = Math.atan2(dx, -dy);
  return angle < 0 ? angle + TAU : angle;
}

export function angleInSlice(angle: number, start: number, end: number): boolean {
  if (end - start >= FULL_SLICE) return true;
  let wrapped = angle;
  if (wrapped < start) wrapped += TAU;
  return wrapped >= start && wrapped < end;
}

export function pointInPieSlice(slice: PieSlice, px: number, py: number): boolean {
  if (!(slice.outerRadius > slice.innerRadius)) return false;
  const dx = px - slice.cx;
  const dy = py - slice.cy;
  const radius = Math.hypot(dx, dy);
  if (radius < slice.innerRadius || radius > slice.outerRadius) return false;
  return angleInSlice(piePointAngle(dx, dy), slice.startAngle, slice.endAngle);
}

/** Point-in-sector locate over already-laid-out slices. The hole is a miss. */
export function locatePieSlice(slices: readonly PieSlice[], px: number, py: number): number {
  for (let i = 0; i < slices.length; i += 1) {
    if (pointInPieSlice(slices[i] as PieSlice, px, py)) return i;
  }
  return -1;
}

/**
 * Active-point index over laid-out slices. Pointer and keyboard share the
 * same ordinal, the same way the other families do.
 */
export function createPieIndex(
  slices: readonly PieSlice[],
  seriesId = "pie",
): ActivePointIndex<PieDatum> {
  const at = (ordinal: number): ActivePoint<PieDatum> | undefined => {
    if (ordinal < 0 || ordinal >= slices.length) return undefined;
    const slice = slices[ordinal] as PieSlice;
    return {
      seriesId,
      sourceIndex: slice.sourceIndex,
      datum: { label: slice.label, value: slice.value, percent: slice.percent },
      position: { x: slice.centroid.x, y: slice.centroid.y },
      at: { kind: "category", category: slice.label },
    };
  };
  return {
    length: slices.length,
    at,
    locate: (px, py) => locatePieSlice(slices, px, py),
  };
}
