/**
 * HeatmapChart — a categorical grid on Canvas.
 *
 * Layout is compute in `@silkplot/core` (`binHeatmap` / `layoutHeatmapCells`).
 * This file hosts the frame, paints cells, and wires the same inspection
 * surface the other composed charts use. There is no series model: input is
 * `{ x, y, value? }` observations binned onto a grid. Colour is never the
 * only channel — hatch density is recorded on every cell.
 *
 * The named graphic is HTML, not SVG. Marks and axes paint on Canvas.
 */
import { Show, createMemo, type Component, type JSX } from "solid-js";
import {
  binHeatmap,
  createHeatmapIndex,
  layoutHeatmapCells,
  type ActivePoint,
  type HeatmapBin,
  type HeatmapCell,
  type HeatmapObservation,
} from "@silkplot/core";
import type { ChartSemantics, ChartSemanticsProps, ChartTableRow } from "@silkplot/solid";
import { CanvasPlot } from "./canvas-plot";
import { paintCartesianSurface } from "./canvas-surface";
import { InteractionLayer, useInspection, type KeyboardHoverProps } from "./inspection";
import { pushMark } from "./canvas-paint";
import type { CanvasMark } from "./canvas-marks";
import { paintHeatmapCell } from "./heatmap-paint";
import type { StyleResolver } from "./canvas-style";
import { createHeatmapModel } from "./heatmap-model";
import {
  ChartShell,
  HEATMAP_COLUMNS,
  createInspectableSemantics,
  type CartesianChartProps,
} from "./scaffold";

export type { HeatmapObservation, HeatmapBin };

/**
 * Clip an element out of view while leaving it in the accessibility tree.
 * Used for the HTML name so this view does not mount an SVG.
 */
const VISUALLY_HIDDEN: JSX.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  "white-space": "nowrap",
  "border-width": "0",
};

export interface HeatmapChartBaseProps extends CartesianChartProps, KeyboardHoverProps {
  /** Observations to bin. Absent `value` counts as 1. */
  data: readonly HeatmapObservation[];
  /** Explicit column domain. Absent → first-seen keys, or numeric bins. */
  columns?: readonly string[];
  /** Explicit row domain. Absent → first-seen keys, or numeric bins. */
  rows?: readonly string[];
  /** When set, numeric `x` is binned into this many equal-width intervals. */
  xBins?: number;
  /** When set, numeric `y` is binned into this many equal-width intervals. */
  yBins?: number;
  /** Band padding as a fraction of the step. Default 0.05. */
  padding?: number;
  /** Accessible wording for one cell. */
  cellLabel?: (d: HeatmapBin, index: number) => string;
  tooltip?: (active: ActivePoint<HeatmapBin>) => JSX.Element;
  onActivate?: (active: ActivePoint<HeatmapBin>) => void;
  onActivePointChange?: (active: ActivePoint<HeatmapBin> | undefined) => void;
}

export type HeatmapChartProps = HeatmapChartBaseProps & ChartSemanticsProps;

type HeatmapChartBodyProps = HeatmapChartBaseProps & { semantics: ChartSemantics };

function gridOf(props: HeatmapChartBaseProps) {
  return binHeatmap({
    observations: props.data,
    columns: props.columns,
    rows: props.rows,
    xBins: props.xBins,
    yBins: props.yBins,
  });
}

function isActiveCell(current: ActivePoint<HeatmapBin> | undefined, cell: { column: string; row: string }): boolean {
  return current?.datum.column === cell.column && current.datum.row === cell.row;
}

function heatmapWording(
  props: HeatmapChartBodyProps,
  active: ActivePoint<HeatmapBin> | undefined,
): string {
  if (active === undefined) return "";
  if (props.cellLabel) return props.cellLabel(active.datum, active.sourceIndex);
  const name = props.semantics.name();
  const cell = `${active.datum.column}, ${active.datum.row}, ${active.datum.value}`;
  return name ? `${name}, ${cell}` : cell;
}

function paintHeatmapMarks(
  ctx: CanvasRenderingContext2D,
  cells: readonly HeatmapCell[],
  current: ActivePoint<HeatmapBin> | undefined,
  resolve: StyleResolver,
): CanvasMark[] {
  const painted: CanvasMark[] = [];
  for (const cell of cells) {
    pushMark(painted, paintHeatmapCell(ctx, cell, { active: isActiveCell(current, cell) }, resolve));
  }
  return painted;
}

const NamedHeatmapGraphic: Component<{ semantics: ChartSemantics }> = (props) => {
  const named = (): string => props.semantics.name();
  const frame: JSX.CSSProperties = { position: "absolute", inset: "0", "pointer-events": "none" };
  if (props.semantics.decorative()) {
    return <div data-silkplot-heatmap="" role="presentation" aria-hidden="true" style={frame} />;
  }
  return (
    <div
      data-silkplot-heatmap=""
      role="img"
      aria-labelledby={props.semantics.labelledBy()}
      aria-describedby={props.semantics.describedBy()}
      aria-details={props.semantics.details()}
      style={frame}
    >
      {named() ? (
        <p id={props.semantics.ids.title} data-silkplot-heatmap-name="" style={VISUALLY_HIDDEN}>
          {named()}
        </p>
      ) : null}
      {props.semantics.desc() ? (
        <p id={props.semantics.ids.desc} data-silkplot-heatmap-desc="" style={VISUALLY_HIDDEN}>
          {props.semantics.desc()}
        </p>
      ) : null}
    </div>
  );
};

const HeatmapChartBody: Component<HeatmapChartBodyProps> = (props) => {
  const grid = createMemo(() => gridOf(props));
  const model = createHeatmapModel({
    columns: () => grid().columns,
    rows: () => grid().rows,
    padding: () => props.padding,
  });

  const cells = createMemo(() => {
    const inner = model.bounds();
    return layoutHeatmapCells(grid().bins, {
      columns: grid().columns,
      rows: grid().rows,
      width: inner.innerWidth,
      height: inner.innerHeight,
      padding: props.padding,
    });
  });

  const index = createMemo(() => createHeatmapIndex(cells(), props.semantics.name() || "heatmap"));
  const insp = useInspection<HeatmapBin>({
    index,
    semantics: () => props.semantics,
    keyboard: props.keyboard,
    pointer: props.pointer,
    pageSize: props.pageSize,
    announce: props.announce,
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<HeatmapBin> | undefined => insp.inspection.point();

  return (
    <>
      <NamedHeatmapGraphic semantics={props.semantics} />

      <Show when={model.hasArea()}>
        <CanvasPlot
          paint={(ctx, plot, resolve) =>
            paintCartesianSurface(ctx, plot, resolve, {
              grid: props.gridlines ?? true,
              xScale: model.x(),
              yScale: model.y(),
              paintMarks: (markCtx, _markPlot, markResolve) =>
                paintHeatmapMarks(markCtx, cells(), active(), markResolve),
            })
          }
        />
      </Show>

      <Show when={insp.enabled() || insp.pointer()}>
        <InteractionLayer
          inspection={insp.inspection}
          semantics={props.semantics}
          label={(a) => heatmapWording(props, a)}
          live={insp.live()}
          keyboard={insp.enabled()}
          pointer={insp.pointer()}
          instruction="Use arrow keys to step through cells."
          tooltip={props.tooltip}
        />
      </Show>
    </>
  );
};

export const HeatmapChart: Component<HeatmapChartProps> = (props) => {
  const semantics = createInspectableSemantics(props);
  const rows = (): readonly ChartTableRow[] =>
    gridOf(props).bins.map((bin) => [bin.column, bin.row, bin.value] as const);

  return (
    <ChartShell layout={props} semantics={semantics} rows={rows} columns={HEATMAP_COLUMNS}>
      <HeatmapChartBody {...props} semantics={semantics} />
    </ChartShell>
  );
};
