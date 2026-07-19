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
import {
  createCartesianModel,
  type ChartSemantics,
  type ChartSemanticsProps,
  type ChartTableRow,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import {
  ChartShell,
  XY_COLUMNS,
  createInspectableSemantics,
  type CartesianChartProps,
} from "./scaffold";
import type { XYPoint } from "./types";

export interface ScatterChartBaseProps extends CartesianChartProps {
  /** The points to plot, as `{ x: number, y: number }[]`. */
  data: readonly XYPoint[];
  /** Point radius in px. Default: 3. */
  radius?: number;
  /** Point fill color. Default: "currentColor". */
  fill?: string;
  /** Point fill opacity. Default: 1. */
  fillOpacity?: number;
}

/**
 * A scatter chart is informative by default and must be named — see
 * `ChartSemanticsProps`. `decorative` is the explicit opt-out.
 */
export type ScatterChartProps = ScatterChartBaseProps & ChartSemanticsProps;

type ScatterChartBodyProps = ScatterChartBaseProps & { semantics: ChartSemantics };

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
const ScatterChartBody: Component<ScatterChartBodyProps> = (props) => {
  const model = createCartesianModel({
    data: () => props.data,
    // x uses the data's own extent for the same reason y does, below.
    x: (range) => linearScale({ domain: extentOf(props.data, (d) => d.x), range }),
    y: { accessor: (d) => d.y, domain: "extent" },
  });

  return (
    <CartesianFrame model={model} layout={props} semantics={props.semantics}>
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
  const semantics = createInspectableSemantics(props);

  return (
    <ChartShell
      layout={props}
      semantics={semantics}
      rows={(): readonly ChartTableRow[] => props.data.map((d) => [d.x, d.y] as const)}
      columns={XY_COLUMNS}
    >
      <ScatterChartBody {...props} semantics={semantics} />
    </ChartShell>
  );
};
