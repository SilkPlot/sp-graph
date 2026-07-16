/**
 * Chart bounds context — the reactive layout every primitive reads from.
 *
 * `ChartRoot` measures its container and provides these bounds; `SvgLayer`,
 * `Axis`, and chart components consume them. SSR-safe: creating and reading a
 * context touches no DOM.
 */
import { createContext, useContext } from "solid-js";
import type { Accessor } from "solid-js";

/** Inset from the container edges, leaving room for axes and labels. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The resolved, reactive geometry of a chart's drawing area. */
export interface ChartBounds {
  /** Outer container width in px. */
  width: number;
  /** Outer container height in px. */
  height: number;
  margins: Margins;
  /** width - margins.left - margins.right (never negative). */
  innerWidth: number;
  /** height - margins.top - margins.bottom (never negative). */
  innerHeight: number;
}

export const DEFAULT_MARGINS: Margins = { top: 8, right: 12, bottom: 24, left: 40 };

/** Compute inner dimensions from outer size + margins, clamped at 0. */
export function resolveBounds(
  width: number,
  height: number,
  margins: Margins,
): ChartBounds {
  return {
    width,
    height,
    margins,
    innerWidth: Math.max(0, width - margins.left - margins.right),
    innerHeight: Math.max(0, height - margins.top - margins.bottom),
  };
}

/** Context carries an accessor so consumers re-run only when bounds change. */
export const ChartBoundsContext = createContext<Accessor<ChartBounds>>();

/** Read the current chart bounds. Throws if used outside a `<ChartRoot>`. */
export function useChartBounds(): Accessor<ChartBounds> {
  const ctx = useContext(ChartBoundsContext);
  if (!ctx) {
    throw new Error(
      "[@silkplot/solid] useChartBounds() must be used inside a <ChartRoot>.",
    );
  }
  return ctx;
}
