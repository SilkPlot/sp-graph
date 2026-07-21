/**
 * Active-point lookup — the pointer/keyboard resolution model (ADR-0002,
 * ADR-0014, ADR-0015).
 *
 * ADR-0002 §1 puts the resolution of "the pointer is at (px, py)" into "datum N
 * is active" in a POINTER MODEL, separate from the cursor and the tooltip so the
 * two primitives cannot disagree, and separate from any one index kind because
 * the right index differs by chart family. This module is that model's compute
 * half: three lookup families, each producing the one public record.
 *
 * ## One record, one interface, three implementations
 *
 * Every family produces the SAME `ActivePoint` (ADR-0014 §1, generalized by
 * ADR-0015) and exposes the SAME `ActivePointIndex`. What differs is the
 * resolution — a monotonic time series wants a bisector, a 2-D point cloud wants
 * the Delaunay index, a categorical chart wants a band test — and those stay
 * separate builders because they change independently. The shared thing is the
 * record and the interface (the seam), not the resolution (the surface).
 *
 * ## Pointer and keyboard write ONE ordinal
 *
 * The interface is deliberately `length` + `at(ordinal)` + `locate(px, py)`. A
 * pointer calls `locate` to get an ordinal; the keyboard steps an ordinal (the
 * existing `createActiveDatum` holder, parameterized by `length`); and BOTH read
 * the record through `at(ordinal)`. So the same ordinal produces the same record
 * whatever wrote it — the "keyboard and pointer write the same state" invariant of
 * ADR-0002 §4 is structural here, not merely tested.
 *
 * This is compute-only. It holds no state and touches no DOM; the reactive holder
 * and the pointer/keyboard event wiring are the Solid layer's. The plot rectangle
 * is not known here either: a pointer leaving the plot is cleared by the adapter
 * that owns the rect (ADR-0014 §7), and `locate` answers the pure question
 * "nearest within the data".
 */
import { createHitIndex } from "./hit-test";

/** Where an active datum sits along the domain axis of its chart family. */
export type ActivePointAt =
  | { kind: "time"; time: Date }
  | { kind: "value"; x: number; y: number }
  | { kind: "category"; category: string };

/**
 * The one active-datum record — ADR-0014 §1, generic over its datum per
 * ADR-0015. `D` is the caller's datum shape for the family: `SeriesDatum<M>` for
 * a time chart (metadata rides inside it), a numeric point for a scatter, a
 * category for a ranked bar.
 */
export interface ActivePoint<D = unknown> {
  /** The series the datum belongs to (ADR-0008 §1 identity). */
  seriesId: string;
  /** Index into that series' data as the caller passed it (ADR-0008 §5). */
  sourceIndex: number;
  /** The datum in the caller's own shape. */
  datum: D;
  /** Inner (pixel) coordinates — the space the cursor and tooltip draw in. */
  position: { x: number; y: number };
  at: ActivePointAt;
  /** Every visible series' datum at this instant, for a shared time cursor.
   *  Absent for a scatter or a bar, which have no shared instant to read across. */
  atTime?: readonly { seriesId: string; datum: D }[];
}

/**
 * A built lookup over the current visible data. Ordinal access serves the
 * keyboard; pixel access serves the pointer; both resolve through `at`.
 */
export interface ActivePointIndex<D = unknown> {
  /** Addressable points in traversal order. Keyboard steps `[0, length)`. */
  readonly length: number;
  /** The record at an ordinal, or `undefined` outside `[0, length)`. */
  at(ordinal: number): ActivePoint<D> | undefined;
  /** The ordinal a pointer resolves to, or `-1` for a no-hit. */
  locate(px: number, py: number): number;
}

/* -------------------------------------------------------------------------- */
/* A sorted-array nearest search, owned rather than imported.                  */
/* -------------------------------------------------------------------------- */

/**
 * The ordinal of the value in an ASCENDING array nearest to `target`, or `-1`
 * for an empty array. An exact-midpoint tie resolves to the LOWER ordinal
 * (ADR-0014 §2's tie rule), which for a time axis is the earlier instant.
 *
 * A binary search rather than `d3-array`'s bisector: the operation is one small
 * function, and pulling a whole d3 module into `core` for it would spend the
 * bundle budget (a first-class engineering priority) on code a consumer would
 * otherwise never import. Native-first — own the layer where owning it is better.
 */
export function nearestSortedIndex(sorted: readonly number[], target: number): number {
  const n = sorted.length;
  if (n === 0) return -1;
  if (target <= (sorted[0] as number)) return 0;
  if (target >= (sorted[n - 1] as number)) return n - 1;

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid] as number;
    if (v === target) return mid;
    if (v < target) lo = mid;
    else hi = mid;
  }
  // `target` lies in (sorted[lo], sorted[hi]). Pick the nearer; a tie takes the
  // lower ordinal, so use `<=` on the low side's distance.
  const dLo = target - (sorted[lo] as number);
  const dHi = (sorted[hi] as number) - target;
  return dLo <= dHi ? lo : hi;
}

/* -------------------------------------------------------------------------- */
/* Time series — a bisector over instants (ADR-0014 §2 nearest-time/shared-time) */
/* -------------------------------------------------------------------------- */

/** One visible series' present points, ascending by time. */
export interface TimeSeriesLookupInput<D> {
  seriesId: string;
  /** Present points only (a gap is not a target), ascending by time. */
  points: readonly D[];
}

export interface TimeSeriesIndexOptions<D> {
  /** The datum's instant in epoch ms. */
  time: (d: D) => number;
  /** The datum's pixel x. Monotonic in `time`, so the instant axis is sortable. */
  px: (d: D) => number;
  /** The datum's pixel y. */
  py: (d: D) => number;
  /** The datum's index in the CALLER's array (ADR-0008 §5). */
  sourceIndex: (d: D) => number;
}

/**
 * A time-series lookup. The ordinal axis is the ascending union of instants, so
 * `locate` bisects on pixel x (nearest-time) and `at` carries every visible
 * series' datum at that instant (shared-time) with a deterministic primary.
 *
 * Determinism, per ADR-0014 §2:
 *   - duplicate timestamps within a series resolve to the LOWEST `sourceIndex`;
 *   - the primary series at an instant is the FIRST in input order that has a
 *     datum there — the resolution ignores pixel y, because nearest-TIME is a
 *     question about x, and a stable primary is what keeps `locate` and `at`
 *     agreeing on the same record for the same ordinal.
 */
export function createTimeSeriesIndex<D>(
  series: readonly TimeSeriesLookupInput<D>[],
  options: TimeSeriesIndexOptions<D>,
): ActivePointIndex<D> {
  // Per series, the representative datum at each instant: the lowest-sourceIndex
  // present point there. Points are ascending by time, so same-time duplicates
  // are adjacent; the first one kept per instant already has the lowest index
  // when the caller's array order is preserved, but we compare explicitly rather
  // than assume it, because "ascending by time" does not promise index order.
  const repByInstant = series.map((s) => {
    const reps = new Map<number, D>();
    for (const d of s.points) {
      const t = options.time(d);
      const existing = reps.get(t);
      if (existing === undefined || options.sourceIndex(d) < options.sourceIndex(existing)) {
        reps.set(t, d);
      }
    }
    return { seriesId: s.seriesId, reps };
  });

  // The union of instants, ascending. This is the ordinal axis.
  const instantSet = new Set<number>();
  for (const s of repByInstant) for (const t of s.reps.keys()) instantSet.add(t);
  const instants = [...instantSet].sort((a, b) => a - b);

  // Per instant, the visible series present there, in series input order, and the
  // pixel x (shared across series at one instant, taken from the primary datum).
  const columns = instants.map((t) => {
    const entries: { seriesId: string; datum: D }[] = [];
    for (const s of repByInstant) {
      const datum = s.reps.get(t);
      if (datum !== undefined) entries.push({ seriesId: s.seriesId, datum });
    }
    const primary = entries[0] as { seriesId: string; datum: D };
    return { entries, px: options.px(primary.datum) };
  });
  const pxByInstant = columns.map((c) => c.px);

  const at = (ordinal: number): ActivePoint<D> | undefined => {
    if (ordinal < 0 || ordinal >= instants.length) return undefined;
    const time = instants[ordinal] as number;
    const column = columns[ordinal] as (typeof columns)[number];
    const primary = column.entries[0] as { seriesId: string; datum: D };
    return {
      seriesId: primary.seriesId,
      sourceIndex: options.sourceIndex(primary.datum),
      datum: primary.datum,
      position: { x: column.px, y: options.py(primary.datum) },
      at: { kind: "time", time: new Date(time) },
      atTime: column.entries,
    };
  };

  return {
    length: instants.length,
    at,
    // Nearest-time is a question about pixel x only; y does not enter it.
    locate: (px: number): number => nearestSortedIndex(pxByInstant, px),
  };
}

/* -------------------------------------------------------------------------- */
/* Scatter — the Delaunay index, wrapped to produce the record (ADR-0014 §2)   */
/* -------------------------------------------------------------------------- */

export interface ScatterIndexOptions<D> {
  /** A single synthetic series id for the cloud. Default: `"scatter"`. */
  seriesId?: string;
  /** Pixel coordinates — what the Delaunay index and the cursor use. */
  px: (d: D, index: number) => number;
  py: (d: D, index: number) => number;
  /** Domain coordinates — what `at.value` carries. */
  x: (d: D, index: number) => number;
  y: (d: D, index: number) => number;
}

/**
 * A scatter lookup over a 2-D point cloud, composing the existing Delaunay
 * `createHitIndex` (ADR-0002: any index the pointer model uses answers in pixel
 * space). Non-finite points are not targets and are dropped, their original
 * `sourceIndex` preserved on the survivors.
 *
 * `locate` returns the nearest point in the plane for any query — the Delaunay
 * index has no plot bounds, so clearing when the pointer leaves the plot is the
 * adapter's job (ADR-0014 §7), not this pure lookup's.
 */
export function createScatterIndex<D>(
  data: readonly D[],
  options: ScatterIndexOptions<D>,
): ActivePointIndex<D> {
  const seriesId = options.seriesId ?? "scatter";

  // Present points only, each carrying its index in the caller's array.
  const entries: { datum: D; sourceIndex: number; px: number; py: number; x: number; y: number }[] =
    [];
  for (const [i, d] of data.entries()) {
    const px = options.px(d, i);
    const py = options.py(d, i);
    const x = options.x(d, i);
    const y = options.y(d, i);
    if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(x) && Number.isFinite(y)) {
      entries.push({ datum: d, sourceIndex: i, px, py, x, y });
    }
  }

  const hit = createHitIndex(entries, { x: (e) => e.px, y: (e) => e.py });

  const at = (ordinal: number): ActivePoint<D> | undefined => {
    if (ordinal < 0 || ordinal >= entries.length) return undefined;
    const e = entries[ordinal] as (typeof entries)[number];
    return {
      seriesId,
      sourceIndex: e.sourceIndex,
      datum: e.datum,
      position: { x: e.px, y: e.py },
      at: { kind: "value", x: e.x, y: e.y },
    };
  };

  return {
    length: entries.length,
    at,
    locate: (px: number, py: number): number => hit.nearest(px, py),
  };
}

/* -------------------------------------------------------------------------- */
/* Categorical — a band test (ADR-0014 §2)                                     */
/* -------------------------------------------------------------------------- */

export interface BandIndexOptions<D> {
  /** A single synthetic series id for the categorical surface. Default: `"category"`. */
  seriesId?: string;
  /** The band's category key — what `at.category` carries. */
  category: (d: D, index: number) => string;
  /** The band's pixel interval `[start, end)` along the selection axis. */
  bandStart: (d: D, index: number) => number;
  bandEnd: (d: D, index: number) => number;
  /** The pointer coordinate that selects a band: `px` for vertical bars, `py`
   *  for horizontal. The caller maps the orientation to one scalar. */
  axis: (px: number, py: number) => number;
  /** Cursor position for the record. */
  px: (d: D, index: number) => number;
  py: (d: D, index: number) => number;
}

/**
 * A categorical band lookup. There is no "nearest" — a pointer is over a band or
 * between bands. `locate` returns the band containing the selection coordinate on
 * a left-inclusive `[start, end)` test, or `-1` when the pointer is in a gap or
 * outside every band, which is the out-of-plot no-hit for this family.
 */
export function createBandIndex<D>(
  data: readonly D[],
  options: BandIndexOptions<D>,
): ActivePointIndex<D> {
  const seriesId = options.seriesId ?? "category";

  const at = (ordinal: number): ActivePoint<D> | undefined => {
    if (ordinal < 0 || ordinal >= data.length) return undefined;
    const d = data[ordinal] as D;
    return {
      seriesId,
      sourceIndex: ordinal,
      datum: d,
      position: { x: options.px(d, ordinal), y: options.py(d, ordinal) },
      at: { kind: "category", category: options.category(d, ordinal) },
    };
  };

  return {
    length: data.length,
    at,
    locate: (px: number, py: number): number => {
      const coord = options.axis(px, py);
      for (const [i, d] of data.entries()) {
        if (coord >= options.bandStart(d, i) && coord < options.bandEnd(d, i)) return i;
      }
      return -1;
    },
  };
}
