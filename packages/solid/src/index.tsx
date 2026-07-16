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
export type { AxisProps, AxisOrientation, AxisScale } from "./Axis";

export { createResize } from "./createResize";
export type { Size, CreateResizeReturn } from "./createResize";

export {
  useChartBounds,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
} from "./context";
export type { ChartBounds, Margins } from "./context";
