/**
 * `decimateMinMax` is a TRANSCRIPTION of the harness candidate
 * `test/perf/app/decimate.ts`'s `minMaxBuckets`, generalised only in HOW it
 * reads a datum ([ADR-0023](../../../docs/decisions/adr-0023-density-decimation-and-inspection.md)).
 * The ADR's picture-quality and spike-survival numbers were measured against
 * that harness candidate, not against this module, so they are evidence for
 * what ships here only if the two compute byte-identical output. The first
 * describe block below is that proof: an oracle test importing the harness
 * candidate directly and comparing against it point-for-point, object-for-
 * object. Everything after it exercises properties the oracle alone would not
 * catch — clamping, identity, and the gap/order guarantees the ADR's decision
 * 2 and 4 depend on.
 */
import { describe, expect, it } from "vitest";
import { decimateMinMax } from "../src/index";
import type { SeriesDatum } from "../src/index";
// The measured candidate itself, imported rather than re-implemented — a
// second hand-written copy would be a claim about the algorithm, and the
// point of this file is to check the SHIPPED code against the MEASURED code,
// not against another guess at what it does.
import { minMaxBuckets } from "../../../test/perf/app/decimate";

/** Reads a `SeriesDatum` — the accessor pair the oracle's own candidate is fixed to. */
const seriesAccessors = {
  time: (d: SeriesDatum) => d.t.getTime(),
  value: (d: SeriesDatum) => d.y,
};

/* -------------------------------------------------------------------------- */
/* The oracle fixture                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic PRNG (mulberry32) — the SAME sequence on every run and every
 * machine, so a failure here is reproducible rather than occasionally lucky.
 * No external dependency: the whole generator is eleven lines.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POINT_COUNT = 12_000;
const EPOCH_MS = Date.UTC(2026, 0, 1);
const STEP_MS = 1000; // one-second cadence, the same density ADR-0023 measured
const GAP_EVERY = 137; // a declared-null datum on this cadence
const SPIKE_EVERY = 97; // a one-sample excursion on this cadence

/** The fixture's two UNIQUE global extremes, forced by index rather than left to
 *  the generator, so the "survives the envelope" tests have an unambiguous
 *  winner instead of hoping the random walk produced one. */
const GLOBAL_MAX_INDEX = 4000;
const GLOBAL_MIN_INDEX = 9000;
const GLOBAL_MAX_VALUE = 500;
const GLOBAL_MIN_VALUE = -500;

const rand = mulberry32(0xc0ffee);

/**
 * 12,000 points — above the 10,000 floor the oracle property requires — built
 * from a smooth base plus noise plus periodic spikes plus periodic null gaps,
 * so a single fixture exercises the extrema search, the gap carry-through, and
 * the final time sort all at once, at every tested budget.
 */
const FIXTURE: SeriesDatum[] = Array.from({ length: POINT_COUNT }, (_, i) => {
  const t = new Date(EPOCH_MS + i * STEP_MS);
  if (i === GLOBAL_MAX_INDEX) return { t, y: GLOBAL_MAX_VALUE };
  if (i === GLOBAL_MIN_INDEX) return { t, y: GLOBAL_MIN_VALUE };
  if (i % GAP_EVERY === 0) return { t, y: null };
  const base = Math.sin(i / 40) * 10;
  const noise = (rand() - 0.5) * 2;
  const spike = i % SPIKE_EVERY === 0 ? (i % (SPIKE_EVERY * 2) === 0 ? 180 : -180) : 0;
  return { t, y: base + noise + spike };
});

/** The three budgets the spec names: a realistic chart budget, an odd one, and a
 *  tiny one that forces most buckets down to a single point pair. */
const TESTED_BUDGETS = [2000, 501, 7] as const;

const isStrictlyAscending = (times: readonly number[]): boolean =>
  times.every((t, i) => i === 0 || (times[i - 1] as number) < t);

describe("decimateMinMax — the oracle: point-for-point against the measured candidate", () => {
  it.each(TESTED_BUDGETS)(
    "equals minMaxBuckets exactly at budget %i — same objects, same order, no tolerance",
    (budget) => {
      const expected = minMaxBuckets(FIXTURE, budget);
      const actual = decimateMinMax(FIXTURE, budget, seriesAccessors);
      expect(actual.length).toBe(expected.length);
      // `toBe`, not `toEqual`: the claim is REFERENCE identity, not lookalike
      // values — a synthesized copy with the same numbers would pass `toEqual`
      // and fail the thing this test exists to prove.
      actual.forEach((d, i) => {
        expect(d).toBe(expected[i]);
      });
    },
  );
});

describe("decimateMinMax — structural envelope: the global extremes always survive", () => {
  it.each(TESTED_BUDGETS)("keeps the planted global max and min at budget %i", (budget) => {
    const out = decimateMinMax(FIXTURE, budget, seriesAccessors);
    expect(out).toContain(FIXTURE[GLOBAL_MAX_INDEX]);
    expect(out).toContain(FIXTURE[GLOBAL_MIN_INDEX]);
  });
});

describe("decimateMinMax — output order", () => {
  it.each(TESTED_BUDGETS)("is strictly ascending in time at budget %i", (budget) => {
    const out = decimateMinMax(FIXTURE, budget, seriesAccessors);
    expect(isStrictlyAscending(out.map((d) => seriesAccessors.time(d)))).toBe(true);
  });
});

describe("decimateMinMax — every emitted datum is caller data", () => {
  it.each(TESTED_BUDGETS)(
    "at budget %i, every output element is reference-identical to a FIXTURE element",
    (budget) => {
      const source = new Set(FIXTURE);
      const out = decimateMinMax(FIXTURE, budget, seriesAccessors);
      for (const d of out) expect(source.has(d)).toBe(true);
    },
  );
});

/* -------------------------------------------------------------------------- */
/* Small, explicit fixtures for the properties the big oracle would obscure    */
/* -------------------------------------------------------------------------- */

/** A minimal accessor pair over `{ t: Date; y: number | null }` literals, for
 *  the small hand-built cases below where a full `SeriesDatum` is unnecessary
 *  ceremony. */
interface Point {
  t: Date;
  y: number | null;
}
const pointAccessors = { time: (d: Point) => d.t.getTime(), value: (d: Point) => d.y };
const at = (seconds: number): Date => new Date(EPOCH_MS + seconds * 1000);

describe("decimateMinMax — identity below budget", () => {
  it("returns the SAME array reference when data.length is under budget", () => {
    const data: Point[] = [{ t: at(0), y: 1 }, { t: at(1), y: 2 }];
    expect(decimateMinMax(data, 100, pointAccessors)).toBe(data);
  });

  it("returns the same reference when data.length equals budget exactly", () => {
    const data: Point[] = [{ t: at(0), y: 1 }, { t: at(1), y: 2 }];
    expect(decimateMinMax(data, 2, pointAccessors)).toBe(data);
  });
});

describe("decimateMinMax — occurrence order within a bucket", () => {
  // One bucket (budget 2, buckets = max(1, floor(2/2)) = 1), three points so
  // decimation actually runs (3 > budget 2).
  it("emits the max first when the max occurred before the min", () => {
    const max = { t: at(0), y: 9 };
    const mid = { t: at(1), y: 5 };
    const min = { t: at(2), y: 1 };
    const out = decimateMinMax([max, mid, min], 2, pointAccessors);
    expect(out).toEqual([max, min]);
  });

  it("emits the min first when the min occurred before the max — the mirror case", () => {
    const min = { t: at(0), y: 1 };
    const mid = { t: at(1), y: 5 };
    const max = { t: at(2), y: 9 };
    const out = decimateMinMax([min, mid, max], 2, pointAccessors);
    expect(out).toEqual([min, max]);
  });

  it("emits a bucket's single present datum once, not twice, when it is both the min and the max", () => {
    const only = { t: at(0), y: 4 };
    const gapA = { t: at(1), y: null };
    const gapB = { t: at(2), y: null };
    // A bucket with one present value and two gaps: `lo === hi` by reference,
    // so the push must not duplicate it. Budget 2 forces the whole thing into
    // one bucket; length 3 exceeds it so decimation runs.
    const out = decimateMinMax([only, gapA, gapB], 2, pointAccessors);
    expect(out.filter((d) => d === only)).toHaveLength(1);
  });
});

describe("decimateMinMax — a gap inside a bucket is carried through", () => {
  it("keeps the null datum in the output alongside the bucket's min and max", () => {
    const lo = { t: at(0), y: 5 };
    const gap = { t: at(1), y: null };
    const hi = { t: at(2), y: 9 };
    const out = decimateMinMax([lo, gap, hi], 2, pointAccessors);
    expect(out).toContain(gap);
    expect(out).toEqual([lo, gap, hi]); // ascending time, gap sorted into place
  });
});

describe("decimateMinMax — present-point budget vs. the documented gap allowance", () => {
  it("bounds PRESENT points at budget but lets gap markers push the total over it", () => {
    // Budget 4 → 2 buckets. Every bucket below carries one gap plus two
    // distinct present values, so present count (4) sits exactly at the
    // budget while the total (6, gaps included) exceeds it — the allowance
    // the doc comment names, not a bound violation.
    const data: Point[] = [
      { t: at(0), y: null },
      { t: at(1), y: 5 },
      { t: at(2), y: 9 },
      { t: at(3), y: null },
      { t: at(4), y: 3 },
      { t: at(5), y: -1 },
    ];
    const out = decimateMinMax(data, 4, pointAccessors);
    const presentCount = out.filter((d) => pointAccessors.value(d) !== null).length;
    expect(presentCount).toBeLessThanOrEqual(4);
    expect(out.length).toBeGreaterThan(4);
    expect(out.length).toBe(6); // both gaps and all four extrema survive here
  });
});

describe("decimateMinMax — budget clamping", () => {
  const data: Point[] = [
    { t: at(0), y: 3 },
    { t: at(1), y: 1 },
    { t: at(2), y: 4 },
    { t: at(3), y: 1 },
    { t: at(4), y: 5 },
  ];

  it("budget 1 behaves as budget 2 — a budget under 2 cannot hold a min and a max", () => {
    expect(decimateMinMax(data, 1, pointAccessors)).toEqual(decimateMinMax(data, 2, pointAccessors));
  });

  it("budget 2.9 behaves as budget 2 — a non-integer budget floors", () => {
    expect(decimateMinMax(data, 2.9, pointAccessors)).toEqual(decimateMinMax(data, 2, pointAccessors));
  });
});

describe("decimateMinMax — generic over datum shape (the accessor is the whole contract)", () => {
  // Neither field is named `t` or `y`, and there is no `SeriesDatum` in sight —
  // the point of `DecimateAccessors` is that this module never has to know
  // that. Stands in for the `NormalizedDatum`-shaped caller ADR-0023 names
  // without pulling that type in for one test.
  interface Reading {
    at: number;
    reading: number | null;
  }
  const readingAccessors = { time: (d: Reading) => d.at, value: (d: Reading) => d.reading };

  it("decimates a datum shape that shares no field name with SeriesDatum", () => {
    const data: Reading[] = Array.from({ length: 10 }, (_, i) => ({
      at: i * 1000,
      reading: i === 5 ? null : Math.sin(i),
    }));
    const out = decimateMinMax(data, 4, readingAccessors);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((d) => data.includes(d))).toBe(true);
  });
});
