/**
 * @silkplot/solid — Solid primitives for SilkPlot.
 *
 * This is the "Solid renders" half. Every DOM element here is a Solid element;
 * we never hand the tree to d3-selection/transition/axis. `solid-js` is a peer
 * dependency — the host app provides it and compiles these `.tsx` sources with
 * its own `vite-plugin-solid` (the "solid" export condition points here).
 */
export { ChartRoot } from "./ChartRoot";
export type { ChartRootProps } from "./ChartRoot";

export { SvgLayer } from "./SvgLayer";
export type { SvgLayerProps } from "./SvgLayer";

export { Axis } from "./Axis";
export type { AxisProps, AxisOrientation } from "./Axis";

export { Gridlines } from "./Gridlines";
export type { GridlinesProps, GridlinesAxis } from "./Gridlines";

export { Crosshair } from "./Crosshair";
export type { CrosshairProps } from "./Crosshair";

export { TooltipAnchor } from "./TooltipAnchor";
export type { TooltipAnchorProps } from "./TooltipAnchor";

export { ChartAnnouncer, DEFAULT_ANNOUNCE_THROTTLE_MS } from "./ChartAnnouncer";
export type { ChartAnnouncerProps } from "./ChartAnnouncer";

export { createActiveDatum, DEFAULT_PAGE_SIZE } from "./createActiveDatum";
export type { ActiveDatum, ActiveDatumSpec } from "./createActiveDatum";

export { createChartKeyboard } from "./createChartKeyboard";
export type { ChartKeyboard, ChartKeyboardSpec, ChartKeyboardRole } from "./createChartKeyboard";

// The one inspection seam every chart composes — ADR-0016. Pointer + keyboard
// write one active-datum state over a caller-supplied active-point index.
export { createChartInspection } from "./createChartInspection";
export type { ChartInspection, ChartInspectionSpec } from "./createChartInspection";

// The reactive visible-time viewport holder — ADR-0014 §3/§4 on ADR-0017's
// representation. Controlled/uncontrolled state over the pure `@silkplot/core`
// viewport model; the single `Date`↔ms boundary; the navigation commands a
// range control or a P05 gesture adapter drives.
export { createViewport } from "./createViewport";
export type { Viewport, ViewportCommands, ViewportSpec } from "./createViewport";
export {
  createViewportGestures,
  MIN_BRUSH_PX,
  PAN_FRACTION,
  WHEEL_ZOOM_IN_FACTOR,
} from "./createViewportGestures";
export type {
  BrushExtent,
  ViewportGestures,
  ViewportGesturesSpec,
} from "./createViewportGestures";

export { ChartKeyboardSurface, SP_FOCUSABLE_CLASS } from "./ChartKeyboardSurface";
export { Legend, MIN_TARGET_PX } from "./Legend";
export type { LegendProps } from "./Legend";
export type { ChartKeyboardSurfaceProps } from "./ChartKeyboardSurface";

export {
  createChartSemantics,
  resolveChartSemantics,
  isDevelopmentBuild,
  FALLBACK_CHART_NAME,
} from "./semantics";
export type {
  ChartSemantics,
  ChartSemanticsProps,
  ChartSemanticsInput,
  ChartSemanticsIssue,
  ChartDataTable,
  DecorativeSemantics,
  InformativeSemantics,
  ResolvedChartSemantics,
} from "./semantics";

export { Dashboard } from "./Dashboard";
export { DashboardSection } from "./DashboardSection";
export type { DashboardSectionProps } from "./DashboardSection";
export { DashboardSectionContext, useDashboardSection, rollingWindow } from "./dashboard-section";
export type { DashboardProps } from "./Dashboard";

export { DashboardTimeControl, toLocalInputValue, fromLocalInputValue } from "./DashboardTimeControl";
export type { DashboardTimeControlProps } from "./DashboardTimeControl";

export {
  DashboardTimeContext,
  createDashboardTime,
  useDashboardTime,
} from "./dashboard-time";
export type { DashboardTime, DashboardTimeSpec, TimeInterval } from "./dashboard-time";

export { ChartEmptyState, ChartEmptyMark, DEFAULT_EMPTY_MESSAGE } from "./ChartEmptyState";
export type { ChartEmptyStateProps } from "./ChartEmptyState";

export { ChartDataAlternative } from "./ChartDataAlternative";
export type { ChartDataAlternativeProps, ChartTableRow } from "./ChartDataAlternative";

export { resolveTicks, isBandScale } from "./scale-ticks";
export type { AxisScale, TickRequest, TickFormat } from "./scale-ticks";

export { createCartesianModel, applyYDomainPolicy } from "./createCartesianModel";
export type {
  AxisPairModel,
  CartesianModel,
  CartesianModelSpec,
  YDomainPolicy,
} from "./createCartesianModel";

// The ranked categorical model. A sibling of `createCartesianModel` rather than
// an orientation flag inside it — three charts compose that one, and none of
// them has an axis to swap. See the module note for the two vocabularies.
export { createRankedModel } from "./createRankedModel";
export type {
  RankedModel,
  RankedModelSpec,
  RankedOrientation,
} from "./createRankedModel";

// The reactive face of ADR-0008's series normalisation. One memo, so every
// consumer reads the same model rather than an independent normalisation.
export { createSeriesModel } from "./createSeriesModel";
export type { SeriesModelSpec, ReactiveSeriesModel } from "./createSeriesModel";

export { createResize } from "./createResize";
export type { Size, CreateResizeReturn } from "./createResize";

export {
  useChartBounds,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
} from "./context";
export type { ChartBounds, Margins } from "./context";
