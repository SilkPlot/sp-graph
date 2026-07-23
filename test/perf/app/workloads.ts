/**
 * The four workloads, named once.
 *
 * The scale numbers are the capability boundary's and the performance protocol's
 * — they are not tuning knobs. Raising one to make a number look better would
 * change what the number is about, so they are constants here and the protocol
 * is the place to argue with them.
 */
import type { Series, TimeInterval } from "@silkplot/core";

export const WORKLOADS = ["w-a", "w-b", "w-c", "w-d"] as const;
export type Workload = (typeof WORKLOADS)[number];

export const isWorkload = (value: string | null): value is Workload =>
  WORKLOADS.includes(value as Workload);

/** W-A: four series of five thousand points — 20,000 values in one chart. */
export const WA_SERIES = 4;
export const WA_POINTS = 5000;

/** W-C: the many-chart dashboard. */
export const WC_CHARTS = 48;

/**
 * W-D: how many points a decimation candidate is allowed to emit.
 *
 * Two thousand, from the geometry rather than from taste: the measured container
 * is 1,100 CSS px wide and a line chart cannot draw two distinguishable points in
 * one pixel column, so ~2 points per column is the most that can carry
 * information. Emitting more would be measuring the cost of drawing points
 * nobody can see, which flatters the raw case and slanders the candidate.
 */
export const WD_TARGET_POINTS = 2000;

/** The union time extent of a series set, for a full-extent range control. */
export function seriesExtent(series: readonly Series[]): TimeInterval {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const d of s.data) {
      const t = d.t.getTime();
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
  }
  // An empty set has no extent; return a degenerate but finite interval rather
  // than Infinity, which would produce a non-finite scale and a blank chart that
  // looks like a rendering bug instead of an empty input.
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { start: new Date(0), end: new Date(1) };
  }
  return { start: new Date(lo), end: new Date(hi) };
}

/** Points actually rendered, summed across series — the denominator for every W number. */
export const countPoints = (series: readonly Series[]): number =>
  series.reduce((n, s) => n + s.data.length, 0);
