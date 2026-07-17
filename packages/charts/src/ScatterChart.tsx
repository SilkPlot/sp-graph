/**
 * ScatterChart — a point cloud of `<circle>` marks over two linear scales.
 *
 * Scaffolding comes from `createCartesianModel` and `CartesianFrame`. What
 * makes this chart a scatter, and the one place it deliberately parts company
 * with every other chart here:
 *
 *   - "extent" y-domain, and a plain extent on x. Neither axis is forced to
 *     include zero. A line or area wants a meaningful zero baseline; a scatter
 *     is read by the relative position of the cloud, and forcing zero into a
 *     domain that does not naturally contain it squashes the points into a
 *     corner instead of using the plotting area.
 *
 * D3 does all the math inside memos; Solid renders every element. No
 * d3-selection, d3-transition, or d3-axis anywhere.
 *
 * TODO(dynamic interaction): wire `createHitIndex` (d3-delaunay, already in
 *   core/hit-test.ts) for nearest-point cursor/tooltip interaction. The
 *   contracts are settled in docs/decisions/adr-0002-crosshair-and-tooltip-anchor.md
 *   — note that the resolution belongs to a pointer model, not to this chart
 *   and not to the cursor.
 */
import { For, type Component } from "solid-js";
import { extentOf, linearScale } from "@silkplot/core";
import { ChartRoot, createCartesianModel, type Margins } from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import type { XYPoint } from "./types";

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
  /** Draw tick-aligned gridlines behind the marks. Default: true. */
  gridlines?: boolean;
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
  const model = createCartesianModel({
    data: props.data,
    // x uses the data's own extent for the same reason y does, below.
    x: (range) => linearScale({ domain: extentOf(props.data, (d) => d.x), range }),
    y: { accessor: (d) => d.y, domain: "extent" },
  });

  return (
    <CartesianFrame
      x={model.x()}
      y={model.y()}
      hasArea={model.hasArea()}
      gridlines={props.gridlines}
      title={props.title}
      class={props.class}
    >
      <For each={props.data}>
        {(d) => (
          <circle
            cx={model.x()(d.x)}
            cy={model.y()(d.y)}
            r={props.radius ?? 3}
            fill={props.fill ?? "currentColor"}
            fill-opacity={props.fillOpacity ?? 1}
          />
        )}
      </For>
    </CartesianFrame>
  );
};

export const ScatterChart: Component<ScatterChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height} margins={props.margins}>
      <ScatterChartBody {...props} />
    </ChartRoot>
  );
};
