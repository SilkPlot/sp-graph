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
} from "./scales";
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
} from "./scales";

// Extents — numeric span of a series under an accessor.
export { extentOf } from "./extent";
// Ticks — the d3-axis replacement.
export {
  computeTicks,
  computeBandTicks,
  numberFormat,
  timeLabelFormat,
} from "./ticks";
export type { Tick, TickOptions, BandTickOptions } from "./ticks";

// Shape — line/area path builders over d3-shape.
export { linePath, areaPath, curves } from "./shape";
export type {
  LinePathOptions,
  AreaPathOptions,
  CurveName,
  CurveFactory,
} from "./shape";

// Overlap packing — calendar (deterministic lane assignment).
export { packOverlaps } from "./overlap";
export type { Interval, PackedInterval, PackOptions } from "./overlap";

// Hit-testing — nearest-point lookup via d3-delaunay.
export { createHitIndex } from "./hit-test";
export type { HitIndex, HitIndexOptions } from "./hit-test";

// Layered time selection — the dashboard scope precedence model (ADR-0007).
export { resolveEffectiveDomain } from "./time-scope";
export type {
  GlobalRange,
  DynamicSelection,
  SectionWindow,
  SectionLatest,
  SectionScope,
  TimeScopes,
  EffectiveDomain,
  EffectiveRange,
  EffectiveLatest,
  EffectiveEmpty,
  EmptyReason,
  TimeScopeIssue,
  ResolveOptions,
} from "./time-scope";

// Build-environment detection, shared by the contracts that fail loud in dev.
export { isDevelopmentBuild } from "./build-env";
