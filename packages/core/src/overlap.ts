/**
 * Overlap packing (calendar) — deterministic interval lane assignment.
 *
 * The deferred calendar roadmap packs concurrent events into
 * columns/lanes with a DETERMINISTIC sweep/partition algorithm — never a
 * `d3-force` physics simulation (heavier, visually unstable). This module owns
 * that math; the Solid calendar package renders lanes from its output.
 *
 * The greedy lane assignment below is real and correct for column packing, but
 * intentionally minimal.
 *
 * TODO(deferred calendar): column-count normalisation (widen events to fill free lanes),
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

/** Options for {@link packOverlaps}. */
export interface PackOptions<T extends Interval> {
  /**
   * A stable identity for each item, used as the FINAL sort tie-break — it only
   * decides order between two items that share BOTH `start` and `end`, which the
   * `(start, end)` sort alone leaves to input order (see below). Supplying it
   * makes packing independent of input order even for exact-duplicate intervals.
   *
   * The key must be UNIQUE across the input. A duplicate key is a caller
   * programming error, not degradable data: one identity mapping to two lanes is
   * exactly the determinism contract's negation, so `packOverlaps` THROWS rather
   * than silently packing it. (This is the opposite stance from the finite-value
   * policy on chart DATA, which degrades — here the offender is caller code.)
   */
  key?: (item: T) => string | number;
}

/** Total order over keys of a single kind (string↔string or number↔number). */
function compareKeys(a: string | number, b: string | number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Assign each interval to the lowest free lane such that no two overlapping
 * intervals share a lane.
 *
 * ## Determinism and the exact-tie caveat
 *
 * The sort key is `(start, end)`, which fully orders every pair EXCEPT those
 * sharing both bounds: equal starts are separated by end, unequal starts by
 * start, and only an exact `(start, end)` duplicate falls through to the
 * comparator's `0`. There the result depends on the input array's order (the
 * sort is stable), so two callers passing the same intervals in different orders
 * can get the two duplicates' lanes swapped. That is deterministic FOR A GIVEN
 * input but not ACROSS input orderings.
 *
 * Pass `options.key` to remove even that dependency: it is the final tie-break
 * and pins exact duplicates to a stable order by identity. `key` must be unique;
 * a duplicate throws (see {@link PackOptions.key}).
 */
export function packOverlaps<T extends Interval>(
  items: readonly T[],
  options: PackOptions<T> = {},
): PackedInterval<T>[] {
  const key = options.key;
  if (key) {
    const seen = new Set<string | number>();
    for (const item of items) {
      const k = key(item);
      if (seen.has(k)) {
        throw new Error(
          `packOverlaps: duplicate key ${JSON.stringify(k)}. A key must uniquely identify an ` +
            `item; two items sharing one would map to two lanes, which no rendering can express.`,
        );
      }
      seen.add(k);
    }
  }

  const sorted = [...items].sort(
    (a, b) => a.start - b.start || a.end - b.end || (key ? compareKeys(key(a), key(b)) : 0),
  );

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
