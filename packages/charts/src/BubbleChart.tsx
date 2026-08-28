/**
 * BubbleChart — scatter with a numeric size channel, on Canvas.
 *
 * Layout is compute in `@silkplot/core` (`computeBubble` / `layoutBubble`).
 * This file hosts the cartesian frame, paints sized markers, and wires the
 * same inspection surface the other composed charts use. Size is the
 * magnitude channel. Series identity is a marker symbol plus a label —
 * colour is never the only differentiator.
 *
 * The named graphic is the empty `SvgLayer` title/desc-only exception the
 * Canvas cartesian work already landed. Marks paint on Canvas. No new SVG.
 */
import { Show, createMemo, type Component, type JSX } from "solid-js";
import {
  BUBBLE_SIZE_LEGEND_RIGHT,
  bubbleSizeTicks,
  computeBubble,
  createBubbleIndex,
  extentOf,
  layoutBubble,
  linearScale,
  type ActivePoint,
  type BubbleDatum,
  type BubbleObservation,
} from "@silkplot/core";
import {
  createCartesianModel,
  type ChartSemantics,
  type ChartSemanticsProps,
  type ChartTableRow,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import { CanvasPlot } from "./canvas-plot";
import { InteractionLayer, useInspection, type KeyboardHoverProps } from "./inspection";
import { paintBubbleMarks, paintBubbleSizeLegend } from "./bubble-paint";
import {
  BUBBLE_COLUMNS,
  ChartShell,
  createInspectableSemantics,
  type CartesianChartProps,
} from "./scaffold";

export type { BubbleObservation, BubbleDatum };

export interface BubbleChartBaseProps extends CartesianChartProps, KeyboardHoverProps {
  /** Points to plot, as `{ x, y, size, series? }[]`. */
  data: readonly BubbleObservation[];
  /** Pixel radius for the smallest size. Default: 4. */
  minRadius?: number;
  /** Pixel radius for the largest size. Default: 24. */
  maxRadius?: number;
  /** Marker fill opacity. Default: 0.65, so overlapping disks still read. */
  fillOpacity?: number;
  /** Accessible wording for one point — series, x, y, size. */
  pointLabel?: (d: BubbleDatum, index: number) => string;
  tooltip?: (active: ActivePoint<BubbleDatum>) => JSX.Element;
  onActivate?: (active: ActivePoint<BubbleDatum>) => void;
  onActivePointChange?: (active: ActivePoint<BubbleDatum> | undefined) => void;
}

export type BubbleChartProps = BubbleChartBaseProps & ChartSemanticsProps;

type BubbleBodyProps = BubbleChartBaseProps & { semantics: ChartSemantics };

function bubbleWording(
  props: BubbleBodyProps,
  active: ActivePoint<BubbleDatum> | undefined,
): string {
  if (active === undefined) return "";
  if (props.pointLabel) return props.pointLabel(active.datum, active.sourceIndex);
  const name = props.semantics.name();
  const point = `${active.datum.series}, ${active.datum.x}, ${active.datum.y}, ${active.datum.size}`;
  return name ? `${name}, ${point}` : point;
}

function bubbleRows(
  data: readonly BubbleObservation[],
  fallback: string,
): readonly ChartTableRow[] {
  return computeBubble(data, { seriesFallback: fallback }).points.map(
    (d) => [d.series, d.x, d.y, d.size] as const,
  );
}

const BubbleChartBody: Component<BubbleBodyProps> = (props) => {
  const fallback = (): string => props.semantics.name() || "series";
  const computed = createMemo(() => computeBubble(props.data, { seriesFallback: fallback() }));
  const model = createCartesianModel({
    data: () => computed().points,
    x: (range) => linearScale({ domain: extentOf(computed().points, (d) => d.x), range }),
    y: { accessor: (d) => d.y, domain: "extent" },
  });
  const laid = createMemo(() => {
    const xs = model.x();
    const ys = model.y();
    return layoutBubble(computed(), {
      px: (d) => xs(d.x),
      py: (d) => ys(d.y),
      minRadius: props.minRadius,
      maxRadius: props.maxRadius,
    });
  });
  const ticks = createMemo(() => {
    const next = laid();
    return next.marks.length === 0 ? [] : bubbleSizeTicks(next.sizeDomain, next.radiusRange);
  });
  const index = createMemo(() =>
    createBubbleIndex(laid().marks, props.semantics.name() || "bubble"),
  );
  const insp = useInspection<BubbleDatum>({
    index,
    semantics: () => props.semantics,
    keyboard: props.keyboard,
    pointer: props.pointer,
    pageSize: props.pageSize,
    announce: props.announce,
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<BubbleDatum> | undefined => insp.inspection.point();

  return (
    <>
      <CartesianFrame
        model={model}
        layout={props}
        semantics={props.semantics}
        paint={(ctx, _plot, resolve) =>
          paintBubbleMarks(ctx, laid().marks, active()?.sourceIndex, resolve, props.fillOpacity)
        }
        chrome={() => {
          const a = active();
          return a === undefined ? {} : { point: { cx: a.position.x, cy: a.position.y } };
        }}
      />
      <Show when={ticks().length > 0}>
        <CanvasPlot
          paint={(ctx, plot, resolve) => paintBubbleSizeLegend(ctx, ticks(), plot, resolve)}
        />
      </Show>
      <Show when={insp.enabled() || insp.pointer()}>
        <InteractionLayer
          inspection={insp.inspection}
          semantics={props.semantics}
          label={(a) => bubbleWording(props, a)}
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

export const BubbleChart: Component<BubbleChartProps> = (props) => {
  const semantics = createInspectableSemantics(props);
  const fallback = (): string => semantics.name() || "series";
  return (
    <ChartShell
      layout={props}
      semantics={semantics}
      rows={() => bubbleRows(props.data, fallback())}
      columns={BUBBLE_COLUMNS}
      reserved={{ right: BUBBLE_SIZE_LEGEND_RIGHT }}
    >
      <BubbleChartBody {...props} semantics={semantics} />
    </ChartShell>
  );
};
