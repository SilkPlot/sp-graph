import { describe, expect, it } from "vitest";
import { createHitIndex } from "../src/index";

interface Point {
  x: number;
  y: number;
}

const xy = { x: (d: Point) => d.x, y: (d: Point) => d.y };

describe("createHitIndex", () => {
  it("empty data: nearest returns -1 for any query point", () => {
    const index = createHitIndex<Point>([], xy);
    expect(index.nearest(0, 0)).toBe(-1);
    expect(index.nearest(100, -50)).toBe(-1);
    expect(index.nearest(-1e6, 1e6)).toBe(-1);
  });

  it("single point: nearest returns index 0 from anywhere in the plane", () => {
    const index = createHitIndex([{ x: 5, y: 5 }], xy);
    expect(index.nearest(5, 5)).toBe(0);
    expect(index.nearest(0, 0)).toBe(0);
    expect(index.nearest(1000, -1000)).toBe(0);
    expect(index.nearest(-1000, 1000)).toBe(0);
  });

  describe("well-separated grid", () => {
    // Points spaced 100 apart so the nearest neighbour is unambiguous.
    const data: Point[] = [
      { x: 0, y: 0 }, // 0
      { x: 100, y: 0 }, // 1
      { x: 0, y: 100 }, // 2
      { x: 100, y: 100 }, // 3
    ];
    const index = createHitIndex(data, xy);

    it("returns the exact point's index when queried exactly at it", () => {
      expect(index.nearest(0, 0)).toBe(0);
      expect(index.nearest(100, 0)).toBe(1);
      expect(index.nearest(0, 100)).toBe(2);
      expect(index.nearest(100, 100)).toBe(3);
    });

    it("returns the nearest point's index when queried near it", () => {
      expect(index.nearest(10, 5)).toBe(0);
      expect(index.nearest(90, 5)).toBe(1);
      expect(index.nearest(10, 95)).toBe(2);
      expect(index.nearest(90, 95)).toBe(3);
    });
  });

  it("returns indices into the caller's original (unsorted) data array", () => {
    // Deliberately not sorted by x or y, so a wrong answer would reveal an
    // assumption that the index maps to some internally-reordered set.
    const data: Point[] = [
      { x: 100, y: 100 }, // 0
      { x: 0, y: 0 }, // 1
      { x: 100, y: 0 }, // 2
      { x: 0, y: 100 }, // 3
    ];
    const index = createHitIndex(data, xy);
    expect(index.nearest(100, 100)).toBe(0);
    expect(index.nearest(0, 0)).toBe(1);
    expect(index.nearest(100, 0)).toBe(2);
    expect(index.nearest(0, 100)).toBe(3);
  });

  it("passes the correct (datum, index) pair to the x and y accessors", () => {
    const p0 = { px: 1, py: 2 };
    const p1 = { px: 3, py: 4 };
    const p2 = { px: 5, py: 6 };
    const data = [p0, p1, p2];
    const xCalls: Array<[unknown, number]> = [];
    const yCalls: Array<[unknown, number]> = [];
    createHitIndex(data, {
      x: (d, i) => {
        xCalls.push([d, i]);
        return d.px;
      },
      y: (d, i) => {
        yCalls.push([d, i]);
        return d.py;
      },
    });
    expect(xCalls).toEqual([
      [p0, 0],
      [p1, 1],
      [p2, 2],
    ]);
    expect(yCalls).toEqual([
      [p0, 0],
      [p1, 1],
      [p2, 2],
    ]);
  });

  it("works with data of plain objects (not tuples)", () => {
    interface Labeled {
      label: string;
      px: number;
      py: number;
    }
    const data: Labeled[] = [
      { label: "a", px: 0, py: 0 },
      { label: "b", px: 50, py: 50 },
      { label: "c", px: 100, py: 0 },
    ];
    const index = createHitIndex(data, { x: (d) => d.px, y: (d) => d.py });
    expect(index.nearest(0, 0)).toBe(0);
    expect(index.nearest(50, 50)).toBe(1);
    expect(index.nearest(100, 0)).toBe(2);
  });

  it("does not mutate the caller's data array", () => {
    const data: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ];
    const snapshot = data.map((d) => ({ ...d }));
    createHitIndex(data, xy);
    expect(data).toEqual(snapshot);
    expect(data.length).toBe(3);
  });

  describe("collinear points (degenerate triangulation)", () => {
    // A horizontal line of well-separated points -- a common time-series
    // shape. Deliberately unsorted, so a wrong index shows up as an
    // index-mapping error rather than a coincidental match against sorted
    // order. d3-delaunay's `find` walks the (degenerate) hull for collinear
    // input rather than relying on triangles, so this is worth probing
    // directly rather than assuming.
    const data: Point[] = [
      { x: 30, y: 0 }, // 0
      { x: 0, y: 0 }, // 1
      { x: 40, y: 0 }, // 2
      { x: 10, y: 0 }, // 3
      { x: 20, y: 0 }, // 4
    ];
    const index = createHitIndex(data, xy);

    it("returns the exact point's index when queried exactly at it", () => {
      expect(index.nearest(30, 0)).toBe(0);
      expect(index.nearest(0, 0)).toBe(1);
      expect(index.nearest(40, 0)).toBe(2);
      expect(index.nearest(10, 0)).toBe(3);
      expect(index.nearest(20, 0)).toBe(4);
    });

    it("returns the nearest point's index for on-axis queries between points", () => {
      expect(index.nearest(9, 0)).toBe(3); // nearer to x=10 than x=0
      expect(index.nearest(11, 0)).toBe(3); // nearer to x=10 than x=20
      expect(index.nearest(-5, 0)).toBe(1); // left of the line -> nearest endpoint
      expect(index.nearest(45, 0)).toBe(2); // right of the line -> nearest endpoint
    });

    it("returns the nearest point's index for off-axis queries", () => {
      expect(index.nearest(12, 100)).toBe(3); // closer to x=10 than x=20
      expect(index.nearest(12, -100)).toBe(3);
      expect(index.nearest(28, 50)).toBe(0); // closer to x=30 than x=20 or x=40
    });
  });
});
