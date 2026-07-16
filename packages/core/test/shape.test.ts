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

describe("linePath", () => {
  it("returns exactly the empty string for empty data", () => {
    expect(linePath<Point>([], { x: (d) => d.x, y: (d) => d.y })).toBe("");
  });

  it("produces a path for a single point", () => {
    const d = linePath([{ x: 0, y: 0 }], { x: (p) => p.x, y: (p) => p.y });
    expect(d.startsWith("M")).toBe(true);
    expect(d.length).toBeGreaterThan(0);
  });

  it("produces a path starting with M for multiple points", () => {
    const d = linePath(points, { x: (p) => p.x, y: (p) => p.y });
    expect(d.startsWith("M")).toBe(true);
  });

  it("passes (datum, index) to the x and y accessors", () => {
    const xCalls: Array<[Point, number]> = [];
    const yCalls: Array<[Point, number]> = [];
    linePath(points, {
      x: (d, i) => {
        xCalls.push([d, i]);
        return d.x;
      },
      y: (d, i) => {
        yCalls.push([d, i]);
        return d.y;
      },
    });
    expect(xCalls.map(([d, i]) => [d, i])).toEqual(points.map((p, i) => [p, i]));
    expect(yCalls.map(([d, i]) => [d, i])).toEqual(points.map((p, i) => [p, i]));
  });

  it("does not mutate the caller's data array", () => {
    const data = [...points];
    const snapshot = [...data];
    linePath(data, { x: (p) => p.x, y: (p) => p.y });
    expect(data).toEqual(snapshot);
  });

  it("creates a gap (multiple M commands) where defined() is false", () => {
    const withGap = [
      { x: 0, y: 0 },
      { x: 1, y: 1 }, // excluded — should split the path
      { x: 2, y: 2 },
    ];
    const d = linePath(withGap, {
      x: (p) => p.x,
      y: (p) => p.y,
      defined: (p) => p.x !== 1,
    });
    const moveCount = (d.match(/M/g) ?? []).length;
    expect(moveCount).toBe(2);
  });

  it("does not gap when defined() is omitted (all points included)", () => {
    const d = linePath(points, { x: (p) => p.x, y: (p) => p.y });
    const moveCount = (d.match(/M/g) ?? []).length;
    expect(moveCount).toBe(1);
  });
});

describe("curves", () => {
  it("exposes linear and monotoneX presets", () => {
    expect(curves.linear).toBeDefined();
    expect(curves.monotoneX).toBeDefined();
  });

  it("linear and monotoneX produce different output for non-collinear data", () => {
    const linear = linePath(points, { x: (p) => p.x, y: (p) => p.y, curve: curves.linear });
    const monotone = linePath(points, {
      x: (p) => p.x,
      y: (p) => p.y,
      curve: curves.monotoneX,
    });
    expect(linear).not.toBe(monotone);
  });

  it("linear curve emits L commands", () => {
    const d = linePath(points, { x: (p) => p.x, y: (p) => p.y, curve: curves.linear });
    expect(d).toMatch(/L/);
  });

  it("monotoneX curve emits C (bezier) commands", () => {
    const d = linePath(points, { x: (p) => p.x, y: (p) => p.y, curve: curves.monotoneX });
    expect(d).toMatch(/C/);
  });

  it("resolves a curve given by name identically to the same curve given by factory", () => {
    const byName = linePath(points, { x: (p) => p.x, y: (p) => p.y, curve: "monotoneX" });
    const byFactory = linePath(points, {
      x: (p) => p.x,
      y: (p) => p.y,
      curve: curves.monotoneX,
    });
    expect(byName).toBe(byFactory);
  });

  it("defaults to the linear curve when curve is omitted", () => {
    const omitted = linePath(points, { x: (p) => p.x, y: (p) => p.y });
    const explicitLinear = linePath(points, {
      x: (p) => p.x,
      y: (p) => p.y,
      curve: curves.linear,
    });
    expect(omitted).toBe(explicitLinear);
  });
});

describe("areaPath", () => {
  it("returns exactly the empty string for empty data", () => {
    expect(areaPath<Point>([], { x: (d) => d.x, y0: 0, y1: (d) => d.y })).toBe("");
  });

  it("produces a path starting with M for multiple points", () => {
    const d = areaPath(points, { x: (p) => p.x, y0: 0, y1: (p) => p.y });
    expect(d.startsWith("M")).toBe(true);
  });

  it("passes (datum, index) to the x and y1 accessors", () => {
    const xCalls: Array<[Point, number]> = [];
    const y1Calls: Array<[Point, number]> = [];
    areaPath(points, {
      x: (d, i) => {
        xCalls.push([d, i]);
        return d.x;
      },
      y0: 0,
      y1: (d, i) => {
        y1Calls.push([d, i]);
        return d.y;
      },
    });
    expect(xCalls.map(([d, i]) => [d, i])).toEqual(points.map((p, i) => [p, i]));
    expect(y1Calls.map(([d, i]) => [d, i])).toEqual(points.map((p, i) => [p, i]));
  });

  it("does not mutate the caller's data array", () => {
    const data = [...points];
    const snapshot = [...data];
    areaPath(data, { x: (p) => p.x, y0: 0, y1: (p) => p.y });
    expect(data).toEqual(snapshot);
  });

  it("creates a gap (multiple M commands) where defined() is false", () => {
    const withGap = [
      { x: 0, y: 0 },
      { x: 1, y: 1 }, // excluded — should split the path
      { x: 2, y: 2 },
    ];
    const d = areaPath(withGap, {
      x: (p) => p.x,
      y0: 0,
      y1: (p) => p.y,
      defined: (p) => p.x !== 1,
    });
    const moveCount = (d.match(/M/g) ?? []).length;
    expect(moveCount).toBe(2);
  });

  // toAccessor normalises a constant y0 into a () => value accessor. A
  // constant and an equivalent accessor must produce byte-identical output.
  it("y0 as a constant number produces identical output to an equivalent accessor", () => {
    const constant = areaPath(points, { x: (p) => p.x, y0: 100, y1: (p) => p.y });
    const accessor = areaPath(points, { x: (p) => p.x, y0: () => 100, y1: (p) => p.y });
    expect(constant).toBe(accessor);
    expect(constant.length).toBeGreaterThan(0);
  });

  it("y0 as a varying accessor (banded/stacked baseline) shapes the path differently than a constant", () => {
    const constantBaseline = areaPath(points, { x: (p) => p.x, y0: 0, y1: (p) => p.y });
    const varyingBaseline = areaPath(points, {
      x: (p) => p.x,
      y0: (p) => p.x, // baseline rises with x — genuinely non-constant
      y1: (p) => p.y,
    });
    expect(varyingBaseline).not.toBe(constantBaseline);
    expect(varyingBaseline.startsWith("M")).toBe(true);
  });

  it("y0 accessor receives (datum, index)", () => {
    const y0Calls: Array<[Point, number]> = [];
    areaPath(points, {
      x: (p) => p.x,
      y0: (d, i) => {
        y0Calls.push([d, i]);
        return 0;
      },
      y1: (p) => p.y,
    });
    expect(y0Calls.map(([d, i]) => [d, i])).toEqual(points.map((p, i) => [p, i]));
  });
});
