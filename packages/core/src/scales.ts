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
