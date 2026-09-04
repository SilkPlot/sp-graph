/**
 * The sorted fast path of `marksForPlotInterval` must return exactly what
 * the general scan returns: same elements, same order, identity when every
 * datum is inside. The general scan is the definition; it is reproduced here
 * verbatim as the oracle and the fast path is held to it over random data,
 * sorted and scrambled, with duplicate instants and empty intervals.
 */
import { describe, expect, it } from "vitest";
import { marksForPlotInterval } from "../src/plot-area";

interface D {
  t: number;
  id: number;
}

/** The pre-2026-09-04 definition, kept as the oracle. */
function oracle<T>(
  data: readonly T[],
  time: (d: T) => number,
  interval: { start: number; end: number } | undefined,
): readonly T[] {
  if (interval === undefined) return data;
  const { start, end } = interval;
  let left: T | undefined;
  let leftT = Number.NEGATIVE_INFINITY;
  let right: T | undefined;
  let rightT = Number.POSITIVE_INFINITY;
  let insideCount = 0;
  for (const d of data) {
    const t = time(d);
    if (t >= start && t <= end) insideCount += 1;
    else if (t < start) {
      if (t >= leftT) {
        left = d;
        leftT = t;
      }
    } else if (t <= rightT) {
      right = d;
      rightT = t;
    }
  }
  if (insideCount === data.length) return data;
  const keep = new Set<T>();
  if (left !== undefined) keep.add(left);
  if (right !== undefined) keep.add(right);
  return data.filter((d) => {
    const t = time(d);
    return (t >= start && t <= end) || keep.has(d);
  });
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const time = (d: D) => d.t;

describe("marksForPlotInterval, sorted fast path", () => {
  it("returns the oracle's elements in the oracle's order on random sorted series", () => {
    const random = lcg(4);
    for (let round = 0; round < 200; round++) {
      const n = Math.floor(random() * 300);
      const data: D[] = [];
      let t = 0;
      for (let i = 0; i < n; i++) {
        // Duplicate instants happen (random() < 0.15 keeps t), so ties are covered.
        if (random() >= 0.15) t += 1 + Math.floor(random() * 5);
        data.push({ t, id: i });
      }
      const a = random() * (t + 10) - 5;
      const b = random() * (t + 10) - 5;
      const interval = { start: Math.min(a, b), end: Math.max(a, b) };
      const expected = oracle(data, time, interval);
      const actual = marksForPlotInterval(data, time, interval);
      expect(actual.map((d) => d.id)).toEqual(expected.map((d) => d.id));
      if (expected === data) expect(actual).toBe(data);
    }
  });

  it("keeps the general scan for a scrambled series", () => {
    const data: D[] = [
      { t: 30, id: 0 },
      { t: 5, id: 1 },
      { t: 20, id: 2 },
      { t: 10, id: 3 },
      { t: 40, id: 4 },
    ];
    const interval = { start: 12, end: 25 };
    expect(marksForPlotInterval(data, time, interval).map((d) => d.id)).toEqual([0, 2, 3]);
    expect(marksForPlotInterval(data, time, interval)).toEqual(oracle(data, time, interval));
  });

  it("returns the same array when the interval covers everything, and both neighbours otherwise", () => {
    const data: D[] = [1, 2, 3, 4, 5].map((t, id) => ({ t, id }));
    expect(marksForPlotInterval(data, time, { start: 0, end: 9 })).toBe(data);
    expect(marksForPlotInterval(data, time, undefined)).toBe(data);
    expect(marksForPlotInterval(data, time, { start: 2.5, end: 3.5 }).map((d) => d.t)).toEqual([2, 3, 4]);
    expect(marksForPlotInterval(data, time, { start: 6, end: 9 }).map((d) => d.t)).toEqual([5]);
    expect(marksForPlotInterval(data, time, { start: -3, end: 0 }).map((d) => d.t)).toEqual([1]);
    expect(marksForPlotInterval([], time, { start: 0, end: 1 })).toEqual([]);
  });
});
