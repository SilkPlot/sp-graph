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
/**
 * Whether an array is already ascending in time, remembered per array
 * identity. The series contract sorts nothing, so this is discovered once per
 * array (one pass) rather than assumed; a scrambled series keeps the general
 * scan below, a sorted one gets the two binary searches. A viewport commit on
 * a dense series narrows every series again, and on 20,000 points the full
 * scan was one of the largest per-commit costs the 2026-09-04 traces named.
 */
const ASCENDING = new WeakMap<readonly unknown[], boolean>();

function ascendingInTime<T>(data: readonly T[], time: (d: T) => number): boolean {
  const known = ASCENDING.get(data);
  if (known !== undefined) return known;
  let ascending = true;
  let previous = Number.NEGATIVE_INFINITY;
  for (const d of data) {
    const t = time(d);
    if (!(t >= previous)) {
      ascending = false;
      break;
    }
    previous = t;
  }
  ASCENDING.set(data, ascending);
  return ascending;
}

/** First index whose time is >= `t` in an ascending array (`data.length` if none). */
function lowerBound<T>(data: readonly T[], time: (d: T) => number, t: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time(data[mid]!) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index whose time is > `t` in an ascending array (`data.length` if none). */
function upperBound<T>(data: readonly T[], time: (d: T) => number, t: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time(data[mid]!) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function marksForPlotInterval<T>(
  data: readonly T[],
  time: (d: T) => number,
  interval: MsInterval | undefined,
): readonly T[] {
  if (interval === undefined) return data;

  const { start, end } = interval;

  if (ascendingInTime(data, time)) {
    // Sorted: the inside run is contiguous, and the nearest outside neighbours
    // are the elements just before and just after it. Same result as the scan
    // below, in source order, including the identity return when everything
    // is inside.
    const first = lowerBound(data, time, start);
    const last = upperBound(data, time, end);
    if (first === 0 && last === data.length) return data;
    // The left neighbour is the last datum before the run; among equal
    // instants the scan below keeps the last in source order, which in an
    // ascending array is the one just before `first`.
    const from = first > 0 ? first - 1 : 0;
    if (last >= data.length) return data.slice(from);
    // The right neighbour is the nearest instant after the run, and among
    // equal instants the scan keeps the LAST in source order; a slice would
    // keep the first, so the tie is resolved explicitly.
    const rightIndex = upperBound(data, time, time(data[last]!)) - 1;
    const out = data.slice(from, last);
    out.push(data[rightIndex]!);
    return out;
  }
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
