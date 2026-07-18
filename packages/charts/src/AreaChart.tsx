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
import { areaPath, linePath, type CurveName } from "@silkplot/core";
import {
  createCartesianModel,
  createChartSemantics,
  type ChartSemantics,
  type ChartSemanticsProps,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import {
  ChartShell,
  StrokedLine,
  finiteDefined,
  timeExtentScale,
  timePointRows,
  type CartesianChartProps,
} from "./scaffold";
import type { TimePoint } from "./types";

export interface AreaChartBaseProps extends CartesianChartProps {
  /** The series to plot, as `{ t: Date, y: number }[]`. */
  data: readonly TimePoint[];
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
}

/**
 * An area chart is informative by default and must be named — see
 * `ChartSemanticsProps`. `decorative` is the explicit opt-out.
 */
export type AreaChartProps = AreaChartBaseProps & ChartSemanticsProps;

type AreaChartBodyProps = AreaChartBaseProps & { semantics: ChartSemantics };

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All
 * scales and paths are memos that recompute only when data or size change.
 */
const AreaChartBody: Component<AreaChartBodyProps> = (props) => {
  const model = createCartesianModel({
    data: () => props.data,
    x: (range) => timeExtentScale(props.data, range),
    // The area is drawn FROM the zero baseline, so 0 must be inside the domain
    // or the fill's flat edge lands on a pixel the axis labels as some other
    // value. "zero-baseline" keeps that honest for all-negative and
    // all-positive series alike. (A line needs no baseline, which is why
    // LineChart uses "zero-floor" instead.)
    y: { accessor: (d) => d.y, domain: "zero-baseline" },
  });

  /** Pixel position of the zero baseline; the domain policy guarantees it is in range. */
  const baselineY = createMemo(() => model.y()(0));

  /**
   * The pixel mapping both marks share. Built once per recompute so the fill and
   * its top stroke are guaranteed to be reading the same scales and the same
   * gap predicate — two marks that disagreed about which points are defined
   * would break the stroke and the fill at different places.
   */
  const marks = createMemo(() => {
    const xs = model.x();
    const ys = model.y();
    const x = (d: TimePoint): number => xs(d.t);
    const y = (d: TimePoint): number => ys(d.y);
    return { x, y, defined: finiteDefined(x, y, props.defined), curve: props.curve ?? "monotoneX" };
  });

  const areaD = createMemo(() => {
    const { x, defined, curve } = marks();
    return areaPath(props.data, { x, y0: baselineY(), y1: marks().y, defined, curve });
  });

  const lineD = createMemo(() => {
    const { x, y, defined, curve } = marks();
    return linePath(props.data, { x, y, defined, curve });
  });

  return (
    <CartesianFrame model={model} layout={props} semantics={props.semantics}>
      <path d={areaD()} fill={props.fill ?? "currentColor"} fill-opacity={props.fillOpacity ?? 0.2} stroke="none" />
      <StrokedLine d={lineD()} stroke={props.stroke} strokeWidth={props.strokeWidth} />
    </CartesianFrame>
  );
};

export const AreaChart: Component<AreaChartProps> = (props) => {
  const semantics = createChartSemantics(props);

  return (
    <ChartShell layout={props} semantics={semantics} rows={() => timePointRows(props.data)}>
      <AreaChartBody {...props} semantics={semantics} />
    </ChartShell>
  );
};
