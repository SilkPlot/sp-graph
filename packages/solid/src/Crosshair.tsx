/**
 * Crosshair — rules drawn at an active position.
 *
 * It is told where to draw and draws there. It does not listen for pointer
 * events, hold a hit index, or know what a datum is: resolving a pointer into
 * an active point is the caller's, so that a time series can resolve with a
 * cheap bisector where a point cloud needs Delaunay, and so the cursor and the
 * tooltip read one position rather than each computing their own and drifting.
 *
 * Snapping is therefore not a feature here — a snapped cursor is one drawn at a
 * snapped position. See docs/decisions/adr-0002-crosshair-and-tooltip-anchor.md.
 *
 * Coordinates are inner coordinates, the same space `Gridlines` and the marks
 * use, so it cannot drift from what it points at.
 */
import { Show, type Component } from "solid-js";
import { useChartBounds } from "./context";

/**
 * The cursor colour, per the theming contract (ADR-0001): the token, with a
 * fallback so an unthemed consumer still sees a cursor rather than one that
 * silently inherits its parent's colour.
 */
const CURSOR_STROKE = "var(--sp-color-cursor, currentColor)";

export interface CrosshairProps {
  /** Vertical rule at this inner-x. Omit for no vertical rule. */
  x?: number;
  /** Horizontal rule at this inner-y. Omit for no horizontal rule. */
  y?: number;
  class?: string;
}

export const Crosshair: Component<CrosshairProps> = (props) => {
  const bounds = useChartBounds();

  return (
    // Decoration: it points at a value the announcement already carries, so it
    // is hidden from assistive tech. A bare <g> has no tabindex.
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a <g> with no tabindex is not focusable
    <g class={props.class} data-silkplot-crosshair aria-hidden="true">
      <Show when={props.x !== undefined}>
        <line
          data-silkplot-crosshair-rule="x"
          x1={props.x}
          x2={props.x}
          y1={0}
          y2={bounds().innerHeight}
          stroke={CURSOR_STROKE}
        />
      </Show>
      <Show when={props.y !== undefined}>
        <line
          data-silkplot-crosshair-rule="y"
          x1={0}
          x2={bounds().innerWidth}
          y1={props.y}
          y2={props.y}
          stroke={CURSOR_STROKE}
        />
      </Show>
    </g>
  );
};
