/**
 * The body every MULTI-SERIES cartesian chart shares: the scope, the model, the
 * frame, and one Canvas paint pass over the visible series. What a series looks
 * like is the caller's — passed as a mark plan — because that is the only
 * thing a line and an area actually disagree about.
 *
 * ## Why this exists beside the single-series bodies rather than replacing them
 *
 * `LineChart` and `AreaChart` keep their original single-series path, and this
 * is a deliberate application of where the reuse priority STOPS: two things are
 * one thing only if they must CHANGE TOGETHER. These must not. Both paths carry
 * ADR-0016's keyboard/pointer active-datum model, but their inputs and rendering
 * work differ: the single-series body consumes `TimePoint[]`, while this body
 * normalizes stable series identity, visibility, shared-time columns, and
 * per-series paint. Collapsing them would hide those real differences.
 */
import { createMemo, Show, type JSX } from "solid-js";
import {
  createTimeSeriesIndex,
  decimateMinMax,
  referenceDomainOf,
  resolveSeriesStyle,
  seriesGeometry,
  windowActivePointIndex,
} from "@silkplot/core";
import type {
  ActivePoint,
  NormalizedDatum,
  NormalizedReference,
  NormalizedSeries,
  ResolvedSeriesStyle,
  ScaleTime,
  SeriesDatum,
} from "@silkplot/core";
import {
  ChartEmptyState,
  DEFAULT_EMPTY_MESSAGE,
  createCartesianModel,
  createChartInspection,
  createViewportGestures,
  type CartesianModel,
  type ChartSemantics,
  type YDomainPolicy,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import { paintFill, paintStroke, pushMark, type FillSpec, type StrokeSpec } from "./canvas-paint";
import type { CanvasMark } from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";
import { InteractionLayer } from "./inspection";
import type { CartesianChartProps } from "./scaffold";
import { dataWithinInterval, type MultiSeriesScope } from "./multi-series";


/** What a chart needs to draw one series' marks. */
export interface SeriesRenderContext<M = unknown> {
  /**
   * The DATA-SCOPE series — identity, label, style, gap policy. Its `data` is
   * NOT viewport-narrowed; `points` below is. Row identity keys on this, so
   * it must stay stable across viewport commits — narrowed data lives in
   * `points`, never here.
   */
  series: NormalizedSeries<M>;
  /** Resolved presentation — caller's style over the index-derived default. */
  style: ResolvedSeriesStyle;
  /** Pixel x for a datum. */
  x: (d: NormalizedDatum<M>) => number;
  /** Pixel y for a datum. Only meaningful where `defined` is true. */
  y: (d: NormalizedDatum<M>) => number;
  /** Whether a datum is drawn — the series' own gap policy, already applied. */
  defined: (d: NormalizedDatum<M>, index: number) => boolean;
  /** The points to pass a path generator, already filtered by gap policy. */
  points: readonly NormalizedDatum<M>[];
  /** Pixel y of the zero baseline. Charts drawn from zero need it; others ignore it. */
  baseline: number;
  /** Paint order index, which is also the palette index. */
  index: number;
}

/** Geometry a cartesian series will stroke or fill, computed off the paint path. */
export type SeriesMarkPlan =
  | { kind: "stroke"; d: string; spec: StrokeSpec }
  | { kind: "fill"; d: string; spec: FillSpec };

export interface MultiSeriesBodyProps<M = unknown> {
  scope: MultiSeriesScope<M>;
  layout: CartesianChartProps;
  semantics: ChartSemantics;
  /** The y-domain policy — the one thing that is never shared (see `scaffold`). */
  yDomain: YDomainPolicy;
  /** True when this chart fills under its line, so styles resolve a fill colour. */
  area?: boolean;
  fillOpacity?: number;
  emptyMessage?: string;
  /**
   * Axis tick formatters (ADR-0008 §9). Only the two axis props reach here —
   * the table formatters are applied where the table is DERIVED, in the scope,
   * so the rows this body never touches are already formatted by the time a
   * data alternative or a CSV export reads them.
   */
  xTickFormat?: (value: Date) => string;
  yTickFormat?: (value: number) => string;
  /**
   * Describe one series' Canvas marks (path `d` strings). Called from a memo
   * that does not track live brush / active-point chrome, so a drag restroke
   * reuses the same geometry instead of re-decimating and re-deriving paths.
   */
  seriesMarks: (context: SeriesRenderContext<M>) => readonly SeriesMarkPlan[];
  /** Maximum drawn points per series (ADR-0023) — see `TimeSeriesChartProps`.
   *  Painting only: the shared-time index below reads the RAW drawn set. */
  decimation?: number;
  /* --- Inspection (ADR-0016). The multi-series path gains one active-datum
     state here for the first time: a shared time cursor over every visible
     series, written by pointer and keyboard alike. --- */
  /** Keyboard composite. Default: true for an informative chart. */
  keyboard?: boolean;
  /** Pointer hover. Default: true for an informative chart. */
  pointer?: boolean;
  /** Page-step size for the keyboard. */
  pageSize?: number;
  /** Announcement channel. Default `"live"`. */
  announce?: "live" | "option";
  /** Tooltip content, as a render-prop (ADR-0016 §1). Receives the shared-time
   *  record — the primary datum plus `atTime` across every visible series. */
  tooltip?: (active: ActivePoint<SeriesDatum<M>>) => JSX.Element;
  onActivate?: (active: ActivePoint<SeriesDatum<M>>) => void;
  onActivePointChange?: (active: ActivePoint<SeriesDatum<M>> | undefined) => void;
  /* --- Viewport gesture capture opt-in (ADR-0018 §2), forwarded from the chart. --- */
  /** Enable `Ctrl`/`Cmd`+wheel zoom. Default off. */
  wheelZoom?: boolean;
  /** Let plain wheel zoom (full-bleed escape hatch). Default off. */
  capturePlainWheel?: boolean;
  /** Enable the drag-to-brush gesture. Default off. */
  brushSelect?: boolean;
  /** Enable two-pointer pinch zoom. Default off. */
  pinchZoom?: boolean;
}

/**
 * Every number the y domain must contain.
 *
 * Flattening across series is correct rather than lazy: the y axis of a
 * multi-series chart describes ALL the visible series at once, so its extent is
 * the extent of their union. The per-series structure is preserved everywhere it
 * matters — identity, gap policy, paint order — and is genuinely irrelevant to a
 * min/max.
 *
 * Two things are folded in here rather than downstream, so the domain has one
 * source and cannot disagree with itself:
 *
 *   - **A gap contributes `NaN`, not a skip.** That is how `extentOf` already
 *     excludes a value, so routing it through one policy means the domain and
 *     the marks cannot disagree about which values exist.
 *   - **Domain-participating VALUE references contribute their position**
 *     (ADR-0008 §10), because a threshold outside the domain has nowhere to be
 *     drawn and a line silently absent looks exactly like a working chart. A
 *     reference opting out with `includeInDomain: false` is filtered out by
 *     `referenceDomainOf` and never reaches here.
 */
function yContributions<M>(
  series: readonly NormalizedSeries<M>[],
  references: readonly NormalizedReference[],
): readonly number[] {
  const out: number[] = [];
  for (const s of series) {
    for (const d of s.data) out.push(d.state === "present" ? (d.y as number) : Number.NaN);
  }
  out.push(...referenceDomainOf(references, "value"));
  return out;
}

function prepareVisibleSeries<M>(args: {
  visible: readonly NormalizedSeries<M>[];
  interval: ReturnType<MultiSeriesScope<M>["viewportInterval"]>;
  budget: number | undefined;
  x: (d: NormalizedDatum<M>) => number;
  y: (d: NormalizedDatum<M>) => number;
  baseline: number;
  area: boolean;
  fillOpacity: number | undefined;
}): SeriesRenderContext<M>[] {
  const out: SeriesRenderContext<M>[] = [];
  args.visible.forEach((series, i) => {
    const drawn =
      args.interval === undefined ? series.data : dataWithinInterval(series.data, args.interval);
    if (drawn.length === 0) return;
    const plotted =
      args.budget === undefined
        ? drawn
        : decimateMinMax(drawn, args.budget, {
            time: (d) => d.time,
            value: (d) => (d.state === "present" ? (d.y as number) : null),
          });
    const geometry = seriesGeometry({ ...series, data: plotted });
    out.push({
      series,
      style: resolveSeriesStyle(series.style, series.sourceIndex, {
        area: args.area,
        fillOpacity: args.fillOpacity,
      }),
      points: geometry.points,
      defined: geometry.defined,
      x: args.x,
      y: args.y,
      baseline: args.baseline,
      index: i,
    });
  });
  return out;
}

function paintSeriesPlans(
  ctx: CanvasRenderingContext2D,
  resolve: StyleResolver,
  plans: readonly SeriesMarkPlan[],
): CanvasMark[] {
  const marks: import("./canvas-marks").CanvasMark[] = [];
  for (const plan of plans) {
    pushMark(
      marks,
      plan.kind === "stroke"
        ? paintStroke(ctx, plan.d, plan.spec, resolve)
        : paintFill(ctx, plan.d, plan.spec, resolve),
    );
  }
  return marks;
}

export function MultiSeriesBody<M = unknown>(props: MultiSeriesBodyProps<M>): JSX.Element {
  const model: CartesianModel<ScaleTime<number, number>> = createCartesianModel({
    // `visible`, not `drawn`: the y axis is computed from the effective-domain
    // data, before the viewport narrows x, so a zoom of x leaves y pinned
    // (ADR-0014 §3). The marks and hit index below read `drawn`, the
    // viewport-narrowed set; standalone with no viewport prop the two are equal.
    data: () => yContributions(props.scope.visible(), props.scope.references()),
    // Already numbers by the time they arrive — see `yContributions`, which is
    // where the gap policy and the reference contribution are applied together.
    x: props.scope.xScale,
    y: {
      accessor: (v) => v,
      domain: props.yDomain,
      override: () => props.scope.viewport.autoscaledValueDomain(),
    },
  });

  /** Pixel position of zero. Only meaningful under a policy that contains zero. */
  const baseline = createMemo(() => model.y()(0));

  /**
   * The pixel mapping, built ONCE per recompute and shared by every series and
   * every mark within a series. An area's fill and its top stroke reading two
   * separately-built mappings would break at different points — which renders,
   * and looks like a rendering bug rather than a wiring one.
   */
  const mapping = createMemo(() => {
    const xs = model.x();
    const ys = model.y();
    return {
      x: (d: NormalizedDatum<M>): number => xs(d.t),
      y: (d: NormalizedDatum<M>): number => ys(d.y as number),
    };
  });

  // Live brush and the active-point mark are chrome. They must not re-run
  // interval filtering, decimation, or path derivation — a drag overlay that
  // re-derives four dense series every frame is how the brush pass drops one.
  const seriesPlans = createMemo(() => {
    const map = mapping();
    const contexts = prepareVisibleSeries({
      visible: props.scope.visible(),
      interval: props.scope.viewportInterval(),
      budget: props.decimation,
      x: map.x,
      y: map.y,
      baseline: baseline(),
      area: props.area ?? false,
      fillOpacity: props.fillOpacity,
    });
    return contexts.flatMap((context) => props.seriesMarks(context));
  });

  // The shared-time lookup: every visible series' present points, keyed by
  // instant. `at` carries the whole column (`atTime`), so a tooltip reads every
  // series at the hovered instant, and `locate` bisects on pixel x (ADR-0014 §2).
  //
  // Built from the DATA-SCOPE series (`visible`), scale-free: the pixel
  // closures read `mapping()` live at call time, so a viewport commit does not
  // rebuild this structure — rebuilding it per commit over the raw points was
  // profiled as the dominant residual commit cost at density. The
  // commit pays two bisections in the windowed view below. Inspection over the
  // RAW points is also the ADR-0023 contract: the path is the envelope, the
  // active point is the truth.
  const sem = (): ChartSemantics => props.semantics;
  const structure = createMemo(() => {
    const input = props.scope.visible().map((s) => ({
      seriesId: s.id,
      points: s.data.filter((d) => d.state === "present"),
    }));
    return createTimeSeriesIndex<NormalizedDatum<M>>(input, {
      time: (d) => d.time,
      px: (d) => mapping().x(d),
      py: (d) => mapping().y(d),
      sourceIndex: (d) => d.sourceIndex,
    });
  });

  // The per-commit view: the structure, windowed to the applied viewport.
  const index = createMemo(() => {
    const inner = structure();
    const iv = props.scope.viewportInterval();
    if (iv === undefined) return inner;
    const { lo, hi } = inner.ordinalRange(iv.start, iv.end);
    return windowActivePointIndex(inner, lo, hi);
  });

  const inspection = createChartInspection<SeriesDatum<M>>({
    index,
    pageSize: props.pageSize,
    pointer: () => !sem().decorative() && (props.pointer ?? true),
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<SeriesDatum<M>> | undefined => inspection.point();
  const keyboardOn = (): boolean => !sem().decorative() && (props.keyboard ?? true);
  const pointerOn = (): boolean => !sem().decorative() && (props.pointer ?? true);
  const live = (): boolean => (props.announce ?? "live") === "live";
  const gestures = createViewportGestures({
    viewport: props.scope.viewport,
    xScale: model.x,
    wheelZoom: () => props.wheelZoom,
    capturePlainWheel: () => props.capturePlainWheel,
    brushSelect: () => props.brushSelect,
    pinchZoom: () => props.pinchZoom,
  });

  // The announcement wording: the PRIMARY series' label, the instant, the value.
  // The series label comes from the record's `seriesId`, so the spoken series
  // and the drawn mark cannot name different things.
  const label = (a: ActivePoint<SeriesDatum<M>> | undefined): string => {
    if (a === undefined) return "";
    const series = props.scope.visible().find((s) => s.id === a.seriesId);
    const name = series?.label ?? sem().name();
    const t = (a.datum.t as Date).toISOString();
    return name ? `${name}, ${t}, ${a.datum.y}` : `${t}, ${a.datum.y}`;
  };

  return (
    <>
      <CartesianFrame
        model={model}
        layout={props.layout}
        semantics={props.semantics}
        xFormat={props.xTickFormat}
        yFormat={props.yTickFormat}
        paint={(ctx, _plot, resolve) => paintSeriesPlans(ctx, resolve, seriesPlans())}
        chrome={() => {
          const a = active();
          return {
            references: props.scope.references(),
            position: (reference) =>
              reference.axis === "value"
                ? model.y()(reference.at)
                : model.x()(new Date(reference.at)),
            brush: gestures.brush(),
            point: a === undefined ? undefined : { cx: a.position.x, cy: a.position.y },
            empty: props.scope.isEmpty()
              ? (props.emptyMessage ?? DEFAULT_EMPTY_MESSAGE)
              : undefined,
          };
        }}
      />

      <ChartEmptyState when={props.scope.isEmpty()} message={props.emptyMessage} />

      <Show when={keyboardOn() || pointerOn()}>
        <InteractionLayer
          inspection={inspection}
          semantics={props.semantics}
          label={label}
          live={live()}
          keyboard={keyboardOn()}
          pointer={pointerOn()}
          instruction="Use arrow keys to step through points."
          tooltip={props.tooltip}
          viewportGestures={gestures}
        />
      </Show>
    </>
  );
}
