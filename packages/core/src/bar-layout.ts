/**
 * Grouped and stacked bar layout — pure compute over the shared series model.
 *
 * Group subdivides each category band with an inner band scale, one slot per
 * visible series. Stack is `d3-shape`'s `stack` with `stackOffsetNone` only —
 * not diverging, not expand/percent. Negatives still hang below the baseline
 * because positives and negatives are stacked as two `stackOffsetNone` runs
 * from zero, which is the same per-segment geometry a single bar already uses
 * (`min` + `abs`) rather than a second offset.
 *
 * There is no DOM here. Charts consume the segments and rectangles; they do
 * not re-derive y0/y1.
 *
 * Input is the already-normalised series model (ADR-0008). A second ranked-
 * series type would be a second opinion about identity, visibility, and
 * missing values. Hidden series are the caller's to drop before they arrive —
 * this module layouts what it is given.
 */
import { stack as d3Stack, stackOffsetNone, stackOrderNone } from "d3-shape";
import { bandScale, type ScaleBand, type ScaleLinear } from "./scales";
import { extentOf } from "./extent";
import type { Domain, NormalizedSeries } from "./series";
import type { RankedOrientation } from "./ranked";

export type BarMode = "grouped" | "stacked";

/** One series' contribution at one category, in data space. */
export interface BarSegment {
  seriesId: string;
  /** Index in the array that was passed — palette and paint order. */
  seriesIndex: number;
  /** Category identity: the datum's instant as epoch ms. */
  time: number;
  /** The present value, or `null` when this series has no reading here. */
  value: number | null;
  /** Stack baseline in data space. Grouped: always 0. */
  y0: number;
  /** Stack top in data space. Grouped: the value itself. */
  y1: number;
}

/** One painted bar, in inner-plot pixels. */
export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  seriesId: string;
  time: number;
  value: number;
  y0: number;
  y1: number;
}

/**
 * Category keys: every valid instant across the series, in first-seen order.
 *
 * First-seen, not sorted. Order is the caller's (ADR-0008 §5); imposing a
 * chronological sort here would make the axis disagree with the array that
 * was passed whenever the first series is not already sorted. `seriesTable`
 * is the one place that sorts, and it says so, because a table's rows are a
 * presentation of the union rather than of any one array.
 *
 * An invalid instant is skipped. A missing (`null`) reading still contributes
 * its instant — the category exists; that series is just absent from it.
 */
export function categoryTimesOf<M>(
  series: readonly NormalizedSeries<M>[],
): readonly number[] {
  const seen = new Set<number>();
  const keys: number[] = [];
  for (const s of series) {
    for (const d of s.data) {
      if (!Number.isFinite(d.time) || seen.has(d.time)) continue;
      seen.add(d.time);
      keys.push(d.time);
    }
  }
  return keys;
}

/** Present `y` at `time`, or `null` when the series has no present reading there. */
function presentAt<M>(series: NormalizedSeries<M>, time: number): number | null {
  for (const d of series.data) {
    if (d.time === time && d.state === "present") return d.y as number;
  }
  return null;
}

/**
 * Grouped segments: every present reading stands on the zero baseline.
 *
 * Missing and invalid readings produce no segment — never a zero-height bar
 * at zero, which is what a real measurement of zero looks like.
 */
export function groupSeries<M>(
  series: readonly NormalizedSeries<M>[],
  keys: readonly number[],
): readonly BarSegment[] {
  const segments: BarSegment[] = [];
  for (const [seriesIndex, s] of series.entries()) {
    for (const time of keys) {
      const value = presentAt(s, time);
      if (value === null) continue;
      segments.push({
        seriesId: s.id,
        seriesIndex,
        time,
        value,
        y0: 0,
        y1: value,
      });
    }
  }
  return segments;
}

/** One wide row for `d3-shape` stack: the category key plus a value per series. */
interface StackRow {
  time: number;
  [seriesId: string]: number;
}

/**
 * Values of one sign, zeros elsewhere, so `stackOffsetNone` can run twice
 * from the same baseline without importing a second offset.
 */
function rowsForSign<M>(
  series: readonly NormalizedSeries<M>[],
  keys: readonly number[],
  sign: 1 | -1,
): StackRow[] {
  return keys.map((time) => {
    const row: StackRow = { time };
    for (const s of series) {
      const value = presentAt(s, time);
      if (value === null) {
        row[s.id] = 0;
        continue;
      }
      row[s.id] = Math.sign(value) === sign ? value : 0;
    }
    return row;
  });
}

function stackSign<M>(
  series: readonly NormalizedSeries<M>[],
  keys: readonly number[],
  sign: 1 | -1,
): ReadonlyMap<string, readonly [number, number]> {
  const ids = series.map((s) => s.id);
  const stacked = d3Stack<StackRow>()
    .keys(ids)
    .value((d, key) => d[key] as number)
    .order(stackOrderNone)
    .offset(stackOffsetNone)(rowsForSign(series, keys, sign));

  const byCell = new Map<string, readonly [number, number]>();
  for (const layer of stacked) {
    for (const point of layer) {
      const y0 = point[0];
      const y1 = point[1];
      if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
      byCell.set(`${layer.key}:${point.data.time}`, [y0, y1]);
    }
  }
  return byCell;
}

/**
 * Stacked segments over `d3-shape` stack, `stackOffsetNone` only.
 *
 * Positives accumulate upward from zero; negatives accumulate downward from
 * zero. That is two `stackOffsetNone` runs, not `stackOffsetDiverging`. A
 * missing reading is a zero in the matrix so the next series still stacks
 * from the same place, and is omitted from the output so it is never drawn
 * as a measurement of zero.
 */
export function stackSeries<M>(
  series: readonly NormalizedSeries<M>[],
  keys: readonly number[],
): readonly BarSegment[] {
  const positives = stackSign(series, keys, 1);
  const negatives = stackSign(series, keys, -1);
  const segments: BarSegment[] = [];

  for (const [seriesIndex, s] of series.entries()) {
    for (const time of keys) {
      const value = presentAt(s, time);
      if (value === null) continue;
      const cell = (value >= 0 ? positives : negatives).get(`${s.id}:${time}`);
      const y0 = cell?.[0] ?? 0;
      const y1 = cell?.[1] ?? value;
      segments.push({
        seriesId: s.id,
        seriesIndex,
        time,
        value,
        y0,
        y1,
      });
    }
  }
  return segments;
}

/**
 * Value extent of a stacked layout: the summed extents, over present values.
 *
 * Per category this is the sum of positives and the sum of negatives. The
 * domain of those sums always contains zero when any finite sum exists; the
 * empty/all-missing result is `extentOf`'s `[0, 1]` sentinel, same as every
 * other domain helper in this package.
 */
export function stackedValueDomain(segments: readonly BarSegment[]): Domain {
  return extentOf(segments, (s) => {
    if (s.value === null) return Number.NaN;
    return s.y1;
  });
}

/**
 * Inner band: one slot per series inside a category band.
 *
 * The range is the category band's `[start, start + width]` in pixels. Padding
 * is a fraction of the inner step. Default 0.05 — tighter than the outer
 * category padding (0.1) so the group reads as one category, not as several.
 */
export function groupInnerBand(
  seriesIds: readonly string[],
  range: readonly [number, number],
  padding?: number,
): ScaleBand<string> {
  return bandScale({
    domain: seriesIds,
    range,
    padding: padding ?? 0.05,
  });
}

export interface LayoutBarRectsOptions {
  mode: BarMode;
  orientation: RankedOrientation;
  /** Category band. Domain keys are `String(time)`. */
  band: ScaleBand<string>;
  value: ScaleLinear<number, number>;
  /** Visible series ids, in paint order — the inner-band domain when grouped. */
  seriesIds: readonly string[];
  /** Inner-band padding. Ignored when stacked. */
  groupPadding?: number;
}

/**
 * Map data-space segments onto inner-plot rectangles.
 *
 * The per-segment geometry is the one BarChart already uses for a signed
 * single series: the smaller pixel coordinate and the absolute distance.
 * SVG rejects a negative width or height and would otherwise render nothing.
 */
export function layoutBarRects(
  segments: readonly BarSegment[],
  options: LayoutBarRectsOptions,
): readonly BarRect[] {
  const rects: BarRect[] = [];
  const innerByCategory = new Map<number, ScaleBand<string>>();

  const innerBand = (time: number, start: number, width: number): ScaleBand<string> => {
    const cached = innerByCategory.get(time);
    if (cached !== undefined) return cached;
    const built = groupInnerBand(
      options.seriesIds,
      [start, start + width],
      options.groupPadding,
    );
    innerByCategory.set(time, built);
    return built;
  };

  for (const seg of segments) {
    if (seg.value === null) continue;
    const catStart = options.band(String(seg.time));
    if (catStart === undefined) continue;
    const catWidth = options.band.bandwidth();

    let bandStart: number | undefined;
    let bandSize: number;
    if (options.mode === "grouped") {
      const inner = innerBand(seg.time, catStart, catWidth);
      bandStart = inner(seg.seriesId);
      bandSize = inner.bandwidth();
    } else {
      bandStart = catStart;
      bandSize = catWidth;
    }
    if (bandStart === undefined) continue;

    const p0 = options.value(seg.y0);
    const p1 = options.value(seg.y1);
    if (!Number.isFinite(p0) || !Number.isFinite(p1) || !Number.isFinite(bandSize)) {
      continue;
    }

    const along = Math.min(p0, p1);
    const span = Math.abs(p1 - p0);

    rects.push(
      options.orientation === "vertical"
        ? {
            x: bandStart,
            y: along,
            width: bandSize,
            height: span,
            seriesId: seg.seriesId,
            time: seg.time,
            value: seg.value,
            y0: seg.y0,
            y1: seg.y1,
          }
        : {
            x: along,
            y: bandStart,
            width: span,
            height: bandSize,
            seriesId: seg.seriesId,
            time: seg.time,
            value: seg.value,
            y0: seg.y0,
            y1: seg.y1,
          },
    );
  }
  return rects;
}

/** Point-in-rect locate over already-laid-out bars. */
export function locateBarRect(
  rects: readonly BarRect[],
  px: number,
  py: number,
): number {
  for (const [i, r] of rects.entries()) {
    if (px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height) {
      return i;
    }
  }
  return -1;
}
