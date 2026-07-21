/**
 * The shared pieces every chart's inspection renders — ADR-0016 §3.
 *
 * The RESOLUTION seam is `createChartInspection` in `@silkplot/solid`; this is
 * the RENDER seam beside it: the one interaction surface (keyboard composite,
 * doubling as the pointer-capture element), the caller's tooltip, the
 * announcement channel, and the point-and-crosshair mark the time and scatter
 * families share. A chart supplies its family index and its label wording and
 * composes these; what a chart draws for its ACTIVE mark that is not a point —
 * a highlighted bar — it draws itself, because that is where the families
 * legitimately differ (engineering-priorities: share the computation and the
 * marks that must not disagree, not the ones that legitimately do).
 */
import { type Accessor, type Component, type JSX, Show, createMemo } from "solid-js";
import {
  createTimeSeriesIndex,
  type ActivePoint,
  type ActivePointIndex,
  type ScaleTime,
  type SeriesDatum,
} from "@silkplot/core";
import {
  ChartAnnouncer,
  ChartKeyboardSurface,
  Crosshair,
  TooltipAnchor,
  createChartInspection,
  type CartesianModel,
  type ChartInspection,
  type ChartSemantics,
  type ViewportGestures,
} from "@silkplot/solid";
import type { TimePoint } from "./types";

/** A present point paired with its index in the caller's array, for the lookup. */
export interface IndexedPoint {
  t: Date;
  y: number;
  meta?: unknown;
  sourceIndex: number;
}

/**
 * The keyboard/hover flags every inspectable chart shares, whatever its datum
 * type — ADR-0016. The datum-typed callbacks (`tooltip`, `onActivate`,
 * `onActivePointChange`, `pointLabel`) are NOT here: a scatter's is an `XYPoint`,
 * a ranked bar's a `RankedCategory`, a time series' a `SeriesDatum`, so each chart
 * declares those with its own datum. What is genuinely one concept lives once.
 */
export interface KeyboardHoverProps {
  /**
   * The single-entry keyboard composite. Default: true for an informative chart,
   * off for a decorative one. Tab reaches the chart once; arrows, Home/End, and
   * Page keys move within; Tab leaves (ADR-0005 §3).
   */
  keyboard?: boolean;
  /**
   * Pointer hover (ADR-0016 §2). Default: true for an informative chart, off for
   * a decorative one. Hover writes the same one active-datum state the keyboard
   * does. Set `pointer={false}` to pay nothing for hover.
   */
  pointer?: boolean;
  /** How many points a Page Up / Page Down step covers. */
  pageSize?: number;
  /** Which channel carries a keyboard step: a polite live region (`"live"`,
   *  default) or `aria-activedescendant` (`"option"`). */
  announce?: "live" | "option";
}

/**
 * The inspection prop surface shared by every single-series TIME chart (Line,
 * Area) — ADR-0016.
 */
export interface TimeChartInspectionProps extends KeyboardHoverProps {
  /** Accessible wording for one point — series, x, y, and units (ADR-0005 §4). */
  pointLabel?: (d: TimePoint, index: number) => string;
  /**
   * Tooltip content, as a render-prop (ADR-0016 §1, ADR-0002 §3). Receives the
   * active-datum record — the present `datum` (with any `meta`), the domain
   * position `at`, the pixel `position`, and, on a multi-series chart, every
   * visible series' value at the active instant (`atTime`). Omit for no tooltip.
   */
  tooltip?: (active: ActivePoint<SeriesDatum>) => JSX.Element;
  /** Drill-down commit — Enter, Space, or a click on the active datum
   *  (ADR-0013's `onActivate`, extended). The user acting, not the cursor moving. */
  onActivate?: (active: ActivePoint<SeriesDatum>) => void;
  /** Fires on every active-datum CHANGE — a hover snap, a keyboard step, a clear
   *  (`undefined`) — with the record (ADR-0016 §4). */
  onActivePointChange?: (active: ActivePoint<SeriesDatum> | undefined) => void;
}

/** The generic inspection wiring over a caller-built index — shared by every
 *  family (time, scatter, categorical). Produces one active-datum state and the
 *  enabled/pointer/live flags each chart's render reads. */
export interface UseInspectionSpec<D> extends KeyboardHoverProps {
  index: Accessor<ActivePointIndex<D>>;
  semantics: () => ChartSemantics;
  onActivate?: (active: ActivePoint<D>) => void;
  onActivePointChange?: (active: ActivePoint<D> | undefined) => void;
}

export interface UseInspectionResult<D> {
  inspection: ChartInspection<D>;
  /** Off for a decorative chart: a focusable surface announcing nothing is a dead tab stop. */
  enabled: () => boolean;
  pointer: () => boolean;
  live: () => boolean;
}

export function useInspection<D>(spec: UseInspectionSpec<D>): UseInspectionResult<D> {
  const sem = spec.semantics;
  const inspection = createChartInspection<D>({
    index: spec.index,
    pageSize: spec.pageSize,
    pointer: () => !sem().decorative() && (spec.pointer ?? true),
    onActivate: spec.onActivate,
    onActivePointChange: spec.onActivePointChange,
  });
  return {
    inspection,
    enabled: () => !sem().decorative() && (spec.keyboard ?? true),
    pointer: () => !sem().decorative() && (spec.pointer ?? true),
    live: () => (spec.announce ?? "live") === "live",
  };
}

/** What `createTimeChartInspection` needs from a single-series time chart. */
export interface TimeChartInspectionSpec extends TimeChartInspectionProps {
  /** The visible points, in the caller's order. */
  visible: () => readonly TimePoint[];
  /** The chart's cartesian model, over a time x scale. */
  model: CartesianModel<ScaleTime<number, number>>;
  semantics: () => ChartSemantics;
  /** The gap predicate — a point it rejects is not a hover/step target. */
  defined?: (d: TimePoint, index: number) => boolean;
}

/**
 * The one active-datum state a single-series TIME chart has, resolved from a
 * time-series index and written by both keyboard and pointer through
 * `createChartInspection` (ADR-0016 §3). The index carries the VISIBLE, DRAWN,
 * present points only: stepping or snapping onto a gap would move the cursor to a
 * coordinate no mark occupies (ADR-0014 §2).
 *
 * Shared by Line and Area, which differ in their marks and never in this.
 */
export function createTimeChartInspection(spec: TimeChartInspectionSpec) {
  const sem = spec.semantics;

  const index = createMemo(() => {
    const xs = spec.model.x();
    const ys = spec.model.y();
    const points: IndexedPoint[] = [];
    const visible = spec.visible();
    for (let i = 0; i < visible.length; i += 1) {
      const d = visible[i] as TimePoint;
      if (!Number.isFinite(d.y) || !Number.isFinite(d.t.getTime())) continue;
      if (spec.defined && !spec.defined(d, i)) continue;
      points.push({ t: d.t, y: d.y, sourceIndex: i });
    }
    return createTimeSeriesIndex<IndexedPoint>([{ seriesId: sem().name() || "series", points }], {
      time: (d) => d.t.getTime(),
      px: (d) => xs(d.t),
      py: (d) => ys(d.y),
      sourceIndex: (d) => d.sourceIndex,
    });
  });

  const shared = useInspection<SeriesDatum>({
    index,
    semantics: sem,
    keyboard: spec.keyboard,
    pointer: spec.pointer,
    pageSize: spec.pageSize,
    announce: spec.announce,
    onActivate: spec.onActivate,
    onActivePointChange: spec.onActivePointChange,
  });

  return {
    ...shared,
    /** The wording for one active datum — the default reading, or the caller's. */
    label: (active: ActivePoint<SeriesDatum> | undefined): string => {
      if (active === undefined) return "";
      if (spec.pointLabel) return spec.pointLabel(active.datum as TimePoint, active.sourceIndex);
      // ISO 8601 for the same reason the table rows use it: unambiguous and
      // locale-independent; the chart's own name stands in for the series
      // context ADR-0005 §4 asks for.
      const series = sem().name();
      const t = (active.datum.t as Date).toISOString();
      return series ? `${series}, ${t}, ${active.datum.y}` : `${t}, ${active.datum.y}`;
    },
  };
}

/**
 * The active-point mark for a time or scatter chart: a ring at the active
 * position with a crosshair through it.
 *
 * Drawn in SIZE and OUTLINE as well as colour so it survives a monochrome
 * rendering (ADR-0005 §5) — a keyboard or pointer user who can see the screen
 * gets nothing from an announcement alone. The surface-coloured under-ring keeps
 * it legible where it crosses a gridline.
 */
export const PointMark: Component<{ cx: number; cy: number }> = (props) => (
  <>
    <circle
      cx={props.cx}
      cy={props.cy}
      r="7"
      fill="none"
      stroke="var(--sp-color-surface, #ffffff)"
      stroke-width="4"
    />
    <circle
      cx={props.cx}
      cy={props.cy}
      r="7"
      fill="none"
      stroke="var(--sp-color-cursor, currentColor)"
      stroke-width="2"
    />
    <Crosshair x={props.cx} y={props.cy} />
  </>
);

/**
 * The live brush rectangle, drawn while a drag-to-brush is in flight (ADR-0018
 * §3). A shaded band across the full plot height between the drag's start and the
 * pointer, drawn in the cursor colour with a dashed edge — the non-colour channel
 * that keeps it legible in a monochrome rendering (ADR-0005 §5). `pointer-events`
 * is off so the band never intercepts the drag that draws it.
 *
 * Coordinates are inner (plot) px, the same space `PointMark` and the marks use,
 * so it lands exactly where the pointer is.
 */
export const BrushRect: Component<{ x0: number; x1: number; height: number }> = (props) => {
  const x = (): number => Math.min(props.x0, props.x1);
  const width = (): number => Math.abs(props.x1 - props.x0);
  return (
    <rect
      data-silkplot-brush=""
      x={x()}
      y={0}
      width={width()}
      height={props.height}
      fill="var(--sp-color-cursor, currentColor)"
      fill-opacity="0.12"
      stroke="var(--sp-color-cursor, currentColor)"
      stroke-opacity="0.5"
      stroke-width="1"
      stroke-dasharray="3 2"
      pointer-events="none"
    />
  );
};

export interface InteractionLayerProps<D> {
  inspection: ChartInspection<D>;
  semantics: ChartSemantics;
  /** Wording for the active datum. Empty string when nothing is active. */
  label: (active: ActivePoint<D> | undefined) => string;
  /** True when the live region carries the step; false when `aria-activedescendant` does. */
  live: boolean;
  /** True when the keyboard composite (the single tab stop) is offered. */
  keyboard: boolean;
  /** True when pointer hover is wired onto the surface. */
  pointer: boolean;
  /** The instruction the keyboard surface announces on focus, e.g. "step through points". */
  instruction: string;
  /** Optional tooltip content (ADR-0016 §1). */
  tooltip?: (active: ActivePoint<D>) => JSX.Element;
  /**
   * The viewport gesture adapters (ADR-0018), composed onto the one interaction
   * surface: its `onKeyDown` gets first refusal before the datum composite, and
   * its `setSurface` receives the same element the inspection layer caches, so the
   * wheel and pointer listeners attach where the hover already reads. Present only
   * on a navigable time chart; absent leaves the keyboard as datum-stepping alone.
   */
  viewportGestures?: ViewportGestures;
}

/**
 * Everything outside the marks that makes the chart inspectable: the ONE
 * interaction surface, the caller's tooltip, and the announcement channel. All
 * read the one active-datum state, so the crosshair, the tooltip, and the speech
 * never describe different points (ADR-0002 §1, §4; ADR-0016 §3).
 *
 * The surface is the keyboard composite when the keyboard is on — it doubles as
 * the pointer-capture element. When the keyboard is explicitly OFF but hover is
 * on, a bare pointer surface stands in, so `keyboard={false}` truly removes the
 * tab stop (the keyboard surface) while hover still works.
 *
 * The two announcement channels are mutually exclusive by construction: `"live"`
 * writes a throttled polite region, `"option"` moves `aria-activedescendant`.
 */
export function InteractionLayer<D>(props: InteractionLayerProps<D>): JSX.Element {
  const insp = props.inspection;
  const named = (): string => props.semantics.name();
  const active = (): ActivePoint<D> | undefined => insp.point();
  // Both the inspection layer and the gesture adapters attach to the SAME surface
  // element — the hover caches its rect here, the wheel/pointer listeners bind
  // here — so they cannot read a different box. A ternary `ref` is not invoked by
  // Solid's ref compilation, so this is a plain function that always runs.
  const attachSurface = (element: HTMLElement): void => {
    insp.setSurface(element);
    props.viewportGestures?.setSurface(element);
  };

  return (
    <>
      <Show
        when={props.keyboard}
        fallback={
          <Show when={props.pointer}>
            {/* Keyboard off, hover on: a bare capture surface, not the keyboard
                composite — no tab stop, no widget role, out of the a11y tree. */}
            <div
              data-silkplot-pointer-surface=""
              aria-hidden="true"
              style={{ position: "absolute", inset: "0" }}
              ref={attachSurface}
              onPointerMove={insp.onPointerMove}
              onPointerLeave={insp.onPointerLeave}
            />
          </Show>
        }
      >
        <ChartKeyboardSurface
          keyboard={insp.keyboard}
          optionLabel={() => props.label(active())}
          activeDescendant={!props.live}
          label={named() ? `${named()}. ${props.instruction}` : undefined}
          labelledBy={named() ? undefined : props.semantics.labelledBy()}
          describedBy={props.semantics.describedBy()}
          // Attached unconditionally: caching the rect is harmless when hover is
          // off, and the move handler self-gates on `pointer` internally. A
          // ternary `ref` is NOT invoked by Solid's ref compilation, which is how
          // the rect silently went uncached and hover resolved nothing.
          ref={attachSurface}
          onPointerMove={insp.onPointerMove}
          onPointerLeave={insp.onPointerLeave}
          beforeKeyDown={props.viewportGestures?.onKeyDown}
        />
      </Show>
      <Show when={props.tooltip && active()}>
        {(a) => {
          const point = a() as ActivePoint<D>;
          return (
            <TooltipAnchor x={point.position.x} y={point.position.y}>
              {props.tooltip?.(point)}
            </TooltipAnchor>
          );
        }}
      </Show>
      {/* The announcer stays mounted while live so a clear empties the region
          rather than removing it — `ChartAnnouncer` clears an empty message
          immediately (ADR-0005 §4). */}
      <Show when={props.keyboard && props.live}>
        {/* `label` owns the no-active case (it returns "" for undefined), so the
            announcer clears through the same wording path a step takes. */}
        <ChartAnnouncer message={props.label(active())} />
      </Show>
    </>
  );
}
