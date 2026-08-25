/**
 * Caller-opted measured left-margin reservation for horizontal category labels.
 *
 * The default path never measures. `measureWidth` is invoked only when the
 * caller opted in AND the category axis is on the left (horizontal bars).
 * Vertical orientation is a no-op on `left` — those labels sit on the bottom.
 *
 * This module stays DOM-free: the render layer supplies `measureWidth`
 * (`getBBox` / `measureText`). Font-metric variance is the explicit
 * determinism trade-off of the opt-in; the default 40px left is unchanged.
 */
import type { RankedOrientation } from "./ranked";

/**
 * Tick-mark length plus the gap Axis already leaves to the left of a left-axis
 * label (`tickSize` 6 + 4). Kept here so the reserved left and the painted
 * offset cannot drift apart.
 */
export const CATEGORY_LABEL_LEFT_TICK_GAP_PX = 10;

export interface MeasuredCategoryLeftInput {
  /** Caller asked for measured left. Absent/false → never measure, never reserve. */
  optedIn: boolean;
  /** Category-axis orientation. Only `"horizontal"` puts labels on the left. */
  orientation: RankedOrientation;
  /** Labels as they will be painted (already truncated / caller-formatted). */
  labels: readonly string[];
  /**
   * Width of one painted label, in px. Must not be called when `optedIn` is
   * false or when orientation is not horizontal.
   */
  measureWidth: (label: string) => number;
}

export interface MeasuredCategoryLeft {
  /**
   * Left-margin floor required when opted in on a horizontal category axis;
   * 0 otherwise. Applied as `Math.max(existingLeft, reservedLeft)` on the
   * shared margin path — never as a bar-only layout fork.
   */
  reservedLeft: number;
}

/**
 * Left inset a horizontal category-label set needs, from the longest painted
 * width plus the tick/gap Axis already uses on the left.
 */
export function reservedMeasuredCategoryLeft(measuredLabelWidth: number): number {
  return Math.ceil(measuredLabelWidth) + CATEGORY_LABEL_LEFT_TICK_GAP_PX;
}

/**
 * Decide how much left margin to reserve when a caller opts into measured
 * mode. The default path (`optedIn` false) never calls `measureWidth`.
 */
export function resolveMeasuredCategoryLeft(
  input: MeasuredCategoryLeftInput,
): MeasuredCategoryLeft {
  if (!input.optedIn || input.orientation !== "horizontal" || input.labels.length === 0) {
    return { reservedLeft: 0 };
  }
  let maxWidth = 0;
  for (const label of input.labels) {
    const width = input.measureWidth(label);
    if (width > maxWidth) maxWidth = width;
  }
  return { reservedLeft: reservedMeasuredCategoryLeft(maxWidth) };
}
