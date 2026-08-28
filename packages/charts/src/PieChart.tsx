/**
 * PieChart and DonutChart — polar part-to-whole on Canvas.
 *
 * Layout is compute in `@silkplot/core` (`computePie` / `layoutPie`). Donut is
 * the same pie layout with a hole (Plotly `hole` in (0, 1]). This file hosts
 * the frame, paints slices, and wires the same inspection surface the other
 * composed charts use. There is no series model: input is `{ label, value }`
 * observations. Colour is never the only channel — each slice carries a fill
 * pattern and a label.
 *
 * The named graphic is the empty `SvgLayer` title/desc-only exception the
 * Canvas cartesian work already landed. Marks paint on Canvas. No new SVG.
 */
import { Show, createMemo, type Component, type JSX } from "solid-js";
import {
  computePie,
  createPieIndex,
  layoutPie,
  resolveDonutHole,
  type ActivePoint,
  type PieDatum,
  type PieObservation,
  type PieSlice,
} from "@silkplot/core";
import {
  SvgLayer,
  useChartBounds,
  type ChartSemantics,
  type ChartSemanticsProps,
  type ChartTableRow,
  type Margins,
} from "@silkplot/solid";
import { CanvasPlot } from "./canvas-plot";
import { InteractionLayer, useInspection, type KeyboardHoverProps } from "./inspection";
import { paintPieSlice } from "./pie-paint";
import type { CanvasMark } from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";
import {
  ChartShell,
  PIE_COLUMNS,
  createInspectableSemantics,
} from "./scaffold";

export type { PieObservation, PieDatum };

export interface PieChartBaseProps extends KeyboardHoverProps {
  /** Fixed width in px. Omit to fill and measure the parent. */
  width?: number;
  /** Fixed height in px. Omit to fill and measure the parent. */
  height?: number;
  margins?: Partial<Margins>;
  class?: string;
  data: readonly PieObservation[];
  /** Accessible wording for one slice. */
  sliceLabel?: (d: PieDatum, index: number) => string;
  tooltip?: (active: ActivePoint<PieDatum>) => JSX.Element;
  onActivate?: (active: ActivePoint<PieDatum>) => void;
  onActivePointChange?: (active: ActivePoint<PieDatum> | undefined) => void;
}

export type PieChartProps = PieChartBaseProps & ChartSemanticsProps;

export interface DonutChartBaseProps extends PieChartBaseProps {
  /**
   * Plotly `hole` in (0, 1]. Absent or 0 uses `DEFAULT_DONUT_HOLE` so the
   * named donut view cannot collapse into a pie.
   */
  hole?: number;
}

export type DonutChartProps = DonutChartBaseProps & ChartSemanticsProps;

type PieBodyProps = PieChartBaseProps & { semantics: ChartSemantics; hole: number };

function isActiveSlice(current: ActivePoint<PieDatum> | undefined, slice: PieSlice): boolean {
  return current?.sourceIndex === slice.sourceIndex;
}

function pieWording(props: PieBodyProps, active: ActivePoint<PieDatum> | undefined): string {
  if (active === undefined) return "";
  if (props.sliceLabel) return props.sliceLabel(active.datum, active.sourceIndex);
  const name = props.semantics.name();
  const slice = `${active.datum.label}, ${active.datum.value}`;
  return name ? `${name}, ${slice}` : slice;
}

function paintPieMarks(
  ctx: CanvasRenderingContext2D,
  slices: readonly PieSlice[],
  current: ActivePoint<PieDatum> | undefined,
  resolve: StyleResolver,
): CanvasMark[] {
  const painted: CanvasMark[] = [];
  for (const slice of slices) {
    painted.push(...paintPieSlice(ctx, slice, { active: isActiveSlice(current, slice) }, resolve));
  }
  return painted;
}

const PieBody: Component<PieBodyProps> = (props) => {
  const bounds = useChartBounds();
  const parts = createMemo(() => computePie(props.data));
  const laidOut = createMemo(() =>
    layoutPie(parts(), {
      width: bounds().innerWidth,
      height: bounds().innerHeight,
      hole: props.hole,
    }),
  );
  const slices = createMemo(() => laidOut().slices);
  const index = createMemo(() => createPieIndex(slices(), props.semantics.name() || "pie"));
  const insp = useInspection<PieDatum>({
    index,
    semantics: () => props.semantics,
    keyboard: props.keyboard,
    pointer: props.pointer,
    pageSize: props.pageSize,
    announce: props.announce,
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<PieDatum> | undefined => insp.inspection.point();
  const sem = (): ChartSemantics => props.semantics;

  return (
    <>
      <SvgLayer
        role="img"
        decorative={sem().decorative()}
        title={sem().name() || undefined}
        titleId={sem().ids.title}
        desc={sem().desc()}
        descId={sem().ids.desc}
        ariaLabelledBy={sem().labelledBy()}
        ariaDescribedBy={sem().describedBy()}
        ariaDetails={sem().details()}
        class={props.class}
      />
      <Show when={bounds().innerWidth > 0 && bounds().innerHeight > 0}>
        <CanvasPlot
          paint={(ctx, _plot, resolve) => paintPieMarks(ctx, slices(), active(), resolve)}
        />
      </Show>
      <Show when={insp.enabled() || insp.pointer()}>
        <InteractionLayer
          inspection={insp.inspection}
          semantics={props.semantics}
          label={(a) => pieWording(props, a)}
          live={insp.live()}
          keyboard={insp.enabled()}
          pointer={insp.pointer()}
          instruction="Use arrow keys to step through slices."
          tooltip={props.tooltip}
        />
      </Show>
    </>
  );
};

function pieRows(data: readonly PieObservation[]): readonly ChartTableRow[] {
  return computePie(data).map((part) => [part.label, part.value, part.percent] as const);
}

export const PieChart: Component<PieChartProps> = (props) => {
  const semantics = createInspectableSemantics(props);
  return (
    <ChartShell layout={props} semantics={semantics} rows={() => pieRows(props.data)} columns={PIE_COLUMNS}>
      <PieBody {...props} hole={0} semantics={semantics} />
    </ChartShell>
  );
};

export const DonutChart: Component<DonutChartProps> = (props) => {
  const semantics = createInspectableSemantics(props);
  return (
    <ChartShell layout={props} semantics={semantics} rows={() => pieRows(props.data)} columns={PIE_COLUMNS}>
      <PieBody {...props} hole={resolveDonutHole(props.hole)} semantics={semantics} />
    </ChartShell>
  );
};
