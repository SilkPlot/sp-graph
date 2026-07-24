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
import { createMemo, mergeProps, Show, type Accessor, type Component, type JSX } from "solid-js";
import {
  decimateMinMax,
  extentOf,
  isDevelopmentBuild,
  timeScale,
  type EffectiveDomain,
  type MsInterval,
  type NormalizedSeries,
  type ScaleTime,
  type TimeInterval,
  type ViewportCause,
} from "@silkplot/core";
import {
  ChartAnnouncer,
  ChartRoot,
  ChartDataAlternative,
  createChartSemantics,
  useDashboardSection,
  useDashboardTime,
  type ChartDataTable,
  type ChartSemanticsInput,
  type ChartSemantics,
  type ChartTableRow,
  type Margins,
  type Viewport,
  type ViewportCommands,
} from "@silkplot/solid";
import type { TimePoint } from "./types";
import {
  createScopeViewport,
  dashboardMemberViewport,
  dataExtentMs,
  type ChartViewportProps,
} from "./viewport-scope";

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
  /* --- The visible time viewport (ADR-0014 §3, §5). All optional and
     `Date` at the boundary (ADR-0017); absent → an uncontrolled viewport at the
     full extent, i.e. the chart draws its whole data exactly as before. The
     gesture adapters that drive this land in a later phase. --- */
  /**
   * Controlled visible time domain. Present → the caller owns navigation and
   * drives every change; absent → the chart owns an uncontrolled viewport
   * defaulting to the full extent (ADR-0008 §6's pattern).
   */
  visibleDomain?: TimeInterval;
  /** The domain a `reset` restores; absent → reset restores the full extent (or,
   *  inside a `<Dashboard>`, the effective domain). */
  defaultVisibleDomain?: TimeInterval;
  /** The zoom-in floor in ms, so a viewport cannot collapse to zero width. */
  minSpan?: number;
  /** Fired on every committed viewport change, with the `Date` domain and the
   *  ADR-0014 cause. A controlled caller feeding the emitted domain back into
   *  `visibleDomain` does not loop (ADR-0014 §7). */
  onVisibleDomainChange?: (domain: TimeInterval, cause: ViewportCause) => void;
  /** Receives the four explicit viewport commands (zoom in/out, autoscale, reset)
   *  once on mount, so an application can render its own toolbar (ADR-0014 §5)
   *  without controlling the domain itself. */
  onViewportCommands?: (commands: ViewportCommands) => void;
  /**
   * The maximum drawn points PER SERIES (ADR-0023). Absent → every point is
   * drawn. Present, and the viewport-narrowed set exceeds it → min/max-per-
   * bucket decimation bounds what is PAINTED: the envelope survives
   * structurally (an excursion is an extreme, so it cannot vanish), a bucket
   * containing a declared gap keeps a gap, and zooming re-decimates so a
   * window at or below the budget draws raw.
   *
   * Painting only. The hit index, keyboard cursor, announcements, tooltip,
   * table, and CSV all resolve against the RAW series at the resolved
   * instant — the path is the envelope; the active point is the truth. That
   * is why the active mark can sit off the drawn path on a zoomed-out dense
   * chart, and why `defined` sees decimated indexes only where it shapes the
   * painted line. Budgets below 2 clamp to 2.
   */
  decimation?: number;
  /* --- Gesture capture opt-in (ADR-0018 §2). Every one defaults to off — nothing
     captures the page's scroll or touch unless the caller asks. The keyboard needs
     no opt-in; it is always on the chart's keyboard composite. --- */
  /** Enable `Ctrl`/`Cmd`+wheel (and trackpad pinch) zoom. Default off. Plain
   *  vertical scrolling still moves the page. */
  wheelZoom?: boolean;
  /** Enable two-finger pinch zoom on a touch screen. Default off. */
  pinchZoom?: boolean;
  /** Enable the drag-to-brush gesture (zoom to the dragged interval). Default off. */
  brushSelect?: boolean;
  /** Let PLAIN wheel zoom, for a single full-bleed chart — the one escape hatch
   *  that trades page scroll for zoom (ADR-0014 §6). Default off. */
  capturePlainWheel?: boolean;
}

/**
 * Generic column headings, by chart shape.
 *
 * Deliberately generic, and deliberately not presented as domain language. The
 * library knows this axis carries instants and that one carries a number; it
 * does not know they are bookings, or rands, or degrees. Supplying `table.columns`
 * replaces these, and any chart with real units should.
 *
 * They exist because the alternative was worse: `columns` used to be required,
 * so a table nobody configured did not render at all — and a missing table is a
 * worse outcome for a non-visual reader than a generically-headed one.
 */
export const TIME_SERIES_COLUMNS: readonly string[] = ["Time", "Value"];
export const CATEGORY_COLUMNS: readonly string[] = ["Category", "Value"];
export const XY_COLUMNS: readonly string[] = ["X", "Y"];

/**
 * Resolve chart semantics with a table present by default.
 *
 * An informative chart that was given no `table` spec gets an empty one, so the
 * data alternative renders from the chart's own derived rows and headings. A
 * decorative chart gets nothing — it is out of the accessibility tree, so a
 * table would be a surface with no reader.
 *
 * `mergeProps`, not a spread: `props` is Solid's reactive proxy, and spreading
 * it reads every field once, in the component body, outside any tracking scope.
 * The chart would then hold the semantics it had at first render while its marks
 * followed the live props — the same class of bug ADR-0003 exists to prevent.
 */
export function createInspectableSemantics(props: ChartSemanticsInput): ChartSemantics {
  return createChartSemantics(
    mergeProps(props, {
      get defaultTable(): ChartDataTable | undefined {
        // `defaultTable`, not `table`: a library-supplied table renders, but
        // deliberately does not satisfy the missing-description check. It
        // carries the values a hidden axis would have shown and none of its
        // units, so a chart with nothing else must still report the gap.
        if (props.decorative === true) return undefined;
        return {};
      },
    }),
  );
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
  /** Generic headings for this chart's shape, used when the caller supplies none. */
  columns: readonly string[];
  /**
   * True while the chart is showing a single most-recent reading. Drives the
   * announcement below; a chart showing a range does not need one, because a
   * range is explored rather than watched.
   */
  latest?: Accessor<boolean>;
  /**
   * The accessible reference list (ADR-0008 §10), as an element rather than as
   * data. A slot, because the wording comes from the chart's own axis formatters
   * and threading those through here would give this shell a second opinion
   * about how a value reads — see `ReferenceList`.
   */
  referenceList?: JSX.Element;
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
    {/*
      Before the data table, and outside its disclosure. A chart typically
      carries three thresholds and hundreds of rows, so the list is short enough
      to sit open, and putting it behind the same toggle would hide the ONE
      surface that makes the overlay's dropped-label fallback acceptable.
    */}
    {props.referenceList}
    <ChartDataAlternative
      semantics={props.semantics}
      defaultRows={props.rows}
      defaultColumns={() => props.columns}
    />
    {/*
      A latest-value chart is a READING, and a reading that changes without
      being announced is invisible to a screen reader — the datum is redrawn,
      the table row is replaced, and nothing tells anyone. `ChartAnnouncer`
      throttles and de-duplicates, so a section that re-renders without its
      value changing stays silent.

      Only in latest mode, and MOUNTED only in latest mode. A live region that
      exists with an empty message is still an element, and LineChart's
      `announce="option"` path asserts there is no live region at all — two
      announcement channels running at once say everything twice.

      A chart CAN carry both this and the keyboard channel, and that is not the
      double-announcing ADR-0005 warns about: a keyboard region is silent until
      the user steps, and this one speaks only when the reading changes. They are
      different events. The `channel` name is what keeps them distinguishable.
    */}
    <Show when={props.latest?.()}>
      <ChartAnnouncer channel="latest" message={latestReading(props)} />
    </Show>
  </>
);

/**
 * The current reading, as a sentence, or empty when there is nothing to say.
 *
 * Built from the chart's own name and its single row, which is honest but
 * generic — the units and the phrasing are the application's, supplied through
 * the table's own columns. ADR-0005 §4 asks for "Bookings, Tuesday 4 March, 42
 * appointments"; this is the part of that the library can know.
 */
function latestReading(props: ChartShellProps): string {
  if (props.latest?.() !== true) return "";

  // Resolved exactly as `ChartDataAlternative` resolves it: the caller's spec
  // wins, the chart's derivation is the fallback. Reading `props.rows()`
  // directly looked equivalent and was not — a caller who supplied their own
  // `table.rows` got a table showing one thing and an announcement saying
  // another, which is the disagreement the shared derivation exists to prevent.
  const spec = props.semantics.table();
  const row = (spec?.rows ?? props.rows())[0];
  if (row === undefined) return "";
  const columns = spec?.columns ?? props.columns;

  const name = props.semantics.name();
  const cells = columns.map((column, i) => `${column} ${row[i] ?? ""}`).join(", ");
  return name ? `${name}: ${cells}` : cells;
}

/**
 * A stroked series path — the mark LineChart draws alone and AreaChart draws
 * over its fill. Identical in both, down to the joins: round, because a mitred
 * join on a sharp reversal spikes well past the data it is meant to describe.
 */
export const StrokedLine: Component<{
  d: string;
  stroke?: string;
  strokeWidth?: number;
  /**
   * `stroke-dasharray`. The redundant non-colour channel for a multi-series
   * chart (ADR-0005 §5) — two series a reader cannot separate by hue are still
   * separable by dash. Omitted, and on a single-series chart, the line is solid.
   */
  dash?: string;
}> = (props) => (
  <path
    d={props.d}
    fill="none"
    stroke={props.stroke ?? "currentColor"}
    stroke-width={props.strokeWidth ?? 1.5}
    stroke-dasharray={props.dash}
    stroke-linejoin="round"
    // `butt`, not `round`, when dashed: a round cap extends each dash by half a
    // stroke width at both ends, so a fine pattern closes up into a solid line
    // and the channel silently stops distinguishing anything.
    stroke-linecap={props.dash === undefined || props.dash === "none" ? "round" : "butt"}
  />
);

/**
 * ADR-0008 §12's runtime backstop: `data` and `series` are mutually exclusive.
 *
 * The typed props already make both-at-once unrepresentable, so this exists for
 * callers who arrive untyped — plain JavaScript, a cast, or props spread from a
 * config object. Development throws; production prefers `series` and diagnoses,
 * because silently merging them renders a chart with a phantom extra series and
 * nothing to indicate it.
 */
export function assertOneInput(
  props: { data?: unknown; series?: unknown },
  options: {
    /** Throw rather than warn. Defaults to `isDevelopmentBuild()`. */
    strict?: boolean;
    /** Diagnostic sink. Defaults to `console.warn`. */
    onIssue?: (message: string) => void;
    /**
     * What the second input is called on this chart. Defaults to `"series"`.
     *
     * A parameter rather than a hardcoded word because BarChart's second input
     * is `categories`, and a diagnostic naming a prop the caller never wrote
     * sends them looking for a `series` prop that does not exist on that chart.
     * A misleading diagnostic costs more than no diagnostic.
     */
    inputName?: string;
  } = {},
): void {
  if (props.data === undefined || props.series === undefined) return;
  const name = options.inputName ?? "series";
  const message =
    `SilkPlot: a chart was given both \`data\` and \`${name}\`. They are two spellings of ` +
    `the same input and cannot both apply. Merging them would draw data the caller never ` +
    `passed. \`${name}\` is used and \`data\` is ignored.`;
  if (options.strict ?? isDevelopmentBuild()) throw new Error(message);
  (options.onIssue ?? ((m: string) => console.warn(m)))(message);
}

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

/**
 * The points a single-series time chart PAINTS: the drawn set, bounded by the
 * caller's explicit `decimation` budget (ADR-0023). With no budget — or a
 * drawn set at or below it — this is the identity, same array reference.
 *
 * Painting only, deliberately: the callers wire their hit index, table, and
 * announcements to the RAW accessors, so nothing outside the path geometry
 * ever sees a decimated point. A non-finite y classifies as a gap, so
 * decimation can never connect the painted line across one.
 */
export function plottedPoints(
  visible: Accessor<readonly TimePoint[]>,
  budget: Accessor<number | undefined>,
): Accessor<readonly TimePoint[]> {
  return createMemo(() => {
    const b = budget();
    if (b === undefined) return visible();
    return decimateMinMax(visible(), b, {
      time: (d) => d.t.getTime(),
      value: (d) => (Number.isFinite(d.y) ? d.y : null),
    });
  });
}

/** What a time-series chart draws, once the dashboard and the viewport have had
 *  their say. */
export interface TimeSeriesScope {
  /**
   * The y-basis: the caller's data narrowed to the dashboard effective domain
   * ONLY — before the viewport narrows x. The y axis and the derived data table
   * are computed from this (ADR-0014 §3; ADR-0022), so panning or zooming x
   * leaves y pinned and the table unmoved; `autoscale` is the explicit opt-in
   * that fits y to the visible values. Standalone this is all the data.
   */
  yData: Accessor<readonly TimePoint[]>;
  /**
   * The data actually drawn — `yData` further narrowed to the viewport interval.
   * Feeds the marks and the hit index, so both describe the interval on screen —
   * NOT the table (ADR-0022). Standalone with no viewport prop this equals
   * `yData`.
   */
  visible: Accessor<readonly TimePoint[]>;
  /** Build the x scale for a pixel range, over the viewport interval (or the
   *  scoped domain where navigation does not apply). */
  xScale: (range: [number, number]) => ScaleTime<number, number>;
  /**
   * The applied viewport interval — `undefined` when navigation is not in
   * force (a chart at its default, or any dashboard member). The inspection
   * window and the drawn narrowing both read this one accessor, so the cursor
   * and the marks cannot disagree about what is on screen.
   */
  viewportInterval: Accessor<MsInterval | undefined>;
  /** True when the scope is real and nothing falls inside it. */
  isEmpty: Accessor<boolean>;
  /**
   * True when this chart is showing a single most-recent reading rather than a
   * range. A reading is a value, and a value that changes without being
   * announced is invisible to a screen reader.
   */
  isLatest: Accessor<boolean>;
  /** The viewport handle — the command surface a chart exposes to an
   *  application's toolbar, and the state the gesture adapters drive. */
  viewport: Viewport;
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
/**
 * A single time series wrapped as a one-element `NormalizedSeries`, so the
 * viewport's autoscale (which is written against the multi-series shape) can fit y
 * to a single-series chart's visible values (ADR-0018 §4). Only `time`, `y`, and
 * `state` are read by `autoscaleValueDomain`; the rest is the minimal valid shape.
 */
function pointsAsSeries(points: readonly TimePoint[]): NormalizedSeries {
  return {
    id: "series",
    label: "",
    nullPolicy: "break",
    style: {},
    visible: true,
    sourceIndex: 0,
    data: points.map((d, i) => ({
      t: d.t,
      time: d.t.getTime(),
      y: d.y,
      sourceIndex: i,
      state: Number.isFinite(d.y) ? "present" : "invalid",
    })),
  };
}

export function createTimeSeriesScope(
  data: Accessor<readonly TimePoint[]>,
  viewportProps: ChartViewportProps = {},
): TimeSeriesScope {
  const dashboard = useDashboardTime();
  const section = useDashboardSection();

  // `undefined` when standalone. Read inside the memo so a range change — or a
  // section whose own window moves — re-resolves. The section is passed THROUGH
  // the resolver rather than applied here, so the precedence rule keeps exactly
  // one definition (ADR-0007 §3).
  const domain = createMemo<EffectiveDomain | undefined>(() => dashboard?.resolve(section?.()));

  // The y-basis: narrowed to the effective domain ONLY. This is the pre-viewport
  // data — the axis is computed from it, so a zoom of x does not silently
  // autoscale y (ADR-0014 §3; the choice this scope previously deferred to "the
  // zoom and pan work"). Standalone it is all the data.
  const yData = createMemo<readonly TimePoint[]>(() => {
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

  // The viewport, bounded by the effective domain when composed and the full data
  // extent when standalone (ADR-0014 §3). `fullExtent` reads the WHOLE data, not
  // `yData`, so the outer bound is the data's own extent even under a dashboard
  // narrowing.
  const sv = createScopeViewport({
    fullExtent: dataExtentMs(() => data().map((d) => d.t.getTime())),
    effectiveDomain: domain,
    // The y-basis as a one-element series, so `autoscale()` fits y to the values
    // in the visible interval (it filters to the viewport itself, ADR-0018 §4).
    series: () => [pointsAsSeries(yData())],
    props: viewportProps,
  });

  // The applied viewport interval — undefined when navigation is not in force.
  const viewportInterval = createMemo<MsInterval | undefined>(() =>
    sv.navigable() ? sv.interval() : undefined,
  );

  // The drawn data: the y-basis narrowed to the viewport interval when the
  // viewport is applied (standalone AND opted in). Otherwise it is the y-basis
  // unchanged — a chart at its default, or any dashboard member — so no baseline
  // moves.
  const visible = createMemo<readonly TimePoint[]>(() => {
    const iv = viewportInterval();
    if (iv === undefined) return yData();
    return yData().filter((d) => {
      const t = d.t.getTime();
      return t >= iv.start && t <= iv.end;
    });
  });

  // The viewport the chart's GESTURES drive. An unsectioned dashboard member
  // drives the shared dynamic selection (dashboard-linked selection); a sectioned member (isolated)
  // and a standalone chart drive their own viewport. `dashboard`/`section` are
  // context presence — stable for this chart's life — so the choice is made once.
  const viewport = dashboardMemberViewport(dashboard, section, domain, sv.viewport);

  return {
    yData,
    visible,
    viewportInterval,
    viewport,
    xScale: (range) => {
      // Navigable: the x domain IS the viewport interval.
      if (sv.navigable()) {
        const iv = sv.interval();
        return timeScale({ domain: [new Date(iv.start), new Date(iv.end)], range });
      }
      // Not navigable — a chart at its default, or a dashboard scope. Exactly the
      // pre-P04b behaviour: the data extent standalone / on an empty scope, else
      // the effective-domain bounds.
      const scope = domain();
      if (scope === undefined || scope.kind === "empty") {
        return timeExtentScale(yData(), range);
      }
      const bounds = scope.kind === "range" ? scope : scope.bounds;
      return timeScale({
        domain: [new Date(bounds.start), new Date(bounds.end)],
        range,
      });
    },
    isEmpty: () => domain() !== undefined && visible().length === 0,
    isLatest: () => domain()?.kind === "latest",
  };
}
