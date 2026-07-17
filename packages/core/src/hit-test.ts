/**
 * Hit-testing — nearest-point lookup for pointer interaction.
 *
 * The dynamic-interaction roadmap needs fast nearest-mark lookup for
 * cursor/tooltip and point exploration. For 2-D scatter/point clouds we use
 * `d3-delaunay`
 * (Delaunay/Voronoi) to find the nearest point to a pointer in O(log n)-ish
 * time; for 1-D time-series a bisector is cheaper (TODO below).
 *
 * This is compute-only: it returns an index into the caller's data. Solid owns
 * the pointer events and the rendered cursor.
 */
import { Delaunay } from "d3-delaunay";

/** A built spatial index over a set of 2-D points. */
export interface HitIndex {
  /** Return the index of the point nearest to (px, py), or -1 if empty. */
  nearest(px: number, py: number): number;
}

export interface HitIndexOptions<T> {
  x: (d: T, index: number) => number;
  y: (d: T, index: number) => number;
}

/**
 * Build a Delaunay-backed nearest-point index over a data series. `x`/`y` map a
 * datum to its rendered pixel coordinates.
 */
export function createHitIndex<T>(
  data: readonly T[],
  options: HitIndexOptions<T>,
): HitIndex {
  if (data.length === 0) {
    return { nearest: () => -1 };
  }
  const delaunay = Delaunay.from(
    data as Iterable<T>,
    (d, i) => options.x(d, i),
    (d, i) => options.y(d, i),
  );
  return {
    nearest(px: number, py: number): number {
      return delaunay.find(px, py);
    },
  };
}

/**
 * TODO(dynamic interaction): `createBisectorIndex` for monotonic 1-D
 * (time-series) lookup —
 * a `d3-array` bisector is cheaper than Delaunay when points are sorted along a
 * single axis. Also a `d3-quadtree` variant for very large point clouds where
 * incremental insertion matters.
 */
