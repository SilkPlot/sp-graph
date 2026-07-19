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
import { createMemo, type Accessor, type Component, type JSX } from "solid-js";
import {
  extentOf,
  timeScale,
  type EffectiveDomain,
  type ScaleTime,
} from "@silkplot/core";
import {
  ChartRoot,
  ChartDataAlternative,
  useDashboardTime,
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

/**
 * What a TIME-SERIES chart accepts on top of the shared layout props.
 *
 * Separate from `CartesianChartProps` because the categorical and point-cloud
 * charts have no time axis, so a dashboard's time range cannot narrow them and
 * they can never reach the empty state below. Offering them the prop anyway
 * would be a control that silently does nothing.
 */
export interface TimeSeriesChartProps extends CartesianChartProps {
  /**
   * Wording when a dashboard range contains none of this series. Default:
   * `DEFAULT_EMPTY_MESSAGE`. Only reachable inside a `<Dashboard>` — a
   * standalone chart draws its own data and cannot be empty this way.
   */
  emptyMessage?: string;
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

/** What a time-series chart draws, once the dashboard has had its say. */
export interface TimeSeriesScope {
  /** The data actually drawn — the caller's series, narrowed to the scope. */
  visible: Accessor<readonly TimePoint[]>;
  /** Build the x scale for a pixel range, over the scoped domain. */
  xScale: (range: [number, number]) => ScaleTime<number, number>;
  /** True when the scope is real and nothing falls inside it. */
  isEmpty: Accessor<boolean>;
}

/**
 * Narrow a time series to the dashboard scope it is rendered inside.
 *
 * Standalone — no `<Dashboard>` above — this is the identity: all the data, and
 * an x domain over its own extent, exactly as before dashboards existed. That is
 * what keeps the feature additive rather than a change to the published API.
 *
 * Inside a dashboard, three things move together and deliberately so:
 *
 *   - the **x domain** becomes the effective domain, because that is what
 *     ADR-0007 defines an effective domain to BE — what the chart draws over;
 *   - the **drawn data** is narrowed to it, because a d3 scale does not clamp,
 *     so an out-of-range datum would otherwise be painted outside the plotting
 *     box rather than excluded from it; and
 *   - the **y domain** follows the narrowed data, because it is computed from
 *     what is passed to `createCartesianModel`. An axis describing values no
 *     visible mark reaches is an axis that lies about its own picture.
 *
 * The third is a consequence, not a policy. An explicit choice between rescaling
 * y and pinning it belongs with the zoom and pan work that makes the question
 * routine, not here where the range moves only by a deliberate control.
 */
export function createTimeSeriesScope(data: Accessor<readonly TimePoint[]>): TimeSeriesScope {
  const dashboard = useDashboardTime();

  // `undefined` when standalone. Read inside the memo so a range change tracks.
  const domain = createMemo<EffectiveDomain | undefined>(() => dashboard?.resolve());

  const visible = createMemo<readonly TimePoint[]>(() => {
    const scope = domain();
    if (scope === undefined) return data();
    if (scope.kind === "empty") return [];

    const bounds = scope.kind === "range" ? scope : scope.bounds;
    const within = data().filter((d) => {
      const t = d.t.getTime();
      return t >= bounds.start && t <= bounds.end;
    });

    // Latest-value resolves to a bounded REQUEST (ADR-0007 §4) — the model
    // deliberately does not hold the data, so picking the point is this
    // consumer's job. `at most one` rather than `the last element`: an empty
    // in-range set stays empty rather than becoming an undefined datum.
    if (scope.kind === "latest") {
      let newest: TimePoint | undefined;
      for (const d of within) {
        if (newest === undefined || d.t.getTime() > newest.t.getTime()) newest = d;
      }
      return newest === undefined ? [] : [newest];
    }
    return within;
  });

  return {
    visible,
    xScale: (range) => {
      const scope = domain();
      // Standalone, or an empty scope with no interval of its own to show: fall
      // back to the data's extent, which is the pre-dashboard behaviour and the
      // only domain available when the scope itself resolved to nothing.
      if (scope === undefined || scope.kind === "empty") {
        return timeExtentScale(visible(), range);
      }
      const bounds = scope.kind === "range" ? scope : scope.bounds;
      return timeScale({
        domain: [new Date(bounds.start), new Date(bounds.end)],
        range,
      });
    },
    isEmpty: () => domain() !== undefined && visible().length === 0,
  };
}
