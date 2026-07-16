/**
 * AreaChart — a real, end-to-end SilkPlot chart.
 *
 * Reuses LineChart's time/linear scales and adds a filled `areaPath` beneath
 * a `linePath` stroke, both from `@silkplot/core`. Same structure as
 * LineChart: an outer `Component` mounting `ChartRoot`, and an inner `...Body`
 * that runs inside it so it can read reactive bounds. D3 computes, Solid
 * renders — no d3-selection, d3-transition, or d3-axis anywhere.
 */
import { createMemo, Show, type Component } from "solid-js";
import { timeScale, linearScale, areaPath, linePath, type CurveName } from "@silkplot/core";
import { ChartRoot, SvgLayer, Axis, useChartBounds, type Margins } from "@silkplot/solid";
import { extentOf, type TimePoint } from "./types";

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
  /** Accessible name for the chart. */
  title?: string;
  class?: string;
}

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All
 * scales and paths are memos that recompute only when data or size change.
 */
const AreaChartBody: Component<AreaChartProps> = (props) => {
  const bounds = useChartBounds();

  const x = createMemo(() =>
    timeScale({
      domain: [
        props.data[0]?.t ?? new Date(0),
        props.data[props.data.length - 1]?.t ?? new Date(1),
      ],
      range: [0, bounds().innerWidth],
    }),
  );

  // The area is drawn FROM the zero baseline, so 0 must be inside the domain or
  // the fill's flat edge lands on a pixel the axis labels as some other value.
  // Padding both ends keeps that honest for all-negative and all-positive
  // series alike. (A line needs no baseline, which is why LineChart doesn't.)
  const y = createMemo(() => {
    const [lo, hi] = extentOf(props.data, (d) => d.y);
    return linearScale({
      domain: [Math.min(0, lo), Math.max(0, hi)],
      range: [bounds().innerHeight, 0],
    });
  });

  /** Pixel position of the zero baseline; the domain above guarantees it is in range. */
  const baselineY = createMemo(() => y()(0));

  const areaD = createMemo(() => {
    const xs = x();
    const ys = y();
    return areaPath(props.data, {
      x: (d) => xs(d.t),
      y0: baselineY(),
      y1: (d) => ys(d.y),
      curve: props.curve ?? "monotoneX",
    });
  });

  const lineD = createMemo(() => {
    const xs = x();
    const ys = y();
    return linePath(props.data, {
      x: (d) => xs(d.t),
      y: (d) => ys(d.y),
      curve: props.curve ?? "monotoneX",
    });
  });

  const hasArea = () => bounds().innerWidth > 0 && bounds().innerHeight > 0;

  return (
    <SvgLayer role="img" title={props.title} class={props.class}>
      <Show when={hasArea()}>
        <Axis scale={y()} orientation="left" />
        <Axis scale={x()} orientation="bottom" />
        <path d={areaD()} fill={props.fill ?? "currentColor"} fill-opacity={props.fillOpacity ?? 0.2} stroke="none" />
        <path
          d={lineD()}
          fill="none"
          stroke={props.stroke ?? "currentColor"}
          stroke-width={props.strokeWidth ?? 1.5}
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </Show>
    </SvgLayer>
  );
};

export const AreaChart: Component<AreaChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height} margins={props.margins}>
      <AreaChartBody {...props} />
    </ChartRoot>
  );
};
