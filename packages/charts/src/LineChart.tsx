/**
 * LineChart — a time series drawn as a single `linePath` stroke.
 *
 * The scaffolding — bounds, pixel ranges, the y-domain policy — comes from
 * `createCartesianModel`; the axes and the SVG frame from `CartesianFrame`.
 * What is written here is only what makes this chart a line chart:
 *
 *   - a time x-domain covering the data's extent;
 *   - a "zero-floor" y-domain, because a line has no baseline to honour;
 *   - one stroked path, no fill.
 *
 * D3 does all the math inside memos; Solid renders every element. No
 * d3-selection, d3-transition, or d3-axis anywhere.
 */
import { createMemo, type Component } from "solid-js";
import { timeScale, linePath, extentOf, type CurveName } from "@silkplot/core";
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
  /**
   * Treat a datum as present. Return false and the line breaks at that point
   * rather than drawing through it — the way to render a known gap (a sensor
   * offline, a month with no reading) instead of implying data you do not have.
   *
   * This ANDs with the library's own finite check; it cannot switch it off. A
   * datum whose scaled position is not finite has no pixel to occupy, so it is
   * always a gap, whatever this returns.
   */
  defined?: (d: TimePoint, index: number) => boolean;
  /** Stroke color. Default: "currentColor". */
  stroke?: string;
  /** Stroke width in px. Default: 1.5. */
  strokeWidth?: number;
  /** Draw tick-aligned gridlines behind the marks. Default: true. */
  gridlines?: boolean;
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
    data: () => props.data,
    // The time domain is the data's EXTENT, not its first and last datum.
    //
    // Taking the ends assumed the series was already sorted, and silently drew
    // nonsense when it was not: [Jan 10, Jan 1, Jan 5] produced a REVERSED
    // domain, and the middle point rendered outside the plot area entirely
    // (scales do not clamp by default). The comment that used to sit here
    // claimed the opposite — that reading the ends stopped a stray out-of-order
    // point widening the axis. It never did that; it just failed differently.
    //
    // The contract is now: the domain covers your data, and the path follows
    // your array. The second half is d3-shape's own behaviour and is why marks
    // still draw in array order — the honest fix for a scrambled series is to
    // sort it before passing it in. Sorting here is the only super-linear
    // option, and this scan is one the y-axis already makes over the same array.
    x: (range) => {
      const [lo, hi] = extentOf(props.data, (d) => d.t.getTime());
      return timeScale({ domain: [new Date(lo), new Date(hi)], range });
    },
    // A line has no baseline to honour, so zero is only the floor — the top
    // stays the data's own maximum. Area and Bar deliberately differ.
    y: { accessor: (d) => d.y, domain: "zero-floor" },
  });

  const pathD = createMemo(() => {
    const xs = model.x();
    const ys = model.y();
    const px = (d: TimePoint): number => xs(d.t);
    const py = (d: TimePoint): number => ys(d.y);
    return linePath(props.data, {
      x: px,
      y: py,
      // The finite check is the library's and is not optional: a datum that maps
      // to a non-finite pixel has nowhere to be drawn, and passing it through
      // yields `M0,100L100,NaN` — a `d` the browser abandons at the bad segment,
      // silently truncating the line. `extentOf` already keeps such values out
      // of the DOMAIN; this keeps them out of the MARK, which is the other half
      // of the same policy and does not follow from the first.
      defined: (d, i) =>
        Number.isFinite(px(d)) && Number.isFinite(py(d)) && (props.defined?.(d, i) ?? true),
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
