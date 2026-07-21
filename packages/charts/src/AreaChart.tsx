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
import { createMemo, Show, type Component } from "solid-js";
import {
  areaPath,
  linePath,
  type ActivePoint,
  type CurveName,
  type SeriesDatum,
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
  InteractionLayer,
  PointMark,
  createTimeChartInspection,
  type TimeChartInspectionProps,
} from "./inspection";
import { CartesianFrame } from "./CartesianFrame";
import { createMultiSeriesScope } from "./multi-series";
import { MultiSeriesBody } from "./MultiSeriesBody";
import { ReferenceList } from "./ReferenceList";
import type { MultiSeriesInputWithFormat, SingleSeriesInput } from "./LineChart";
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
import { tableOptions } from "./formatters";

export interface AreaChartBaseProps extends TimeSeriesChartProps, TimeChartInspectionProps {
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
export type AreaChartProps = AreaChartBaseProps &
  (SingleSeriesInput | MultiSeriesInputWithFormat) &
  ChartSemanticsProps;

type AreaChartBodyProps = AreaChartBaseProps & {
  data: readonly TimePoint[];
  semantics: ChartSemantics;
  scope: TimeSeriesScope;
};

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All
 * scales and paths are memos that recompute only when data or size change.
 */
const AreaChartBody: Component<AreaChartBodyProps> = (props) => {
  // Standalone this is the identity; inside a `<Dashboard>` it narrows to the
  // shared range. See `createTimeSeriesScope`.
  const scope = props.scope;

  const model = createCartesianModel({
    data: scope.visible,
    x: scope.xScale,
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
    return areaPath(scope.visible(), { x, y0: baselineY(), y1: marks().y, defined, curve });
  });

  const lineD = createMemo(() => {
    const { x, y, defined, curve } = marks();
    return linePath(scope.visible(), { x, y, defined, curve });
  });

  // One active-datum state, shared by keyboard and pointer over the same
  // time-series index Line uses — Area and Line differ in their marks and never
  // in this (ADR-0016 §3).
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

  return (
    <>
      <CartesianFrame model={model} layout={props} semantics={props.semantics}>
        <path d={areaD()} fill={props.fill ?? "currentColor"} fill-opacity={props.fillOpacity ?? 0.2} stroke="none" />
        <StrokedLine d={lineD()} stroke={props.stroke} strokeWidth={props.strokeWidth} />
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
        />
      </Show>
    </>
  );
};

/** The multi-series path: one fill plus its top stroke, per visible series. */
const AreaChartMulti: Component<
  AreaChartBaseProps & MultiSeriesInputWithFormat & { semantics: ChartSemantics }
> = (props) => {
  const scope = createMultiSeriesScope({
    series: () => props.series,
    visibleSeries: () => props.visibleSeries,
    references: () => props.references,
    // A thunk, so a formatter closing over a signal re-runs the table.
    tableOptions: () => tableOptions(props),
  });

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
        area
        fillOpacity={props.fillOpacity}
        // The fill is drawn FROM zero, so zero must be inside the domain or the
        // flat edge lands on a pixel the axis labels as some other value. Line
        // deliberately differs; an all-negative series is where you see it.
        yDomain="zero-baseline"
        emptyMessage={props.emptyMessage}
        renderSeries={(ctx) => {
          // ONE defined predicate, built once and shared by both marks. Two
          // separately-built predicates would break the fill and its stroke at
          // different points — which renders, and reads as a drawing bug.
          const defined = finiteDefined(ctx.x, ctx.y, ctx.defined);
          const curve = props.curve ?? "monotoneX";
          return (
            <>
              <path
                d={areaPath(ctx.points, {
                  x: ctx.x,
                  y0: ctx.baseline,
                  y1: ctx.y,
                  defined,
                  curve,
                })}
                fill={ctx.style.fill}
                fill-opacity={ctx.style.fillOpacity}
                stroke="none"
              />
              <StrokedLine
                d={linePath(ctx.points, { x: ctx.x, y: ctx.y, defined, curve })}
                stroke={ctx.style.stroke}
                strokeWidth={ctx.style.strokeWidth}
                dash={ctx.style.dash}
              />
            </>
          );
        }}
      />
    </ChartShell>
  );
};

export const AreaChart: Component<AreaChartProps> = (props) => {
  const semantics = createInspectableSemantics(props);
  assertOneInput(props);

  return (
    <Show
      when={props.series !== undefined}
      fallback={
        <AreaChartSingle {...(props as AreaChartBaseProps & SingleSeriesInput)} semantics={semantics} />
      }
    >
      <AreaChartMulti {...(props as AreaChartBaseProps & MultiSeriesInputWithFormat)} semantics={semantics} />
    </Show>
  );
};

/** The original single-series surface, unchanged. */
const AreaChartSingle: Component<
  AreaChartBaseProps & SingleSeriesInput & { semantics: ChartSemantics }
> = (props) => {
  // Outside ChartRoot: the table is a sibling of the measured box, so the scope
  // must be readable from both sides of it, and the table takes the VISIBLE rows.
  const scope = createTimeSeriesScope(() => props.data);

  return (
    <ChartShell
      layout={props}
      semantics={props.semantics}
      rows={() => timePointRows(scope.visible())}
      columns={TIME_SERIES_COLUMNS}
      latest={scope.isLatest}
    >
      <AreaChartBody {...props} semantics={props.semantics} scope={scope} />
    </ChartShell>
  );
};
