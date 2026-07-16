/**
 * Shape — line/area path builders over `d3-shape`.
 *
 * These produce SVG path `d` strings (compute-only). Solid renders the
 * `<path>`; d3 only computes the geometry. The same generators can target a
 * Canvas 2D context later (roadmap Phase 1 canvas layer) by passing a context.
 */
import { line as d3Line, area as d3Area, curveLinear, curveMonotoneX } from "d3-shape";
import type { CurveFactory } from "d3-shape";

export type { CurveFactory };

/** Named curve presets so consumers need not import `d3-shape` directly. */
export const curves = {
  linear: curveLinear,
  monotoneX: curveMonotoneX,
} as const;

export type CurveName = keyof typeof curves;

function resolveCurve(curve: CurveName | CurveFactory | undefined): CurveFactory {
  if (curve === undefined) return curveLinear;
  if (typeof curve === "string") return curves[curve];
  return curve;
}

export interface LinePathOptions<Datum> {
  x: (d: Datum, index: number) => number;
  y: (d: Datum, index: number) => number;
  /** Skip points where this returns false (gaps in the line). */
  defined?: (d: Datum, index: number) => boolean;
  curve?: CurveName | CurveFactory;
}

/** Build an SVG line path `d` string from a data series. Returns "" if empty. */
export function linePath<Datum>(
  data: readonly Datum[],
  options: LinePathOptions<Datum>,
): string {
  const generator = d3Line<Datum>()
    .x((d, i) => options.x(d, i))
    .y((d, i) => options.y(d, i))
    .curve(resolveCurve(options.curve));
  if (options.defined) generator.defined((d, i) => options.defined!(d, i));
  return generator([...data]) ?? "";
}

export interface AreaPathOptions<Datum> {
  x: (d: Datum, index: number) => number;
  /** Baseline y (bottom of the band). Number or accessor. */
  y0: number | ((d: Datum, index: number) => number);
  /** Top edge y. */
  y1: (d: Datum, index: number) => number;
  defined?: (d: Datum, index: number) => boolean;
  curve?: CurveName | CurveFactory;
}

/** Build an SVG area path `d` string from a data series. Returns "" if empty. */
export function areaPath<Datum>(
  data: readonly Datum[],
  options: AreaPathOptions<Datum>,
): string {
  const y0 = options.y0;
  const generator = d3Area<Datum>()
    .x((d, i) => options.x(d, i))
    .y0(typeof y0 === "number" ? y0 : (d, i) => y0(d, i))
    .y1((d, i) => options.y1(d, i))
    .curve(resolveCurve(options.curve));
  if (options.defined) generator.defined((d, i) => options.defined!(d, i));
  return generator([...data]) ?? "";
}
