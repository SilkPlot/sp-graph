/**
 * TreeChart, TreemapChart, and PackChart — named hierarchy views on Canvas.
 *
 * Layout is compute in `@silkplot/core` over `d3-hierarchy`. This file hosts
 * the frame, paints nodes, and wires the same inspection surface the other
 * composed charts use. There is no series model: input is `{ id, parent, value }`
 * observations. Colour is never the only channel — each node carries a fill
 * pattern and a label.
 *
 * The named graphic is the empty `SvgLayer` title/desc-only exception the
 * Canvas cartesian work already landed. Marks paint on Canvas. No new SVG.
 */
import { Show, createMemo, type Component, type JSX } from "solid-js";
import {
  createPackIndex,
  createTreeIndex,
  createTreemapIndex,
  layoutPackFromObservations,
  layoutTreeFromObservations,
  layoutTreemapFromObservations,
  type ActivePoint,
  type HierarchyDatum,
  type HierarchyObservation,
  type PackNode,
  type TreeLayout,
  type TreemapNode,
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
import { paintPackLayout, paintTreeLayout, paintTreemapLayout } from "./hierarchy-paint";
import type { CanvasMark } from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";
import {
  ChartShell,
  HIERARCHY_COLUMNS,
  createInspectableSemantics,
} from "./scaffold";

export type { HierarchyObservation, HierarchyDatum };

export interface HierarchyChartBaseProps extends KeyboardHoverProps {
  /** Fixed width in px. Omit to fill and measure the parent. */
  width?: number;
  /** Fixed height in px. Omit to fill and measure the parent. */
  height?: number;
  margins?: Partial<Margins>;
  class?: string;
  data: readonly HierarchyObservation[];
  /** Accessible wording for one node. */
  nodeLabel?: (d: HierarchyDatum, index: number) => string;
  tooltip?: (active: ActivePoint<HierarchyDatum>) => JSX.Element;
  onActivate?: (active: ActivePoint<HierarchyDatum>) => void;
  onActivePointChange?: (active: ActivePoint<HierarchyDatum> | undefined) => void;
}

export type TreeChartProps = HierarchyChartBaseProps & ChartSemanticsProps;
export type TreemapChartProps = HierarchyChartBaseProps & ChartSemanticsProps;
export type PackChartProps = HierarchyChartBaseProps & ChartSemanticsProps;

type HierarchyKind = "tree" | "treemap" | "pack";

type HierarchyFrameProps = HierarchyChartBaseProps &
  ChartSemanticsProps & { kind: HierarchyKind };

type HierarchyBodyProps = HierarchyFrameProps & { semantics: ChartSemantics };

type LaidOut =
  | { kind: "tree"; tree: TreeLayout }
  | { kind: "treemap"; nodes: readonly TreemapNode[] }
  | { kind: "pack"; nodes: readonly PackNode[] };

function hierarchyWording(
  props: HierarchyBodyProps,
  active: ActivePoint<HierarchyDatum> | undefined,
): string {
  if (active === undefined) return "";
  if (props.nodeLabel) return props.nodeLabel(active.datum, active.sourceIndex);
  const name = props.semantics.name();
  const node = `${active.datum.id}, ${active.datum.value}`;
  return name ? `${name}, ${node}` : node;
}

function paintHierarchyMarks(
  ctx: CanvasRenderingContext2D,
  laid: LaidOut,
  current: ActivePoint<HierarchyDatum> | undefined,
  resolve: StyleResolver,
): CanvasMark[] {
  const source = current?.sourceIndex;
  if (laid.kind === "tree") return paintTreeLayout(ctx, laid.tree, source, resolve);
  if (laid.kind === "treemap") return paintTreemapLayout(ctx, laid.nodes, source, resolve);
  return paintPackLayout(ctx, laid.nodes, source, resolve);
}

const HierarchyBody: Component<HierarchyBodyProps> = (props) => {
  const bounds = useChartBounds();
  const laid = createMemo<LaidOut>(() => {
    const box = { width: bounds().innerWidth, height: bounds().innerHeight };
    if (props.kind === "tree") {
      return { kind: "tree", tree: layoutTreeFromObservations(props.data, box) };
    }
    if (props.kind === "treemap") {
      return { kind: "treemap", nodes: layoutTreemapFromObservations(props.data, box) };
    }
    return { kind: "pack", nodes: layoutPackFromObservations(props.data, box) };
  });
  const index = createMemo(() => {
    const laidOut = laid();
    const seriesId = props.semantics.name() || props.kind;
    if (laidOut.kind === "tree") return createTreeIndex(laidOut.tree.nodes, seriesId);
    if (laidOut.kind === "treemap") return createTreemapIndex(laidOut.nodes, seriesId);
    return createPackIndex(laidOut.nodes, seriesId);
  });
  const insp = useInspection<HierarchyDatum>({
    index,
    semantics: () => props.semantics,
    keyboard: props.keyboard,
    pointer: props.pointer,
    pageSize: props.pageSize,
    announce: props.announce,
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<HierarchyDatum> | undefined => insp.inspection.point();
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
          paint={(ctx, _plot, resolve) => paintHierarchyMarks(ctx, laid(), active(), resolve)}
        />
      </Show>
      <Show when={insp.enabled() || insp.pointer()}>
        <InteractionLayer
          inspection={insp.inspection}
          semantics={props.semantics}
          label={(a) => hierarchyWording(props, a)}
          live={insp.live()}
          keyboard={insp.enabled()}
          pointer={insp.pointer()}
          instruction="Use arrow keys to step through nodes."
          tooltip={props.tooltip}
        />
      </Show>
    </>
  );
};

function hierarchyRows(data: readonly HierarchyObservation[]): readonly ChartTableRow[] {
  return data.map((node) => [
    node.id,
    node.parent ?? "",
    node.value === undefined || !Number.isFinite(node.value) ? "" : node.value,
  ]);
}

function HierarchyFrame(props: HierarchyFrameProps): JSX.Element {
  const semantics = createInspectableSemantics(props);
  return (
    <ChartShell
      layout={props}
      semantics={semantics}
      rows={() => hierarchyRows(props.data)}
      columns={HIERARCHY_COLUMNS}
    >
      <HierarchyBody {...props} semantics={semantics} />
    </ChartShell>
  );
}

export const TreeChart: Component<TreeChartProps> = (props) => (
  <HierarchyFrame {...props} kind="tree" />
);

export const TreemapChart: Component<TreemapChartProps> = (props) => (
  <HierarchyFrame {...props} kind="treemap" />
);

export const PackChart: Component<PackChartProps> = (props) => (
  <HierarchyFrame {...props} kind="pack" />
);
