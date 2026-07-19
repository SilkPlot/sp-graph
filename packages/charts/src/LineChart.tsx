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
import { createMemo, Show, type Component } from "solid-js";
import { linePath, type CurveName, type Series } from "@silkplot/core";
import {
  ChartAnnouncer,
  ChartEmptyMark,
  ChartEmptyState,
  ChartKeyboardSurface,
  Crosshair,
  DEFAULT_EMPTY_MESSAGE,
  createActiveDatum,
  createCartesianModel,
  createChartKeyboard,
  type ActiveDatum,
  type ChartKeyboard,
  type ChartSemantics,
  type ChartSemanticsProps,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import { createMultiSeriesScope } from "./multi-series";
import { MultiSeriesBody } from "./MultiSeriesBody";
import {
  ChartShell,
  StrokedLine,
  assertOneInput,
  TIME_SERIES_COLUMNS,
  createInspectableSemantics,
  createTimeSeriesScope,
  finiteDefined,
  timePointRows,
  type TimeSeriesChartProps,
  type TimeSeriesScope,
} from "./scaffold";
import type { TimePoint } from "./types";

export interface LineChartBaseProps extends TimeSeriesChartProps {
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
  /**
   * Give the chart the single-entry keyboard composite. Default: true for an
   * informative chart, always off for a decorative one.
   *
   * On by default because ADR-0005 makes the keyboard model library behaviour
   * rather than a per-application reference, and because "optional
   * accessibility ships as absent accessibility" is the failure this contract
   * exists to prevent. Tab reaches the chart once; arrows, Home/End and Page
   * keys move within it; Tab leaves. A decorative chart is out of the
   * accessibility tree entirely, so a focusable surface on one would be a tab
   * stop that announces nothing.
   */
  keyboard?: boolean;
  /**
   * How many points a Page Up / Page Down step covers. Default:
   * `DEFAULT_PAGE_SIZE`, an engineering policy rather than a standard.
   */
  pageSize?: number;
  /**
   * Accessible wording for one point — series, x, y, and units. Default: the
   * chart's own name, the ISO timestamp, and the value.
   *
   * The default is honest but not good: ADR-0005 §4 asks for "Bookings, Tuesday
   * 4 March, 42 appointments", and the library knows neither that the unit is
   * appointments nor how this application writes a date. Supply this and the
   * announcement becomes a sentence instead of a reading of the data.
   */
  pointLabel?: (d: TimePoint, index: number) => string;
  /**
   * Which channel carries a keyboard step.
   *
   * - `"live"` (default) — a polite live region, per ADR-0005 §4.
   * - `"option"` — `aria-activedescendant` moves to the rendered option, which
   *   is the APG mechanism for a listbox and avoids depending on live-region
   *   behaviour that varies by reader and version.
   *
   * They are mutually exclusive by construction. Running both announces every
   * step twice.
   */
  announce?: "live" | "option";
}

/**
 * The two input shapes, as a discriminated pair.
 *
 * `series?: never` and `data?: never` are what make "both at once" a COMPILE
 * error rather than only a runtime one — the same technique ADR-0005 uses to
 * make "informative and unnamed" unrepresentable. The runtime backstop in the
 * component remains, for callers who reach this untyped.
 *
 * The single-series `data` prop is NOT deprecated. A one-series chart is a
 * permanent, legitimate use rather than a transitional one, and churning every
 * existing consumer to express it as a one-element array would buy nothing
 * (ADR-0008 §12).
 */
export interface SingleSeriesInput {
  /** The series to plot, as `{ t: Date, y: number }[]`. */
  data: readonly TimePoint[];
  series?: never;
  visibleSeries?: never;
}

export interface MultiSeriesInput {
  /**
   * Stable series, each with its own id, label, gap policy, and style.
   *
   * `Series<unknown>`, deliberately NOT generic on the metadata type. The
   * generic exists in `core` and flows through the model, but the chart exposes
   * no callback that hands it back yet — tooltip and activation are a later
   * contract — so a generic here would buy nothing and cost real compatibility:
   * a generic function component is not assignable to Solid's `Component<P>`,
   * which breaks `createComponent(LineChart, …)`, the exact call JSX compiles
   * to. The packed-consumer release gate caught this outside the workspace,
   * where the workspace's own JSX call sites could not.
   *
   * A caller's `Series<Reading>[]` is assignable here, so no metadata is lost
   * on the way in. The generic returns when a surface exists that gives it back.
   */
  series: readonly Series[];
  /**
   * Controlled visibility by series id (ADR-0008 §6). Omit for uncontrolled —
   * every series visible. An EMPTY array means nothing is visible, and is a
   * real state rather than "no filter".
   */
  visibleSeries?: readonly string[];
  data?: never;
}

/**
 * A line chart is informative by default and must be named — see
 * `ChartSemanticsProps`. `decorative` is the explicit opt-out; there is no
 * implicit one.
 */
export type LineChartProps = LineChartBaseProps &
  (SingleSeriesInput | MultiSeriesInput) &
  ChartSemanticsProps;

type LineChartBodyProps = LineChartBaseProps & {
  data: readonly TimePoint[];
  semantics: ChartSemantics;
  scope: TimeSeriesScope;
};

/**
 * The visual mark for the active point.
 *
 * Drawn in SIZE and OUTLINE as well as colour so it survives a monochrome
 * rendering (ADR-0005 §5) — a keyboard user who can see the screen gets nothing
 * from an announcement alone. The surface-coloured under-ring keeps it legible
 * where it crosses a gridline.
 */
const ActivePoint: Component<{ cx: number; cy: number }> = (props) => (
  <>
    <circle
      cx={props.cx}
      cy={props.cy}
      r="7"
      fill="none"
      stroke="var(--sp-color-surface, #ffffff)"
      stroke-width="4"
    />
    <circle
      cx={props.cx}
      cy={props.cy}
      r="7"
      fill="none"
      stroke="var(--sp-color-cursor, currentColor)"
      stroke-width="2"
    />
    <Crosshair x={props.cx} y={props.cy} />
  </>
);

interface KeyboardLayerProps {
  keyboard: ChartKeyboard;
  active: ActiveDatum;
  semantics: ChartSemantics;
  /** Wording for one point, by index. Empty string for an index with no datum. */
  pointLabel: (index: number) => string;
  /** True when the live region carries the step; false when `aria-activedescendant` does. */
  live: boolean;
}

/**
 * The keyboard composite and its announcement channel — everything outside the
 * `<svg>` that makes the chart operable without a pointer.
 *
 * The two channels are mutually exclusive by construction. In `"live"` mode a
 * polite region carries the committed step, throttled inside `ChartAnnouncer` so
 * a held arrow key announces at the primitive's policy rate rather than the
 * key-repeat rate, with the last point of a burst always left in the region. In
 * `"option"` mode `aria-activedescendant` carries it instead. Rendering both
 * would announce every step twice.
 */
const KeyboardLayer: Component<KeyboardLayerProps> = (props) => {
  const named = (): string => props.semantics.name();

  return (
    <>
      <ChartKeyboardSurface
        keyboard={props.keyboard}
        optionLabel={props.pointLabel}
        activeDescendant={!props.live}
        label={named() ? `${named()}. Use arrow keys to step through points.` : undefined}
        labelledBy={named() ? undefined : props.semantics.labelledBy()}
        describedBy={props.semantics.describedBy()}
      />
      <Show when={props.live}>
        <ChartAnnouncer
          message={
            props.active.index() === undefined ? "" : props.pointLabel(props.active.index() as number)
          }
        />
      </Show>
    </>
  );
};

/**
 * The chart's keyboard state and the wording it announces.
 *
 * Pulled out of the body because it is a self-contained concern: which datum is
 * active, whether the surface is offered at all, and how one point reads aloud.
 * The body is then about marks and layout, which is what a reader opens it for.
 *
 * ONE active-datum state, deliberately. The keyboard writes it here; a pointer
 * model writes the same object when composed-chart hit-testing arrives. There is
 * no second place to keep an answer, which is what stops the cursor and the
 * announcement ever describing different points (ADR-0002 §1, §4).
 */
function createLineKeyboard(props: LineChartBodyProps) {
  // Every read below is of the VISIBLE series, not the caller's whole array.
  // Stepping through points that are not drawn would announce values with no
  // mark on screen and move the active-point cursor to coordinates outside the
  // plotting box — one state, describing one picture (ADR-0002 §1).
  const visible = (): readonly TimePoint[] => props.scope.visible();

  const active = createActiveDatum({
    count: () => visible().length,
    pageSize: props.pageSize,
  });
  const keyboard = createChartKeyboard({ active });
  const sem = (): ChartSemantics => props.semantics;

  return {
    active,
    keyboard,
    /** Off for a decorative chart: a focusable surface announcing nothing is a dead tab stop. */
    enabled: (): boolean => !sem().decorative() && (props.keyboard ?? true),
    /** True when a live region carries the step, false when `aria-activedescendant` does. */
    live: (): boolean => (props.announce ?? "live") === "live",
    datum: (): TimePoint | undefined => {
      const i = active.index();
      return i === undefined ? undefined : visible()[i];
    },
    pointLabel: (index: number): string => {
      const d = visible()[index];
      if (d === undefined) return "";
      if (props.pointLabel) return props.pointLabel(d, index);
      // ISO 8601 for the same reason the derived table rows use it: it is
      // unambiguous and locale-independent, and anything friendlier is domain
      // wording this library would be inventing. The chart's own name stands in
      // for the series context ADR-0005 §4 asks for.
      const series = sem().name();
      return series ? `${series}, ${d.t.toISOString()}, ${d.y}` : `${d.t.toISOString()}, ${d.y}`;
    },
  };
}

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. The scales
 * and the path are memos that recompute only when data or size change.
 */
const LineChartBody: Component<LineChartBodyProps> = (props) => {
  // Standalone this is the identity — all the data, the data's own extent. Inside
  // a `<Dashboard>` it narrows to the shared range. See `createTimeSeriesScope`.
  const scope = props.scope;

  const model = createCartesianModel({
    data: scope.visible,
    x: scope.xScale,
    // A line has no baseline to honour, so zero is only the floor — the top
    // stays the data's own maximum. Area and Bar deliberately differ, and an
    // all-negative series is the only input where you can see it.
    y: { accessor: (d) => d.y, domain: "zero-floor" },
  });

  const pathD = createMemo(() => {
    const xs = model.x();
    const ys = model.y();
    const px = (d: TimePoint): number => xs(d.t);
    const py = (d: TimePoint): number => ys(d.y);
    return linePath(scope.visible(), {
      x: px,
      y: py,
      defined: finiteDefined(px, py, props.defined),
      curve: props.curve ?? "monotoneX",
    });
  });

  const kb = createLineKeyboard(props);

  return (
    <>
      <CartesianFrame model={model} layout={props} semantics={props.semantics}>
        <StrokedLine d={pathD()} stroke={props.stroke} strokeWidth={props.strokeWidth} />
        {/* Solid's `<Show>` render-prop yields the narrowed `when` value itself. */}
        <Show when={kb.datum()}>
          {(d) => <ActivePoint cx={model.x()(d().t)} cy={model.y()(d().y)} />}
        </Show>
        <Show when={scope.isEmpty()}>
          <ChartEmptyMark message={props.emptyMessage ?? DEFAULT_EMPTY_MESSAGE} />
        </Show>
      </CartesianFrame>

      <ChartEmptyState when={scope.isEmpty()} message={props.emptyMessage} />

      <Show when={kb.enabled()}>
        <KeyboardLayer
          keyboard={kb.keyboard}
          active={kb.active}
          semantics={props.semantics}
          pointLabel={kb.pointLabel}
          live={kb.live()}
        />
      </Show>
    </>
  );
};

/** The multi-series path: one stroked path per visible series. */
const LineChartMulti: Component<
  LineChartBaseProps & MultiSeriesInput & { semantics: ChartSemantics }
> = (props) => {
  const scope = createMultiSeriesScope({
    series: () => props.series,
    visibleSeries: () => props.visibleSeries,
  });

  return (
    <ChartShell
      layout={props}
      semantics={props.semantics}
      rows={() => scope.table().rows}
      columns={scope.table().columns}
      latest={scope.isLatest}
    >
      <MultiSeriesBody
        scope={scope}
        layout={props}
        semantics={props.semantics}
        // A line has no baseline to honour, so zero is only the floor. Area
        // deliberately differs; an all-negative series is the only input where
        // you can see it.
        yDomain="zero-floor"
        emptyMessage={props.emptyMessage}
        renderSeries={(ctx) => (
          <StrokedLine
            d={linePath(ctx.points, {
              x: ctx.x,
              y: ctx.y,
              defined: finiteDefined(ctx.x, ctx.y, ctx.defined),
              curve: props.curve ?? "monotoneX",
            })}
            stroke={ctx.style.stroke}
            strokeWidth={ctx.style.strokeWidth}
            dash={ctx.style.dash}
          />
        )}
      />
    </ChartShell>
  );
};

export const LineChart: Component<LineChartProps> = (props) => {
  // Resolved OUTSIDE ChartRoot — see `ChartShell`, which is where the reason
  // lives now that all four charts share the arrangement.
  const semantics = createInspectableSemantics(props);

  // The runtime backstop for the compile-time pair above. Untyped callers reach
  // here too, and a chart drawing a phantom extra series is worse than a throw:
  // ADR-0008 §12 makes `series` win and diagnoses rather than merging.
  assertOneInput(props);

  return (
    <Show
      when={props.series !== undefined}
      fallback={<LineChartSingle {...(props as LineChartBaseProps & SingleSeriesInput)} semantics={semantics} />}
    >
      <LineChartMulti {...(props as LineChartBaseProps & MultiSeriesInput)} semantics={semantics} />
    </Show>
  );
};

/** The original single-series surface, unchanged — keyboard model and all. */
const LineChartSingle: Component<
  LineChartBaseProps & SingleSeriesInput & { semantics: ChartSemantics }
> = (props) => {
  // Outside ChartRoot for a second reason: the table is a sibling of the
  // measured box, so the scope has to be readable from both sides of it. The
  // table takes the VISIBLE rows — a table describing rows the picture does not
  // draw is the exact disagreement `ChartDataAlternative` exists to prevent.
  const scope = createTimeSeriesScope(() => props.data);

  return (
    <ChartShell
      layout={props}
      semantics={props.semantics}
      rows={() => timePointRows(scope.visible())}
      columns={TIME_SERIES_COLUMNS}
      latest={scope.isLatest}
    >
      <LineChartBody {...props} semantics={props.semantics} scope={scope} />
    </ChartShell>
  );
};
