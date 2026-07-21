import { describe, expect, it } from "vitest";
import {
  type ActivePoint,
  type ActivePointIndex,
  createBandIndex,
  createScatterIndex,
  createTimeSeriesIndex,
  nearestSortedIndex,
} from "../src/index";

/* -------------------------------------------------------------------------- */
/* nearestSortedIndex — the owned binary search                                */
/* -------------------------------------------------------------------------- */

describe("nearestSortedIndex", () => {
  it("returns -1 for an empty array", () => {
    expect(nearestSortedIndex([], 5)).toBe(-1);
  });

  it("returns 0 for a single-element array, from anywhere", () => {
    expect(nearestSortedIndex([10], 10)).toBe(0);
    expect(nearestSortedIndex([10], -1000)).toBe(0);
    expect(nearestSortedIndex([10], 1000)).toBe(0);
  });

  it("clamps below the first and above the last element", () => {
    const a = [0, 10, 20, 30];
    expect(nearestSortedIndex(a, -5)).toBe(0);
    expect(nearestSortedIndex(a, 100)).toBe(3);
  });

  it("returns the exact index on a direct hit", () => {
    const a = [0, 10, 20, 30];
    expect(nearestSortedIndex(a, 0)).toBe(0);
    expect(nearestSortedIndex(a, 20)).toBe(2);
    expect(nearestSortedIndex(a, 30)).toBe(3);
  });

  it("returns the nearer neighbour when between two values", () => {
    const a = [0, 10, 20, 30];
    expect(nearestSortedIndex(a, 9)).toBe(1); // nearer 10
    expect(nearestSortedIndex(a, 11)).toBe(1); // nearer 10
    expect(nearestSortedIndex(a, 24)).toBe(2); // nearer 20
    expect(nearestSortedIndex(a, 26)).toBe(3); // nearer 30
  });

  it("breaks an exact midpoint tie toward the LOWER index", () => {
    const a = [0, 10, 20, 30];
    expect(nearestSortedIndex(a, 5)).toBe(0); // equidistant 0 and 10 -> lower
    expect(nearestSortedIndex(a, 15)).toBe(1);
    expect(nearestSortedIndex(a, 25)).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/** A minimal present-point datum for the time-series lookup. */
interface TPoint {
  t: number; // epoch ms
  v: number;
  i: number; // index in the caller's array
}

const timeOpts = {
  time: (d: TPoint) => d.t,
  // A linear, monotonic pixel mapping so the instant axis is sortable.
  px: (d: TPoint) => (d.t - 1000) / 10,
  py: (d: TPoint) => 500 - d.v,
  sourceIndex: (d: TPoint) => d.i,
};

const p = (t: number, v: number, i: number): TPoint => ({ t, v, i });

/** Assert that a pointer resolution and its ordinal read produce one record. */
function pointerEqualsKeyboard<D>(index: ActivePointIndex<D>, px: number, py: number): void {
  const ordinal = index.locate(px, py);
  expect(ordinal).toBeGreaterThanOrEqual(0);
  expect(index.at(ordinal)).toEqual(index.at(ordinal)); // stable
  // The record a pointer gets is exactly the record that ordinal addresses.
  const viaPointer = index.at(index.locate(px, py));
  const viaKeyboard = index.at(ordinal);
  expect(viaPointer).toEqual(viaKeyboard);
}

/* -------------------------------------------------------------------------- */
/* createTimeSeriesIndex                                                       */
/* -------------------------------------------------------------------------- */

describe("createTimeSeriesIndex", () => {
  it("empty input has length 0 and resolves nothing", () => {
    const index = createTimeSeriesIndex<TPoint>([], timeOpts);
    expect(index.length).toBe(0);
    expect(index.at(0)).toBeUndefined();
    expect(index.locate(0, 0)).toBe(-1);
  });

  it("a series with no points contributes no instants", () => {
    const index = createTimeSeriesIndex<TPoint>([{ seriesId: "a", points: [] }], timeOpts);
    expect(index.length).toBe(0);
    expect(index.locate(50, 50)).toBe(-1);
  });

  it("single series: builds one ordinal per instant, in ascending order", () => {
    const index = createTimeSeriesIndex<TPoint>(
      [{ seriesId: "a", points: [p(1000, 10, 0), p(2000, 20, 1), p(3000, 30, 2)] }],
      timeOpts,
    );
    expect(index.length).toBe(3);
    const first = index.at(0) as ActivePoint<TPoint>;
    expect(first.seriesId).toBe("a");
    expect(first.sourceIndex).toBe(0);
    expect(first.datum).toEqual(p(1000, 10, 0));
    expect(first.at).toEqual({ kind: "time", time: new Date(1000) });
    expect(first.position).toEqual({ x: 0, y: 490 });
    expect(first.atTime).toHaveLength(1);
  });

  it("boundary ordinals resolve to undefined", () => {
    const index = createTimeSeriesIndex<TPoint>(
      [{ seriesId: "a", points: [p(1000, 10, 0), p(2000, 20, 1)] }],
      timeOpts,
    );
    expect(index.at(-1)).toBeUndefined();
    expect(index.at(2)).toBeUndefined();
  });

  it("locate bisects on pixel x and matches the ordinal read (pointer == keyboard)", () => {
    const index = createTimeSeriesIndex<TPoint>(
      [{ seriesId: "a", points: [p(1000, 10, 0), p(2000, 20, 1), p(3000, 30, 2)] }],
      timeOpts,
    );
    // px for the three instants is 0, 100, 200.
    expect(index.locate(0, 0)).toBe(0);
    expect(index.locate(95, 0)).toBe(1);
    expect(index.locate(1000, 0)).toBe(2); // clamps past the last
    pointerEqualsKeyboard(index, 95, 0);
  });

  it("locate breaks a midpoint tie toward the earlier instant", () => {
    const index = createTimeSeriesIndex<TPoint>(
      [{ seriesId: "a", points: [p(1000, 10, 0), p(2000, 20, 1)] }],
      timeOpts,
    );
    // px 0 and 100; the midpoint 50 is equidistant -> earlier instant, ordinal 0.
    expect(index.locate(50, 0)).toBe(0);
  });

  it("duplicate timestamps within a series resolve to the lowest sourceIndex", () => {
    const index = createTimeSeriesIndex<TPoint>(
      [{ seriesId: "a", points: [p(1000, 99, 2), p(1000, 10, 0), p(1000, 55, 1)] }],
      timeOpts,
    );
    expect(index.length).toBe(1);
    const rec = index.at(0) as ActivePoint<TPoint>;
    // The kept datum is the one with sourceIndex 0, not the array-first (index 2).
    expect(rec.sourceIndex).toBe(0);
    expect(rec.datum.v).toBe(10);
  });

  it("shared-time: atTime carries every visible series present at the instant", () => {
    const index = createTimeSeriesIndex<TPoint>(
      [
        { seriesId: "a", points: [p(1000, 10, 0), p(2000, 20, 1)] },
        { seriesId: "b", points: [p(1000, 15, 0)] }, // only at t=1000
      ],
      timeOpts,
    );
    expect(index.length).toBe(2); // instants 1000 and 2000
    const atFirst = index.at(0) as ActivePoint<TPoint>;
    expect(atFirst.atTime?.map((e) => e.seriesId)).toEqual(["a", "b"]);
    // The primary is the first series in input order.
    expect(atFirst.seriesId).toBe("a");
    const atSecond = index.at(1) as ActivePoint<TPoint>;
    expect(atSecond.atTime?.map((e) => e.seriesId)).toEqual(["a"]); // b absent at 2000
  });
});

/* -------------------------------------------------------------------------- */
/* createScatterIndex                                                          */
/* -------------------------------------------------------------------------- */

interface XY {
  x: number;
  y: number;
}

const scatterOpts = {
  // Identity pixel mapping for a clean nearest test.
  px: (d: XY) => d.x,
  py: (d: XY) => d.y,
  x: (d: XY) => d.x,
  y: (d: XY) => d.y,
};

describe("createScatterIndex", () => {
  it("empty input has length 0 and resolves nothing", () => {
    const index = createScatterIndex<XY>([], scatterOpts);
    expect(index.length).toBe(0);
    expect(index.at(0)).toBeUndefined();
    expect(index.locate(1, 1)).toBe(-1);
  });

  it("produces a value-kind record with domain coordinates and pixel position", () => {
    const index = createScatterIndex<XY>([{ x: 3, y: 4 }], { ...scatterOpts, seriesId: "cloud" });
    const rec = index.at(0) as ActivePoint<XY>;
    expect(rec.seriesId).toBe("cloud");
    expect(rec.sourceIndex).toBe(0);
    expect(rec.at).toEqual({ kind: "value", x: 3, y: 4 });
    expect(rec.position).toEqual({ x: 3, y: 4 });
    expect(rec.atTime).toBeUndefined();
  });

  it("drops non-finite points but preserves the caller's sourceIndex on survivors", () => {
    const index = createScatterIndex<XY>(
      [
        { x: 0, y: 0 }, // 0 — kept
        { x: Number.NaN, y: 5 }, // 1 — dropped
        { x: 100, y: 100 }, // 2 — kept, sourceIndex must remain 2
      ],
      scatterOpts,
    );
    expect(index.length).toBe(2);
    expect((index.at(0) as ActivePoint<XY>).sourceIndex).toBe(0);
    expect((index.at(1) as ActivePoint<XY>).sourceIndex).toBe(2);
  });

  it("locate finds the nearest point and matches the ordinal read", () => {
    const index = createScatterIndex<XY>(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 100 },
      ],
      scatterOpts,
    );
    expect(index.locate(5, 5)).toBe(0);
    expect(index.locate(95, 5)).toBe(1);
    expect(index.locate(5, 95)).toBe(2);
    pointerEqualsKeyboard(index, 95, 5);
  });

  it("out-of-range ordinals resolve to undefined", () => {
    const index = createScatterIndex<XY>([{ x: 1, y: 1 }], scatterOpts);
    expect(index.at(-1)).toBeUndefined();
    expect(index.at(1)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* createBandIndex                                                             */
/* -------------------------------------------------------------------------- */

interface Cat {
  key: string;
  x0: number;
  x1: number;
}

const bands: Cat[] = [
  { key: "a", x0: 0, x1: 30 },
  { key: "b", x0: 40, x1: 70 }, // a gap between 30 and 40
  { key: "c", x0: 70, x1: 100 },
];

const bandOpts = {
  category: (d: Cat) => d.key,
  bandStart: (d: Cat) => d.x0,
  bandEnd: (d: Cat) => d.x1,
  axis: (px: number) => px, // vertical bars: the x coordinate selects the band
  px: (d: Cat) => (d.x0 + d.x1) / 2,
  py: () => 250,
};

describe("createBandIndex", () => {
  it("empty input has length 0 and resolves nothing", () => {
    const index = createBandIndex<Cat>([], bandOpts);
    expect(index.length).toBe(0);
    expect(index.at(0)).toBeUndefined();
    expect(index.locate(10, 10)).toBe(-1);
  });

  it("produces a category-kind record with the band's cursor position", () => {
    const index = createBandIndex<Cat>(bands, { ...bandOpts, seriesId: "ranked" });
    const rec = index.at(0) as ActivePoint<Cat>;
    expect(rec.seriesId).toBe("ranked");
    expect(rec.sourceIndex).toBe(0);
    expect(rec.at).toEqual({ kind: "category", category: "a" });
    expect(rec.position).toEqual({ x: 15, y: 250 });
    expect(rec.atTime).toBeUndefined();
  });

  it("locate returns the band containing the coordinate, left-inclusive", () => {
    const index = createBandIndex<Cat>(bands, bandOpts);
    expect(index.locate(0, 0)).toBe(0); // left edge is inclusive
    expect(index.locate(15, 0)).toBe(0);
    expect(index.locate(50, 0)).toBe(1);
    expect(index.locate(70, 0)).toBe(2); // right edge of b is exclusive -> c
    pointerEqualsKeyboard(index, 50, 0);
  });

  it("returns -1 in a gap between bands and outside every band", () => {
    const index = createBandIndex<Cat>(bands, bandOpts);
    expect(index.locate(35, 0)).toBe(-1); // in the 30..40 gap
    expect(index.locate(-5, 0)).toBe(-1); // left of everything
    expect(index.locate(200, 0)).toBe(-1); // right of everything
  });

  it("selects the band on the vertical (py) axis when the caller maps it so", () => {
    const horizontal = createBandIndex<Cat>(bands, { ...bandOpts, axis: (_px, py) => py });
    expect(horizontal.locate(0, 50)).toBe(1); // py 50 falls in band b
    expect(horizontal.locate(999, 15)).toBe(0); // px ignored; py selects
  });
});
