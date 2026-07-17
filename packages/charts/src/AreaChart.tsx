/**
 * AreaChart — a time series drawn as a filled `areaPath` under a `linePath`.
 *
 * Scaffolding comes from `createCartesianModel` and `CartesianFrame`. What
 * makes this chart an area chart, and what separates it from LineChart despite
 * the shared time x-domain:
 *
 *   - a "zero-baseline" y-domain, because the fill is drawn FROM zero and a
 *     domain excluding zero puts the fill's flat edge on a pixel the axis
 *     labels as some other number;
 *   - two marks — the fill, then the stroke over it.
 *
 * D3 does all the math inside memos; Solid renders every element. No
 * d3-selection, d3-transition, or d3-axis anywhere.
 */
import { createMemo, type Component } from "solid-js";
import { timeScale, areaPath, linePath, type CurveName } from "@silkplot/core";
import { ChartRoot, createCartesianModel, type Margins } from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import type { TimePoint } from "./types";

export interface AreaChartProps {
  /** The series to plot, as `{ t: Date, y: number }[]`. */
  data: readonly TimePoint[];
  /** Fixed width in px. Omit to fill and measure the parent. */
  width?: number;
  /** Fixed height in px. Omit to fill and measure the parent. */
  height?: number;
  margins?: Partial<Margins>;
  /** Area/line curve preset. Default: "monotoneX". */
  curve?: CurveName;
  /** Area fill color. Default: "currentColor". */
  fill?: string;
  /** Area fill opacity. Default: 0.2. */
  fillOpacity?: number;
  /** Line stroke color. Default: "currentColor". */
  stroke?: string;
  /** Line stroke width in px. Default: 1.5. */
  strokeWidth?: number;
  /** Draw tick-aligned gridlines behind the marks. Default: true. */
  gridlines?: boolean;
  /** Accessible name for the chart. */
  title?: string;
  class?: string;
}

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All
 * scales and paths are memos that recompute only when data or size change.
 */
const AreaChartBody: Component<AreaChartProps> = (props) => {
  const model = createCartesianModel({
    data: props.data,
    x: (range) =>
      timeScale({
        domain: [
          props.data[0]?.t ?? new Date(0),
          props.data[props.data.length - 1]?.t ?? new Date(1),
        ],
        range,
      }),
    // The area is drawn FROM the zero baseline, so 0 must be inside the domain
    // or the fill's flat edge lands on a pixel the axis labels as some other
    // value. "zero-baseline" keeps that honest for all-negative and
    // all-positive series alike. (A line needs no baseline, which is why
    // LineChart uses "zero-floor" instead.)
    y: { accessor: (d) => d.y, domain: "zero-baseline" },
  });

  /** Pixel position of the zero baseline; the domain policy guarantees it is in range. */
  const baselineY = createMemo(() => model.y()(0));

  const areaD = createMemo(() => {
    const xs = model.x();
    const ys = model.y();
    return areaPath(props.data, {
      x: (d) => xs(d.t),
      y0: baselineY(),
      y1: (d) => ys(d.y),
      curve: props.curve ?? "monotoneX",
    });
  });

  const lineD = createMemo(() => {
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
      gridlines={props.gridlines}
      title={props.title}
      class={props.class}
    >
      <path d={areaD()} fill={props.fill ?? "currentColor"} fill-opacity={props.fillOpacity ?? 0.2} stroke="none" />
      <path
        d={lineD()}
        fill="none"
        stroke={props.stroke ?? "currentColor"}
        stroke-width={props.strokeWidth ?? 1.5}
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </CartesianFrame>
  );
};

export const AreaChart: Component<AreaChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height} margins={props.margins}>
      <AreaChartBody {...props} />
    </ChartRoot>
  );
};
