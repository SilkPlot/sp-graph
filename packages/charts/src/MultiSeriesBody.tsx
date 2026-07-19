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
import type { NormalizedDatum, NormalizedSeries, ScaleTime } from "@silkplot/core";
import {
  ChartEmptyMark,
  ChartEmptyState,
  DEFAULT_EMPTY_MESSAGE,
  createCartesianModel,
  type CartesianModel,
  type ChartSemantics,
  type YDomainPolicy,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import type { CartesianChartProps } from "./scaffold";
import type { MultiSeriesScope } from "./multi-series";
import { resolveSeriesStyle, type ResolvedSeriesStyle } from "./series-style";

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
  /** Draw one series. Called once per visible series, in paint order. */
  renderSeries: (context: SeriesRenderContext<M>) => JSX.Element;
}

/**
 * Every visible datum, flattened.
 *
 * This is what the cartesian model reads to build the y domain, and flattening
 * is correct rather than lazy: the y axis of a multi-series chart describes ALL
 * the visible series at once, so its extent is the extent of their union. The
 * per-series structure is preserved everywhere it matters — identity, gap
 * policy, paint order — and is genuinely irrelevant to a min/max.
 */
function flatten<M>(series: readonly NormalizedSeries<M>[]): readonly NormalizedDatum<M>[] {
  const out: NormalizedDatum<M>[] = [];
  for (const s of series) out.push(...s.data);
  return out;
}

export function MultiSeriesBody<M = unknown>(props: MultiSeriesBodyProps<M>): JSX.Element {
  const model: CartesianModel<ScaleTime<number, number>> = createCartesianModel({
    data: () => flatten(props.scope.visible()),
    x: props.scope.xScale,
    y: {
      // A gap contributes nothing to the domain. `NaN` rather than a skip,
      // because that is how `extentOf` already excludes a value — routing it
      // through one policy means the domain and the marks cannot disagree about
      // which values exist.
      accessor: (d) => (d.state === "present" ? (d.y as number) : Number.NaN),
      domain: props.yDomain,
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

  return (
    <>
      <CartesianFrame model={model} layout={props.layout} semantics={props.semantics}>
        {/*
          `For`, not `Index`: series are keyed by identity, and `For` re-uses a
          row's DOM when the item is the same reference while `Index` re-uses it
          by position. Under a reorder, `Index` would keep series 0's rendered
          path and hand it series 1's data — the exact identity failure ADR-0008
          §1 exists to prevent, expressed in the DOM instead of the model.
        */}
        <For each={props.scope.visible()}>
          {(series, i) => {
            const style = createMemo(() =>
              resolveSeriesStyle(series.style, series.sourceIndex, {
                area: props.area ?? false,
                fillOpacity: props.fillOpacity,
              }),
            );
            // Gap policy applied here, from the series' own setting. `connect`
            // yields a shorter array; `break` yields every point with the gaps
            // marked undrawn. See `seriesGeometry`.
            const geometry = createMemo(() => {
              if (series.nullPolicy === "connect") {
                return {
                  points: series.data.filter((d) => d.state === "present"),
                  defined: () => true,
                };
              }
              return {
                points: series.data,
                defined: (d: NormalizedDatum<M>) => d.state === "present",
              };
            });

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

        <Show when={props.scope.isEmpty()}>
          <ChartEmptyMark message={props.emptyMessage ?? DEFAULT_EMPTY_MESSAGE} />
        </Show>
      </CartesianFrame>

      <ChartEmptyState when={props.scope.isEmpty()} message={props.emptyMessage} />
    </>
  );
}
