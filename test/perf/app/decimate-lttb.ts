/**
 * Largest-Triangle-Three-Buckets (LTTB) — the third decimation candidate for
 * this harness, kept in its own file rather than folded into `decimate.ts` so
 * neither file needs to change shape to accommodate the other.
 *
 * Source of the algorithm: Sveinn Steinarsson, "Downsampling Time Series for
 * Visual Representation" (MSc thesis, University of Iceland, 2013), chapter 4,
 * section 4.2 "Largest-Triangle-Three-Buckets", Algorithm 4.2 (pp. 21-23) —
 * https://skemman.is/handle/1946/15343. The thesis's own pseudocode (Algorithm
 * 4.2) states the bucket/average/rank steps but not the bucket-boundary
 * arithmetic in closed form, so the boundary and area formulas below are taken
 * from the author's reference implementation instead of re-derived from prose:
 * github.com/sveinn-steinarsson/flot-downsample, `jquery.flot.downsample.js`,
 * function `largestTriangleThreeBuckets`. That is a deliberate choice — a
 * differently-valid bucketing would still be "LTTB" in spirit but would not
 * reproduce the reference's point-for-point selection, which is what a
 * candidate in this harness needs to do to be checked against it.
 *
 * Unlike min/max-per-bucket, LTTB picks exactly one real point per bucket (by
 * triangle area against the previous pick and the next bucket's average), so
 * it never invents a value and never draws a flatter or spikier line than one
 * of the raw points already drew — it just discards the ones judged least
 * visually significant.
 */
import type { Candidate } from "./decimate";
import type { SeriesDatum } from "@silkplot/core";

export const lttb: Candidate = (data, target) => {
  if (data.length <= target) return [...data];

  // The reference needs a first point, a last point, and at least one bucket
  // in between to form a single triangle; below that its own bucket-count
  // arithmetic (`every = (dataLength - 2) / (target - 2)`) divides by zero or
  // goes negative. The thesis does not size this edge — it is the two points
  // every larger target keeps unconditionally, so that is what a target below
  // it gets. (If `data` has only one point, first and last coincide.)
  if (target < 3) {
    const first = data[0] as SeriesDatum;
    const last = data[data.length - 1] as SeriesDatum;
    return first === last ? [first] : [first, last];
  }

  const dataLength = data.length;
  const every = (dataLength - 2) / (target - 2);
  const out: SeriesDatum[] = [data[0] as SeriesDatum];

  // `a` is the index of the previously selected point — the fixed left corner
  // of the next triangle. It starts at the first point.
  let a = 0;

  for (let i = 0; i < target - 2; i++) {
    const anchor = data[a] as SeriesDatum;
    const anchorX = anchor.t.getTime();
    // `anchor` is null only in the single case where `a` is still 0 and the
    // very first datum itself has a null y — the only anchor the loop never
    // re-derives from a non-null selection. There is no principled numeric
    // stand-in for a missing reading, so this falls back to 0 for the area
    // arithmetic only; the emitted point for that position is still the
    // original (null) datum, unchanged.
    const anchorY = anchor.y ?? 0;

    // Average point of the NEXT bucket: the temporary third triangle vertex
    // the thesis substitutes for a brute-force scan of that bucket (§4.2,
    // p. 22) — cheaper, and the thesis found it visually equivalent in
    // practice. A null datum is excluded from this average entirely (neither
    // its time nor its value contributes), the same "exclude, don't
    // zero-fill" choice `minMaxBuckets` makes for its extremes — the thesis
    // has no notion of a missing reading, so this is this file's call, not
    // the source's.
    const avgStart = Math.floor((i + 1) * every) + 1;
    const avgEnd = Math.min(Math.floor((i + 2) * every) + 1, dataLength);
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = avgStart; j < avgEnd; j++) {
      const d = data[j] as SeriesDatum;
      if (d.y === null) continue;
      avgX += d.t.getTime();
      avgY += d.y;
      avgCount++;
    }
    // `avgStart < avgEnd` always holds here — `every > 1` whenever a target
    // reaches this loop (data is longer than target, so dataLength - 2 >
    // target - 2), which forces consecutive bucket floors apart — so this
    // bucket always contains at least one raw point. The only way `avgCount`
    // can still be 0 is every point in it being null; falling back to the
    // anchor's own coordinates makes every candidate below form a zero-area
    // triangle, so the tie-break (`area > maxArea`, strict) deterministically
    // keeps the first non-null candidate.
    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    } else {
      avgX = anchorX;
      avgY = anchorY;
    }

    // Current bucket: rank each point by the area of the triangle it forms
    // with the anchor and the average point above, and keep the largest.
    const bucketStart = Math.floor(i * every) + 1;
    const bucketEnd = Math.floor((i + 1) * every) + 1;
    let maxArea = -1;
    let maxAreaIndex = -1;
    let gapPoint: SeriesDatum | undefined;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const d = data[j] as SeriesDatum;
      if (d.y === null) {
        // The first null in the bucket is carried through as its own point,
        // emitted ALONGSIDE the bucket's selected point rather than instead
        // of it, so a gap policy still has a gap to honour downstream —
        // mirroring `minMaxBuckets`'s reasoning for the same problem.
        gapPoint ??= d;
        continue; // A null point can never be the point a bucket selects.
      }
      const area =
        Math.abs((anchorX - avgX) * (d.y - anchorY) - (anchorX - d.t.getTime()) * (avgY - anchorY)) *
        0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    if (gapPoint) out.push(gapPoint);
    if (maxAreaIndex >= 0) {
      out.push(data[maxAreaIndex] as SeriesDatum);
      a = maxAreaIndex;
    }
    // A bucket with no non-null candidate selects nothing new; `a` carries
    // forward unchanged into the next triangle rather than pointing at a null.
  }

  out.push(data[dataLength - 1] as SeriesDatum);

  // A gap point is pushed as soon as it is found scanning left to right within
  // its bucket, which can be before or after that same bucket's selected
  // point depending on where the null happened to fall — so the emission
  // order above is not guaranteed ascending whenever a gap exists. Sorting by
  // time restores it, the same fix `minMaxBuckets` applies for the same
  // reason. On data with no nulls this is a no-op: every pushed point already
  // came from a strictly increasing index.
  return out.sort((x, y) => x.t.getTime() - y.t.getTime());
};
