/**
 * @silkplot/core — pure, D3-backed math for visualization.
 *
 * No Solid. No DOM. Every export here is a compute-only function or type: this
 * is the "D3 computes" half of SilkPlot. The Solid packages import these to
 * build reactive chart models and render them.
 *
 * BANNED here and everywhere in the render path: d3-selection, d3-transition,
 * d3-axis. `ticks.computeTicks` is the axis replacement.
 */

// Scales — typed wrappers over d3-scale.
export {
  linearScale,
  timeScale,
  bandScale,
  ordinalScale,
} from "./scales.ts";
export type {
  ContinuousScale,
  LinearScaleOptions,
  TimeScaleOptions,
  BandScaleOptions,
  OrdinalScaleOptions,
  ScaleLinear,
  ScaleTime,
  ScaleBand,
  ScaleOrdinal,
} from "./scales.ts";

// Ticks — the d3-axis replacement.
export {
  computeTicks,
  numberFormat,
  timeLabelFormat,
} from "./ticks.ts";
export type { Tick, TickOptions } from "./ticks.ts";

// Shape — line/area path builders over d3-shape.
export { linePath, areaPath, curves } from "./shape.ts";
export type {
  LinePathOptions,
  AreaPathOptions,
  CurveName,
  CurveFactory,
} from "./shape.ts";

// Overlap packing — calendar (deterministic lane assignment).
export { packOverlaps } from "./overlap.ts";
export type { Interval, PackedInterval } from "./overlap.ts";

// Hit-testing — nearest-point lookup via d3-delaunay.
export { createHitIndex } from "./hit-test.ts";
export type { HitIndex, HitIndexOptions } from "./hit-test.ts";
