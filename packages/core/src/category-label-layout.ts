/**
 * Deterministic category-label collision and the bottom-margin reservation
 * rotated labels need.
 *
 * The decide-to-rotate path is CHAR-COUNT × a constant versus adjacent-label
 * extents on the band step. It must not call `measureText`, `getBBox`, or any
 * other runtime font metric: those are how a visual baseline stops being
 * deterministic. Identical labels, band width, padding, and opt-in flag
 * therefore produce the same rotate-or-not answer and the same reserved
 * bottom every run.
 *
 * Rotation itself is caller-opted. This module never decides to rotate when
 * `optedIn` is false; an automatic path is out of scope.
 */
import { bandScale } from "./scales";

/**
 * Approximate px per axis-label character at the 11px axis font.
 *
 * An integer on purpose. A measured average width would re-introduce the
 * font-metric dependency truncation already rejected.
 */
export const CATEGORY_LABEL_CHAR_PX = 6;

/**
 * Degrees applied to a bottom category axis when the collision test fires.
 * Negative is the conventional "lean down to the right" for a bottom axis.
 */
export const CATEGORY_LABEL_ROTATION_DEG = -45;

/**
 * Tick-mark length plus the gap Axis already leaves under a bottom label
 * (`tickSize` 6 + 12). Kept here so the reserved bottom and the painted
 * offset cannot drift apart.
 */
export const CATEGORY_LABEL_TICK_GAP_PX = 18;

/** Axis font-size fallback, matching `Axis`'s `--sp-font-sm, 11px`. */
export const CATEGORY_LABEL_FONT_PX = 11;

/**
 * √2/2 as a 707/1000 integer ratio, so a 45° projection is exact integer
 * arithmetic rather than a `Math.sin` that could differ by platform.
 */
const SQRT_HALF_NUM = 707;
const SQRT_HALF_DEN = 1000;

export interface CategoryLabelRotationInput {
  /** Caller asked for rotation. Absent/false → never rotate, never reserve. */
  optedIn: boolean;
  /** Labels as they will be painted (already truncated / caller-formatted). */
  labels: readonly string[];
  /** Inner drawing width the band scale will receive, in px. */
  innerWidth: number;
  /** Band padding, forwarded to `bandScale`. Default: the scale's own 0.1. */
  padding?: number;
}

export interface CategoryLabelRotation {
  rotate: boolean;
  /**
   * Bottom-margin floor required when `rotate` is true; 0 otherwise.
   * Applied as `Math.max(existingBottom, reservedBottom)` on the shared
   * margin path — never as a bar-only layout fork.
   */
  reservedBottom: number;
}

/**
 * The band step for `count` categories across `innerWidth`.
 *
 * Built through `bandScale` rather than re-derived, so the collision test
 * and the painted scale agree on spacing. Dummy domain ids are enough:
 * step depends on count, range, and padding, not on the id strings.
 */
export function categoryBandStep(
  count: number,
  innerWidth: number,
  padding?: number,
): number {
  if (count <= 0) return innerWidth;
  const domain = Array.from({ length: count }, (_, i) => String(i));
  return bandScale({ domain, range: [0, innerWidth], padding }).step();
}

/**
 * Adjacent labels collide when the sum of their half-extents (char-count ×
 * the constant) exceeds the band step that separates their centres.
 */
export function adjacentCategoryLabelsCollide(
  labels: readonly string[],
  step: number,
): boolean {
  for (let i = 0; i < labels.length - 1; i++) {
    const left = labels[i];
    const right = labels[i + 1];
    if (left === undefined || right === undefined) continue;
    const halfLeft = (left.length * CATEGORY_LABEL_CHAR_PX) / 2;
    const halfRight = (right.length * CATEGORY_LABEL_CHAR_PX) / 2;
    if (halfLeft + halfRight > step) return true;
  }
  return false;
}

/**
 * Bottom inset a 45°-rotated label set needs, from the longest painted
 * label. Integer projection of length × char-px and the font height, plus
 * the tick gap Axis already uses.
 */
export function reservedRotatedCategoryBottom(labels: readonly string[]): number {
  let maxLen = 0;
  for (const label of labels) {
    if (label.length > maxLen) maxLen = label.length;
  }
  const projected = Math.floor(
    (maxLen * CATEGORY_LABEL_CHAR_PX * SQRT_HALF_NUM +
      CATEGORY_LABEL_FONT_PX * SQRT_HALF_NUM) /
      SQRT_HALF_DEN,
  );
  return projected + CATEGORY_LABEL_TICK_GAP_PX;
}

/**
 * Decide whether an opted-in vertical category axis should rotate, and how
 * much bottom margin to reserve when it does.
 *
 * `innerWidth <= 0` (unmeasured) is "cannot decide" — not a collision — so a
 * first paint at size 0 does not invent a reservation that a later measure
 * has to take back.
 */
export function resolveCategoryLabelRotation(
  input: CategoryLabelRotationInput,
): CategoryLabelRotation {
  if (!input.optedIn || input.labels.length < 2 || input.innerWidth <= 0) {
    return { rotate: false, reservedBottom: 0 };
  }
  const step = categoryBandStep(input.labels.length, input.innerWidth, input.padding);
  if (!adjacentCategoryLabelsCollide(input.labels, step)) {
    return { rotate: false, reservedBottom: 0 };
  }
  return {
    rotate: true,
    reservedBottom: reservedRotatedCategoryBottom(input.labels),
  };
}
