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
import { timeScale, areaPath, linePath, extentOf, type CurveName } from "@silkplot/core";
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
  /**
   * Treat a datum as present. Return false and the fill and its top stroke both
   * break at that point rather than drawing through it — the way to render a
   * known gap (a sensor offline, a month with no reading) instead of implying
   * data you do not have. A gap splits the area into separate filled regions;
   * it does not bridge the hole with a flat span at the baseline.
   *
   * This ANDs with the library's own finite check; it cannot switch it off. A
   * datum whose scaled position is not finite has no pixel to occupy, so it is
   * always a gap, whatever this returns.
   */
  defined?: (d: TimePoint, index: number) => boolean;
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
    data: () => props.data,
    // The time domain is the data's EXTENT, not its first and last datum.
    //
    // Reading the ends assumed the series was already sorted, and silently drew
    // nonsense when it was not: [Jan 10, Jan 1, Jan 5] produced a REVERSED
    // domain, and the middle point rendered outside the plot area entirely
    // (scales do not clamp by default). The comment that used to sit here
    // claimed the opposite — that reading the ends stopped a stray out-of-order
    // point widening the axis. It never did that; it just failed differently.
    //
    // The contract is now: the domain covers your data, and the fill follows
    // your array. The honest fix for a scrambled series is to sort it before
    // passing it in. This extent scan is one the y-axis already makes over the
    // same array.
    x: (range) => {
      const [lo, hi] = extentOf(props.data, (d) => d.t.getTime());
      return timeScale({ domain: [new Date(lo), new Date(hi)], range });
    },
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
    const px = (d: TimePoint): number => xs(d.t);
    const py = (d: TimePoint): number => ys(d.y);
    return areaPath(props.data, {
      x: px,
      y0: baselineY(),
      y1: py,
      // The finite check is the library's and is not optional: a datum that maps
      // to a non-finite pixel has nowhere to be drawn, and passing it through
      // yields a `d` the browser abandons at the bad segment — for a fill that
      // corrupts the whole shape, not just one span. `extentOf` already keeps
      // such values out of the DOMAIN; this keeps them out of the MARK, the
      // other half of the same policy. The area and its top stroke share this
      // predicate so they break at exactly the same points.
      defined: (d, i) =>
        Number.isFinite(px(d)) && Number.isFinite(py(d)) && (props.defined?.(d, i) ?? true),
      curve: props.curve ?? "monotoneX",
    });
  });

  const lineD = createMemo(() => {
    const xs = model.x();
    const ys = model.y();
    const px = (d: TimePoint): number => xs(d.t);
    const py = (d: TimePoint): number => ys(d.y);
    return linePath(props.data, {
      x: px,
      y: py,
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
