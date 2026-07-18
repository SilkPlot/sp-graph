/**
 * `packOverlaps`' GEOMETRY contract — how intervals become lanes.
 *
 * Cluster boundaries, lane assignment and reuse, tie ordering, determinism,
 * input purity, and the invariants over a larger set. Everything that turns on
 * `options.key` — identity-stable lanes, the duplicate-key throw, permutation
 * determinism — is the other subject and lives in `overlap-identity.test.ts`.
 * The oracles both files share are in `overlap-support.ts`.
 */
import { describe, expect, it } from "vitest";
import { packOverlaps } from "../src/index";
import type { Interval, PackedInterval } from "../src/index";
import {
  expectClusterLaneCounts,
  expectNoLaneSharing,
  overlapClusters,
} from "./overlap-support";

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
