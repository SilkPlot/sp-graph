/**
 * Shape — line/area path builders over `d3-shape`.
 *
 * These produce path `d` strings (compute-only). Charts paint those strings
 * onto a Canvas 2D context via `Path2D`; d3 only computes the geometry.
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

/** Normalize a constant-or-accessor option into a plain accessor for d3-shape setters. */
function toAccessor<Datum>(
  value: number | ((d: Datum, index: number) => number),
): (d: Datum, index: number) => number {
  return typeof value === "number" ? () => value : value;
}

/**
 * Something that receives the same path commands the `d` string records.
 *
 * `Path2D` satisfies this in a browser. Core never names `Path2D`, so the
 * builders stay DOM-free; a renderer that passes one gets the geometry
 * without re-parsing the string it is also handed.
 */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

export interface LinePathOptions<Datum> {
  x: (d: Datum, index: number) => number;
  y: (d: Datum, index: number) => number;
  /** Skip points where this returns false (gaps in the line). */
  defined?: (d: Datum, index: number) => boolean;
  curve?: CurveName | CurveFactory;
  /**
   * Receives every command of the returned `d`, with the same rounded
   * coordinates, while the string is built. Only the linear curve feeds a
   * sink; other curves leave it untouched and the caller parses `d`.
   */
  sink?: PathSink;
}

/** d3-path's default precision: three decimals, rounded, then `${number}`. */
const ROUND = 1000;
const round = (v: number): number => Math.round(v * ROUND) / ROUND;

/**
 * The linear curve, written directly.
 *
 * Reproduces `d3Line().curve(curveLinear)` command for command: `M` opens a
 * defined run, `L` continues it, and a run of exactly one point closes with
 * `Z`, as d3's linear curve does. Coordinates are rounded the way d3-path
 * rounds them, so the string is byte-identical to the generator's. What it
 * saves is the generator's per-point accessor and curve indirection and the
 * template-literal path builder, and it can feed a `PathSink` as it goes.
 */
function linearLinePath<Datum>(
  data: readonly Datum[],
  x: (d: Datum, index: number) => number,
  y: (d: Datum, index: number) => number,
  defined: ((d: Datum, index: number) => boolean) | undefined,
  sink: PathSink | undefined,
): string {
  let out = "";
  let inRun = false;
  let runLength = 0;
  const n = data.length;
  for (let i = 0; i <= n; i++) {
    const on = i < n && (defined === undefined || defined(data[i]!, i));
    if (on) {
      const px = round(+x(data[i]!, i));
      const py = round(+y(data[i]!, i));
      if (!inRun) {
        out += `M${px},${py}`;
        sink?.moveTo(px, py);
        inRun = true;
        runLength = 1;
      } else {
        out += `L${px},${py}`;
        sink?.lineTo(px, py);
        runLength++;
      }
    } else if (inRun) {
      if (runLength === 1) {
        out += "Z";
        sink?.closePath();
      }
      inRun = false;
    }
  }
  return out;
}

/** Build an SVG line path `d` string from a data series. Returns "" if empty. */
export function linePath<Datum>(
  data: readonly Datum[],
  options: LinePathOptions<Datum>,
): string {
  const curve = resolveCurve(options.curve);
  if (curve === curveLinear) {
    return linearLinePath(data, options.x, options.y, options.defined, options.sink);
  }
  const generator = d3Line<Datum>()
    .x((d, i) => options.x(d, i))
    .y((d, i) => options.y(d, i))
    .curve(resolveCurve(options.curve));
  if (options.defined) generator.defined((d, i) => options.defined!(d, i));
  return generator(data) ?? "";
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
  const y0 = toAccessor(options.y0);
  const generator = d3Area<Datum>()
    .x((d, i) => options.x(d, i))
    .y0((d, i) => y0(d, i))
    .y1((d, i) => options.y1(d, i))
    .curve(resolveCurve(options.curve));
  if (options.defined) generator.defined((d, i) => options.defined!(d, i));
  return generator([...data]) ?? "";
}
