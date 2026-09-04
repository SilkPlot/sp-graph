/**
 * Scales — thin, typed wrappers over `d3-scale`.
 *
 * These are compute-only: a scale maps a data value to a pixel position (and
 * back). No DOM, no Solid. Consumers build a scale from a domain + range and
 * call it as a function, exactly as with d3, but with SilkPlot-friendly names
 * and narrowed types.
 *
 * D3 computes, Solid renders — a scale is pure computation.
 */
import {
  scaleLinear as d3ScaleLinear,
  scaleTime as d3ScaleTime,
  scaleBand as d3ScaleBand,
  scaleOrdinal as d3ScaleOrdinal,
} from "d3-scale";
import type {
  ScaleLinear,
  ScaleTime,
  ScaleBand,
  ScaleOrdinal,
} from "d3-scale";

export type { ScaleLinear, ScaleTime, ScaleBand, ScaleOrdinal };

/** Any continuous scale we can compute ticks from (linear or time). */
export type ContinuousScale = ScaleLinear<number, number> | ScaleTime<number, number>;

/**
 * A continuous scale's two-point affine form, when it has one.
 *
 * d3's linear and time scales map `v` as `r0 * (1 - t) + r1 * t` with
 * `t = (v - d0) / (d1 - d0)`, through a chain of closures (`normalize`,
 * `bimap`, `interpolateNumber`) that costs several calls per point. A dense
 * series re-maps every point on every viewport commit, and that chain was
 * the single largest per-frame cost the 2026-09-04 traces attributed. The
 * mapper below evaluates the same expression, in the same operation order so
 * the result is bit-identical, with no calls.
 *
 * Undefined when the scale is not a plain two-point affine map: clamped,
 * piecewise (more than two domain or range values), logarithmic or power,
 * a degenerate domain, or anything else that fails the self-check against
 * the scale itself. Callers fall back to calling the scale.
 */
export function affineOf(
  scale: ContinuousScale,
): { d0: number; d1: number; r0: number; r1: number } | undefined {
  const domain = scale.domain();
  const range = scale.range();
  if (domain.length !== 2 || range.length !== 2) return undefined;
  if (scale.clamp()) return undefined;
  const probe = scale as unknown as { base?: unknown; exponent?: unknown };
  if (typeof probe.base === "function" || typeof probe.exponent === "function") {
    return undefined;
  }
  const d0 = +domain[0]!;
  const d1 = +domain[1]!;
  const r0 = +range[0]!;
  const r1 = +range[1]!;
  if (![d0, d1, r0, r1].every(Number.isFinite) || d1 === d0) return undefined;
  const map = (v: number): number => {
    const t = (v - d0) / (d1 - d0);
    return r0 * (1 - t) + r1 * t;
  };
  const mid = (d0 + d1) / 2;
  const call = scale as unknown as (v: number) => number;
  if (map(d0) !== call(d0) || map(d1) !== call(d1) || map(mid) !== call(mid)) {
    return undefined;
  }
  return { d0, d1, r0, r1 };
}

/**
 * `v => scale(v)` as a plain function: the affine expression when `affineOf`
 * finds one, otherwise the scale itself. Accepts the number a time scale's
 * `Date` coerces to, so a caller passes `date.getTime()` and skips d3's
 * per-call coercion as well.
 */
export function affineMapper(scale: ContinuousScale): (v: number) => number {
  const affine = affineOf(scale);
  const call = scale as unknown as (v: number) => number;
  if (affine === undefined) return (v) => call(v);
  const { d0, d1, r0, r1 } = affine;
  const span = d1 - d0;
  // d3 answers `null`, `undefined`, and anything that is NaN once coerced
  // with the scale's `unknown` value (undefined by default) rather than a
  // number. A gap datum's null y relies on that: coerce it to zero instead
  // and the "gap" is drawn as a spike to the baseline. Same rule here.
  const unknown = scale.unknown() as unknown as number;
  return (v) => {
    if (v == null) return unknown;
    const n = +v;
    if (Number.isNaN(n)) return unknown;
    const t = (n - d0) / span;
    return r0 * (1 - t) + r1 * t;
  };
}

export interface LinearScaleOptions {
  domain: readonly [number, number];
  range: readonly [number, number];
  /** Extend the domain to round, human-friendly bounds. Default: true. */
  nice?: boolean;
  /** Clamp outputs to the range. Default: false. */
  clamp?: boolean;
}

/** Continuous linear scale (numeric domain -> pixel range). */
export function linearScale(options: LinearScaleOptions): ScaleLinear<number, number> {
  const scale = d3ScaleLinear()
    .domain([...options.domain])
    .range([...options.range]);
  if (options.nice ?? true) scale.nice();
  if (options.clamp) scale.clamp(true);
  return scale;
}

export interface TimeScaleOptions {
  domain: readonly [Date, Date];
  range: readonly [number, number];
  /** Extend the domain to round calendar bounds. Default: true. */
  nice?: boolean;
  clamp?: boolean;
}

/** Continuous time scale (Date domain -> pixel range), calendar-aware ticks. */
export function timeScale(options: TimeScaleOptions): ScaleTime<number, number> {
  const scale = d3ScaleTime()
    .domain([...options.domain])
    .range([...options.range]);
  if (options.nice ?? true) scale.nice();
  if (options.clamp) scale.clamp(true);
  return scale;
}

export interface BandScaleOptions {
  domain: readonly string[];
  range: readonly [number, number];
  /**
   * Padding as a fraction of the step [0, 1]. Sets BOTH inner and outer
   * padding. Default: 0.1 — which applies even when only one of
   * `paddingInner`/`paddingOuter` is given, so the other stays at 0.1 rather
   * than d3's bare default of 0.
   */
  padding?: number;
  /** Inner padding only. Takes precedence over `padding`. */
  paddingInner?: number;
  /** Outer padding only. Takes precedence over `padding`. */
  paddingOuter?: number;
  /** Alignment within the range [0, 1]. Default: 0.5. */
  align?: number;
}

/** Discrete band scale (categorical domain -> banded pixel range) for bars. */
export function bandScale(options: BandScaleOptions): ScaleBand<string> {
  const scale = d3ScaleBand<string>()
    .domain([...options.domain])
    .range([...options.range]);
  if (options.padding !== undefined) scale.padding(options.padding);
  else scale.padding(0.1);
  if (options.paddingInner !== undefined) scale.paddingInner(options.paddingInner);
  if (options.paddingOuter !== undefined) scale.paddingOuter(options.paddingOuter);
  scale.align(options.align ?? 0.5);
  return scale;
}

export interface OrdinalScaleOptions<Range> {
  domain: readonly string[];
  range: readonly Range[];
}

/** Discrete ordinal scale (categorical domain -> arbitrary range, e.g. colors). */
export function ordinalScale<Range>(
  options: OrdinalScaleOptions<Range>,
): ScaleOrdinal<string, Range> {
  return d3ScaleOrdinal<string, Range>()
    .domain([...options.domain])
    .range([...options.range]);
}
