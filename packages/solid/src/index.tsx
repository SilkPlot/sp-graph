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

export { ChartKeyboardSurface, SP_FOCUSABLE_CLASS } from "./ChartKeyboardSurface";
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
  CartesianModel,
  CartesianModelSpec,
  YDomainPolicy,
} from "./createCartesianModel";

export { createResize } from "./createResize";
export type { Size, CreateResizeReturn } from "./createResize";

export {
  useChartBounds,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
} from "./context";
export type { ChartBounds, Margins } from "./context";
