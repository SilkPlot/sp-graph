/**
 * CalendarHeatmap — occupancy on Canvas, binned onto `buildTimeGrid` output.
 *
 * Days are columns, unique slot clock-times are rows. Layout is the same
 * `binHeatmap` / `layoutHeatmapCells` the ordinary heatmap uses. Colour is
 * never the only channel: hatch density rides with fill. Interactive — hover,
 * keyboard selection, data replacement — and a semantic HTML table.
 *
 * Not a rewrite of `WeekGrid`. No SVG, no WebGL, no second time grid.
 */
import { Show, createEffect, createMemo, createSignal, mergeProps, type Component, type JSX } from "solid-js";
import {
  createHeatmapIndex,
  layoutHeatmapCells,
  type ActivePoint,
  type HeatmapBin,
  type HeatmapCell,
} from "@silkplot/core";
import {
  ChartAnnouncer,
  ChartDataAlternative,
  ChartKeyboardSurface,
  ChartRoot,
  TooltipAnchor,
  createChartInspection,
  createChartSemantics,
  useChartBounds,
  type ChartSemantics,
  type ChartSemanticsProps,
  type ChartTableRow,
  type Margins,
} from "@silkplot/solid";
import { binOntoTimeGrid, type TimeGridObservation } from "./calendar-heatmap-bin";
import { syncCalendarHeatmap } from "./calendar-heatmap-paint";
import type { TimeGrid } from "./time-grid";

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

const TABLE_COLUMNS: readonly string[] = ["Day", "Slot", "Value"];

export interface CalendarHeatmapBaseProps {
  grid: TimeGrid;
  observations: readonly TimeGridObservation[];
  width?: number;
  height?: number;
  margins?: Partial<Margins>;
  padding?: number;
  class?: string;
  keyboard?: boolean;
  pointer?: boolean;
  pageSize?: number;
  announce?: "live" | "option";
  cellLabel?: (d: HeatmapBin, index: number) => string;
  tooltip?: (active: ActivePoint<HeatmapBin>) => JSX.Element;
  onActivate?: (active: ActivePoint<HeatmapBin>) => void;
  onActivePointChange?: (active: ActivePoint<HeatmapBin> | undefined) => void;
}

export type CalendarHeatmapProps = CalendarHeatmapBaseProps & ChartSemanticsProps;

type BodyProps = CalendarHeatmapBaseProps & { semantics: ChartSemantics };

function heatmapSemantics(props: ChartSemanticsProps): ChartSemantics {
  return createChartSemantics(
    mergeProps(props, {
      get defaultTable() {
        if (props.decorative === true) return undefined;
        return {};
      },
    }),
  );
}

function cellWording(
  props: BodyProps,
  active: ActivePoint<HeatmapBin> | undefined,
): string {
  if (active === undefined) return "";
  if (props.cellLabel) return props.cellLabel(active.datum, active.sourceIndex);
  const name = props.semantics.name();
  const cell = `${active.datum.column}, ${active.datum.row}, ${active.datum.value}`;
  return name ? `${name}, ${cell}` : cell;
}

const CalendarHeatmapPlot: Component<{
  cells: () => readonly HeatmapCell[];
  activeIndex: () => number;
}> = (props) => {
  const bounds = useChartBounds();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>();
  createEffect(() => {
    const b = bounds();
    syncCalendarHeatmap(
      canvas(),
      {
        width: b.innerWidth,
        height: b.innerHeight,
        originX: b.margins.left,
        originY: b.margins.top,
        outerWidth: b.width,
        outerHeight: b.height,
      },
      props.cells(),
      props.activeIndex(),
      window.devicePixelRatio,
    );
  });
  return (
    <canvas
      ref={setCanvas}
      data-silkplot-calendar-heatmap-plot=""
      data-silkplot-clip="canvas"
      style={{
        position: "absolute",
        left: "0px",
        top: "0px",
        width: `${bounds().width}px`,
        height: `${bounds().height}px`,
        "pointer-events": "none",
        display: "block",
      }}
    />
  );
};

const NamedCalendarGraphic: Component<{ semantics: ChartSemantics }> = (props) => {
  const named = (): string => props.semantics.name();
  const frame: JSX.CSSProperties = { position: "absolute", inset: "0", "pointer-events": "none" };
  if (props.semantics.decorative()) {
    return (
      <div data-silkplot-calendar-heatmap="" role="presentation" aria-hidden="true" style={frame} />
    );
  }
  return (
    <div
      data-silkplot-calendar-heatmap=""
      role="img"
      aria-labelledby={props.semantics.labelledBy()}
      aria-describedby={props.semantics.describedBy()}
      aria-details={props.semantics.details()}
      style={frame}
    >
      {named() ? (
        <p id={props.semantics.ids.title} data-silkplot-calendar-heatmap-name="" style={VISUALLY_HIDDEN}>
          {named()}
        </p>
      ) : null}
      {props.semantics.desc() ? (
        <p id={props.semantics.ids.desc} data-silkplot-calendar-heatmap-desc="" style={VISUALLY_HIDDEN}>
          {props.semantics.desc()}
        </p>
      ) : null}
    </div>
  );
};

const CalendarHeatmapSurface: Component<{
  props: BodyProps;
  inspection: ReturnType<typeof createChartInspection<HeatmapBin>>;
  active: () => ActivePoint<HeatmapBin> | undefined;
  enabled: boolean;
  live: boolean;
}> = (spec) => {
  const named = (): string => spec.props.semantics.name();
  const inspection = spec.inspection;
  if (!spec.enabled) {
    return (
      <div
        data-silkplot-pointer-surface=""
        aria-hidden="true"
        style={{ position: "absolute", inset: "0" }}
        ref={inspection.setSurface}
        onPointerEnter={inspection.onPointerEnter}
        onPointerMove={inspection.onPointerMove}
        onPointerLeave={inspection.onPointerLeave}
      />
    );
  }
  return (
    <ChartKeyboardSurface
      keyboard={inspection.keyboard}
      optionLabel={() => cellWording(spec.props, spec.active())}
      activeDescendant={!spec.live}
      label={named() ? `${named()}. Use arrow keys to step through cells.` : undefined}
      labelledBy={named() ? undefined : spec.props.semantics.labelledBy()}
      describedBy={spec.props.semantics.describedBy()}
      ref={inspection.setSurface}
      onPointerEnter={inspection.onPointerEnter}
      onPointerMove={inspection.onPointerMove}
      onPointerLeave={inspection.onPointerLeave}
    />
  );
};

const CalendarHeatmapInspect: Component<{
  props: BodyProps;
  inspection: ReturnType<typeof createChartInspection<HeatmapBin>>;
  active: () => ActivePoint<HeatmapBin> | undefined;
}> = (spec) => {
  const enabled = (): boolean => !spec.props.semantics.decorative() && (spec.props.keyboard ?? true);
  const pointerOn = (): boolean => !spec.props.semantics.decorative() && (spec.props.pointer ?? true);
  const live = (): boolean => (spec.props.announce ?? "live") === "live";
  return (
    <>
      <Show when={enabled() || pointerOn()}>
        <CalendarHeatmapSurface
          props={spec.props}
          inspection={spec.inspection}
          active={spec.active}
          enabled={enabled()}
          live={live()}
        />
      </Show>
      <Show when={spec.props.tooltip && spec.active()}>
        {(a) => {
          const point = a() as ActivePoint<HeatmapBin>;
          return (
            <TooltipAnchor x={point.position.x} y={point.position.y}>
              {spec.props.tooltip?.(point)}
            </TooltipAnchor>
          );
        }}
      </Show>
      <Show when={enabled() && live()}>
        <ChartAnnouncer message={cellWording(spec.props, spec.active())} />
      </Show>
    </>
  );
};

const CalendarHeatmapBody: Component<BodyProps> = (props) => {
  const packed = createMemo(() => binOntoTimeGrid(props.grid, props.observations));
  const bounds = useChartBounds();
  const cells = createMemo(() => {
    const inner = bounds();
    const grid = packed();
    return layoutHeatmapCells(grid.bins, {
      columns: grid.columns,
      rows: grid.rows,
      width: inner.innerWidth,
      height: inner.innerHeight,
      padding: props.padding,
    });
  });
  const index = createMemo(() =>
    createHeatmapIndex(cells(), props.semantics.name() || "calendar-heatmap"),
  );
  const inspection = createChartInspection<HeatmapBin>({
    index,
    pageSize: props.pageSize,
    pointer: () => !props.semantics.decorative() && (props.pointer ?? true),
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<HeatmapBin> | undefined => inspection.point();
  const activeIndex = (): number => {
    const point = active();
    return point === undefined ? -1 : point.sourceIndex;
  };

  return (
    <>
      <NamedCalendarGraphic semantics={props.semantics} />
      <CalendarHeatmapPlot cells={cells} activeIndex={activeIndex} />
      <CalendarHeatmapInspect props={props} inspection={inspection} active={active} />
    </>
  );
};

export const CalendarHeatmap: Component<CalendarHeatmapProps> = (props) => {
  const semantics = heatmapSemantics(props);
  const rows = (): readonly ChartTableRow[] =>
    binOntoTimeGrid(props.grid, props.observations).bins.map(
      (bin) => [bin.column, bin.row, bin.value] as const,
    );

  return (
    <>
      <ChartRoot width={props.width} height={props.height} margins={props.margins} class={props.class}>
        <CalendarHeatmapBody {...props} semantics={semantics} />
      </ChartRoot>
      <ChartDataAlternative
        semantics={semantics}
        defaultRows={rows}
        defaultColumns={() => TABLE_COLUMNS}
      />
    </>
  );
};

export type { TimeGridObservation };
