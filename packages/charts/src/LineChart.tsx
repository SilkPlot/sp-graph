/**
 * LineChart — a time series drawn as a single `linePath` stroke.
 *
 * The scaffolding — bounds, pixel ranges, the y-domain policy — comes from
 * `createCartesianModel`; the axes and the SVG frame from `CartesianFrame`.
 * What is written here is only what makes this chart a line chart:
 *
 *   - a time x-domain taken from the first and last datum, not the extent;
 *   - a "zero-floor" y-domain, because a line has no baseline to honour;
 *   - one stroked path, no fill.
 *
 * D3 does all the math inside memos; Solid renders every element. No
 * d3-selection, d3-transition, or d3-axis anywhere.
 */
import { createMemo, type Component } from "solid-js";
import { timeScale, linePath, type CurveName } from "@silkplot/core";
import { ChartRoot, createCartesianModel, type Margins } from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import type { TimePoint } from "./types";

export interface LineChartProps {
  /** The series to plot, as `{ t: Date, y: number }[]`. */
  data: readonly TimePoint[];
  /** Fixed width in px. Omit to fill and measure the parent. */
  width?: number;
  /** Fixed height in px. Omit to fill and measure the parent. */
  height?: number;
  margins?: Partial<Margins>;
  /** Line curve preset. Default: "monotoneX". */
  curve?: CurveName;
  /** Stroke color. Default: "currentColor". */
  stroke?: string;
  /** Stroke width in px. Default: 1.5. */
  strokeWidth?: number;
  /** Accessible name for the chart. */
  title?: string;
  class?: string;
}

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All scales,
 * the path, and ticks are memos that recompute only when data or size change.
 */
const LineChartBody: Component<LineChartProps> = (props) => {
  const model = createCartesianModel({
    data: props.data,
    // The time domain is the FIRST and LAST datum, not the extent: a series is
    // plotted in the order given, and a stray out-of-order point should not
    // silently widen the axis.
    x: (range) =>
      timeScale({
        domain: [
          props.data[0]?.t ?? new Date(0),
          props.data[props.data.length - 1]?.t ?? new Date(1),
        ],
        range,
      }),
    // A line has no baseline to honour, so zero is only the floor — the top
    // stays the data's own maximum. Area and Bar deliberately differ.
    y: { accessor: (d) => d.y, domain: "zero-floor" },
  });

  const pathD = createMemo(() => {
    const xs = model.x();
    const ys = model.y();
    return linePath(props.data, {
      x: (d) => xs(d.t),
      y: (d) => ys(d.y),
      curve: props.curve ?? "monotoneX",
    });
  });

  return (
    <CartesianFrame
      x={model.x()}
      y={model.y()}
      hasArea={model.hasArea()}
      title={props.title}
      class={props.class}
    >
      <path
        d={pathD()}
        fill="none"
        stroke={props.stroke ?? "currentColor"}
        stroke-width={props.strokeWidth ?? 1.5}
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </CartesianFrame>
  );
};

export const LineChart: Component<LineChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height} margins={props.margins}>
      <LineChartBody {...props} />
    </ChartRoot>
  );
};
