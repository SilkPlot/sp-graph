/**
 * Bubble layout — size→radius math, series slots, and hit-testing as data.
 *
 * Geometry is asserted as values, the same way pie and heatmap assert
 * theirs: a node test walks the compute, never a rendered tree.
 */
import { describe, expect, it } from "vitest";
import {
  BUBBLE_SIZE_LEGEND_RIGHT,
  DEFAULT_BUBBLE_MAX_RADIUS,
  DEFAULT_BUBBLE_MIN_RADIUS,
  DEFAULT_BUBBLE_SERIES,
  bubbleRadius,
  bubbleSizeTicks,
  computeBubble,
  createBubbleIndex,
  layoutBubble,
  layoutBubbleFromObservations,
  locateBubble,
  pointInBubble,
  resolveBubbleRadiusRange,
  type BubbleObservation,
} from "../src/index";

const CLOUD: BubbleObservation[] = [
  { x: 0, y: 0, size: 1, series: "North" },
  { x: 10, y: 10, size: 4, series: "North" },
  { x: 0, y: 10, size: 2, series: "South" },
];

describe("resolveBubbleRadiusRange", () => {
  it("defaults, keeps a valid range, swaps an inverted one, and rejects non-finite", () => {
    expect(resolveBubbleRadiusRange()).toEqual([
      DEFAULT_BUBBLE_MIN_RADIUS,
      DEFAULT_BUBBLE_MAX_RADIUS,
    ]);
    expect(resolveBubbleRadiusRange(6, 18)).toEqual([6, 18]);
    expect(resolveBubbleRadiusRange(18, 6)).toEqual([6, 18]);
    expect(resolveBubbleRadiusRange(-2, 10)).toEqual([DEFAULT_BUBBLE_MIN_RADIUS, 10]);
    expect(resolveBubbleRadiusRange(4, Number.NaN)).toEqual([4, DEFAULT_BUBBLE_MAX_RADIUS]);
    expect(BUBBLE_SIZE_LEGEND_RIGHT).toBeGreaterThan(DEFAULT_BUBBLE_MAX_RADIUS * 2);
  });
});

describe("bubbleRadius encodes area, not diameter", () => {
  const domain = [1, 4] as const;
  const range = [10, 20] as const;

  it("maps domain ends onto the radius range", () => {
    expect(bubbleRadius(1, domain, range)).toBeCloseTo(10);
    expect(bubbleRadius(4, domain, range)).toBeCloseTo(20);
  });

  it("puts the size midpoint off the radius midpoint", () => {
    // Linear-in-size (diameter) would place 2.5 at radius 15. Area encoding
    // places sqrt(2.5) between 1 and 2, which is not halfway.
    expect(bubbleRadius(2.5, domain, range)).not.toBeCloseTo(15, 5);
    expect(bubbleRadius(2.25, domain, range)).toBeCloseTo(15);
  });

  it("returns NaN for a non-positive size and the mid-range for a collapsed domain", () => {
    expect(Number.isNaN(bubbleRadius(0, domain, range))).toBe(true);
    expect(Number.isNaN(bubbleRadius(-3, domain, range))).toBe(true);
    expect(Number.isNaN(bubbleRadius(8, domain, [Number.NaN, 20]))).toBe(true);
    expect(Number.isNaN(bubbleRadius(8, domain, [10, Number.NaN]))).toBe(true);
    expect(bubbleRadius(8, [4, 4], range)).toBe(15);
    expect(bubbleRadius(8, domain, [12, 12])).toBe(12);
    expect(bubbleRadius(8, [0, 4], range)).toBe(15);
  });
});

describe("computeBubble", () => {
  it("keeps caller order, first-seen series indexes, and drops invalid rows", () => {
    const computed = computeBubble([
      { x: 1, y: 1, size: 2, series: "A" },
      { x: Number.NaN, y: 1, size: 2, series: "A" },
      { x: 2, y: 2, size: 0, series: "B" },
      { x: 3, y: 3, size: 5, series: "B" },
      { x: 4, y: 4, size: 3 },
      { x: 5, y: 5, size: Number.POSITIVE_INFINITY, series: "A" },
    ]);
    expect(computed.points.map((p) => p.sourceIndex)).toEqual([0, 3, 4]);
    expect(computed.series).toEqual(["A", "B", DEFAULT_BUBBLE_SERIES]);
    expect(computed.points[0]?.seriesIndex).toBe(0);
    expect(computed.points[1]?.seriesIndex).toBe(1);
    expect(computed.points[2]?.series).toBe(DEFAULT_BUBBLE_SERIES);
    expect(computed.points[2]?.seriesIndex).toBe(2);
    expect(computed.sizeDomain).toEqual([2, 5]);
  });

  it("uses the caller fallback instead of the default series name", () => {
    const computed = computeBubble([{ x: 1, y: 1, size: 2 }], { seriesFallback: "Clinics" });
    expect(computed.points[0]?.series).toBe("Clinics");
    expect(computed.series).toEqual(["Clinics"]);
  });

  it("returns an empty set for empty input", () => {
    const computed = computeBubble([]);
    expect(computed.points).toEqual([]);
    expect(computed.series).toEqual([]);
  });
});

describe("layoutBubble and layoutBubbleFromObservations", () => {
  it("places points on extent scales and sizes them by area", () => {
    const laid = layoutBubbleFromObservations(CLOUD, { width: 100, height: 50 });
    expect(laid.marks).toHaveLength(3);
    expect(laid.marks[0]?.px).toBeCloseTo(0);
    expect(laid.marks[0]?.py).toBeCloseTo(50);
    expect(laid.marks[1]?.px).toBeCloseTo(100);
    expect(laid.marks[1]?.py).toBeCloseTo(0);
    expect(laid.marks[0]!.r).toBeLessThan(laid.marks[2]!.r);
    expect(laid.marks[2]!.r).toBeLessThan(laid.marks[1]!.r);
    expect(laid.series).toEqual(["North", "South"]);
  });

  it("honours an explicit radius range", () => {
    const laid = layoutBubbleFromObservations([{ x: 0, y: 0, size: 1 }, { x: 1, y: 1, size: 4 }], {
      width: 10,
      height: 10,
      minRadius: 5,
      maxRadius: 15,
    });
    expect(laid.marks[0]?.r).toBeCloseTo(5);
    expect(laid.marks[1]?.r).toBeCloseTo(15);
  });

  it("drops a zero-radius mark", () => {
    const computed = computeBubble([{ x: 0, y: 0, size: 1 }]);
    const laid = layoutBubble(computed, { px: () => 0, py: () => 0, minRadius: 0, maxRadius: 0 });
    expect(laid.marks).toEqual([]);
  });

  it("drops a point whose pixel is not finite", () => {
    const computed = computeBubble([{ x: 0, y: 0, size: 1 }]);
    const laid = layoutBubble(computed, {
      px: () => Number.NaN,
      py: () => 0,
    });
    expect(laid.marks).toEqual([]);
  });
});

describe("bubbleSizeTicks", () => {
  it("emits ends and midpoint for a span, and one tick when they match", () => {
    const range = [4, 24] as const;
    const three = bubbleSizeTicks([1, 4], range);
    expect(three.map((t) => t.size)).toEqual([1, 2.5, 4]);
    expect(three[0]?.r).toBeCloseTo(bubbleRadius(1, [1, 4], range));
    expect(bubbleSizeTicks([9, 9], range)).toEqual([{ size: 9, r: 14 }]);
    expect(bubbleSizeTicks([0, 4], range)).toEqual([]);
  });
});

describe("locateBubble", () => {
  it("hits the smallest containing disk and misses empty space", () => {
    const small: ReturnType<typeof layoutBubbleFromObservations>["marks"][number] = {
      series: "A",
      seriesIndex: 0,
      x: 0,
      y: 0,
      size: 1,
      sourceIndex: 0,
      px: 0,
      py: 0,
      r: 10,
    };
    const large = { ...small, sourceIndex: 1, series: "B", r: 30 };
    expect(pointInBubble(small, 0, 0)).toBe(true);
    expect(locateBubble([large, small], 0, 0)).toBe(1);
    expect(locateBubble([large, small], 20, 0)).toBe(0);
    expect(locateBubble([large, small], 80, 80)).toBe(-1);
    expect(locateBubble([], 0, 0)).toBe(-1);
    const twin = { ...small, sourceIndex: 2, px: 6, py: 0, r: 10 };
    expect(locateBubble([small, twin], 3, 0)).toBe(0);
    expect(locateBubble([small, twin], 5, 0)).toBe(1);
  });
});

describe("createBubbleIndex", () => {
  it("walks caller order and resolves a containing point including size", () => {
    const laid = layoutBubbleFromObservations(CLOUD, { width: 100, height: 100 });
    const index = createBubbleIndex(laid.marks, "cloud");
    expect(index.length).toBe(3);
    expect(index.at(-1)).toBeUndefined();
    expect(index.at(3)).toBeUndefined();
    const first = index.at(0);
    expect(first?.datum).toEqual({ series: "North", x: 0, y: 0, size: 1 });
    expect(first?.seriesId).toBe("North");
    expect(first?.at).toEqual({ kind: "value", x: 0, y: 0 });
    const hit = laid.marks[1]!;
    const ordinal = index.locate(hit.px, hit.py);
    expect(index.at(ordinal)?.datum.size).toBe(4);
    expect(index.locate(1000, 1000)).toBe(-1);
  });

  it("falls back to the index series id when a point's series is empty", () => {
    const laid = layoutBubbleFromObservations([{ x: 0, y: 0, size: 1, series: "" }], {
      width: 10,
      height: 10,
    });
    const index = createBubbleIndex(laid.marks, "cloud");
    expect(index.at(0)?.seriesId).toBe("cloud");
  });
});
