import { describe, expect, it } from "vitest";
import { linePath, areaPath, curves } from "../src/index";

interface Point {
  x: number;
  y: number;
}

/** Non-collinear so linear vs. monotoneX curves actually diverge. */
const points: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 5 },
  { x: 2, y: 1 },
  { x: 3, y: 8 },
];

/** The plain accessors. Reading `d.x`/`d.y` is never the subject here — the curve, gap and baseline behaviour is. */
const XY = { x: (p: Point) => p.x, y: (p: Point) => p.y } as const;
const AREA_XY = { x: (p: Point) => p.x, y0: 0, y1: (p: Point) => p.y } as const;

/** A three-point series with the middle point excluded, for the gap cases. */
const GAPPED: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 }, // excluded — should split the path
  { x: 2, y: 2 },
];
const notMiddle = (p: Point): boolean => p.x !== 1;

/** How many subpaths a `d` string contains: one `M` per contiguous run. */
const moveCount = (d: string): number => (d.match(/M/g) ?? []).length;

/**
 * An accessor that records every `(datum, index)` it is handed, alongside the
 * calls it made. The recorder is the plumbing; each test still asserts what its
 * own accessor should have seen.
 */
function recorder(read: (p: Point) => number) {
  const calls: Array<[Point, number]> = [];
  return {
    calls,
    accessor: (d: Point, i: number): number => {
      calls.push([d, i]);
      return read(d);
    },
  };
}

/** Every datum, in order, with its index — what a well-behaved d3 generator passes through. */
const eachWithIndex = (data: readonly Point[]): Array<[Point, number]> =>
  data.map((p, i) => [p, i]);

describe("linePath", () => {
  it("returns exactly the empty string for empty data", () => {
    expect(linePath<Point>([], { x: (d) => d.x, y: (d) => d.y })).toBe("");
  });

  it("produces a path for a single point", () => {
    const d = linePath([{ x: 0, y: 0 }], XY);
    expect(d.startsWith("M")).toBe(true);
    expect(d.length).toBeGreaterThan(0);
  });

  it("produces a path starting with M for multiple points", () => {
    expect(linePath(points, XY).startsWith("M")).toBe(true);
  });

  it("passes (datum, index) to the x and y accessors", () => {
    const x = recorder((p) => p.x);
    const y = recorder((p) => p.y);
    linePath(points, { x: x.accessor, y: y.accessor });
    expect(x.calls).toEqual(eachWithIndex(points));
    expect(y.calls).toEqual(eachWithIndex(points));
  });

  it("does not mutate the caller's data array", () => {
    const data = [...points];
    const snapshot = [...data];
    linePath(data, XY);
    expect(data).toEqual(snapshot);
  });

  it("creates a gap (multiple M commands) where defined() is false", () => {
    expect(moveCount(linePath(GAPPED, { ...XY, defined: notMiddle }))).toBe(2);
  });

  it("does not gap when defined() is omitted (all points included)", () => {
    expect(moveCount(linePath(points, XY))).toBe(1);
  });
});

describe("curves", () => {
  it("exposes linear and monotoneX presets", () => {
    expect(curves.linear).toBeDefined();
    expect(curves.monotoneX).toBeDefined();
  });

  /** The same points under a named or given curve — the curve is the only thing that varies. */
  const under = (curve: Parameters<typeof linePath<Point>>[1]["curve"]): string =>
    linePath(points, { ...XY, curve });

  it("linear and monotoneX produce different output for non-collinear data", () => {
    expect(under(curves.linear)).not.toBe(under(curves.monotoneX));
  });

  it("linear curve emits L commands", () => {
    expect(under(curves.linear)).toMatch(/L/);
  });

  it("monotoneX curve emits C (bezier) commands", () => {
    expect(under(curves.monotoneX)).toMatch(/C/);
  });

  it("resolves a curve given by name identically to the same curve given by factory", () => {
    expect(under("monotoneX")).toBe(under(curves.monotoneX));
  });

  it("defaults to the linear curve when curve is omitted", () => {
    expect(linePath(points, XY)).toBe(under(curves.linear));
  });
});

describe("areaPath", () => {
  it("returns exactly the empty string for empty data", () => {
    expect(areaPath<Point>([], { x: (d) => d.x, y0: 0, y1: (d) => d.y })).toBe("");
  });

  it("produces a path starting with M for multiple points", () => {
    expect(areaPath(points, AREA_XY).startsWith("M")).toBe(true);
  });

  it("passes (datum, index) to the x and y1 accessors", () => {
    const x = recorder((p) => p.x);
    const y1 = recorder((p) => p.y);
    areaPath(points, { x: x.accessor, y0: 0, y1: y1.accessor });
    expect(x.calls).toEqual(eachWithIndex(points));
    expect(y1.calls).toEqual(eachWithIndex(points));
  });

  it("does not mutate the caller's data array", () => {
    const data = [...points];
    const snapshot = [...data];
    areaPath(data, AREA_XY);
    expect(data).toEqual(snapshot);
  });

  it("creates a gap (multiple M commands) where defined() is false", () => {
    expect(moveCount(areaPath(GAPPED, { ...AREA_XY, defined: notMiddle }))).toBe(2);
  });

  // toAccessor normalises a constant y0 into a () => value accessor. A
  // constant and an equivalent accessor must produce byte-identical output.
  it("y0 as a constant number produces identical output to an equivalent accessor", () => {
    const constant = areaPath(points, { ...AREA_XY, y0: 100 });
    const accessor = areaPath(points, { ...AREA_XY, y0: () => 100 });
    expect(constant).toBe(accessor);
    expect(constant.length).toBeGreaterThan(0);
  });

  it("y0 as a varying accessor (banded/stacked baseline) shapes the path differently than a constant", () => {
    // Baseline rises with x — genuinely non-constant, so the two cannot coincide.
    const varyingBaseline = areaPath(points, { ...AREA_XY, y0: (p) => p.x });
    expect(varyingBaseline).not.toBe(areaPath(points, AREA_XY));
    expect(varyingBaseline.startsWith("M")).toBe(true);
  });

  it("y0 accessor receives (datum, index)", () => {
    const y0 = recorder(() => 0);
    areaPath(points, { ...AREA_XY, y0: y0.accessor });
    expect(y0.calls).toEqual(eachWithIndex(points));
  });
});
