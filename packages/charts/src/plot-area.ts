/**
 * Plot-area paint helpers — neighbour inclusion for marks that must enter or
 * leave the clipped plot, and nothing else.
 *
 * The viewport (`createViewport`, ADR-0014) stays interval arithmetic. This
 * module does not move that interval. It decides which datums a path generator
 * receives so a segment can cross a plot edge; Canvas `ctx.clip` hides
 * the overflow. The inclusion rule is substrate-independent.
 */
import type { MsInterval } from "@silkplot/core";

/**
 * The points a mark path should receive for a visible interval: every datum
 * inside the interval, plus one neighbour past each edge when one exists.
 *
 * The extra neighbour is what lets a segment enter or leave the plot. Without
 * it the path stops on the first and last inside points, which sit short of
 * the edge whenever those points are not exactly on the interval bound.
 *
 * `interval === undefined` is the identity (same array reference): no
 * navigation, or a dashboard member whose display comes from the effective
 * domain rather than a per-chart viewport.
 *
 * Order is the source order. Neighbours are the temporally nearest outside
 * points, not array-index neighbours, so a scrambled series does not pick a
 * geometric neighbour by accident.
 */
export function marksForPlotInterval<T>(
  data: readonly T[],
  time: (d: T) => number,
  interval: MsInterval | undefined,
): readonly T[] {
  if (interval === undefined) return data;

  const { start, end } = interval;
  let left: T | undefined;
  let leftT = Number.NEGATIVE_INFINITY;
  let right: T | undefined;
  let rightT = Number.POSITIVE_INFINITY;
  let insideCount = 0;

  for (const d of data) {
    const t = time(d);
    if (t >= start && t <= end) {
      insideCount += 1;
    } else if (t < start) {
      if (t >= leftT) {
        left = d;
        leftT = t;
      }
    } else if (t <= rightT) {
      right = d;
      rightT = t;
    }
  }

  if (insideCount === data.length) return data;

  const keep = new Set<T>();
  if (left !== undefined) keep.add(left);
  if (right !== undefined) keep.add(right);

  return data.filter((d) => {
    const t = time(d);
    return (t >= start && t <= end) || keep.has(d);
  });
}
