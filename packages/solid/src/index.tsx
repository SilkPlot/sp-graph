/**
 * @silkplot/solid — Solid primitives for SilkPlot.
 *
 * This is the "Solid renders" half. Every DOM element here is a Solid element;
 * we never hand the tree to d3-selection/transition/axis. `solid-js` is a peer
 * dependency — the host app provides it and compiles these `.tsx` sources with
 * its own `vite-plugin-solid` (the "solid" export condition points here).
 */
export { ChartRoot } from "./ChartRoot.tsx";
export type { ChartRootProps } from "./ChartRoot.tsx";

export { SvgLayer } from "./SvgLayer.tsx";
export type { SvgLayerProps } from "./SvgLayer.tsx";

export { Axis } from "./Axis.tsx";
export type { AxisProps, AxisOrientation } from "./Axis.tsx";

export { createResize } from "./createResize.ts";
export type { Size, CreateResizeReturn } from "./createResize.ts";

export {
  useChartBounds,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
} from "./context.ts";
export type { ChartBounds, Margins } from "./context.ts";
