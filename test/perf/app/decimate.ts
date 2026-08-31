/**
 * The W-D aggregation/decimation CANDIDATES, and the error they introduce.
 *
 * These are the historical comparison candidates and scorer retained in the
 * harness. Their measurements informed the shipped min/max paint recovery,
 * which now lives in the chart package and is mounted by W-D at a 2,000-point
 * budget. The harness versions remain independent data-level swaps: they score
 * error against raw truth and prove that a candidate already at the budget is
 * not reduced again by the shipped paint policy.
 *
 * TWO candidates rather than one, because a single unopposed error figure is
 * unreadable. "Max error 4.2 units" means nothing until you can see what a
 * careless method scores on the same data — and on this fixture the careless
 * method scores far worse in a specific, nameable way (it aliases the fast
 * oscillation and drops every spike), which is what makes the good method's
 * number evidence instead of a reassurance.
 */
import type { Series, SeriesDatum } from "@silkplot/core";
import type { ActiveReading } from "./perf-types";

/** A decimation candidate: same shape in, fewer points out, time order preserved. */
export type Candidate = (data: readonly SeriesDatum[], target: number) => SeriesDatum[];

/** Independent expected inspection for a displayed series at a raw-domain fraction. */
export function expectedInspectionAtFraction(
  seriesId: string,
  raw: readonly SeriesDatum[],
  displayed: readonly SeriesDatum[],
  fraction: number,
): ActiveReading | undefined {
  const first = raw[0];
  const last = raw.at(-1);
  if (!first || !last || displayed.length === 0 || fraction < 0 || fraction > 1) {
    return undefined;
  }
  const target =
    first.t.getTime() + fraction * (last.t.getTime() - first.t.getTime());
  let lo = 0;
  let hi = displayed.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((displayed[mid]?.t.getTime() ?? Number.POSITIVE_INFINITY) < target) lo = mid;
    else hi = mid;
  }
  const loDatum = displayed[lo] as SeriesDatum;
  const hiDatum = displayed[hi] as SeriesDatum;
  const sourceIndex =
    Math.abs(target - loDatum.t.getTime()) <= Math.abs(hiDatum.t.getTime() - target)
      ? lo
      : hi;
  const datum = displayed[sourceIndex] as SeriesDatum;
  return {
    seriesId,
    sourceIndex,
    time: datum.t.toISOString(),
    y: datum.y,
  };
}

/**
 * Every Nth point. The naive candidate, included to FAIL.
 *
 * It is the first thing anyone writes and it is wrong in a way that does not
 * look wrong: sampling a signal that oscillates near the sample interval
 * reconstructs a smooth, plausible curve at the wrong frequency, and a
 * one-sample spike survives only if it happens to land on a multiple of N. The
 * picture is clean. The reading is false. Keeping it here means the good
 * candidate's error figure has something to be better than.
 */
export const everyNth: Candidate = (data, target) => {
  if (data.length <= target) return [...data];
  const step = Math.ceil(data.length / target);
  const out: SeriesDatum[] = [];
  for (let i = 0; i < data.length; i += step) out.push(data[i] as SeriesDatum);
  const last = data[data.length - 1] as SeriesDatum;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
};

/**
 * Min and max per bucket, emitted in the order they occurred within the bucket.
 *
 * The standard truthful reduction for a dense time series, and the reason is
 * geometric rather than statistical: a line chart at 86,400 points over ~1,100
 * pixels is drawing roughly 80 points per pixel column, and the only thing a
 * reader can actually SEE in a column is its vertical extent. Keeping the
 * extremes of each bucket preserves exactly that extent, so the drawn envelope
 * is the same envelope the raw data would draw. An excursion cannot vanish,
 * because an excursion IS an extreme.
 *
 * Emitting them in occurrence order (min before max, or max before min,
 * whichever came first) matters: emitting them in a fixed order would make the
 * line zig-zag against time and put segments where the data never went.
 *
 * A null in the bucket is carried through as its own point rather than being
 * skipped, so a gap policy still has a gap to honour — dropping it would silently
 * connect across missing data, which is the one thing the series contract exists
 * to prevent.
 */
export const minMaxBuckets: Candidate = (data, target) => {
  if (data.length <= target) return [...data];
  // Two points out per bucket, so the bucket count is half the target.
  const buckets = Math.max(1, Math.floor(target / 2));
  const size = data.length / buckets;
  const out: SeriesDatum[] = [];

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(data.length, Math.floor((b + 1) * size));
    let lo: SeriesDatum | undefined;
    let hi: SeriesDatum | undefined;
    let loAt = -1;
    let hiAt = -1;
    let gap: SeriesDatum | undefined;

    for (let i = start; i < end; i++) {
      const d = data[i] as SeriesDatum;
      if (d.y === null) {
        gap ??= d;
        continue;
      }
      if (lo === undefined || d.y < (lo.y as number)) {
        lo = d;
        loAt = i;
      }
      if (hi === undefined || d.y > (hi.y as number)) {
        hi = d;
        hiAt = i;
      }
    }

    if (gap) out.push(gap);
    if (lo && hi && lo !== hi) out.push(...(loAt < hiAt ? [lo, hi] : [hi, lo]));
    else if (lo) out.push(lo);
  }

  // Sort by time: a gap point can land out of order against the pair it shares a
  // bucket with, and a time series whose x is not ascending draws backwards.
  return out.sort((a, b) => a.t.getTime() - b.t.getTime());
};

export interface DecimationError {
  candidate: string;
  rawPoints: number;
  outPoints: number;
  /** The worst a reader could misread a value by, in data units. */
  maxAbsError: number;
  /** The typical misreading — small even for a bad candidate, which is why it is not the gate. */
  meanAbsError: number;
  /** Whether the raw extremes survive as drawn values. An envelope that shrank has lost an excursion. */
  keptMin: boolean;
  keptMax: boolean;
  /** How many of the fixture's deliberate one-second spikes survive. */
  spikesKept: number;
  spikesTotal: number;
}

/**
 * Score a candidate against the raw truth, from the READER's position.
 *
 * The error is not "how far is each emitted point from the original at the same
 * index" — that would score a candidate on the points it kept, which it kept
 * because they were easy. It is: for every raw instant, what value does the
 * decimated chart show a reader who inspects there? A reader lands on the
 * nearest drawn point, so that is what each raw value is compared against.
 *
 * `maxAbsError` is the number that matters and `meanAbsError` is the number that
 * flatters. On 86,400 points, eight destroyed spikes move a mean by almost
 * nothing while being precisely the failure a density policy exists to name — so
 * both are reported, in that order, and the spike count is reported beside them
 * so neither can be read alone.
 */
export function decimationError(
  candidate: string,
  raw: readonly SeriesDatum[],
  out: readonly SeriesDatum[],
  spikeIndices: readonly number[],
): DecimationError {
  const times = out.map((d) => d.t.getTime());
  // The drawn points are ascending in time, so a reader's nearest is a binary
  // search rather than a scan — 86,400 linear scans over ~2,000 points is 170
  // million comparisons and would make the harness itself the slow thing.
  const nearest = (t: number): SeriesDatum => {
    let lo = 0;
    let hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((times[mid] as number) < t) lo = mid;
      else hi = mid;
    }
    const dLo = Math.abs(t - (times[lo] as number));
    const dHi = Math.abs((times[hi] as number) - t);
    return (dLo <= dHi ? out[lo] : out[hi]) as SeriesDatum;
  };

  let maxAbs = 0;
  let sumAbs = 0;
  let counted = 0;
  let rawMin = Number.POSITIVE_INFINITY;
  let rawMax = Number.NEGATIVE_INFINITY;

  for (const d of raw) {
    if (d.y === null) continue;
    rawMin = Math.min(rawMin, d.y);
    rawMax = Math.max(rawMax, d.y);
    const shown = nearest(d.t.getTime());
    if (shown.y === null) continue;
    const err = Math.abs(d.y - shown.y);
    if (err > maxAbs) maxAbs = err;
    sumAbs += err;
    counted++;
  }

  const drawn = out.filter((d) => d.y !== null).map((d) => d.y as number);
  const drawnSet = new Set(drawn);
  const outTimes = new Set(times);
  const spikesKept = spikeIndices.filter((i) => {
    const spike = raw[i];
    return spike !== undefined && outTimes.has(spike.t.getTime());
  }).length;

  return {
    candidate,
    rawPoints: raw.length,
    outPoints: out.length,
    maxAbsError: +maxAbs.toFixed(2),
    meanAbsError: +(counted === 0 ? 0 : sumAbs / counted).toFixed(3),
    keptMin: drawnSet.has(rawMin),
    keptMax: drawnSet.has(rawMax),
    spikesKept,
    spikesTotal: spikeIndices.length,
  };
}

/** Apply a candidate to a one-series fixture, keeping identity so it is a replacement and not a remount. */
export const decimateSeries = (
  series: readonly Series[],
  candidate: Candidate,
  target: number,
): Series[] =>
  series.map((s) => ({ ...s, data: candidate(s.data, target) }));
