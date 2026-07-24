/**
 * Min/max-per-bucket decimation — [ADR-0023](../../../docs/decisions/adr-0023-density-decimation-and-inspection.md)'s
 * density recovery, adopted from the harness candidate `test/perf/app/decimate.ts`'s
 * `minMaxBuckets` that the ADR's measurement selected.
 *
 * That measurement is what makes this file a TRANSCRIPTION rather than a fresh
 * implementation: the ADR's numbers (picture quality, spike survival, extrema
 * survival) were produced by the harness candidate, and they are evidence for
 * THIS module only if what ships here computes byte-identical output to what
 * was measured. `packages/core/test/decimate.test.ts` proves that with an
 * oracle test against the harness candidate directly — read it before changing
 * anything below.
 *
 * Generalised over the harness candidate in exactly one place: the harness
 * candidate is typed to `SeriesDatum` and reads `.t`/`.y` directly, because the
 * harness only ever decimates one shape. This module is called from both the
 * `SeriesDatum` painting path and, downstream, from `NormalizedDatum`-shaped
 * inputs, so time/value access goes through `DecimateAccessors` instead of a
 * hard-coded field name. The bucketing, extrema, gap-carry, and sort logic are
 * unchanged.
 */

/** How to read a datum of caller-supplied shape `T`. */
export interface DecimateAccessors<T> {
  /** Epoch ms for a datum. */
  time: (d: T) => number;
  /** The plotted value, or null for a gap (a declared null, a non-finite, an
   *  invalid state — the CALLER classifies; this module only honours it). */
  value: (d: T) => number | null;
}

/**
 * Min/max per bucket over `data`, bounding the PRESENT points at `budget`
 * (gap markers ride along and may exceed it). Returns original datum objects
 * only — identity, metadata, and state survive. Identity (the same array
 * reference) when `data.length <= budget`. Budgets below 2 clamp to 2;
 * non-integer budgets floor.
 *
 * ## Bucketing
 *
 * Two points can come out of a bucket (its min and its max), so the bucket
 * count is half the (clamped, floored) budget — `Math.max(1, Math.floor(budget
 * / 2))` — and bucket bounds are cut by INDEX FRACTION (`data.length /
 * buckets`), not by time. A bucket's min and max datum are the ones the
 * accessor reads, among PRESENT values only, and are emitted in the OCCURRENCE
 * order they appeared in `data` — min first if it came first, max first
 * otherwise — never a fixed order. A fixed order would zig-zag the drawn line
 * against time and draw a segment the data never went through. A bucket with a
 * single present datum emits it once, not twice.
 *
 * ## Gaps
 *
 * The FIRST gap datum encountered in a bucket (`value` returns `null`) is
 * carried through to the output (`gap ??= d`) even though it contributes
 * nothing to the min/max search. Dropping it would let a decimated chart
 * silently connect a line across data the source declared missing — the one
 * thing the series contract exists to prevent — so a bucket that had a gap
 * still HAS a gap for whatever null policy the caller applies downstream.
 *
 * ## Output order
 *
 * The per-bucket loop can leave a gap datum out of time order against the
 * min/max pair it shares a bucket with (the gap is pushed first, unconditionally,
 * ahead of an extremum that occurred earlier in the bucket), so the full output
 * is sorted ascending by time before it is returned. A time series whose x is
 * not ascending draws backwards.
 */
export function decimateMinMax<T>(
  data: readonly T[],
  budget: number,
  accessors: DecimateAccessors<T>,
): readonly T[] {
  if (data.length <= budget) return data;

  // Clamp before halving: a budget under 2 has no room for a min AND a max, and
  // a non-integer budget names a point count that does not exist.
  const clampedBudget = Math.max(2, Math.floor(budget));
  const buckets = Math.max(1, Math.floor(clampedBudget / 2));
  const size = data.length / buckets;
  const out: T[] = [];

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(data.length, Math.floor((b + 1) * size));
    let lo: T | undefined;
    let hi: T | undefined;
    let loAt = -1;
    let hiAt = -1;
    let gap: T | undefined;

    for (let i = start; i < end; i++) {
      const d = data[i] as T;
      const v = accessors.value(d);
      if (v === null) {
        gap ??= d;
        continue;
      }
      if (lo === undefined || v < (accessors.value(lo) as number)) {
        lo = d;
        loAt = i;
      }
      if (hi === undefined || v > (accessors.value(hi) as number)) {
        hi = d;
        hiAt = i;
      }
    }

    if (gap) out.push(gap);
    if (lo && hi && lo !== hi) out.push(...(loAt < hiAt ? [lo, hi] : [hi, lo]));
    else if (lo) out.push(lo);
  }

  // Sort by time: a gap point can land out of order against the pair it shares
  // a bucket with, and a time series whose x is not ascending draws backwards.
  return out.sort((a, b) => accessors.time(a) - accessors.time(b));
}
