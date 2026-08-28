/**
 * Bubble layout — scatter with a numeric size channel, as data.
 *
 * There is no DOM here. Charts paint the marks; they do not re-derive
 * radii or the size-legend ticks. Plotly names this trace "bubble": a
 * scatter whose `marker.size` is a numerical array. Size is the magnitude
 * channel. Series identity is a label (and, at paint time, a marker
 * symbol) so colour cannot uniquely encode.
 *
 * Radius is area-proportional to size. Encoding diameter linearly would
 * make a value twice as large read as four times the magnitude.
 */
import { extentOf } from "./extent";
import { linearScale } from "./scales";
import type { ActivePoint, ActivePointIndex } from "./active-point";

/** One observation. Non-finite x/y/size and non-positive size do not become marks. */
export interface BubbleObservation {
  x: number;
  y: number;
  /** Encoded magnitude. Mapped to marker area, not treated as a pixel size. */
  size: number;
  /** Series identity. Absent → `DEFAULT_BUBBLE_SERIES`. */
  series?: string;
}

/** The public datum a hover, selection, or table row carries. */
export interface BubbleDatum {
  series: string;
  x: number;
  y: number;
  size: number;
}

/** One included point, in data space: no pixels yet. */
export interface BubblePart extends BubbleDatum {
  /** Index into the caller's observation array. */
  sourceIndex: number;
  /** Palette / marker-symbol slot, first-seen series order. */
  seriesIndex: number;
}

export interface ComputeBubbleOptions {
  /** Series label when an observation omits `series`. Default: `"series"`. */
  seriesFallback?: string;
}

export interface ComputedBubble {
  points: readonly BubblePart[];
  /** First-seen series labels, in caller order. */
  series: readonly string[];
  /** Size extent of included points. `[1, 1]` when none survive. */
  sizeDomain: readonly [number, number];
}

export interface LayoutBubbleOptions {
  px: (d: BubblePart) => number;
  py: (d: BubblePart) => number;
  minRadius?: number;
  maxRadius?: number;
}

export interface LayoutBubbleFromObservationsOptions {
  width: number;
  height: number;
  minRadius?: number;
  maxRadius?: number;
  seriesFallback?: string;
}

/** One painted bubble, in inner-plot pixels. */
export interface BubbleMark extends BubblePart {
  px: number;
  py: number;
  /** Pixel radius; area is proportional to `size`. */
  r: number;
}

export interface BubbleLayout {
  marks: readonly BubbleMark[];
  series: readonly string[];
  sizeDomain: readonly [number, number];
  radiusRange: readonly [number, number];
}

export interface BubbleSizeTick {
  size: number;
  r: number;
}

export const DEFAULT_BUBBLE_MIN_RADIUS = 4;
export const DEFAULT_BUBBLE_MAX_RADIUS = 24;
export const DEFAULT_BUBBLE_SERIES = "series";

/** Right-margin floor reserved for the size legend, in px. */
export const BUBBLE_SIZE_LEGEND_RIGHT = 96;

/**
 * Clamp a caller radius range into `[0, ∞)`, swapping if min > max.
 * Absent or non-finite ends take the defaults.
 */
export function resolveBubbleRadiusRange(
  minRadius?: number,
  maxRadius?: number,
): [number, number] {
  const lo =
    minRadius !== undefined && Number.isFinite(minRadius) && minRadius >= 0
      ? minRadius
      : DEFAULT_BUBBLE_MIN_RADIUS;
  const hi =
    maxRadius !== undefined && Number.isFinite(maxRadius) && maxRadius >= 0
      ? maxRadius
      : DEFAULT_BUBBLE_MAX_RADIUS;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

/**
 * Pixel radius for a magnitude, with area proportional to size.
 *
 * Endpoints of `sizeDomain` map to `radiusRange`. Equal sizes, or a
 * collapsed domain, sit at the midpoint of the range.
 */
export function bubbleRadius(
  size: number,
  sizeDomain: readonly [number, number],
  radiusRange: readonly [number, number],
): number {
  const [r0, r1] = radiusRange;
  if (!Number.isFinite(size) || size <= 0) return Number.NaN;
  if (!Number.isFinite(r0) || !Number.isFinite(r1)) return Number.NaN;
  if (r0 === r1) return r0;
  const [d0, d1] = sizeDomain;
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || d0 <= 0 || d1 <= 0 || d0 === d1) {
    return (r0 + r1) / 2;
  }
  const t = (Math.sqrt(size) - Math.sqrt(d0)) / (Math.sqrt(d1) - Math.sqrt(d0));
  return r0 + t * (r1 - r0);
}

function seriesName(observation: BubbleObservation, fallback: string): string {
  const raw = observation.series;
  if (raw === undefined) return fallback;
  return raw;
}

/**
 * Eligible points in caller order, with first-seen series indexes.
 * Non-finite positions and non-positive sizes are dropped.
 */
export function computeBubble(
  observations: readonly BubbleObservation[],
  options: ComputeBubbleOptions = {},
): ComputedBubble {
  const fallback = options.seriesFallback ?? DEFAULT_BUBBLE_SERIES;
  const seriesIndex = new Map<string, number>();
  const series: string[] = [];
  const points: BubblePart[] = [];

  for (let i = 0; i < observations.length; i += 1) {
    const observation = observations[i] as BubbleObservation;
    if (!Number.isFinite(observation.x) || !Number.isFinite(observation.y)) continue;
    if (!Number.isFinite(observation.size) || observation.size <= 0) continue;
    const name = seriesName(observation, fallback);
    let index = seriesIndex.get(name);
    if (index === undefined) {
      index = series.length;
      seriesIndex.set(name, index);
      series.push(name);
    }
    points.push({
      series: name,
      seriesIndex: index,
      x: observation.x,
      y: observation.y,
      size: observation.size,
      sourceIndex: i,
    });
  }

  const sizeDomain: [number, number] =
    points.length === 0 ? [1, 1] : extentOf(points, (d) => d.size);
  return { points, series, sizeDomain };
}

/** Map computed points through pixel accessors and the size→radius scale. */
export function layoutBubble(
  computed: ComputedBubble,
  options: LayoutBubbleOptions,
): BubbleLayout {
  const radiusRange = resolveBubbleRadiusRange(options.minRadius, options.maxRadius);
  const marks: BubbleMark[] = [];
  for (const part of computed.points) {
    const px = options.px(part);
    const py = options.py(part);
    const r = bubbleRadius(part.size, computed.sizeDomain, radiusRange);
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(r) || r <= 0) continue;
    marks.push({ ...part, px, py, r });
  }
  return {
    marks,
    series: computed.series,
    sizeDomain: computed.sizeDomain,
    radiusRange,
  };
}

/**
 * Layout over two linear extent scales. Tests and any consumer that needs
 * pixels without Solid use this; the chart feeds the same compute through
 * `createCartesianModel` so axes and marks share one domain policy.
 */
export function layoutBubbleFromObservations(
  observations: readonly BubbleObservation[],
  options: LayoutBubbleFromObservationsOptions,
): BubbleLayout {
  const computed = computeBubble(observations, { seriesFallback: options.seriesFallback });
  const x = linearScale({
    domain: extentOf(computed.points, (d) => d.x),
    range: [0, options.width],
  });
  const y = linearScale({
    domain: extentOf(computed.points, (d) => d.y),
    range: [options.height, 0],
  });
  return layoutBubble(computed, {
    px: (d) => x(d.x),
    py: (d) => y(d.y),
    minRadius: options.minRadius,
    maxRadius: options.maxRadius,
  });
}

/** Size-legend ticks: the domain ends, and the midpoint when they differ. */
export function bubbleSizeTicks(
  sizeDomain: readonly [number, number],
  radiusRange: readonly [number, number],
): readonly BubbleSizeTick[] {
  const [lo, hi] = sizeDomain;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= 0) return [];
  const sizes = lo === hi ? [lo] : [lo, lo + (hi - lo) / 2, hi];
  return sizes.map((size) => ({
    size,
    r: bubbleRadius(size, sizeDomain, radiusRange),
  }));
}

export function pointInBubble(mark: BubbleMark, px: number, py: number): boolean {
  const dx = px - mark.px;
  const dy = py - mark.py;
  return dx * dx + dy * dy <= mark.r * mark.r;
}

/**
 * Smallest containing bubble, then nearest centroid. A pointer in empty
 * space is a miss — size is a real disk, not a Voronoi cell.
 */
export function locateBubble(marks: readonly BubbleMark[], px: number, py: number): number {
  let found = -1;
  let bestR = Infinity;
  let bestDist = Infinity;
  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i] as BubbleMark;
    if (!pointInBubble(mark, px, py)) continue;
    const dist = (px - mark.px) ** 2 + (py - mark.py) ** 2;
    if (mark.r < bestR || (mark.r === bestR && dist < bestDist)) {
      found = i;
      bestR = mark.r;
      bestDist = dist;
    }
  }
  return found;
}

function toDatum(mark: BubbleMark): BubbleDatum {
  return { series: mark.series, x: mark.x, y: mark.y, size: mark.size };
}

export function createBubbleIndex(
  marks: readonly BubbleMark[],
  seriesId = "bubble",
): ActivePointIndex<BubbleDatum> {
  const at = (ordinal: number): ActivePoint<BubbleDatum> | undefined => {
    if (ordinal < 0 || ordinal >= marks.length) return undefined;
    const mark = marks[ordinal] as BubbleMark;
    return {
      seriesId: mark.series || seriesId,
      sourceIndex: mark.sourceIndex,
      datum: toDatum(mark),
      position: { x: mark.px, y: mark.py },
      at: { kind: "value", x: mark.x, y: mark.y },
    };
  };
  return {
    length: marks.length,
    at,
    locate: (px, py) => locateBubble(marks, px, py),
  };
}
