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
