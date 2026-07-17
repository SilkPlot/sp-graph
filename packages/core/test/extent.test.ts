/**
 * `extentOf` decides the domain of every cartesian chart, so a mistake here is a
 * mistake in all four at once — and it went untested longest while carrying the
 * worst defect.
 *
 * The cases below are written against the POLICY, not against the current
 * implementation's shape: each states which non-finite input it rejects and what
 * the caller sees instead. The `null` case is the one that matters most — it is
 * the only defect in this module that rendered a plausible, wrong chart rather
 * than a blank one.
 */
import { describe, expect, it } from "vitest";
import { extentOf } from "../src/index";

interface Row {
  y: number;
}

/** Rows carrying values no `number`-typed accessor should ever see, but does. */
const rows = (...values: unknown[]): Row[] => values.map((y) => ({ y }) as Row);

describe("extentOf — the ordinary case", () => {
  it("returns the min and max under the accessor", () => {
    expect(extentOf(rows(5, 1, 9, 3), (d) => d.y)).toEqual([1, 9]);
  });

  it("handles a single row as a degenerate but finite span", () => {
    expect(extentOf(rows(7), (d) => d.y)).toEqual([7, 7]);
  });

  it("does not care about input order", () => {
    expect(extentOf(rows(9, 1, 5), (d) => d.y)).toEqual(
      extentOf(rows(1, 5, 9), (d) => d.y),
    );
  });

  it("keeps negative extents intact — zero is a policy, not this function's job", () => {
    // Forcing zero in belongs to the y-domain policy downstream. If this
    // function ever "helpfully" clamped, zero-floor and zero-baseline would stop
    // being distinguishable and four charts would collapse into one.
    expect(extentOf(rows(-5, -1), (d) => d.y)).toEqual([-5, -1]);
  });
});

describe("extentOf — the empty and all-invalid fallback", () => {
  it("returns the [0, 1] sentinel for empty input", () => {
    expect(extentOf([], (d: Row) => d.y)).toEqual([0, 1]);
  });

  // Each of these is a separate row because the seeds fail differently: NaN
  // never displaces them (both comparisons are false), while Infinity would
  // displace `max` and pass a non-finite bound straight into a d3 domain.
  it.each([
    ["all NaN", [Number.NaN, Number.NaN]],
    ["all null", [null, null]],
    ["all undefined", [undefined, undefined]],
    ["all +Infinity", [Number.POSITIVE_INFINITY]],
    ["all -Infinity", [Number.NEGATIVE_INFINITY]],
    ["a mix of every invalid kind", [Number.NaN, null, undefined, Number.POSITIVE_INFINITY]],
  ])("falls back to the [0, 1] sentinel when every value is invalid — %s", (_label, values) => {
    expect(extentOf(rows(...values), (d) => d.y)).toEqual([0, 1]);
  });

  it("returns the same sentinel for empty and all-invalid — one path, not two", () => {
    // The fallback is deliberately the empty case's documented sentinel. If
    // these ever diverge, a caller has two degenerate domains to reason about
    // instead of one.
    expect(extentOf(rows(Number.NaN), (d) => d.y)).toEqual(extentOf([], (d: Row) => d.y));
  });
});

describe("extentOf — partially invalid series skip the bad values", () => {
  it("ignores NaN among finite values", () => {
    expect(extentOf(rows(5, Number.NaN, 9), (d) => d.y)).toEqual([5, 9]);
  });

  it("ignores null rather than coercing it to zero — THE regression", () => {
    // The original defect exactly: `null < min` coerces null to 0, so null was
    // stored AS the minimum, d3 read it back as 0, and an all-positive series
    // silently gained a zero floor. Nothing about the rendered chart looked
    // wrong. This is the assertion that would have caught it.
    expect(extentOf(rows(5, null, 9), (d) => d.y)).toEqual([5, 9]);
  });

  it("ignores undefined among finite values", () => {
    expect(extentOf(rows(5, undefined, 9), (d) => d.y)).toEqual([5, 9]);
  });

  it("ignores +Infinity rather than letting it become the maximum", () => {
    expect(extentOf(rows(1, Number.POSITIVE_INFINITY), (d) => d.y)).toEqual([1, 1]);
  });

  it("ignores -Infinity rather than letting it become the minimum", () => {
    expect(extentOf(rows(Number.NEGATIVE_INFINITY, 4), (d) => d.y)).toEqual([4, 4]);
  });

  it("never returns a non-finite bound, whatever the mix", () => {
    const [lo, hi] = extentOf(
      rows(Number.NEGATIVE_INFINITY, 2, null, Number.NaN, 8, Number.POSITIVE_INFINITY, undefined),
      (d) => d.y,
    );
    expect(Number.isFinite(lo)).toBe(true);
    expect(Number.isFinite(hi)).toBe(true);
    expect([lo, hi]).toEqual([2, 8]);
  });

  it("a null among negatives does not invent a zero bound", () => {
    // The mirror of the headline case: coercion would put 0 at the TOP of an
    // all-negative extent, which is exactly the kind of quietly-wrong axis this
    // policy exists to prevent.
    expect(extentOf(rows(-9, null, -2), (d) => d.y)).toEqual([-9, -2]);
    // Guard against a vacuous pass: a coercing implementation returns [-9, 0]
    // here, so the two results must genuinely differ.
    expect(extentOf(rows(-9, null, -2), (d) => d.y)).not.toEqual([-9, 0]);
  });
});

describe("extentOf — the accessor is what decides", () => {
  it("reads the accessed field, not the datum", () => {
    const data = [
      { a: 1, b: 100 },
      { a: 2, b: 200 },
    ];
    expect(extentOf(data, (d) => d.a)).toEqual([1, 2]);
    expect(extentOf(data, (d) => d.b)).toEqual([100, 200]);
  });

  it("applies the finite policy to whatever the accessor computes, not to the stored value", () => {
    // A stored value can be perfectly finite and still produce NaN once the
    // accessor touches it. The policy has to catch the computed value.
    const data = [{ n: 4 }, { n: 0 }, { n: 16 }];
    expect(extentOf(data, (d) => 8 / d.n)).toEqual([0.5, 2]);
  });

  it("filters Invalid Date times, which is how a bad date reaches a time domain", () => {
    // `LineChart`/`AreaChart` derive their time domain through this function, so
    // an Invalid Date arrives here as NaN and must be skipped like any other.
    const data = [
      { t: new Date(Date.UTC(2026, 0, 1)) },
      { t: new Date("nonsense") },
      { t: new Date(Date.UTC(2026, 0, 5)) },
    ];
    const [lo, hi] = extentOf(data, (d) => d.t.getTime());
    expect(new Date(lo).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(new Date(hi).toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });
});

describe("extentOf — input purity", () => {
  it("does not mutate the caller's array or its rows", () => {
    const data = rows(3, Number.NaN, 8);
    const snapshot = data.map((d) => ({ ...d }));
    extentOf(data, (d) => d.y);
    expect(data).toEqual(snapshot);
    expect(data).toHaveLength(3);
  });
});
