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
  referenceDomainOf,
  resolveSeriesStyle,
  seriesGeometry,
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
import { InteractionLayer, PointMark } from "./inspection";
import type { CartesianChartProps } from "./scaffold";
import type { MultiSeriesScope } from "./multi-series";
import { ReferenceOverlay } from "./ReferenceOverlay";


/** What a chart needs to draw one series' marks. */
export interface SeriesRenderContext<M = unknown> {
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
    y: { accessor: (v) => v, domain: props.yDomain },
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
  const sem = (): ChartSemantics => props.semantics;
  const index = createMemo(() => {
    const m = mapping();
    const input = props.scope.drawn().map((s) => ({
      seriesId: s.id,
      points: s.data.filter((d) => d.state === "present"),
    }));
    return createTimeSeriesIndex<NormalizedDatum<M>>(input, {
      time: (d) => d.time,
      px: (d) => m.x(d),
      py: (d) => m.y(d),
      sourceIndex: (d) => d.sourceIndex,
    });
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
  const gestures = createViewportGestures({ viewport: props.scope.viewport });

  // The announcement wording: the PRIMARY series' label, the instant, the value.
  // The series label comes from the record's `seriesId`, so the spoken series
  // and the drawn mark cannot name different things.
  const label = (a: ActivePoint<SeriesDatum> | undefined): string => {
    if (a === undefined) return "";
    const series = props.scope.drawn().find((s) => s.id === a.seriesId);
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
        */}
        <For each={props.scope.drawn()}>
          {(series, i) => {
            const style = createMemo(() =>
              resolveSeriesStyle(series.style, series.sourceIndex, {
                area: props.area ?? false,
                fillOpacity: props.fillOpacity,
              }),
            );
            // Gap policy comes from `core`, not from a copy of it here. An
            // earlier draft inlined the same two branches, which is precisely
            // the duplication that disagrees silently: the model's table and
            // the chart's marks would each have had their own idea of which
            // points are drawn, and no test would have gone red when they
            // parted. One function, one answer.
            const geometry = createMemo(() => seriesGeometry(series));

            return (
              <Show when={series.data.length > 0}>
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
          viewportKeyDown={gestures.onKeyDown}
        />
      </Show>
    </>
  );
}
