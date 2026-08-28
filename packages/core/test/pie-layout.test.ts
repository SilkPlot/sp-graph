/**
 * Pie layout — angles, percents, and the donut hole as data.
 *
 * Geometry is asserted as values, the same way `layoutHeatmapCells` asserts
 * cells: a node test walks the compute, never a rendered tree. Donut is the
 * same engine as pie; only `hole` changes.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DONUT_HOLE,
  PIE_PATTERN_COUNT,
  angleInSlice,
  computePie,
  createPieIndex,
  layoutPie,
  layoutPieFromObservations,
  locatePieSlice,
  pieHole,
  piePatternIndex,
  piePointAngle,
  pointInPieSlice,
  resolveDonutHole,
} from "../src/index";
import type { PieObservation } from "../src/index";

const TAU = Math.PI * 2;

const QUARTERS: PieObservation[] = [
  { label: "A", value: 1 },
  { label: "B", value: 1 },
  { label: "C", value: 1 },
  { label: "D", value: 1 },
];

describe("pieHole and resolveDonutHole", () => {
  it("treats absent, non-finite, and negative as pie (0)", () => {
    expect(pieHole(undefined)).toBe(0);
    expect(pieHole(Number.NaN)).toBe(0);
    expect(pieHole(-0.2)).toBe(0);
    expect(pieHole(0)).toBe(0);
  });

  it("keeps hole in (0, 1] and clamps above 1", () => {
    expect(pieHole(0.25)).toBe(0.25);
    expect(pieHole(1)).toBe(1);
    expect(pieHole(2)).toBe(1);
  });

  it("gives the donut view a hole in (0, 1], defaulting 0 and absent", () => {
    expect(resolveDonutHole(undefined)).toBe(DEFAULT_DONUT_HOLE);
    expect(resolveDonutHole(0)).toBe(DEFAULT_DONUT_HOLE);
    expect(resolveDonutHole(Number.NaN)).toBe(DEFAULT_DONUT_HOLE);
    expect(resolveDonutHole(0.3)).toBe(0.3);
    expect(resolveDonutHole(1)).toBe(1);
    expect(resolveDonutHole(4)).toBe(1);
  });
});

describe("piePatternIndex", () => {
  it("wraps into the catalog, including negatives", () => {
    expect(piePatternIndex(0)).toBe(0);
    expect(piePatternIndex(PIE_PATTERN_COUNT)).toBe(0);
    expect(piePatternIndex(PIE_PATTERN_COUNT + 1)).toBe(1);
    expect(piePatternIndex(-1)).toBe(PIE_PATTERN_COUNT - 1);
  });
});

describe("computePie", () => {
  it("assigns contiguous clockwise angles from 12 o'clock, in caller order", () => {
    const parts = computePie(QUARTERS);
    expect(parts).toHaveLength(4);
    expect(parts[0]?.label).toBe("A");
    expect(parts[0]?.startAngle).toBe(0);
    expect(parts[0]?.endAngle).toBeCloseTo(TAU / 4);
    expect(parts[1]?.startAngle).toBeCloseTo(TAU / 4);
    expect(parts[3]?.endAngle).toBeCloseTo(TAU);
    expect(parts.map((p) => p.label)).toEqual(["A", "B", "C", "D"]);
  });

  it("does not reorder a smaller first slice ahead of a larger later one", () => {
    const parts = computePie([
      { label: "small", value: 1 },
      { label: "large", value: 9 },
    ]);
    expect(parts[0]?.label).toBe("small");
    expect(parts[1]?.label).toBe("large");
    expect(parts[1]?.percent).toBe(0.9);
  });

  it("makes a 100% single slice span the whole circle", () => {
    const parts = computePie([{ label: "all", value: 40 }]);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.percent).toBe(1);
    expect(parts[0]?.startAngle).toBe(0);
    expect(parts[0]?.endAngle).toBeCloseTo(TAU);
  });

  it("sums percents to 1 across mixed values", () => {
    const parts = computePie([
      { label: "a", value: 2 },
      { label: "b", value: 3 },
      { label: "c", value: 5 },
    ]);
    const sum = parts.reduce((total, part) => total + part.percent, 0);
    expect(sum).toBeCloseTo(1, 12);
    expect(parts[2]?.percent).toBe(0.5);
  });

  it("drops zero, negative, and missing values rather than drawing empty slices", () => {
    const parts = computePie([
      { label: "zero", value: 0 },
      { label: "neg", value: -4 },
      { label: "nan", value: Number.NaN },
      { label: "inf", value: Number.POSITIVE_INFINITY },
      { label: "kept", value: 10 },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.label).toBe("kept");
    expect(parts[0]?.sourceIndex).toBe(4);
    expect(parts[0]?.percent).toBe(1);
  });

  it("returns empty when nothing finite and positive survives", () => {
    expect(computePie([{ label: "x", value: 0 }])).toEqual([]);
    expect(computePie([])).toEqual([]);
  });
});

describe("layoutPie hole", () => {
  const parts = computePie(QUARTERS);
  const box = { width: 200, height: 100 };

  it("hole=0 is a pie: inner radius 0, outer is half the short side", () => {
    const pie = layoutPie(parts, { ...box, hole: 0 });
    expect(pie.hole).toBe(0);
    expect(pie.innerRadius).toBe(0);
    expect(pie.outerRadius).toBe(50);
    expect(pie.cx).toBe(100);
    expect(pie.cy).toBe(50);
    expect(pie.slices).toHaveLength(4);
    expect(pie.slices[0]?.innerRadius).toBe(0);
    expect(pie.slices[0]?.d.startsWith("M")).toBe(true);
  });

  it("omitted hole is the same pie as hole=0", () => {
    const omitted = layoutPie(parts, box);
    const explicit = layoutPie(parts, { ...box, hole: 0 });
    expect(omitted.innerRadius).toBe(explicit.innerRadius);
    expect(omitted.outerRadius).toBe(explicit.outerRadius);
    expect(omitted.slices[0]?.startAngle).toBe(explicit.slices[0]?.startAngle);
  });

  it("hole in (0, 1] is a donut: inner = hole × outer, angles unchanged", () => {
    const pie = layoutPie(parts, { ...box, hole: 0 });
    const donut = layoutPie(parts, { ...box, hole: 0.4 });
    expect(donut.hole).toBe(0.4);
    expect(donut.innerRadius).toBeCloseTo(donut.outerRadius * 0.4);
    expect(donut.innerRadius).toBeGreaterThan(0);
    expect(donut.slices[0]?.startAngle).toBe(pie.slices[0]?.startAngle);
    expect(donut.slices[0]?.endAngle).toBe(pie.slices[0]?.endAngle);
    expect(donut.slices.map((s) => s.percent)).toEqual(pie.slices.map((s) => s.percent));
  });

  it("hole=1 is still a donut whose inner radius meets the outer", () => {
    const donut = layoutPie(parts, { ...box, hole: 1 });
    expect(donut.innerRadius).toBe(donut.outerRadius);
    expect(donut.hole).toBe(1);
  });

  it("layoutPieFromObservations composes compute then layout", () => {
    const direct = layoutPieFromObservations(QUARTERS, { ...box, hole: 0.5 });
    const composed = layoutPie(computePie(QUARTERS), { ...box, hole: 0.5 });
    expect(direct.innerRadius).toBe(composed.innerRadius);
    expect(direct.slices.map((s) => s.label)).toEqual(composed.slices.map((s) => s.label));
  });
});

describe("piePointAngle, angleInSlice, locatePieSlice", () => {
  it("measures 0 at 12 o'clock and increases clockwise", () => {
    expect(piePointAngle(0, 0)).toBe(0);
    expect(piePointAngle(0, -1)).toBeCloseTo(0);
    expect(piePointAngle(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(piePointAngle(0, 1)).toBeCloseTo(Math.PI);
    expect(piePointAngle(-1, 0)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it("treats a full-circle slice as containing every angle", () => {
    expect(angleInSlice(0, 0, TAU)).toBe(true);
    expect(angleInSlice(Math.PI, 0, TAU)).toBe(true);
  });

  it("wraps an angle that sits before start", () => {
    expect(angleInSlice(0.1, TAU - 0.2, TAU + 0.2)).toBe(true);
    expect(angleInSlice(Math.PI, 0, Math.PI / 2)).toBe(false);
  });

  const pie = layoutPieFromObservations(QUARTERS, { width: 200, height: 200, hole: 0 });
  const donut = layoutPieFromObservations(QUARTERS, { width: 200, height: 200, hole: 0.5 });

  it("hits the slice containing a point on a pie and misses outside", () => {
    const first = pie.slices[0] as (typeof pie.slices)[number];
    expect(locatePieSlice(pie.slices, first.centroid.x, first.centroid.y)).toBe(0);
    expect(pointInPieSlice(first, first.centroid.x, first.centroid.y)).toBe(true);
    expect(locatePieSlice(pie.slices, -10, -10)).toBe(-1);
    expect(locatePieSlice(pie.slices, pie.cx, pie.cy)).toBe(0);
  });

  it("misses the hole of a donut and still hits the ring", () => {
    expect(locatePieSlice(donut.slices, donut.cx, donut.cy)).toBe(-1);
    const first = donut.slices[0] as (typeof donut.slices)[number];
    expect(locatePieSlice(donut.slices, first.centroid.x, first.centroid.y)).toBe(0);
  });

  it("rejects a collapsed ring", () => {
    const collapsed = layoutPieFromObservations(QUARTERS, { width: 200, height: 200, hole: 1 });
    const first = collapsed.slices[0] as (typeof collapsed.slices)[number];
    expect(pointInPieSlice(first, first.centroid.x, first.centroid.y)).toBe(false);
    expect(locatePieSlice(collapsed.slices, first.centroid.x, first.centroid.y)).toBe(-1);
  });
});

describe("createPieIndex", () => {
  const pie = layoutPieFromObservations(QUARTERS, { width: 100, height: 100, hole: 0 });

  it("lets pointer and keyboard resolve the same record", () => {
    const index = createPieIndex(pie.slices, "share");
    expect(index.length).toBe(4);
    expect(index.at(-1)).toBeUndefined();
    expect(index.at(4)).toBeUndefined();
    const first = pie.slices[0] as (typeof pie.slices)[number];
    const ordinal = index.locate(first.centroid.x, first.centroid.y);
    expect(ordinal).toBe(0);
    const record = index.at(ordinal);
    expect(record?.seriesId).toBe("share");
    expect(record?.datum).toEqual({ label: "A", value: 1, percent: 0.25 });
    expect(record?.at).toEqual({ kind: "category", category: "A" });
    expect(record?.sourceIndex).toBe(0);
    expect(record?.position.x).toBe(first.centroid.x);
  });

  it("defaults the series id when the caller does not name one", () => {
    expect(createPieIndex(pie.slices).at(0)?.seriesId).toBe("pie");
  });
});
