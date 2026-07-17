/**
 * Gridlines — tick-aligned rules across the plotting area.
 *
 * It shares `resolveTicks` with `Axis` rather than computing its own ticks.
 * That is the whole point: a grid line half a pixel off the label beneath it is
 * a defect the eye catches immediately and a test never does, and the only way
 * to make that disagreement impossible is for both to ask the same function.
 * Pass the same `scale` (and the same tick hints) you pass the matching `Axis`.
 *
 * D3 computes, Solid renders — no d3-axis, no d3-selection.
 */
import { createMemo, For, type Component } from "solid-js";
import type { Tick } from "@silkplot/core";
import { useChartBounds } from "./context";
import { resolveTicks, type AxisScale } from "./scale-ticks";

/** Which scale's ticks to draw lines for. */
export type GridlinesAxis = "x" | "y";

/**
 * The grid colour, per the theming contract (ADR-0001): read the token, and
 * carry a fallback so an unthemed consumer still gets something legible.
 *
 * `currentColor` is a safety net, not a designed colour — it is the *text*
 * colour, so an unthemed grid is heavier than intended. That is deliberate: it
 * renders, and it looks like something is missing, which is exactly what is
 * true. Loading the token stylesheet is what makes it right.
 *
 * The var is written out rather than imported from `@silkplot/theme`: primitives
 * do not depend on that package, and the property name is contract.
 */
const GRID_STROKE = "var(--sp-color-grid, currentColor)";

export interface GridlinesProps {
  /** The scale whose ticks the lines are drawn at. */
  scale: AxisScale;
  /**
   * Which scale this is. `"x"` draws VERTICAL lines — one per x tick, spanning
   * the full inner height; `"y"` draws HORIZONTAL lines. Default: `"y"`.
   *
   * Named for the scale rather than the line direction on purpose: "horizontal
   * gridlines" is ambiguous — it reads as either lines that are horizontal, or
   * lines belonging to the horizontal axis, which are vertical.
   */
  axis?: GridlinesAxis;
  /** Desired tick count (a hint). Ignored for band scales — every band is a tick. */
  tickCount?: number;
  /** Target px spacing between ticks when `tickCount` is omitted. Ignored for band scales. */
  pixelsPerTick?: number;
  class?: string;
}

export const Gridlines: Component<GridlinesProps> = (props) => {
  const bounds = useChartBounds();
  const axis = (): GridlinesAxis => props.axis ?? "y";

  const ticks = createMemo<Tick[]>(() =>
    resolveTicks(props.scale, {
      count: props.tickCount,
      pixelsPerTick: props.pixelsPerTick,
    }),
  );

  return (
    // Decoration that restates the axis labels, so it is hidden from assistive
    // tech for the same reason `Axis` is. A bare <g> has no tabindex.
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a <g> with no tabindex is not focusable
    <g class={props.class} data-silkplot-gridlines={axis()} aria-hidden="true">
      <For each={ticks()}>
        {(tick) =>
          axis() === "x" ? (
            <line
              x1={tick.position}
              x2={tick.position}
              y1={0}
              y2={bounds().innerHeight}
              stroke={GRID_STROKE}
            />
          ) : (
            <line
              x1={0}
              x2={bounds().innerWidth}
              y1={tick.position}
              y2={tick.position}
              stroke={GRID_STROKE}
            />
          )
        }
      </For>
    </g>
  );
};
