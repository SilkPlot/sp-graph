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

/**
 * Merge caller insets over the defaults, then raise any edge a reservation
 * asks to keep. Reservation is a floor (`Math.max`), so a caller who already
 * sized an edge larger than the reserved amount keeps their own value.
 *
 * This is the shared margin path every chart already walks. Extra room for
 * rotated category labels is applied here rather than as a bar-only layout.
 */
export function resolveMargins(
  partial?: Partial<Margins>,
  reserved?: Partial<Margins>,
): Margins {
  const base: Margins = { ...DEFAULT_MARGINS, ...partial };
  if (reserved === undefined) return base;
  return {
    top: Math.max(base.top, reserved.top ?? 0),
    right: Math.max(base.right, reserved.right ?? 0),
    bottom: Math.max(base.bottom, reserved.bottom ?? 0),
    left: Math.max(base.left, reserved.left ?? 0),
  };
}

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
