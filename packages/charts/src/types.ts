/** Shared chart data types. */

/** A single time-series point: a timestamp and a numeric value. */
export interface TimePoint {
  t: Date;
  y: number;
}

/** A single categorical datum: a label and a numeric value. */
export interface CategoryPoint {
  label: string;
  y: number;
}

/** A single 2-D point for scatter plots. */
export interface XYPoint {
  x: number;
  y: number;
}

/** Min/max of an accessor over a series (returns [0, 1] for empty input). */
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
