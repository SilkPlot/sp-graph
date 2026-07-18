import { describe, expect, it } from "vitest";
import { packOverlaps } from "../src/index";
import type { Interval, PackedInterval } from "../src/index";

/** Strict overlap: touching (a.end === b.start) is NOT an overlap. */
function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Deterministic, varied interval set (no RNG) for property-style checks. */
function generateIntervals(n: number): Interval[] {
  const items: Interval[] = [];
  for (let i = 0; i < n; i++) {
    const start = (i * 17) % 97;
    const span = 1 + ((i * 23 + 7) % 19);
    items.push({ start, end: start + span });
  }
  return items;
}

/** Connected components of the overlap graph — independent of the sort/sweep internals. */
function overlapClusters(items: readonly Interval[]): Interval[][] {
  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x]!;
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (overlaps(items[i]!, items[j]!)) union(i, j);
    }
  }
  const groups = new Map<number, Interval[]>();
  items.forEach((item, i) => {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(item);
    groups.set(root, group);
  });
  return [...groups.values()];
}

/** Max number of intervals simultaneously active, via sweep line (ends before starts on ties). */
function maxConcurrent(items: readonly Interval[]): number {
  const events: Array<[time: number, delta: number]> = [];
  for (const it of items) {
    events.push([it.start, 1]);
    events.push([it.end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let max = 0;
  for (const [, delta] of events) {
    current += delta;
    if (current > max) max = current;
  }
  return max;
}

/**
 * Build an expected packing from `(item, lane, laneCount)` triples.
 *
 * This constructs the expectation; it does not make it. Every case below still
 * writes its own lanes and lane counts and still fails on its own numbers — what
 * is shared is the `{ item, lane, laneCount }` object shape, which is the
 * packer's output format and identical by definition.
 */
const packing = <T extends Interval>(
  ...rows: Array<[item: T, lane: number, laneCount: number]>
): PackedInterval<T>[] => rows.map(([item, lane, laneCount]) => ({ item, lane, laneCount }));

/** No two overlapping intervals may share a lane. Asserted over whichever set is passed. */
function expectNoLaneSharing(packed: readonly PackedInterval<Interval>[]): void {
  for (let i = 0; i < packed.length; i++) {
    for (let j = i + 1; j < packed.length; j++) {
      if (overlaps(packed[i]!.item, packed[j]!.item)) {
        expect(packed[i]!.lane).not.toBe(packed[j]!.lane);
      }
    }
  }
}

/** Every item in a cluster carries one laneCount, and it equals that cluster's peak concurrency. */
function expectClusterLaneCounts(
  items: readonly Interval[],
  packed: readonly PackedInterval<Interval>[],
): void {
  const byItem = new Map(packed.map((p) => [p.item, p]));
  for (const cluster of overlapClusters(items)) {
    const laneCounts = new Set(cluster.map((it) => byItem.get(it)!.laneCount));
    expect(laneCounts.size).toBe(1);
    expect([...laneCounts][0]).toBe(maxConcurrent(cluster));
  }
}

describe("packOverlaps — basic shape", () => {
  it("returns an empty array for empty input", () => {
    expect(packOverlaps([])).toEqual([]);
  });

  it("assigns a single interval to lane 0 of a 1-lane cluster", () => {
    const [p] = packOverlaps([{ start: 0, end: 10 }]);
    expect(p).toEqual({ item: { start: 0, end: 10 }, lane: 0, laneCount: 1 });
  });

  it("puts two disjoint intervals both in lane 0, each its own 1-lane cluster", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 20, end: 30 };
    expect(packOverlaps([a, b])).toEqual(packing([a, 0, 1], [b, 0, 1]));
  });

  it("puts two overlapping intervals in different lanes of a shared 2-lane cluster", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 5, end: 15 };
    expect(packOverlaps([a, b])).toEqual(packing([a, 0, 2], [b, 1, 2]));
  });
});

describe("packOverlaps — cluster boundaries", () => {
  it("treats touching intervals (a.end === b.start) as non-overlapping — new cluster", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 10, end: 20 };
    expect(packOverlaps([a, b])).toEqual(packing([a, 0, 1], [b, 0, 1]));
  });

  it("keeps a genuinely overlapping pair (b.start just before a.end) in one cluster", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 9, end: 20 };
    expect(packOverlaps([a, b])).toEqual(packing([a, 0, 2], [b, 1, 2]));
  });

  it("treats two identical zero-length intervals at the same point as touching, not overlapping", () => {
    const a = { start: 5, end: 5 };
    const b = { start: 5, end: 5 };
    expect(packOverlaps([a, b])).toEqual(packing([a, 0, 1], [b, 0, 1]));
  });

  it("treats a zero-length interval at another interval's end as touching, not overlapping", () => {
    const a = { start: 0, end: 5 };
    const b = { start: 5, end: 5 };
    expect(packOverlaps([a, b])).toEqual(packing([a, 0, 1], [b, 0, 1]));
  });

  it("packs a zero-length interval that starts inside another interval into a second lane", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 5, end: 5 };
    expect(packOverlaps([a, b])).toEqual(packing([a, 0, 2], [b, 1, 2]));
  });
});

describe("packOverlaps — lane reuse", () => {
  it("reuses a freed lane for a later non-overlapping interval in the same cluster", () => {
    const a = { start: 0, end: 100 };
    const b = { start: 10, end: 20 };
    const c = { start: 30, end: 40 };
    // b frees lane 1 at t=20, so c takes it back rather than opening a third.
    expect(packOverlaps([a, b, c])).toEqual(packing([a, 0, 2], [b, 1, 2], [c, 1, 2]));
  });
});

describe("packOverlaps — ties", () => {
  it("gives three identical intervals three distinct lanes and laneCount 3", () => {
    const a = { start: 5, end: 10 };
    const b = { start: 5, end: 10 };
    const c = { start: 5, end: 10 };
    expect(packOverlaps([a, b, c])).toEqual(packing([a, 0, 3], [b, 1, 3], [c, 2, 3]));
  });

  it("sorts intervals sharing a start by ascending end, and packs them into distinct lanes", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 0, end: 5 };
    const c = { start: 0, end: 20 };
    // Output order is the SORTED order — b (end 5) first, then a, then c.
    expect(packOverlaps([a, b, c])).toEqual(packing([b, 0, 3], [a, 1, 3], [c, 2, 3]));
  });
});

describe("packOverlaps — determinism", () => {
  it("produces the same per-item packing regardless of input order", () => {
    // Distinct starts by construction, so sort order — and thus the packing —
    // cannot depend on input order or on sort stability for ties.
    const items: Interval[] = [];
    for (let i = 0; i < 20; i++) {
      const start = i * 7;
      items.push({ start, end: start + ((i % 4) + 1) * 5 });
    }

    const forward = packOverlaps(items);

    const shuffled = [...items];
    // Fixed, deterministic permutation (not a random shuffle).
    for (let i = 0; i < shuffled.length; i += 2) {
      const j = shuffled.length - 1 - i;
      if (j > i) {
        const tmp = shuffled[i]!;
        shuffled[i] = shuffled[j]!;
        shuffled[j] = tmp;
      }
    }
    const reversed = packOverlaps(shuffled);

    const byItem = <T extends Interval>(
      packed: PackedInterval<T>[],
    ): Map<T, { lane: number; laneCount: number }> =>
      new Map(packed.map((p) => [p.item, { lane: p.lane, laneCount: p.laneCount }]));

    expect(byItem(forward)).toEqual(byItem(reversed));
  });
});

describe("packOverlaps — input purity", () => {
  it("does not mutate the caller's array or its items", () => {
    const items: Interval[] = [
      { start: 5, end: 15 },
      { start: 0, end: 10 },
      { start: 20, end: 25 },
    ];
    const originalOrder = [...items];
    const snapshot = items.map((it) => ({ ...it }));

    packOverlaps(items);

    expect(items).toEqual(snapshot);
    expect(items[0]).toBe(originalOrder[0]);
    expect(items[1]).toBe(originalOrder[1]);
    expect(items[2]).toBe(originalOrder[2]);
  });
});

describe("packOverlaps — invariants over a larger deterministic set", () => {
  const items = generateIntervals(60);
  const packed = packOverlaps(items);

  it("never assigns overlapping intervals to the same lane", () => {
    expectNoLaneSharing(packed);
  });

  it("gives every item in an overlap cluster the same laneCount, equal to peak concurrency", () => {
    expectClusterLaneCounts(items, packed);
  });

  it("uses exactly the lanes [0, laneCount) within each cluster, with no gaps", () => {
    const byItem = new Map(packed.map((p) => [p.item, p]));
    for (const cluster of overlapClusters(items)) {
      const laneCount = byItem.get(cluster[0]!)!.laneCount;
      const usedLanes = new Set(cluster.map((it) => byItem.get(it)!.lane));
      for (const lane of usedLanes) {
        expect(lane).toBeGreaterThanOrEqual(0);
        expect(lane).toBeLessThan(laneCount);
      }
    }
  });

  it("preserves every input item exactly once in the output (order may be re-sorted)", () => {
    expect(packed).toHaveLength(items.length);
    const packedItems = new Set(packed.map((p) => p.item));
    expect(packedItems.size).toBe(items.length);
    for (const item of items) expect(packedItems.has(item)).toBe(true);
  });
});

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
    // The same two invariants as the unkeyed set above, over a set built to hit
    // every tie shape. Same property, different data — this still fails on its
    // own dataset, and it must hold once a key enters the sort just as it did
    // without one.
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
