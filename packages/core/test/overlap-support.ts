/**
 * Shared ORACLES for the `packOverlaps` suites — an independent reimplementation
 * of what a correct packing means, used by both the geometry suite
 * (`overlap.test.ts`) and the identity suite (`overlap-identity.test.ts`).
 *
 * These deliberately do not share a line of logic with the packer: the overlap
 * relation is recomputed pairwise, clusters come from a union-find over that
 * relation, and peak concurrency from a sweep line. A helper that asked the
 * packer what the packer should do would pass against any change to it.
 *
 * What does NOT belong here is any single test's own expectations. The two
 * invariant helpers below are the exception that proves the rule: they are the
 * same property asserted over different datasets, so each caller still fails on
 * its own data.
 */
import { expect } from "vitest";
import type { Interval, PackedInterval } from "../src/index";

/** Strict overlap: touching (a.end === b.start) is NOT an overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Connected components of the overlap graph — independent of the sort/sweep internals. */
export function overlapClusters(items: readonly Interval[]): Interval[][] {
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
export function maxConcurrent(items: readonly Interval[]): number {
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

/** No two overlapping intervals may share a lane. Asserted over whichever set is passed. */
export function expectNoLaneSharing(packed: readonly PackedInterval<Interval>[]): void {
  for (let i = 0; i < packed.length; i++) {
    for (let j = i + 1; j < packed.length; j++) {
      if (overlaps(packed[i]!.item, packed[j]!.item)) {
        expect(packed[i]!.lane).not.toBe(packed[j]!.lane);
      }
    }
  }
}

/** Every item in a cluster carries one laneCount, and it equals that cluster's peak concurrency. */
export function expectClusterLaneCounts(
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
