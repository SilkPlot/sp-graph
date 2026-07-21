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
import {
  linePath,
  type ActivePoint,
  type CurveName,
  type ReferenceValue,
  type SeriesDatum,
  type Series,
} from "@silkplot/core";
import {
  ChartEmptyMark,
  ChartEmptyState,
  DEFAULT_EMPTY_MESSAGE,
  createCartesianModel,
  type ChartSemantics,
  type ChartSemanticsProps,
} from "@silkplot/solid";
import {
  BrushRect,
  InteractionLayer,
  PointMark,
  createTimeChartInspection,
  type TimeChartInspectionProps,
} from "./inspection";
import { CartesianFrame } from "./CartesianFrame";
import { createMultiSeriesScope } from "./multi-series";
import { MultiSeriesBody } from "./MultiSeriesBody";
import { ReferenceList } from "./ReferenceList";
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
import { emitViewportCommands, forwardViewport } from "./viewport-scope";
import { createViewportGestures } from "@silkplot/solid";
import type { TimePoint } from "./types";
import { tableOptions, type MultiSeriesFormatProps } from "./formatters";

export interface LineChartBaseProps extends TimeSeriesChartProps, TimeChartInspectionProps {
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
  /**
   * The §9 formatters are multi-series only, and these `never`s say so at
   * COMPILE time rather than ignoring the prop at runtime. The single-series
   * path has its own wording contract in `pointLabel`, wired to a keyboard
   * announcement this path does not have; silently accepting `yTickFormat` here
   * would produce a chart whose axis is unchanged and no error anywhere.
   *
   * Extending the formatters to the single-series axes is legitimate work and
   * is not this phase's — the surface below is what ADR-0008 §9 promised.
   */
  xTickFormat?: never;
  yTickFormat?: never;
  tableTimeFormat?: never;
  tableValueFormat?: never;
  /** Reference overlays are multi-series surface too — same reasoning as above. */
  references?: never;
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
  /**
   * Labelled reference lines (ADR-0008 §10) — an SLA floor at 95, a deployment
   * at 14:20. Each carries a `value` (horizontal, on the y axis) or a `time`
   * (vertical, on the x axis).
   *
   * `includeInDomain` defaults to **true**, so the axis expands to contain the
   * line: one drawn nowhere is a silent failure that looks exactly like a
   * working chart. Opt out for a target far outside the data, which would
   * otherwise compress every series into a band.
   *
   * **On the time axis that default governs the STANDALONE domain only.** Inside
   * a `<Dashboard>`, ADR-0007 §3's precedence over the visible interval is
   * total: the scope wins and an out-of-scope reference is clipped rather than
   * widening it, because a tile showing a different interval from the
   * dashboard's own range control would be unmarked and indistinguishable from
   * a bug.
   */
  references?: readonly ReferenceValue[];
  data?: never;
}

/**
 * The multi-series input, plus the caller formatting ADR-0008 §9 promised.
 *
 * Intersected rather than declared inline so `MultiSeriesFormatProps` stays one
 * definition with one set of doc comments, reachable from both charts and from
 * whatever consumes the surface next.
 */
export type MultiSeriesInputWithFormat = MultiSeriesInput & MultiSeriesFormatProps;

/**
 * A line chart is informative by default and must be named — see
 * `ChartSemanticsProps`. `decorative` is the explicit opt-out; there is no
 * implicit one.
 */
export type LineChartProps = LineChartBaseProps &
  (SingleSeriesInput | MultiSeriesInputWithFormat) &
  ChartSemanticsProps;

type LineChartBodyProps = LineChartBaseProps & {
  data: readonly TimePoint[];
  semantics: ChartSemantics;
  scope: TimeSeriesScope;
};

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. The scales
 * and the path are memos that recompute only when data or size change.
 */
const LineChartBody: Component<LineChartBodyProps> = (props) => {
  // Standalone this is the identity — all the data, the data's own extent. Inside
  // a `<Dashboard>` it narrows to the shared range. See `createTimeSeriesScope`.
  const scope = props.scope;

  const model = createCartesianModel({
    // `yData`, not `visible`: the y axis is computed from the effective-domain
    // data, BEFORE the viewport narrows x, so panning or zooming x leaves y
    // pinned (ADR-0014 §3). The marks below read `visible`, the viewport-narrowed
    // set. Standalone with no viewport prop the two are equal.
    data: scope.yData,
    x: scope.xScale,
    // A line has no baseline to honour, so zero is only the floor — the top
    // stays the data's own maximum. Area and Bar deliberately differ, and an
    // all-negative series is the only input where you can see it. The autoscale
    // snapshot, when set, fits y to the visible values under this same policy.
    y: {
      accessor: (d) => d.y,
      domain: "zero-floor",
      override: () => scope.viewport.autoscaledValueDomain(),
    },
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

  const insp = createTimeChartInspection({
    visible: scope.visible,
    model,
    semantics: () => props.semantics,
    defined: props.defined,
    keyboard: props.keyboard,
    pointer: props.pointer,
    pageSize: props.pageSize,
    announce: props.announce,
    pointLabel: props.pointLabel,
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<SeriesDatum> | undefined => insp.inspection.point();
  const gestures = createViewportGestures({
    viewport: scope.viewport,
    xScale: model.x,
    wheelZoom: () => props.wheelZoom,
    capturePlainWheel: () => props.capturePlainWheel,
    brushSelect: () => props.brushSelect,
    pinchZoom: () => props.pinchZoom,
  });

  return (
    <>
      <CartesianFrame model={model} layout={props} semantics={props.semantics}>
        <StrokedLine d={pathD()} stroke={props.stroke} strokeWidth={props.strokeWidth} />
        <Show when={gestures.brush()}>
          {(b) => <BrushRect x0={b().x0} x1={b().x1} height={model.bounds().innerHeight} />}
        </Show>
        {/* Solid's `<Show>` render-prop yields the narrowed `when` value itself. */}
        <Show when={active()}>
          {(a) => <PointMark cx={a().position.x} cy={a().position.y} />}
        </Show>
        <Show when={scope.isEmpty()}>
          <ChartEmptyMark message={props.emptyMessage ?? DEFAULT_EMPTY_MESSAGE} />
        </Show>
      </CartesianFrame>

      <ChartEmptyState when={scope.isEmpty()} message={props.emptyMessage} />

      <Show when={insp.enabled() || insp.pointer()}>
        <InteractionLayer
          inspection={insp.inspection}
          semantics={props.semantics}
          label={insp.label}
          live={insp.live()}
          keyboard={insp.enabled()}
          pointer={insp.pointer()}
          instruction="Use arrow keys to step through points."
          tooltip={props.tooltip}
          viewportGestures={gestures}
        />
      </Show>
    </>
  );
};

/** The multi-series path: one stroked path per visible series. */
const LineChartMulti: Component<
  LineChartBaseProps & MultiSeriesInputWithFormat & { semantics: ChartSemantics }
> = (props) => {
  const scope = createMultiSeriesScope({
    series: () => props.series,
    visibleSeries: () => props.visibleSeries,
    references: () => props.references,
    // Read through a thunk, not spread once: a formatter closing over a signal
    // must re-run the table when that signal changes.
    tableOptions: () => tableOptions(props),
    viewport: forwardViewport(props),
  });
  emitViewportCommands(props.onViewportCommands, scope.viewport);

  return (
    <ChartShell
      layout={props}
      semantics={props.semantics}
      rows={() => scope.table().rows}
      columns={scope.table().columns}
      latest={scope.isLatest}
      referenceList={
        <ReferenceList
          references={scope.references()}
          xTickFormat={props.xTickFormat}
          yTickFormat={props.yTickFormat}
        />
      }
    >
      <MultiSeriesBody
        scope={scope}
        layout={props}
        semantics={props.semantics}
        keyboard={props.keyboard}
        pointer={props.pointer}
        pageSize={props.pageSize}
        announce={props.announce}
        tooltip={props.tooltip}
        onActivate={props.onActivate}
        onActivePointChange={props.onActivePointChange}
        xTickFormat={props.xTickFormat}
        yTickFormat={props.yTickFormat}
        // A line has no baseline to honour, so zero is only the floor. Area
        // deliberately differs; an all-negative series is the only input where
        // you can see it.
        yDomain="zero-floor"
        emptyMessage={props.emptyMessage}
        wheelZoom={props.wheelZoom}
        capturePlainWheel={props.capturePlainWheel}
        brushSelect={props.brushSelect}
        pinchZoom={props.pinchZoom}
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
      <LineChartMulti {...(props as LineChartBaseProps & MultiSeriesInputWithFormat)} semantics={semantics} />
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
  const scope = createTimeSeriesScope(() => props.data, forwardViewport(props));
  emitViewportCommands(props.onViewportCommands, scope.viewport);

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
