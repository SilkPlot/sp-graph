/**
 * Extents — the numeric span of a series under an accessor.
 *
 * This is core's job by the package split: core owns pure computation over data
 * (scales, extents, ticks, formatters). It lived in `@silkplot/charts` until the
 * cartesian model needed it too, which is the usual way a misplaced helper
 * announces itself.
 */

/**
 * Min/max of an accessor over a series.
 *
 * Returns `[0, 1]` for empty input rather than `[Infinity, -Infinity]`: an empty
 * series still has to produce a scale, and a degenerate domain makes d3 emit
 * `NaN` positions that render as nothing and are painful to trace back here.
 */
export function extentOf<T>(
  data: readonly T[],
  accessor: (d: T) => number,
): [number, number] {
  if (data.length === 0) return [0, 1];
  let min = Infinity;
  let max = -Infinity;
  for (const d of data) {
    const v = accessor(d);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}
