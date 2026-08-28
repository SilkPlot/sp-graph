/**
 * Histogram layout — bin raw values, then map bins to pixel rects.
 *
 * There is no DOM here. Charts paint the bars; they do not re-derive edges,
 * counts, or density. Binning is `d3-array`'s `bin`, not Plotly autobinx /
 * `xbins` / `histnorm`. Thresholds are explicit (a count of equal-width bins,
 * or interior edges) or D3's default, frozen from the combined sample so
 * every series shares one set of edges.
 *
 * Colour is a render concern. A single series is distinguished by position
 * and length. Multi-series identity is a fill-pattern index plus the series
 * label, so colour cannot uniquely encode.
 */
import { bin as d3Bin } from "d3-array";
import { extentOf } from "./extent";
import { linearScale } from "./scales";
import type { ActivePoint, ActivePointIndex } from "./active-point";
import { SERIES_PALETTE_SIZE } from "./series-style";

/** One raw observation. Non-finite values do not enter a bin. */
export interface HistogramObservation {
  value: number;
  /** Series identity. Absent → `DEFAULT_HISTOGRAM_SERIES`. */
  series?: string;
}

/** The public datum a hover, selection, or table row carries. */
export interface HistogramDatum {
  series: string;
  /** Inclusive left edge of the bin interval. */
  x0: number;
  /** Exclusive right edge, except the last bin which includes `x1`. */
  x1: number;
  count: number;
  /**
   * Probability density: `count / (n × width)` for that series, or `0`
   * when the interval has no width. Integrates to 1 over a series.
   */
  density: number;
}

/** One included bin, in data space: no pixels yet. */
export interface HistogramPart extends HistogramDatum {
  /** Palette / fill-pattern slot, first-seen series order. */
  seriesIndex: number;
  pattern: number;
}

export interface ComputeHistogramOptions {
  /** Series label when an observation omits `series`. Default: `"series"`. */
  seriesFallback?: string;
  /**
   * Equal-width bin count, or explicit interior thresholds for `d3.bin`.
   * Absent → D3's default (Sturges), taken once from the combined sample.
   */
  thresholds?: number | readonly number[];
  /** Binning domain. Absent → extent of finite values. */
  domain?: readonly [number, number];
}

export interface ComputedHistogram {
  bins: readonly HistogramPart[];
  /** First-seen series labels, in caller order. */
  series: readonly string[];
  /** Shared edges, length `binCount + 1`. Empty when nothing was binned. */
  edges: readonly number[];
  /** Finite values that entered a bin, across every series. */
  valueCount: number;
  /** `[first edge, last edge]`, or `[0, 1]` when there are no edges. */
  xDomain: readonly [number, number];
}

export type HistogramValue = "count" | "density";

export interface LayoutHistogramOptions {
  x: (v: number) => number;
  y: (v: number) => number;
  /** Which channel the bar height encodes. Default `"count"`. */
  value?: HistogramValue;
  /** Inner-plot width, used when a collapsed domain would paint zero-width. */
  width: number;
  /** Inner-band padding as a fraction of the bin span. Default 0.05. */
  groupPadding?: number;
}

export interface LayoutHistogramFromObservationsOptions {
  width: number;
  height: number;
  thresholds?: number | readonly number[];
  domain?: readonly [number, number];
  value?: HistogramValue;
  seriesFallback?: string;
  groupPadding?: number;
}

/** One painted bar, in inner-plot pixels. */
export interface HistogramBar extends HistogramPart {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HistogramLayout {
  marks: readonly HistogramBar[];
  series: readonly string[];
  edges: readonly number[];
  xDomain: readonly [number, number];
}

export const DEFAULT_HISTOGRAM_SERIES = "series";
export const HISTOGRAM_PATTERN_COUNT = SERIES_PALETTE_SIZE;
export const HISTOGRAM_GROUP_PADDING = 0.05;

/** Wrap an index into the pattern catalog, including negatives. */
export function histogramPatternIndex(i: number): number {
  return ((i % HISTOGRAM_PATTERN_COUNT) + HISTOGRAM_PATTERN_COUNT) % HISTOGRAM_PATTERN_COUNT;
}

/**
 * Interior thresholds for `n` equal-width bins over `domain`.
 *
 * `d3.bin` takes interior edges, not the domain ends. A count below 1, a
 * non-finite count, or a collapsed domain yields no interiors (one bin).
 */
export function histogramThresholds(
  domain: readonly [number, number],
  bins: number,
): number[] {
  if (!Number.isFinite(bins) || bins < 1) return [];
  const n = Math.floor(bins);
  const [lo, hi] = domain;
  if (!(hi > lo) || n === 1) return [];
  const step = (hi - lo) / n;
  const thresholds: number[] = [];
  for (let i = 1; i < n; i += 1) thresholds.push(lo + i * step);
  return thresholds;
}

/** Probability density for one bin. Zero-width intervals are 0, not Infinity. */
export function histogramDensity(count: number, n: number, x0: number, x1: number): number {
  if (!(count > 0) || !(n > 0)) return 0;
  const width = x1 - x0;
  if (!(width > 0)) return 0;
  return count / (n * width);
}

/** The encoded bar height: count, or density when that channel is drawn. */
export function histogramEncoded(part: HistogramDatum, value?: HistogramValue): number {
  return value === "density" ? part.density : part.count;
}

interface Eligible {
  value: number;
  series: string;
}

interface SeriesBucket {
  name: string;
  values: number[];
}

function seriesName(observation: HistogramObservation, fallback: string): string {
  return observation.series === undefined ? fallback : observation.series;
}

function eligibleOf(
  observations: readonly HistogramObservation[],
  fallback: string,
): Eligible[] {
  const eligible: Eligible[] = [];
  for (const observation of observations) {
    if (!Number.isFinite(observation.value)) continue;
    eligible.push({ value: observation.value, series: seriesName(observation, fallback) });
  }
  return eligible;
}

function bucketsOf(eligible: readonly Eligible[]): SeriesBucket[] {
  const index = new Map<string, SeriesBucket>();
  const buckets: SeriesBucket[] = [];
  for (const item of eligible) {
    let bucket = index.get(item.series);
    if (bucket === undefined) {
      bucket = { name: item.series, values: [] };
      index.set(item.series, bucket);
      buckets.push(bucket);
    }
    bucket.values.push(item.value);
  }
  return buckets;
}

function resolveDomain(
  values: readonly number[],
  explicit: readonly [number, number] | undefined,
): [number, number] | undefined {
  if (explicit !== undefined) {
    const lo = explicit[0];
    const hi = explicit[1];
    if (Number.isFinite(lo) && Number.isFinite(hi)) return lo <= hi ? [lo, hi] : [hi, lo];
  }
  if (values.length === 0) return undefined;
  return extentOf(values, (v) => v);
}

function interiorOf(
  values: readonly number[],
  domain: readonly [number, number],
  thresholds: number | readonly number[] | undefined,
): number[] {
  if (typeof thresholds === "number") return histogramThresholds(domain, thresholds);
  if (thresholds !== undefined) return [...thresholds];
  const probe = d3Bin<number, number>()
    .domain([domain[0], domain[1]])
    .value((d) => d)(values as number[]);
  const interior: number[] = [];
  for (let i = 0; i < probe.length - 1; i += 1) {
    const edge = probe[i]?.x1;
    if (edge !== undefined && Number.isFinite(edge)) interior.push(edge);
  }
  return interior;
}

function binSeries(
  values: readonly number[],
  domain: readonly [number, number],
  interior: readonly number[],
): { x0: number; x1: number; count: number }[] {
  const generator = d3Bin<number, number>()
    .domain([domain[0], domain[1]])
    .value((d) => d)
    .thresholds([...interior]);
  const bins = generator(values as number[]);
  const out: { x0: number; x1: number; count: number }[] = [];
  for (const bin of bins) {
    const x0 = bin.x0;
    const x1 = bin.x1;
    if (x0 === undefined || x1 === undefined || !Number.isFinite(x0) || !Number.isFinite(x1)) {
      continue;
    }
    out.push({ x0, x1, count: bin.length });
  }
  return out;
}

/**
 * Eligible values in caller series-order, binned onto shared D3 edges.
 * Non-finite values are dropped. Empty input yields no bins.
 */
export function computeHistogram(
  observations: readonly HistogramObservation[],
  options: ComputeHistogramOptions = {},
): ComputedHistogram {
  const fallback = options.seriesFallback ?? DEFAULT_HISTOGRAM_SERIES;
  const eligible = eligibleOf(observations, fallback);
  const values = eligible.map((item) => item.value);
  const domain = resolveDomain(values, options.domain);
  if (domain === undefined || eligible.length === 0) {
    return { bins: [], series: [], edges: [], valueCount: 0, xDomain: [0, 1] };
  }

  const buckets = bucketsOf(eligible);
  const interior = interiorOf(values, domain, options.thresholds);
  const parts: HistogramPart[] = [];
  const series: string[] = [];

  for (let seriesIndex = 0; seriesIndex < buckets.length; seriesIndex += 1) {
    const bucket = buckets[seriesIndex] as SeriesBucket;
    series.push(bucket.name);
    const n = bucket.values.length;
    const binned = binSeries(bucket.values, domain, interior);
    const pattern = histogramPatternIndex(seriesIndex);
    for (const bin of binned) {
      parts.push({
        series: bucket.name,
        seriesIndex,
        pattern,
        x0: bin.x0,
        x1: bin.x1,
        count: bin.count,
        density: histogramDensity(bin.count, n, bin.x0, bin.x1),
      });
    }
  }

  const first = parts[0];
  const last = parts[parts.length - 1];
  const edges: number[] =
    first === undefined || last === undefined
      ? []
      : [
          first.x0,
          ...parts
            .filter((part) => part.seriesIndex === 0)
            .map((part) => part.x1),
        ];
  const xDomain: [number, number] =
    edges.length < 2 ? [0, 1] : [edges[0] as number, edges[edges.length - 1] as number];

  return { bins: parts, series, edges, valueCount: eligible.length, xDomain };
}

function groupSlot(
  span: number,
  seriesIndex: number,
  seriesCount: number,
  padding: number,
): { start: number; size: number } {
  if (seriesCount <= 1 || !(span > 0)) return { start: 0, size: span };
  const gap = padding * span;
  const inner = Math.max(0, span - gap);
  const size = inner / seriesCount;
  return { start: gap / 2 + seriesIndex * size, size };
}

/** Map computed bins through pixel accessors. Zero-count bins produce no mark. */
export function layoutHistogram(
  computed: ComputedHistogram,
  options: LayoutHistogramOptions,
): HistogramLayout {
  const padding = options.groupPadding ?? HISTOGRAM_GROUP_PADDING;
  const seriesCount = computed.series.length;
  const marks: HistogramBar[] = [];

  for (const part of computed.bins) {
    if (!(part.count > 0)) continue;
    const encoded = histogramEncoded(part, options.value);
    const x0 = options.x(part.x0);
    const x1 = options.x(part.x1);
    if (!Number.isFinite(x0) || !Number.isFinite(x1)) continue;
    let left = Math.min(x0, x1);
    let span = Math.abs(x1 - x0);
    if (!(span > 0) && options.width > 0) {
      left = 0;
      span = options.width;
    }
    const slot = groupSlot(span, part.seriesIndex, seriesCount, padding);
    const y0 = options.y(0);
    const y1 = options.y(encoded);
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    const top = Math.min(y0, y1);
    const height = Math.abs(y1 - y0);
    const width = slot.size;
    if (!(width > 0)) continue;
    marks.push({
      ...part,
      x: left + slot.start,
      y: top,
      width,
      height,
    });
  }

  return {
    marks,
    series: computed.series,
    edges: computed.edges,
    xDomain: computed.xDomain,
  };
}

function zeroBaseline(extent: readonly [number, number]): [number, number] {
  return [Math.min(0, extent[0]), Math.max(0, extent[1])];
}

/**
 * Layout over a linear x (bin edges, not niced) and a zero-baseline y.
 * Tests and any consumer that needs pixels without Solid use this; the
 * chart feeds the same compute through `createCartesianModel`.
 */
export function layoutHistogramFromObservations(
  observations: readonly HistogramObservation[],
  options: LayoutHistogramFromObservationsOptions,
): HistogramLayout {
  const computed = computeHistogram(observations, {
    seriesFallback: options.seriesFallback,
    thresholds: options.thresholds,
    domain: options.domain,
  });
  const x = linearScale({
    domain: computed.xDomain,
    range: [0, options.width],
    nice: false,
  });
  const y = linearScale({
    domain: zeroBaseline(extentOf(computed.bins, (d) => histogramEncoded(d, options.value))),
    range: [options.height, 0],
  });
  return layoutHistogram(computed, {
    x,
    y,
    value: options.value,
    width: options.width,
    groupPadding: options.groupPadding,
  });
}

export function pointInHistogramBar(bar: HistogramBar, px: number, py: number): boolean {
  return px >= bar.x && px < bar.x + bar.width && py >= bar.y && py < bar.y + bar.height;
}

/** Point-in-rect locate over already-laid-out bars. Empty space is a miss. */
export function locateHistogramBar(marks: readonly HistogramBar[], px: number, py: number): number {
  for (let i = 0; i < marks.length; i += 1) {
    if (pointInHistogramBar(marks[i] as HistogramBar, px, py)) return i;
  }
  return -1;
}

function toDatum(part: HistogramPart): HistogramDatum {
  return {
    series: part.series,
    x0: part.x0,
    x1: part.x1,
    count: part.count,
    density: part.density,
  };
}

/**
 * Active-point index over laid-out bars. Pointer and keyboard share the
 * same ordinal, the same way the other families do.
 */
export function createHistogramIndex(
  marks: readonly HistogramBar[],
  seriesId = "histogram",
  value?: HistogramValue,
): ActivePointIndex<HistogramDatum> {
  const at = (ordinal: number): ActivePoint<HistogramDatum> | undefined => {
    if (ordinal < 0 || ordinal >= marks.length) return undefined;
    const mark = marks[ordinal] as HistogramBar;
    return {
      seriesId: mark.series || seriesId,
      sourceIndex: ordinal,
      datum: toDatum(mark),
      position: { x: mark.x + mark.width / 2, y: mark.y + mark.height / 2 },
      at: { kind: "value", x: (mark.x0 + mark.x1) / 2, y: histogramEncoded(mark, value) },
    };
  };
  return {
    length: marks.length,
    at,
    locate: (px, py) => locateHistogramBar(marks, px, py),
  };
}
