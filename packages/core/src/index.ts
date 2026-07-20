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

// The shared series model — ADR-0008's normalisation, domains, gap policy, and
// the derived table every consumer reads instead of re-deriving.
export {
  normalizeSeries,
  seriesGeometry,
  seriesTable,
  seriesSummary,
  valueDomainOf,
  timeDomainOf,
  fromRows,
} from "./series";
export type {
  Series,
  SeriesDatum,
  SeriesStyle,
  NullPolicy,
  DatumState,
  NormalizedDatum,
  NormalizedSeries,
  SeriesModel,
  SeriesIssue,
  SeriesIssueCode,
  SeriesGeometry,
  MultiSeriesFormatProps,
  SeriesTable,
  SeriesTableOptions,
  SeriesTableRow,
  SeriesSummary,
  NormalizeOptions,
  FromRowsSpec,
  Domain,
} from "./series";

// The ranked categorical model — the categorical analogue of the series model.
// Separate from `series.ts` because a category has no instant and a ranked chart
// has no gap policy, so folding them together would mean one model carrying two
// sets of fields half of which are always absent. It deliberately shares the
// DIAGNOSTIC channel (`SeriesIssue`) and the `DatumState` vocabulary, so a caller
// wires one `onIssue` and reads one set of state names across both surfaces.
export { normalizeCategories, rankedDomainOf } from "./ranked";
export type {
  RankedCategory,
  RankedOrientation,
  RankedFormatProps,
  NormalizedCategory,
  RankedModel,
  NormalizeCategoriesOptions,
} from "./ranked";

// Reference overlays — ADR-0008 §10. Kept beside the series model rather than
// inside it: a reference is not a series, and one that reached the legend, the
// derived table, or the visible-series domain would be a measurement nobody took.
export { normalizeReferences, referenceDomainOf } from "./reference";
export type {
  ReferenceValue,
  ReferenceBase,
  ReferenceStyle,
  ReferenceAxis,
  NormalizedReference,
  NormalizeReferencesOptions,
  ReferenceModel,
} from "./reference";

// Per-series presentation — which colour and dash token series `i` gets.
//
// Moved here from `charts`, because the Legend lives in `solid` and `solid`
// cannot import from `charts`. A legend swatch that disagrees with its own mark
// is the defect this move prevents structurally: one function, one answer.
// `charts` re-exports the public names unchanged.
//
// Note what that structure means for testing, because it is counter-intuitive
// and was learned by getting it wrong: mutating THIS file cannot prove the two
// consumers are coupled. A change here moves the swatch and the mark together,
// so they stay equal and the seam test stays green — correctly. The standing
// probe therefore breaks ONE consumer (the legend's own palette index) instead.
export {
  SERIES_DASH_COUNT,
  SERIES_PALETTE_SIZE,
  resolveSeriesStyle,
  seriesColorToken,
  seriesDashToken,
} from "./series-style";
export type { ResolvedSeriesStyle } from "./series-style";

// CSV serialisation — the chart's own table as a file (RFC 4180, injection-safe).
export { toCsv, csvField, UTF8_BOM } from "./csv";
export type { CsvTable, CsvOptions } from "./csv";

// Build-environment detection, shared by the contracts that fail loud in dev.
export { isDevelopmentBuild } from "./build-env";
