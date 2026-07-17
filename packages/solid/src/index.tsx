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

export { ChartAnnouncer } from "./ChartAnnouncer";
export type { ChartAnnouncerProps } from "./ChartAnnouncer";

export { resolveTicks, isBandScale } from "./scale-ticks";
export type { AxisScale, TickRequest } from "./scale-ticks";

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
