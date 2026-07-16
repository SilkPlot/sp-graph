/**
 * ScatterChart — a real, end-to-end SilkPlot chart.
 *
 * Same structure as LineChart: an outer `Component` mounting `ChartRoot`, and
 * an inner `...Body` that runs inside it so it can read reactive bounds. Two
 * `linearScale`s (x and y) map data extents to pixel ranges; every point is a
 * Solid `<circle>` rendered with `<For>`. D3 computes, Solid renders — no
 * d3-selection, d3-transition, or d3-axis anywhere.
 *
 * TODO(Phase 2): wire `createHitIndex` (d3-delaunay, already in
 *   core/hit-test.ts) for nearest-point cursor/tooltip interaction. That is
 *   its own primitive surface (Crosshair / TooltipAnchor) that has not been
 *   designed yet, so it is intentionally left out of this pass.
 */
import { createMemo, For, Show, type Component } from "solid-js";
import { linearScale } from "@silkplot/core";
import { ChartRoot, SvgLayer, Axis, useChartBounds, type Margins } from "@silkplot/solid";
import { extentOf, type XYPoint } from "./types";

export interface ScatterChartProps {
  /** The points to plot, as `{ x: number, y: number }[]`. */
  data: readonly XYPoint[];
  /** Fixed width in px. Omit to fill and measure the parent. */
  width?: number;
  /** Fixed height in px. Omit to fill and measure the parent. */
  height?: number;
  margins?: Partial<Margins>;
  /** Point radius in px. Default: 3. */
  radius?: number;
  /** Point fill color. Default: "currentColor". */
  fill?: string;
  /** Point fill opacity. Default: 1. */
  fillOpacity?: number;
  /** Accessible name for the chart. */
  title?: string;
  class?: string;
}

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All
 * scales are memos that recompute only when data or size change.
 *
 * Unlike LineChart/AreaChart, neither axis is forced to include zero. A
 * line/area wants a meaningful zero baseline; a scatter plot is read by the
 * relative position of the point cloud, and forcing zero into a domain that
 * doesn't naturally contain it would squash the cloud into a corner instead
 * of using the plotting area. So both domains use the data's actual extent.
 */
const ScatterChartBody: Component<ScatterChartProps> = (props) => {
  const bounds = useChartBounds();

  const x = createMemo(() => {
    const [lo, hi] = extentOf(props.data, (d) => d.x);
    return linearScale({ domain: [lo, hi], range: [0, bounds().innerWidth] });
  });

  const y = createMemo(() => {
    const [lo, hi] = extentOf(props.data, (d) => d.y);
    return linearScale({ domain: [lo, hi], range: [bounds().innerHeight, 0] });
  });

  const hasArea = () => bounds().innerWidth > 0 && bounds().innerHeight > 0;

  return (
    <SvgLayer role="img" title={props.title} class={props.class}>
      <Show when={hasArea()}>
        <Axis scale={y()} orientation="left" />
        <Axis scale={x()} orientation="bottom" />
        <For each={props.data}>
          {(d) => (
            <circle
              cx={x()(d.x)}
              cy={y()(d.y)}
              r={props.radius ?? 3}
              fill={props.fill ?? "currentColor"}
              fill-opacity={props.fillOpacity ?? 1}
            />
          )}
        </For>
      </Show>
    </SvgLayer>
  );
};

export const ScatterChart: Component<ScatterChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height} margins={props.margins}>
      <ScatterChartBody {...props} />
    </ChartRoot>
  );
};
