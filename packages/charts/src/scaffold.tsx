/**
 * The scaffolding every composed chart in this package repeated verbatim.
 *
 * `createCartesianModel` already removed the *math* every chart hand-rolled —
 * bounds, pixel ranges, the y-domain policy. What stayed duplicated was the
 * plumbing either side of it: the same five layout props declared four times,
 * the same `ChartRoot` / marks / `ChartDataAlternative` sandwich assembled four
 * times, and the same finite-value predicate written three times across two
 * files. None of that is what makes a chart a line, a bar, or a cloud.
 *
 * What is emphatically NOT here is the y-domain policy. Line is `zero-floor`,
 * Area and Bar are `zero-baseline`, Scatter is `extent`, and those differences
 * are the charts' own — see the per-chart comments and ADR-0003. Unifying the
 * scaffolding is the point; unifying the policies would be a bug wearing the
 * same clothes, and one an all-positive fixture cannot see.
 */
import type { Component, JSX } from "solid-js";
import { extentOf, timeScale, type ScaleTime } from "@silkplot/core";
import {
  ChartRoot,
  ChartDataAlternative,
  type ChartSemantics,
  type ChartTableRow,
  type Margins,
} from "@silkplot/solid";
import type { TimePoint } from "./types";

/**
 * The layout and presentation props every chart in this package accepts, with
 * identical meaning in each. Each chart's own `*BaseProps` extends this and adds
 * only what is specific to its marks, so the shared half cannot drift into four
 * subtly different contracts — and its documentation cannot drift either.
 */
export interface CartesianChartProps {
  /** Fixed width in px. Omit to fill and measure the parent. */
  width?: number;
  /** Fixed height in px. Omit to fill and measure the parent. */
  height?: number;
  margins?: Partial<Margins>;
  /** Draw tick-aligned gridlines behind the marks. Default: true. */
  gridlines?: boolean;
  class?: string;
}

export interface ChartShellProps {
  /**
   * The chart's own props, read through for width/height/margins. Passed as the
   * live props object rather than as copied values so each read stays tracked —
   * destructuring here would freeze the layout at first render.
   */
  layout: CartesianChartProps;
  /** Resolved semantics, from `createChartSemantics` in the chart's outer component. */
  semantics: ChartSemantics;
  /**
   * Table rows derived from the chart's own data. An accessor, so the table
   * tracks the same replacement the marks track — a table and a picture
   * describing different datasets is the failure this shape prevents.
   */
  rows: () => readonly ChartTableRow[];
  /** The chart body. Rendered INSIDE `ChartRoot`, so it can read the measured bounds. */
  children?: JSX.Element;
}

/**
 * `ChartRoot` + the chart body + the data alternative, in the one arrangement
 * ADR-0005 requires.
 *
 * The alternative is a SIBLING of the measured box, not a child of it: the root
 * is sized to the chart, so a table rendered inside would overlap the drawing.
 * Semantics are resolved by the caller, outside `ChartRoot`, for the same
 * reason — both the frame and the table need them.
 */
export const ChartShell: Component<ChartShellProps> = (props) => (
  <>
    <ChartRoot
      width={props.layout.width}
      height={props.layout.height}
      margins={props.layout.margins}
    >
      {props.children}
    </ChartRoot>
    <ChartDataAlternative semantics={props.semantics} defaultRows={props.rows} />
  </>
);

/**
 * A stroked series path — the mark LineChart draws alone and AreaChart draws
 * over its fill. Identical in both, down to the joins: round, because a mitred
 * join on a sharp reversal spikes well past the data it is meant to describe.
 */
export const StrokedLine: Component<{
  d: string;
  stroke?: string;
  strokeWidth?: number;
}> = (props) => (
  <path
    d={props.d}
    fill="none"
    stroke={props.stroke ?? "currentColor"}
    stroke-width={props.strokeWidth ?? 1.5}
    stroke-linejoin="round"
    stroke-linecap="round"
  />
);

/**
 * The mark-level finite check, AND-ed with the caller's own `defined`.
 *
 * It is the library's and is not optional: a datum that maps to a non-finite
 * pixel has nowhere to be drawn, and passing it through yields `M0,100L100,NaN`
 * — a `d` the browser abandons at the bad segment, silently truncating a line
 * and corrupting a fill outright. `extentOf` already keeps such values out of
 * the DOMAIN; this keeps them out of the MARK, which is the other half of the
 * same policy and does not follow from the first.
 *
 * A chart with two marks (AreaChart's fill and its top stroke) builds this once
 * per mark from the same inputs, so the two break at exactly the same points.
 */
export function finiteDefined<T>(
  px: (d: T) => number,
  py: (d: T) => number,
  userDefined?: (d: T, index: number) => boolean,
): (d: T, index: number) => boolean {
  return (d, index) =>
    Number.isFinite(px(d)) && Number.isFinite(py(d)) && (userDefined?.(d, index) ?? true);
}

/**
 * The x scale a time-series chart builds: a time scale over the data's EXTENT,
 * not its first and last datum.
 *
 * Taking the ends assumed the series was already sorted, and silently drew
 * nonsense when it was not: `[Jan 10, Jan 1, Jan 5]` produced a REVERSED domain,
 * and the middle point rendered outside the plot area entirely (scales do not
 * clamp by default). The comment that used to sit at each call site claimed the
 * opposite — that reading the ends stopped a stray out-of-order point widening
 * the axis. It never did that; it just failed differently.
 *
 * The contract is: the domain covers your data, and the marks follow your array.
 * The second half is d3-shape's own behaviour, and the honest fix for a
 * scrambled series is to sort it before passing it in. Sorting here is the only
 * super-linear option, and this scan is one the y-axis already makes over the
 * same array.
 */
export function timeExtentScale(
  data: readonly TimePoint[],
  range: [number, number],
): ScaleTime<number, number> {
  const [lo, hi] = extentOf(data, (d) => d.t.getTime());
  return timeScale({ domain: [new Date(lo), new Date(hi)], range });
}

/**
 * Default table rows for a time series. Timestamps go out as ISO 8601: it is
 * unambiguous and locale-independent, and anything friendlier is domain wording
 * this library would be inventing — pass `table.rows` to control it.
 */
export function timePointRows(data: readonly TimePoint[]): readonly ChartTableRow[] {
  return data.map((d) => [d.t.toISOString(), d.y] as const);
}
