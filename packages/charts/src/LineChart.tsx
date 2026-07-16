/**
 * LineChart — a real, end-to-end SilkPlot chart.
 *
 * Composition demonstrates the whole architecture:
 *   @silkplot/core   → timeScale + linearScale (compute), linePath (compute),
 *                      computeTicks (compute — the d3-axis replacement)
 *   @silkplot/solid  → ChartRoot (measure), SvgLayer (render), Axis (render)
 *
 * D3 does all the math inside memos; Solid renders every element. No
 * d3-selection, d3-transition, or d3-axis anywhere.
 */
import { createMemo, Show, type Component } from "solid-js";
import { timeScale, linearScale, linePath, type CurveName } from "@silkplot/core";
import { ChartRoot, SvgLayer, Axis, useChartBounds, type Margins } from "@silkplot/solid";
import { extentOf, type TimePoint } from "./types.ts";

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

  const y = createMemo(() => {
    const [lo, hi] = extentOf(props.data, (d) => d.y);
    return linearScale({
      domain: [Math.min(0, lo), hi],
      range: [bounds().innerHeight, 0],
    });
  });

  const pathD = createMemo(() => {
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
        <path
          d={pathD()}
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

export const LineChart: Component<LineChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height} margins={props.margins}>
      <LineChartBody {...props} />
    </ChartRoot>
  );
};
