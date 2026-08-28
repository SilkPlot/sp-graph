/**
 * HistogramChart — a Cartesian bar of bins, on Canvas.
 *
 * Layout is compute in `@silkplot/core` (`computeHistogram` / `layoutHistogram`).
 * This file hosts the cartesian frame, paints bin rects, and wires the same
 * inspection surface the other composed charts use. Binning is D3, not Plotly
 * implicit autobinx. Hover and selection address a bin (interval plus count,
 * or density when that channel is drawn).
 *
 * A single series is distinguished by position and length. Multi-series
 * identity is a fill pattern plus the series label on the table — colour is
 * never the only differentiator.
 *
 * The named graphic is the empty `SvgLayer` title/desc-only exception the
 * Canvas cartesian work already landed. Marks paint on Canvas. No new SVG.
 */
import { Show, createMemo, type Component, type JSX } from "solid-js";
import {
  computeHistogram,
  createHistogramIndex,
  histogramEncoded,
  layoutHistogram,
  linearScale,
  type ActivePoint,
  type HistogramDatum,
  type HistogramObservation,
  type HistogramValue,
} from "@silkplot/core";
import {
  createCartesianModel,
  type ChartSemantics,
  type ChartSemanticsProps,
  type ChartTableRow,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import { InteractionLayer, useInspection, type KeyboardHoverProps } from "./inspection";
import { paintHistogramMarks } from "./histogram-paint";
import {
  ChartShell,
  histogramTableColumns,
  createInspectableSemantics,
  type CartesianChartProps,
} from "./scaffold";

export type { HistogramObservation, HistogramDatum, HistogramValue };

export interface HistogramChartBaseProps extends CartesianChartProps, KeyboardHoverProps {
  /** Raw values to bin, as `{ value, series? }[]`. */
  data: readonly HistogramObservation[];
  /**
   * Equal-width bin count, or explicit interior thresholds for D3's `bin`.
   * Absent → D3's default, frozen from the combined sample.
   */
  thresholds?: number | readonly number[];
  /** Binning domain. Absent → extent of finite values. */
  domain?: readonly [number, number];
  /** Bar height encodes count (default) or probability density. */
  value?: HistogramValue;
  /** Accessible wording for one bin — series, interval, count or density. */
  binLabel?: (d: HistogramDatum, index: number) => string;
  tooltip?: (active: ActivePoint<HistogramDatum>) => JSX.Element;
  onActivate?: (active: ActivePoint<HistogramDatum>) => void;
  onActivePointChange?: (active: ActivePoint<HistogramDatum> | undefined) => void;
}

export type HistogramChartProps = HistogramChartBaseProps & ChartSemanticsProps;

type HistogramBodyProps = HistogramChartBaseProps & { semantics: ChartSemantics };

function histogramWording(
  props: HistogramBodyProps,
  active: ActivePoint<HistogramDatum> | undefined,
): string {
  if (active === undefined) return "";
  if (props.binLabel) return props.binLabel(active.datum, active.sourceIndex);
  const name = props.semantics.name();
  const measure = props.value === "density" ? active.datum.density : active.datum.count;
  const point = `${active.datum.series}, ${active.datum.x0}–${active.datum.x1}, ${measure}`;
  return name ? `${name}, ${point}` : point;
}

function histogramRows(
  data: readonly HistogramObservation[],
  options: {
    seriesFallback: string;
    thresholds?: number | readonly number[];
    domain?: readonly [number, number];
    density: boolean;
  },
): readonly ChartTableRow[] {
  const computed = computeHistogram(data, {
    seriesFallback: options.seriesFallback,
    thresholds: options.thresholds,
    domain: options.domain,
  });
  const multi = computed.series.length > 1;
  return computed.bins.map((bin) => {
    const cells: (string | number)[] = [];
    if (multi) cells.push(bin.series);
    cells.push(bin.x0, bin.x1, bin.count);
    if (options.density) cells.push(bin.density);
    return cells as ChartTableRow;
  });
}

const HistogramChartBody: Component<HistogramBodyProps> = (props) => {
  const fallback = (): string => props.semantics.name() || "series";
  const computed = createMemo(() =>
    computeHistogram(props.data, {
      seriesFallback: fallback(),
      thresholds: props.thresholds,
      domain: props.domain,
    }),
  );
  const model = createCartesianModel({
    data: () => computed().bins,
    x: (range) => linearScale({ domain: computed().xDomain, range, nice: false }),
    y: {
      accessor: (d) => histogramEncoded(d, props.value),
      domain: "zero-baseline",
    },
  });
  const laid = createMemo(() =>
    layoutHistogram(computed(), {
      x: model.x(),
      y: model.y(),
      value: props.value,
      width: model.bounds().innerWidth,
    }),
  );
  const index = createMemo(() =>
    createHistogramIndex(laid().marks, props.semantics.name() || "histogram", props.value),
  );
  const insp = useInspection<HistogramDatum>({
    index,
    semantics: () => props.semantics,
    keyboard: props.keyboard,
    pointer: props.pointer,
    pageSize: props.pageSize,
    announce: props.announce,
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<HistogramDatum> | undefined => insp.inspection.point();
  const patterned = (): boolean => computed().series.length > 1;

  return (
    <>
      <CartesianFrame
        model={model}
        layout={props}
        semantics={props.semantics}
        paint={(ctx, _plot, resolve) =>
          paintHistogramMarks(ctx, laid().marks, active()?.sourceIndex, resolve, patterned())
        }
      />
      <Show when={insp.enabled() || insp.pointer()}>
        <InteractionLayer
          inspection={insp.inspection}
          semantics={props.semantics}
          label={(a) => histogramWording(props, a)}
          live={insp.live()}
          keyboard={insp.enabled()}
          pointer={insp.pointer()}
          instruction="Use arrow keys to step through bins."
          tooltip={props.tooltip}
        />
      </Show>
    </>
  );
};

export const HistogramChart: Component<HistogramChartProps> = (props) => {
  const semantics = createInspectableSemantics(props);
  const fallback = (): string => semantics.name() || "series";
  const density = (): boolean => props.value === "density";
  const computed = () =>
    computeHistogram(props.data, {
      seriesFallback: fallback(),
      thresholds: props.thresholds,
      domain: props.domain,
    });
  return (
    <ChartShell
      layout={props}
      semantics={semantics}
      rows={() =>
        histogramRows(props.data, {
          seriesFallback: fallback(),
          thresholds: props.thresholds,
          domain: props.domain,
          density: density(),
        })
      }
      columns={histogramTableColumns({
        series: computed().series.length > 1,
        density: density(),
      })}
    >
      <HistogramChartBody {...props} semantics={semantics} />
    </ChartShell>
  );
};
