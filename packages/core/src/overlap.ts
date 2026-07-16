/**
 * Overlap packing (calendar) — deterministic interval lane assignment.
 *
 * Roadmap Phase 3: the booking calendar packs concurrent events into
 * columns/lanes with a DETERMINISTIC sweep/partition algorithm — never a
 * `d3-force` physics simulation (heavier, visually unstable). This module owns
 * that math; the Solid calendar package renders lanes from its output.
 *
 * The greedy lane assignment below is real and correct for column packing, but
 * intentionally minimal.
 *
 * TODO(Phase 3): column-count normalisation (widen events to fill free lanes),
 *   visible-range clipping / overscan, and resource-row grouping.
 */

/** A time interval to be packed. `start`/`end` are comparable numbers (e.g. epoch ms). */
export interface Interval {
  start: number;
  end: number;
}

/** An interval plus its assigned lane and the total lane count of its cluster. */
export interface PackedInterval<T extends Interval> {
  item: T;
  /** Zero-based lane index within its overlap cluster. */
  lane: number;
  /** Number of lanes in the cluster this item belongs to (for width = 1/laneCount). */
  laneCount: number;
}

/**
 * Assign each interval to the lowest free lane such that no two overlapping
 * intervals share a lane. Deterministic: input is sorted by (start, end).
 */
export function packOverlaps<T extends Interval>(items: readonly T[]): PackedInterval<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);

  const result: PackedInterval<T>[] = [];
  // `active` holds the end time currently occupying each lane index.
  let clusterStart = 0;
  let clusterMaxEnd = -Infinity;
  const laneEnds: number[] = [];

  const flushCluster = (upTo: number): void => {
    const laneCount = Math.max(1, laneEnds.length);
    for (let i = clusterStart; i < upTo; i++) result[i]!.laneCount = laneCount;
    laneEnds.length = 0;
    clusterStart = upTo;
    clusterMaxEnd = -Infinity;
  };

  sorted.forEach((item, index) => {
    // A gap with no active overlap closes the current cluster.
    if (item.start >= clusterMaxEnd && laneEnds.length > 0) flushCluster(index);

    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    clusterMaxEnd = Math.max(clusterMaxEnd, item.end);
    result.push({ item, lane, laneCount: 1 });
  });

  flushCluster(result.length);
  return result;
}
