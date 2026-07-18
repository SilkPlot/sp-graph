/**
 * `packOverlaps`' IDENTITY contract — everything that turns on `options.key`.
 *
 * The geometry of the packing (lanes, clusters, lane counts, ties, purity) is
 * `overlap.test.ts`. This file is the other subject: what an identity is for,
 * what it fixes, and what it makes an error. Three things, in order — the
 * input-order dependency a key removes, the duplicate-key throw, and the
 * permutation determinism a unique key buys across every tie shape at once.
 *
 * The two geometry invariants are re-asserted at the end over the keyed set,
 * because a key entering the sort must not change what a correct packing is.
 */
import { describe, expect, it } from "vitest";
import { packOverlaps } from "../src/index";
import type { Interval, PackedInterval } from "../src/index";
import { expectClusterLaneCounts, expectNoLaneSharing } from "./overlap-support";

/**
 * The `(start, end)` sort fully orders every pair EXCEPT exact duplicates
 * (same start AND same end). For those, the unkeyed packer falls through to
 * input order — deterministic for one input, but able to swap the duplicates'
 * lanes when the same set arrives in a different order. `options.key` is the
 * final tie-break that removes that last dependency.
 */
describe("packOverlaps — exact-duplicate tie-break", () => {
  const laneOf = <T extends Interval>(packed: PackedInterval<T>[], item: T): number =>
    packed.find((p) => p.item === item)!.lane;

  it("without a key, exact-duplicate intervals take lanes in INPUT order (the documented caveat)", () => {
    const a = { id: "a", start: 0, end: 10 };
    const b = { id: "b", start: 0, end: 10 };

    // Same two objects, opposite array orders. The lane an item gets tracks its
    // array position, not its identity — which is exactly the caveat the doc
    // comment now states plainly.
    expect(laneOf(packOverlaps([a, b]), a)).toBe(0);
    expect(laneOf(packOverlaps([b, a]), a)).toBe(1);
  });

  it("with a key, exact duplicates get identity-stable lanes regardless of input order", () => {
    const a = { id: "a", start: 0, end: 10 };
    const b = { id: "b", start: 0, end: 10 };
    const key = (e: { id: string }): string => e.id;

    // id "a" < id "b", so a is lane 0 and b is lane 1 no matter the input order.
    expect(laneOf(packOverlaps([a, b], { key }), a)).toBe(0);
    expect(laneOf(packOverlaps([b, a], { key }), a)).toBe(0);
    expect(laneOf(packOverlaps([a, b], { key }), b)).toBe(1);
    expect(laneOf(packOverlaps([b, a], { key }), b)).toBe(1);
  });
});

describe("packOverlaps — duplicate keys are a caller error, not degradable data", () => {
  const key = (e: { id: string }): string => e.id;

  it("throws when two items share a key AND an interval", () => {
    const items = [
      { id: "dup", start: 0, end: 10 },
      { id: "dup", start: 0, end: 10 },
    ];
    expect(() => packOverlaps(items, { key })).toThrow(/duplicate key/);
  });

  it("throws on an identity collision even when the intervals differ", () => {
    // The offence is the repeated identity, not a repeated interval: one key
    // cannot map to two lanes whatever the geometry.
    const items = [
      { id: "dup", start: 0, end: 10 },
      { id: "dup", start: 50, end: 60 },
    ];
    expect(() => packOverlaps(items, { key })).toThrow(/duplicate key/);
  });

  it("does not throw for an all-unique key set", () => {
    const items = [
      { id: "x", start: 0, end: 10 },
      { id: "y", start: 0, end: 10 },
    ];
    expect(() => packOverlaps(items, { key })).not.toThrow();
  });

  it("does NOT throw for exact-duplicate intervals when no key is supplied — data degrades", () => {
    // The contrast with the throwing cases above: with no key, the input is
    // treated as data (two events that genuinely coincide) and packs cleanly.
    // Throwing is reserved for a supplied key that collides — a code bug.
    const items = [
      { start: 0, end: 10 },
      { start: 0, end: 10 },
    ];
    expect(() => packOverlaps(items)).not.toThrow();
    expect(packOverlaps(items)).toHaveLength(2);
  });
});

/**
 * Permutation determinism for a UNIQUELY KEYED set spanning every shape the
 * phase calls out: identical intervals, equal starts, equal ends, a zero-length
 * interval, and two disjoint clusters. With a unique key the sort is a total
 * order, so packing is fully determined and every fixed permutation must yield
 * the same `{ lane, laneCount }` per key. Fixed reorderings only — no RNG.
 */
describe("packOverlaps — key permutation determinism across every tie shape", () => {
  type Keyed = Interval & { id: string };

  const KEYED: Keyed[] = [
    // Cluster A (spans 0..20): identical pair, an equal-start fan, an equal-end
    // pair, and a zero-length interval sitting inside the span.
    { id: "a1", start: 0, end: 10 },
    { id: "a2", start: 0, end: 10 }, // identical to a1
    { id: "a3", start: 0, end: 5 }, // equal start, smaller end
    { id: "a4", start: 0, end: 20 }, // equal start, larger end
    { id: "a5", start: 2, end: 20 }, // equal END with a4, different start
    { id: "a6", start: 8, end: 8 }, // zero-length, inside a4/a5
    // Cluster B (spans 40..60): disjoint from A (40 >= 20), with its own
    // identical pair and zero-length interval.
    { id: "b1", start: 40, end: 50 },
    { id: "b2", start: 40, end: 50 }, // identical to b1
    { id: "b3", start: 45, end: 45 }, // zero-length, inside b1/b4
    { id: "b4", start: 45, end: 60 }, // equal start with b3
  ];
  const key = (e: Keyed): string => e.id;

  // Fixed, deterministic permutations of the input — never a random shuffle.
  const permutations: Array<(xs: Keyed[]) => Keyed[]> = [
    (xs) => [...xs],
    (xs) => [...xs].reverse(),
    (xs) => [...xs.slice(4), ...xs.slice(0, 4)], // rotate by 4
    (xs) => {
      const out = [...xs];
      for (let i = 0; i + 1 < out.length; i += 2) {
        const t = out[i]!;
        out[i] = out[i + 1]!;
        out[i + 1] = t;
      }
      return out;
    },
  ];

  const byKey = (packed: PackedInterval<Keyed>[]): Map<string, { lane: number; laneCount: number }> =>
    new Map(packed.map((p) => [p.item.id, { lane: p.lane, laneCount: p.laneCount }]));

  it("is non-vacuous: the set actually contains exact-duplicate intervals", () => {
    // Without exact `(start, end)` duplicates the key tie-break is never reached
    // and this whole suite would prove nothing.
    const seen = new Set<string>();
    let duplicatePairs = 0;
    for (const it of KEYED) {
      const sig = `${it.start},${it.end}`;
      if (seen.has(sig)) duplicatePairs++;
      seen.add(sig);
    }
    expect(duplicatePairs).toBeGreaterThan(0);
  });

  it("yields the same { lane, laneCount } per key under every fixed permutation", () => {
    const reference = byKey(packOverlaps(KEYED, { key }));
    expect(reference.size).toBe(KEYED.length);
    for (const permute of permutations) {
      expect(byKey(packOverlaps(permute(KEYED), { key }))).toEqual(reference);
    }
  });

  it("upholds the geometry invariants: no overlapping pair shares a lane, one laneCount per cluster", () => {
    // The same two invariants as the unkeyed set in `overlap.test.ts`, over a
    // set built to hit every tie shape. Same property, different data — this
    // still fails on its own dataset, and it must hold once a key enters the
    // sort just as it did without one.
    const packed = packOverlaps(KEYED, { key });
    expectNoLaneSharing(packed);
    expectClusterLaneCounts(KEYED, packed);
  });

  it("does not mutate the caller's array or its items when keyed", () => {
    const snapshot = KEYED.map((it) => ({ ...it }));
    const order = [...KEYED];
    packOverlaps(KEYED, { key });
    expect(KEYED).toEqual(snapshot);
    KEYED.forEach((it, i) => {
      expect(it).toBe(order[i]);
    });
  });
});
