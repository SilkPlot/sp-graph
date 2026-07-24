/**
 * M4 — the pixel-column extremum selection described in Jugel, Jerzak,
 * Hackenbroich & Markl, "M4: A Visualization-Oriented Time Series Data
 * Aggregation", PVLDB 7(10), 2014.
 *
 * Section 4.2 states the aggregation directly: "M4 is a composite
 * value-preserving aggregation ... that groups a time series relation into w
 * equidistant time spans, such that each group exactly corresponds to a pixel
 * column in the visualization. For each group, M4 then computes the
 * aggregates min(v), max(v), min(t), and max(t) — hence the name M4 — and
 * then joins the aggregated data with the original time series, to add the
 * missing timestamps t_bottom and t_top and the missing values v_first and
 * v_last."
 *
 * Definition 2 (Section 4.4) names the same four tuples formally: "A
 * width-based M4 aggregation G_M4(T) selects the extremum tuples
 * (t_bottom_i, v_min_i), (t_top_i, v_max_i), (t_min_i, v_first_i), and
 * (t_max_i, v_last_i) from each B_i of G(T)." Four ROLES, not four points — a
 * single tuple can and often does fill more than one, and the paper's own
 * query (Figure 7a) selects it once:
 *
 *   ON k = round($w*(t-$t1)/($t2-$t1))
 *     AND (v = v_min OR v = v_max OR t = t_min OR t = t_max)
 *
 * one row per qualifying tuple, from a single OR predicate rather than a
 * union of four independent selections. This candidate deduplicates for the
 * same reason: a tuple that is simultaneously its column's first, min, and
 * max point is emitted once.
 *
 * `minMaxBuckets` (in `./decimate`) already keeps two of these four roles —
 * min and max. Definition 2's remaining two, the column's first and last
 * tuples by time, are what close the errors Section 4.3 documents for a
 * min/max-only reduction: the "missing line error", where a pixel column ends
 * up holding no tuple at all because neither the start nor the end of the
 * corresponding line was kept, and the "false line error", where the drawn
 * line connects the wrong pair of tuples across a column boundary because
 * that boundary was never selected. Theorem 1 (Section 4.4) is the payoff:
 * keeping exactly these four extrema per column reproduces the identical
 * two-colour line rendering as the full, unreduced series.
 */
import type { SeriesDatum } from "@silkplot/core";
import type { Candidate } from "./decimate";

/**
 * Per bucket: the earliest tuple, the latest tuple, a minimum-value tuple,
 * and a maximum-value tuple, over the bucket's non-null data — deduplicated,
 * output sorted by time.
 */
export const m4Columns: Candidate = (data, target) => {
  if (data.length <= target) return [...data];

  // M4 emits up to four tuples per bucket (first, last, min, max), so the
  // bucket count is a quarter of the point budget — the M4 analogue of how
  // `minMaxBuckets` derives its bucket count from `target / 2` for its two
  // tuples per bucket.
  const buckets = Math.max(1, Math.floor(target / 4));

  const t0 = (data[0] as SeriesDatum).t.getTime();
  const tEnd = (data[data.length - 1] as SeriesDatum).t.getTime();
  const span = tEnd - t0;

  // Bucket assignment is by TIME, mirroring the paper's pixel-column
  // grouping. Definition 1 (Section 4.4) derives it from the surjective
  // function i = round(w · (t − t_start)/(t_end − t_start)) over the full
  // time extent. We floor-and-clamp instead of round: `round` over
  // [0, w] yields w+1 groups with half-width groups at the two ends,
  // where floor-and-clamp yields exactly `buckets` equal-width columns
  // numbered 0..buckets-1. For uniformly sampled data the two schemes place
  // the same tuples in the same columns, which is why index bucketing and
  // time bucketing agree on `minMaxBuckets`'s fixture; this candidate
  // implements the paper's time-based form because M4's grouping is defined
  // over the time axis, not over row position.
  const bucketOf = (t: number): number =>
    span === 0 ? 0 : Math.min(buckets - 1, Math.floor(((t - t0) / span) * buckets));

  interface Column {
    first?: SeriesDatum;
    last?: SeriesDatum;
    min?: SeriesDatum;
    max?: SeriesDatum;
    // The first null in the column, carried through as its own emitted point —
    // mirrors `minMaxBuckets`'s `gap`, for the same reason: a null never fills
    // a value role, but dropping it entirely would silently connect across
    // missing data, which is the one thing a gap policy exists to prevent.
    gap?: SeriesDatum;
  }

  const columns: Column[] = Array.from({ length: buckets }, () => ({}));

  for (const d of data) {
    const col = columns[bucketOf(d.t.getTime())] as Column;
    if (d.y === null) {
      col.gap ??= d;
      continue;
    }
    const t = d.t.getTime();
    // Strict comparisons only, so a tie keeps whichever tuple was seen
    // first — the earliest occurrence, which is what determinism requires
    // for equal values.
    if (col.first === undefined || t < col.first.t.getTime()) col.first = d;
    if (col.last === undefined || t > col.last.t.getTime()) col.last = d;
    if (col.min === undefined || (d.y as number) < (col.min.y as number)) col.min = d;
    if (col.max === undefined || (d.y as number) > (col.max.y as number)) col.max = d;
  }

  const out: SeriesDatum[] = [];
  for (const col of columns) {
    if (col.gap) out.push(col.gap);
    // One tuple filling several roles is emitted once — see the file header:
    // the paper's own join is a single OR predicate, not a union of four
    // selections, so a qualifying tuple surfaces exactly once.
    const seen = new Set<SeriesDatum>();
    for (const d of [col.first, col.last, col.min, col.max]) {
      if (d !== undefined && !seen.has(d)) {
        seen.add(d);
        out.push(d);
      }
    }
  }

  // Sort by time: a gap point can land out of order against the tuples it
  // shares a bucket with, exactly as in `minMaxBuckets`.
  return out.sort((a, b) => a.t.getTime() - b.t.getTime());
};
