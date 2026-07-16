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
    const packed = packOverlaps([a, b]);
    expect(packed).toEqual([
      { item: a, lane: 0, laneCount: 1 },
      { item: b, lane: 0, laneCount: 1 },
    ]);
  });

  it("puts two overlapping intervals in different lanes of a shared 2-lane cluster", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 5, end: 15 };
    const packed = packOverlaps([a, b]);
    expect(packed).toEqual([
      { item: a, lane: 0, laneCount: 2 },
      { item: b, lane: 1, laneCount: 2 },
    ]);
  });
});

describe("packOverlaps — cluster boundaries", () => {
  it("treats touching intervals (a.end === b.start) as non-overlapping — new cluster", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 10, end: 20 };
    const packed = packOverlaps([a, b]);
    expect(packed).toEqual([
      { item: a, lane: 0, laneCount: 1 },
      { item: b, lane: 0, laneCount: 1 },
    ]);
  });

  it("keeps a genuinely overlapping pair (b.start just before a.end) in one cluster", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 9, end: 20 };
    const packed = packOverlaps([a, b]);
    expect(packed).toEqual([
      { item: a, lane: 0, laneCount: 2 },
      { item: b, lane: 1, laneCount: 2 },
    ]);
  });

  it("treats two identical zero-length intervals at the same point as touching, not overlapping", () => {
    const a = { start: 5, end: 5 };
    const b = { start: 5, end: 5 };
    const packed = packOverlaps([a, b]);
    expect(packed).toEqual([
      { item: a, lane: 0, laneCount: 1 },
      { item: b, lane: 0, laneCount: 1 },
    ]);
  });

  it("treats a zero-length interval at another interval's end as touching, not overlapping", () => {
    const a = { start: 0, end: 5 };
    const b = { start: 5, end: 5 };
    const packed = packOverlaps([a, b]);
    expect(packed).toEqual([
      { item: a, lane: 0, laneCount: 1 },
      { item: b, lane: 0, laneCount: 1 },
    ]);
  });

  it("packs a zero-length interval that starts inside another interval into a second lane", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 5, end: 5 };
    const packed = packOverlaps([a, b]);
    expect(packed).toEqual([
      { item: a, lane: 0, laneCount: 2 },
      { item: b, lane: 1, laneCount: 2 },
    ]);
  });
});

describe("packOverlaps — lane reuse", () => {
  it("reuses a freed lane for a later non-overlapping interval in the same cluster", () => {
    const a = { start: 0, end: 100 };
    const b = { start: 10, end: 20 };
    const c = { start: 30, end: 40 };
    const packed = packOverlaps([a, b, c]);
    expect(packed).toEqual([
      { item: a, lane: 0, laneCount: 2 },
      { item: b, lane: 1, laneCount: 2 },
      { item: c, lane: 1, laneCount: 2 },
    ]);
  });
});

describe("packOverlaps — ties", () => {
  it("gives three identical intervals three distinct lanes and laneCount 3", () => {
    const a = { start: 5, end: 10 };
    const b = { start: 5, end: 10 };
    const c = { start: 5, end: 10 };
    const packed = packOverlaps([a, b, c]);
    expect(packed).toEqual([
      { item: a, lane: 0, laneCount: 3 },
      { item: b, lane: 1, laneCount: 3 },
      { item: c, lane: 2, laneCount: 3 },
    ]);
  });

  it("sorts intervals sharing a start by ascending end, and packs them into distinct lanes", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 0, end: 5 };
    const c = { start: 0, end: 20 };
    const packed = packOverlaps([a, b, c]);
    expect(packed).toEqual([
      { item: b, lane: 0, laneCount: 3 },
      { item: a, lane: 1, laneCount: 3 },
      { item: c, lane: 2, laneCount: 3 },
    ]);
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
    for (let i = 0; i < packed.length; i++) {
      for (let j = i + 1; j < packed.length; j++) {
        if (overlaps(packed[i]!.item, packed[j]!.item)) {
          expect(packed[i]!.lane).not.toBe(packed[j]!.lane);
        }
      }
    }
  });

  it("gives every item in an overlap cluster the same laneCount, equal to peak concurrency", () => {
    const byItem = new Map(packed.map((p) => [p.item, p]));
    for (const cluster of overlapClusters(items)) {
      const laneCounts = new Set(cluster.map((it) => byItem.get(it)!.laneCount));
      expect(laneCounts.size).toBe(1);
      expect([...laneCounts][0]).toBe(maxConcurrent(cluster));
    }
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
