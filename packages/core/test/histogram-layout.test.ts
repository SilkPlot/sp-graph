/**
 * Histogram layout — D3 bin edges, counts, and density as data.
 *
 * Geometry is asserted as values, the same way pie and heatmap assert
 * theirs: a node test walks the compute, never a rendered tree.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_HISTOGRAM_SERIES,
  HISTOGRAM_GROUP_PADDING,
  HISTOGRAM_PATTERN_COUNT,
  computeHistogram,
  createHistogramIndex,
  histogramDensity,
  histogramEncoded,
  histogramPatternIndex,
  histogramThresholds,
  layoutHistogram,
  layoutHistogramFromObservations,
  locateHistogramBar,
  pointInHistogramBar,
  type HistogramObservation,
} from "../src/index";

const SPREAD: HistogramObservation[] = [
  { value: 0 },
  { value: 1 },
  { value: 2 },
  { value: 3 },
  { value: 4 },
  { value: 5 },
  { value: 6 },
  { value: 7 },
  { value: 8 },
  { value: 9 },
];

describe("histogramThresholds", () => {
  it("emits n-1 equal interiors and nothing for a collapsed or invalid count", () => {
    expect(histogramThresholds([0, 10], 4)).toEqual([2.5, 5, 7.5]);
    expect(histogramThresholds([0, 10], 1)).toEqual([]);
    expect(histogramThresholds([4, 4], 8)).toEqual([]);
    expect(histogramThresholds([0, 10], 0)).toEqual([]);
    expect(histogramThresholds([0, 10], Number.NaN)).toEqual([]);
    expect(histogramThresholds([0, 10], -3)).toEqual([]);
  });
});

describe("histogramDensity and histogramEncoded", () => {
  it("is count / (n × width), and 0 when the interval has no width", () => {
    expect(histogramDensity(2, 10, 0, 2)).toBeCloseTo(0.1);
    expect(histogramDensity(0, 10, 0, 2)).toBe(0);
    expect(histogramDensity(4, 0, 0, 2)).toBe(0);
    expect(histogramDensity(4, 10, 5, 5)).toBe(0);
    const part = { series: "s", x0: 0, x1: 2, count: 4, density: 0.2 };
    expect(histogramEncoded(part)).toBe(4);
    expect(histogramEncoded(part, "count")).toBe(4);
    expect(histogramEncoded(part, "density")).toBe(0.2);
  });
});

describe("histogramPatternIndex", () => {
  it("wraps into the catalog, including negatives", () => {
    expect(histogramPatternIndex(0)).toBe(0);
    expect(histogramPatternIndex(HISTOGRAM_PATTERN_COUNT)).toBe(0);
    expect(histogramPatternIndex(HISTOGRAM_PATTERN_COUNT + 1)).toBe(1);
    expect(histogramPatternIndex(-1)).toBe(HISTOGRAM_PATTERN_COUNT - 1);
  });
});

describe("computeHistogram", () => {
  it("bins onto equal-width edges with counts that sum to the sample", () => {
    const computed = computeHistogram(SPREAD, { thresholds: 4, domain: [0, 10] });
    expect(computed.edges).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(computed.xDomain).toEqual([0, 10]);
    expect(computed.valueCount).toBe(10);
    expect(computed.bins.map((b) => b.count)).toEqual([3, 2, 3, 2]);
    expect(computed.bins.reduce((n, b) => n + b.count, 0)).toBe(10);
    expect(computed.bins[0]?.x0).toBe(0);
    expect(computed.bins[0]?.x1).toBe(2.5);
    expect(computed.bins[3]?.x1).toBe(10);
    expect(computed.series).toEqual([DEFAULT_HISTOGRAM_SERIES]);
  });

  it("puts a value on the closed top edge into the last bin", () => {
    const computed = computeHistogram([{ value: 0 }, { value: 10 }], {
      thresholds: 2,
      domain: [0, 10],
    });
    expect(computed.bins.map((b) => b.count)).toEqual([1, 1]);
    expect(computed.bins[1]?.x1).toBe(10);
  });

  it("computes density from the series n and the bin width", () => {
    const computed = computeHistogram(SPREAD, { thresholds: 4, domain: [0, 10] });
    expect(computed.bins[0]?.density).toBeCloseTo(histogramDensity(3, 10, 0, 2.5));
    expect(computed.bins.reduce((sum, b) => sum + b.density * (b.x1 - b.x0), 0)).toBeCloseTo(1);
  });

  it("returns no bins for empty input", () => {
    const computed = computeHistogram([]);
    expect(computed.bins).toEqual([]);
    expect(computed.series).toEqual([]);
    expect(computed.edges).toEqual([]);
    expect(computed.valueCount).toBe(0);
  });

  it("drops non-finite values rather than counting them", () => {
    const computed = computeHistogram(
      [
        { value: 1 },
        { value: Number.NaN },
        { value: Number.POSITIVE_INFINITY },
        { value: 9 },
      ],
      { thresholds: 2, domain: [0, 10] },
    );
    expect(computed.valueCount).toBe(2);
    expect(computed.bins.reduce((n, b) => n + b.count, 0)).toBe(2);
  });

  it("collapses constant and single-value input onto one occupied bin", () => {
    const constant = computeHistogram([{ value: 5 }, { value: 5 }, { value: 5 }], {
      thresholds: 4,
    });
    expect(constant.bins.reduce((n, b) => n + b.count, 0)).toBe(3);
    expect(constant.bins.filter((b) => b.count > 0)).toHaveLength(1);
    const single = computeHistogram([{ value: 2 }], { thresholds: 1 });
    expect(single.bins).toHaveLength(1);
    expect(single.bins[0]?.count).toBe(1);
    expect(single.bins[0]?.x0).toBe(2);
    expect(single.bins[0]?.x1).toBe(2);
  });

  it("uses the caller fallback instead of the default series name", () => {
    const computed = computeHistogram([{ value: 1 }], { seriesFallback: "Wait" });
    expect(computed.series).toEqual(["Wait"]);
    expect(computed.bins[0]?.series).toBe("Wait");
  });

  it("shares one set of edges across series and assigns pattern slots", () => {
    const computed = computeHistogram(
      [
        { value: 1, series: "North" },
        { value: 8, series: "South" },
        { value: 2, series: "North" },
      ],
      { thresholds: 2, domain: [0, 10] },
    );
    expect(computed.series).toEqual(["North", "South"]);
    expect(computed.bins).toHaveLength(4);
    const north = computed.bins.filter((b) => b.series === "North");
    const south = computed.bins.filter((b) => b.series === "South");
    expect(north.map((b) => b.x0)).toEqual(south.map((b) => b.x0));
    expect(north.map((b) => b.count)).toEqual([2, 0]);
    expect(south.map((b) => b.count)).toEqual([0, 1]);
    expect(north[0]?.seriesIndex).toBe(0);
    expect(south[0]?.seriesIndex).toBe(1);
    expect(south[0]?.pattern).not.toBe(north[0]?.pattern);
  });

  it("recomputes bins when the raw values are replaced, not when an array mutates", () => {
    const raw: HistogramObservation[] = [{ value: 1 }, { value: 2 }, { value: 3 }];
    const first = computeHistogram(raw, { thresholds: 2, domain: [0, 10] });
    raw.push({ value: 9 });
    expect(first.valueCount).toBe(3);
    expect(first.bins.reduce((n, b) => n + b.count, 0)).toBe(3);
    const replaced = computeHistogram(
      [
        { value: 8 },
        { value: 9 },
      ],
      { thresholds: 2, domain: [0, 10] },
    );
    expect(replaced.valueCount).toBe(2);
    expect(replaced.bins.map((b) => b.count)).not.toEqual(first.bins.map((b) => b.count));
  });

  it("honours explicit interior thresholds", () => {
    const computed = computeHistogram([{ value: 1 }, { value: 6 }, { value: 9 }], {
      domain: [0, 10],
      thresholds: [5],
    });
    expect(computed.bins.map((b) => [b.x0, b.x1, b.count])).toEqual([
      [0, 5, 1],
      [5, 10, 2],
    ]);
  });

  it("freezes D3 default thresholds from the combined sample so series share edges", () => {
    const computed = computeHistogram([
      { value: 1, series: "A" },
      { value: 2, series: "B" },
      { value: 8, series: "A" },
    ]);
    expect(computed.edges.length).toBeGreaterThan(1);
    const a = computed.bins.filter((b) => b.series === "A");
    const b = computed.bins.filter((b) => b.series === "B");
    expect(a.map((bin) => bin.x0)).toEqual(b.map((bin) => bin.x0));
    expect(a.map((bin) => bin.x1)).toEqual(b.map((bin) => bin.x1));
    expect(a.reduce((n, bin) => n + bin.count, 0)).toBe(2);
    expect(b.reduce((n, bin) => n + bin.count, 0)).toBe(1);
  });

  it("swaps an inverted domain and ignores a non-finite one", () => {
    const swapped = computeHistogram([{ value: 3 }], { domain: [10, 0], thresholds: 2 });
    expect(swapped.xDomain).toEqual([0, 10]);
    const ignored = computeHistogram([{ value: 3 }], {
      domain: [Number.NaN, 10],
      thresholds: 1,
    });
    expect(ignored.bins[0]?.count).toBe(1);
  });
});

describe("layoutHistogram and layoutHistogramFromObservations", () => {
  it("places occupied bins on a linear x and a zero-baseline y", () => {
    const laid = layoutHistogramFromObservations(SPREAD, {
      width: 100,
      height: 50,
      thresholds: 4,
      domain: [0, 10],
    });
    expect(laid.marks).toHaveLength(4);
    expect(laid.marks[0]?.x).toBeCloseTo(0);
    expect(laid.marks[0]?.width).toBeCloseTo(25);
    expect(laid.marks[3]?.x).toBeCloseTo(75);
    expect(laid.marks[0]!.height).toBeGreaterThan(laid.marks[1]!.height);
    expect(laid.edges).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it("skips empty bins and groups multi-series inside a shared interval", () => {
    const laid = layoutHistogramFromObservations(
      [
        { value: 1, series: "North" },
        { value: 8, series: "South" },
      ],
      { width: 100, height: 40, thresholds: 2, domain: [0, 10] },
    );
    expect(laid.marks).toHaveLength(2);
    expect(laid.marks[0]?.series).toBe("North");
    expect(laid.marks[1]?.series).toBe("South");
    expect(laid.marks[0]!.x + laid.marks[0]!.width).toBeLessThan(laid.marks[1]!.x);
    expect(laid.marks[0]!.width).toBeLessThan(50);
    expect(HISTOGRAM_GROUP_PADDING).toBeGreaterThan(0);
  });

  it("spans the plot when a collapsed domain would paint zero width", () => {
    const laid = layoutHistogramFromObservations([{ value: 5 }], {
      width: 80,
      height: 40,
      thresholds: 1,
    });
    expect(laid.marks).toHaveLength(1);
    expect(laid.marks[0]?.x).toBeCloseTo(0);
    expect(laid.marks[0]?.width).toBeCloseTo(80);
    expect(laid.marks[0]?.height).toBeGreaterThan(0);
    const grouped = layoutHistogramFromObservations(
      [
        { value: 5, series: "North" },
        { value: 5, series: "South" },
      ],
      { width: 80, height: 40, thresholds: 1 },
    );
    expect(grouped.marks).toHaveLength(2);
    expect(grouped.marks[0]!.width + grouped.marks[1]!.width).toBeLessThan(80);
  });

  it("encodes density as bar height when asked", () => {
    const data = [{ value: 1 }, { value: 9 }];
    const options = { width: 100, height: 50, thresholds: [2], domain: [0, 10] as const };
    const count = layoutHistogramFromObservations(data, options);
    const density = layoutHistogramFromObservations(data, { ...options, value: "density" });
    expect(count.marks).toHaveLength(2);
    expect(density.marks).toHaveLength(2);
    expect(count.marks[0]?.height).toBeCloseTo(count.marks[1]?.height ?? 0);
    expect(density.marks[0]!.height).toBeGreaterThan(density.marks[1]!.height);
  });

  it("drops a bar whose pixel is not finite", () => {
    const computed = computeHistogram([{ value: 1 }], { thresholds: 1 });
    expect(
      layoutHistogram(computed, {
        x: () => Number.NaN,
        y: () => 0,
        width: 10,
      }).marks,
    ).toEqual([]);
    expect(
      layoutHistogram(computed, {
        x: () => 0,
        y: () => Number.NaN,
        width: 10,
      }).marks,
    ).toEqual([]);
  });
});

describe("locateHistogramBar and createHistogramIndex", () => {
  const laid = layoutHistogramFromObservations(SPREAD, {
    width: 100,
    height: 50,
    thresholds: 4,
    domain: [0, 10],
  });

  it("hits a bar interior and misses empty space", () => {
    const first = laid.marks[0]!;
    expect(pointInHistogramBar(first, first.x + first.width / 2, first.y + first.height / 2)).toBe(
      true,
    );
    expect(locateHistogramBar(laid.marks, first.x + 1, first.y + 1)).toBe(0);
    expect(locateHistogramBar(laid.marks, 200, 200)).toBe(-1);
    expect(locateHistogramBar(laid.marks, first.x + first.width / 2, -1)).toBe(-1);
  });

  it("resolves the same ordinal from locate and at, with interval plus count", () => {
    const index = createHistogramIndex(laid.marks, "wait");
    expect(index.length).toBe(4);
    expect(index.at(-1)).toBeUndefined();
    expect(index.at(4)).toBeUndefined();
    const first = laid.marks[0]!;
    const ordinal = index.locate(first.x + 1, first.y + 1);
    const record = index.at(ordinal);
    expect(record?.datum.x0).toBe(0);
    expect(record?.datum.x1).toBe(2.5);
    expect(record?.datum.count).toBe(3);
    expect(record?.datum.density).toBeGreaterThan(0);
    expect(record?.at).toEqual({ kind: "value", x: 1.25, y: 3 });
    const densityIndex = createHistogramIndex(laid.marks, "wait", "density");
    const densityAt = densityIndex.at(0)?.at;
    expect(densityAt).toMatchObject({ kind: "value", y: first.density });
  });
});
