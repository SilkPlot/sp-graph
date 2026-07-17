/**
 * Extents — the numeric span of a series under an accessor.
 *
 * This is core's job by the package split: core owns pure computation over data
 * (scales, extents, ticks, formatters). It lived in `@silkplot/charts` until the
 * cartesian model needed it too, which is the usual way a misplaced helper
 * announces itself.
 */

/**
 * Min/max of an accessor over a series, ignoring every non-finite value.
 *
 * ## The finite-value policy
 *
 * Values failing `Number.isFinite` are skipped: `NaN`, `null`, `undefined`, and
 * `±Infinity` alike. `Number.isFinite` is used rather than the global `isFinite`
 * precisely because it does NOT coerce — the global would accept `null` as `0`
 * and re-admit the bug this policy exists to remove.
 *
 * That bug is worth stating, because it is the reason the check lives HERE and
 * not in the callers. Under a naive `v < min` scan, `null` coerces to `0` in the
 * relational comparison and is stored AS the minimum: `[5, null, 9]` yielded
 * `[null, 9]`, d3 then read that as `0`, and a single null row silently floored
 * an all-positive axis at zero. The chart rendered perfectly and was wrong. An
 * all-`NaN` series at least blanked the chart; this announced nothing.
 *
 * A domain-level check downstream cannot replace this, because the damage is
 * already policy-shaped by the time a domain exists: on all-invalid input a
 * `zero-floor` policy yields the inverted `[0, -Infinity]` while `zero-baseline`
 * yields the finite-but-meaningless `[0, 0]`. A "no NaN in the domain" guard
 * catches the line chart and misses the area chart.
 *
 * ## Why filter rather than throw
 *
 * A charting library that throws on one bad row takes a live dashboard down over
 * a value it could simply have skipped. d3, Vega-Lite, Observable Plot, Chart.js,
 * ECharts and Highcharts all degrade instead. Drawing a gap is the honest
 * failure: it is visible, local, and recoverable.
 *
 * ## The all-invalid fallback
 *
 * Returns `[0, 1]` when nothing finite survives — the same sentinel, and for the
 * same reason, as the empty case: a series still has to produce a scale, and a
 * degenerate domain makes d3 emit `NaN` positions that render as nothing and are
 * painful to trace back here. Empty and all-invalid are one path, not two.
 */
export function extentOf<T>(
  data: readonly T[],
  accessor: (d: T) => number,
): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const d of data) {
    const v = accessor(d);
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // `min` is only untouched when no finite value was seen — which covers empty
  // input and all-invalid input together.
  if (min === Infinity) return [0, 1];
  return [min, max];
}
