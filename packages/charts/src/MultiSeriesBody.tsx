/**
 * The body every MULTI-SERIES cartesian chart shares: the scope, the model, the
 * frame, and one mark group per visible series. What a series looks like is the
 * caller's — passed as a render function — because that is the only thing a line
 * and an area actually disagree about.
 *
 * ## Why this exists beside the single-series bodies rather than replacing them
 *
 * `LineChart` and `AreaChart` keep their original single-series path, and this
 * is a deliberate application of where the reuse priority STOPS: two things are
 * one thing only if they must CHANGE TOGETHER. These must not. The single-series
 * body carries a keyboard model, an announcement channel, and a point-label
 * contract that the multi-series surface deliberately does not have yet — the
 * active-datum model for many series is a separate decision, and inventing one
 * here would pre-empt it in the worst way, by shipping it.
 *
 * So the paths stay apart, with the reason recorded, until that decision exists.
 * Collapsing them now would bury a deliberate difference behind a shared name.
 */
import { createMemo, For, Show, type JSX } from "solid-js";
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
  ChartEmptyMark,
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
import { BrushRect, InteractionLayer, PointMark } from "./inspection";
import type { CartesianChartProps } from "./scaffold";
import { dataWithinInterval, type MultiSeriesScope } from "./multi-series";
import { ReferenceOverlay } from "./ReferenceOverlay";


/** What a chart needs to draw one series' marks. */
export interface SeriesRenderContext<M = unknown> {
  /**
   * The DATA-SCOPE series — identity, label, style, gap policy. Its `data` is
   * NOT viewport-narrowed; `points` below is. Row identity keys on this, so
   * it must stay stable across viewport commits (see the `For` note in the
   * body) — narrowed data lives in `points`, never here.
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
  /** Draw one series. Called once per visible series, in paint order. */
  renderSeries: (context: SeriesRenderContext<M>) => JSX.Element;
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
  tooltip?: (active: ActivePoint<SeriesDatum>) => JSX.Element;
  onActivate?: (active: ActivePoint<SeriesDatum>) => void;
  onActivePointChange?: (active: ActivePoint<SeriesDatum> | undefined) => void;
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

  const inspection = createChartInspection<SeriesDatum>({
    index,
    pageSize: props.pageSize,
    pointer: () => !sem().decorative() && (props.pointer ?? true),
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<SeriesDatum> | undefined => inspection.point();
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
  const label = (a: ActivePoint<SeriesDatum> | undefined): string => {
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
      >
        {/*
          `For`, not `Index`: series are keyed by identity, and `For` re-uses a
          row's DOM when the item is the same reference while `Index` re-uses it
          by position. Under a reorder, `Index` would keep series 0's rendered
          path and hand it series 1's data — the exact identity failure ADR-0008
          §1 exists to prevent, expressed in the DOM instead of the model.

          `visible`, not `drawn`: the row is keyed on the DATA-SCOPE series,
          whose identity survives a viewport commit, and the viewport narrowing
          happens INSIDE the row (`drawnData` below). Keying on `drawn` handed
          `For` four fresh objects per commit, so every zoom step tore down and
          recreated every row — root, style memo, geometry, path node — which
          profiling attributed as the shared zoom/brush/range-drag
          budget miss. With stable rows, a commit re-runs only each row's
          geometry memos and updates the path attribute in place.
        */}
        <For each={props.scope.visible()}>
          {(series, i) => {
            const style = createMemo(() =>
              resolveSeriesStyle(series.style, series.sourceIndex, {
                area: props.area ?? false,
                fillOpacity: props.fillOpacity,
              }),
            );
            // The row's drawn points: the series narrowed to the applied
            // viewport interval, through the scope's ONE filter definition.
            const drawnData = createMemo(() => {
              const iv = props.scope.viewportInterval();
              return iv === undefined ? series.data : dataWithinInterval(series.data, iv);
            });
            // What this row PAINTS — the drawn points under the explicit
            // per-series decimation budget (ADR-0023). The shared-time index
            // above deliberately reads the RAW drawn set: the path is the
            // envelope, the active point is the truth. A non-present state
            // classifies as a gap, so decimation cannot connect across one.
            const plotted = createMemo(() => {
              const b = props.decimation;
              if (b === undefined) return drawnData();
              return decimateMinMax(drawnData(), b, {
                time: (d) => d.time,
                value: (d) => (d.state === "present" ? (d.y as number) : null),
              });
            });
            // Gap policy comes from `core`, not from a copy of it here. An
            // earlier draft inlined the same two branches, which is precisely
            // the duplication that disagrees silently: the model's table and
            // the chart's marks would each have had their own idea of which
            // points are drawn, and no test would have gone red when they
            // parted. One function, one answer.
            const geometry = createMemo(() => seriesGeometry({ ...series, data: plotted() }));

            return (
              <Show when={drawnData().length > 0}>
                {props.renderSeries({
                  series,
                  get style() {
                    return style();
                  },
                  get points() {
                    return geometry().points;
                  },
                  get defined() {
                    return geometry().defined;
                  },
                  get x() {
                    return mapping().x;
                  },
                  get y() {
                    return mapping().y;
                  },
                  get baseline() {
                    return baseline();
                  },
                  index: i(),
                })}
              </Show>
            );
          }}
        </For>

        {/*
          AFTER the series, so a threshold stays legible on a dense chart. The
          full reasoning — including why "above the marks" is achieved by paint
          order while "never over the axes" is achieved by clipping — is on
          `ReferenceOverlay` itself.
        */}
        <ReferenceOverlay
          references={props.scope.references()}
          position={(reference) =>
            reference.axis === "value"
              ? model.y()(reference.at)
              : model.x()(new Date(reference.at))
          }
          innerWidth={model.bounds().innerWidth}
          innerHeight={model.bounds().innerHeight}
        />

        <Show when={gestures.brush()}>
          {(b) => <BrushRect x0={b().x0} x1={b().x1} height={model.bounds().innerHeight} />}
        </Show>

        {/* The active mark, painted above the series and references so the
            cursor is never hidden behind a dense line. */}
        <Show when={active()}>
          {(a) => <PointMark cx={a().position.x} cy={a().position.y} />}
        </Show>

        <Show when={props.scope.isEmpty()}>
          <ChartEmptyMark message={props.emptyMessage ?? DEFAULT_EMPTY_MESSAGE} />
        </Show>
      </CartesianFrame>

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
