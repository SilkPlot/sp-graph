/**
 * Grouped and stacked bar layout — exact rectangles as data.
 *
 * Geometry is asserted as values, the same way `packOverlaps` asserts lanes:
 * a node test walks the compute, never a rendered tree. Scales are rebuilt
 * from the same constructors the layout consumes, with `nice: false`, so a
 * d3 version bump does not rewrite the suite and a nicened domain cannot
 * hide an off-by-one.
 */
import { describe, expect, it } from "vitest";
import {
  bandScale,
  categoryTimesOf,
  groupInnerBand,
  groupSeries,
  layoutBarRects,
  linearScale,
  locateBarRect,
  normalizeSeries,
  stackSeries,
  stackedValueDomain,
  valueDomainOf,
} from "../src/index";
import type { NormalizedSeries, Series } from "../src/index";

const LENIENT = { strict: false } as const;

const T0 = Date.UTC(2026, 2, 1);
const T1 = Date.UTC(2026, 2, 2);
const T2 = Date.UTC(2026, 2, 3);

function series(id: string, values: readonly (number | null)[]): Series {
  return {
    id,
    label: id,
    data: values.map((y, i) => ({ t: new Date(T0 + i * 86_400_000), y })),
  };
}

function visible(input: readonly Series[]): readonly NormalizedSeries[] {
  return normalizeSeries(input, LENIENT).visible;
}

function byId(segments: readonly { seriesId: string; time: number }[], id: string, time: number) {
  return segments.find((s) => s.seriesId === id && s.time === time);
}

describe("categoryTimesOf", () => {
  it("unions instants in first-seen order, not sorted", () => {
    const a = series("a", [1, 2]);
    const lateFirst: Series = {
      id: "late",
      label: "late",
      data: [
        { t: new Date(T2), y: 9 },
        { t: new Date(T0), y: 1 },
      ],
    };
    expect(categoryTimesOf(visible([lateFirst, a]))).toEqual([T2, T0, T1]);
  });

  it("keeps a missing reading's instant and drops an invalid one", () => {
    const keys = categoryTimesOf(
      visible([
        series("a", [1, null]),
        { id: "b", label: "b", data: [{ t: new Date(Number.NaN), y: 4 }] },
      ]),
    );
    expect(keys).toEqual([T0, T1]);
  });

  it("returns empty when nothing finite survives", () => {
    expect(categoryTimesOf(visible([]))).toEqual([]);
  });
});

describe("groupSeries", () => {
  it("stands every present reading on the zero baseline", () => {
    const segs = groupSeries(visible([series("a", [10, -4]), series("b", [3, 8])]), [T0, T1]);
    expect(byId(segs, "a", T0)).toEqual({
      seriesId: "a",
      seriesIndex: 0,
      time: T0,
      value: 10,
      y0: 0,
      y1: 10,
    });
    expect(byId(segs, "a", T1)).toMatchObject({ value: -4, y0: 0, y1: -4 });
    expect(byId(segs, "b", T0)).toMatchObject({ value: 3, y0: 0, y1: 3, seriesIndex: 1 });
    expect(segs).toHaveLength(4);
  });

  it("omits a missing or invalid reading rather than drawing zero", () => {
    const segs = groupSeries(
      visible([
        series("a", [5, null]),
        { id: "b", label: "b", data: [{ t: new Date(T0), y: Number.NaN }] },
      ]),
      [T0, T1],
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ seriesId: "a", time: T0, value: 5 });
  });
});

describe("stackSeries", () => {
  it("accumulates positives upward from zero", () => {
    const segs = stackSeries(visible([series("a", [10]), series("b", [20])]), [T0]);
    expect(byId(segs, "a", T0)).toMatchObject({ y0: 0, y1: 10, value: 10 });
    expect(byId(segs, "b", T0)).toMatchObject({ y0: 10, y1: 30, value: 20 });
  });

  it("accumulates negatives downward from zero", () => {
    const segs = stackSeries(visible([series("a", [-10]), series("b", [-5])]), [T0]);
    expect(byId(segs, "a", T0)).toMatchObject({ y0: 0, y1: -10, value: -10 });
    expect(byId(segs, "b", T0)).toMatchObject({ y0: -10, y1: -15, value: -5 });
  });

  it("lets mixed signs diverge about the baseline", () => {
    const segs = stackSeries(
      visible([series("a", [10, -8]), series("b", [-3, 6]), series("c", [4, -2])]),
      [T0, T1],
    );
    // T0: +10 and +4 up; -3 down.
    expect(byId(segs, "a", T0)).toMatchObject({ y0: 0, y1: 10 });
    expect(byId(segs, "c", T0)).toMatchObject({ y0: 10, y1: 14 });
    expect(byId(segs, "b", T0)).toMatchObject({ y0: 0, y1: -3 });
    // T1: +6 up; -8 then -2 down.
    expect(byId(segs, "b", T1)).toMatchObject({ y0: 0, y1: 6 });
    expect(byId(segs, "a", T1)).toMatchObject({ y0: 0, y1: -8 });
    expect(byId(segs, "c", T1)).toMatchObject({ y0: -8, y1: -10 });
  });

  it("does not let a missing reading become a zero in the picture", () => {
    const segs = stackSeries(visible([series("a", [10, null]), series("b", [5, 7])]), [T0, T1]);
    expect(byId(segs, "a", T1)).toBeUndefined();
    expect(byId(segs, "b", T1)).toMatchObject({ y0: 0, y1: 7 });
    expect(byId(segs, "b", T0)).toMatchObject({ y0: 10, y1: 15 });
  });

  it("draws a real zero as a zero-height segment at the baseline", () => {
    const segs = stackSeries(visible([series("a", [0])]), [T0]);
    expect(byId(segs, "a", T0)).toMatchObject({ value: 0, y0: 0, y1: 0 });
  });

  it("falls back to 0/value when the stack cell is non-finite", () => {
    const handmade: NormalizedSeries = {
      id: "a",
      label: "a",
      nullPolicy: "break",
      style: {},
      visible: true,
      sourceIndex: 0,
      data: [
        {
          t: new Date(T0),
          time: T0,
          y: Number.POSITIVE_INFINITY,
          sourceIndex: 0,
          state: "present",
        },
      ],
    };
    const segs = stackSeries([handmade], [T0]);
    expect(byId(segs, "a", T0)).toMatchObject({
      value: Number.POSITIVE_INFINITY,
      y0: 0,
      y1: Number.POSITIVE_INFINITY,
    });
  });
});

describe("stackedValueDomain", () => {
  it("spans the summed extents and contains zero", () => {
    const segs = stackSeries(
      visible([series("a", [10, -8]), series("b", [5, -4])]),
      [T0, T1],
    );
    expect(stackedValueDomain(segs)).toEqual([-12, 15]);
  });

  it("falls back to the empty sentinel when nothing is present", () => {
    expect(stackedValueDomain([])).toEqual([0, 1]);
  });

  it("ignores a segment whose value is missing", () => {
    expect(
      stackedValueDomain([
        {
          seriesId: "a",
          seriesIndex: 0,
          time: T0,
          value: null,
          y0: 0,
          y1: 9,
        },
      ]),
    ).toEqual([0, 1]);
  });
});

describe("groupInnerBand", () => {
  it("subdivides a category band, one slot per series", () => {
    const inner = groupInnerBand(["a", "b"], [100, 200], 0);
    expect(inner("a")).toBe(100);
    expect(inner("b")).toBe(150);
    expect(inner.bandwidth()).toBe(50);
  });

  it("defaults inner padding to 0.05", () => {
    const inner = groupInnerBand(["a", "b"], [0, 100]);
    expect(inner.paddingInner()).toBeCloseTo(0.05);
  });
});

describe("layoutBarRects — exact rectangles", () => {
  const keys = [T0, T1];
  const band = bandScale({
    domain: keys.map(String),
    range: [0, 200],
    padding: 0,
  });
  const seriesIds = ["a", "b"] as const;

  it("grouped vertical: inner-band x, min/abs y for a negative", () => {
    const segs = groupSeries(visible([series("a", [10, -20]), series("b", [5, 8])]), keys);
    const value = linearScale({ domain: [-20, 10], range: [100, 0], nice: false });
    const rects = layoutBarRects(segs, {
      mode: "grouped",
      orientation: "vertical",
      band,
      value,
      seriesIds,
      groupPadding: 0,
    });

    const a0 = rects.find((r) => r.seriesId === "a" && r.time === T0)!;
    const a1 = rects.find((r) => r.seriesId === "a" && r.time === T1)!;
    const inner0 = groupInnerBand(seriesIds, [band(String(T0))!, band(String(T0))! + band.bandwidth()], 0);

    expect(a0).toEqual({
      x: inner0("a"),
      y: value(10),
      width: inner0.bandwidth(),
      height: Math.abs(value(10) - value(0)),
      seriesId: "a",
      time: T0,
      value: 10,
      y0: 0,
      y1: 10,
    });
    // Negative hangs below the baseline: y is the smaller pixel (closer to the
    // bottom of an inverted range), height is the absolute distance.
    expect(a1.y).toBe(Math.min(value(0), value(-20)));
    expect(a1.height).toBe(Math.abs(value(-20) - value(0)));
    expect(a1.height).toBeGreaterThan(0);
    expect(rects).toHaveLength(4);
  });

  it("grouped horizontal: the same geometry on the other axis", () => {
    const segs = groupSeries(visible([series("a", [10, -20]), series("b", [5, 8])]), keys);
    const value = linearScale({ domain: [-20, 10], range: [0, 100], nice: false });
    const hBand = bandScale({ domain: keys.map(String), range: [0, 80], padding: 0 });
    const rects = layoutBarRects(segs, {
      mode: "grouped",
      orientation: "horizontal",
      band: hBand,
      value,
      seriesIds,
      groupPadding: 0,
    });
    const a1 = rects.find((r) => r.seriesId === "a" && r.time === T1)!;
    expect(a1.x).toBe(Math.min(value(0), value(-20)));
    expect(a1.width).toBe(Math.abs(value(-20) - value(0)));
    expect(a1.height).toBe(
      groupInnerBand(seriesIds, [hBand(String(T1))!, hBand(String(T1))! + hBand.bandwidth()], 0).bandwidth(),
    );
  });

  it("stacked vertical: each segment uses its own y0/y1, not the baseline", () => {
    const segs = stackSeries(visible([series("a", [10, -8]), series("b", [5, 6])]), keys);
    const domain = stackedValueDomain(segs);
    const value = linearScale({ domain, range: [100, 0], nice: false });
    const rects = layoutBarRects(segs, {
      mode: "stacked",
      orientation: "vertical",
      band,
      value,
      seriesIds,
    });

    const b0 = rects.find((r) => r.seriesId === "b" && r.time === T0)!;
    expect(b0.x).toBe(band(String(T0)));
    expect(b0.width).toBe(band.bandwidth());
    expect(b0.y).toBe(Math.min(value(10), value(15)));
    expect(b0.height).toBe(Math.abs(value(15) - value(10)));

    const a1 = rects.find((r) => r.seriesId === "a" && r.time === T1)!;
    expect(a1.y).toBe(Math.min(value(0), value(-8)));
    expect(a1.height).toBe(Math.abs(value(-8) - value(0)));
  });

  it("stacked horizontal: negatives run left of the baseline", () => {
    const segs = stackSeries(visible([series("a", [-10]), series("b", [-5])]), [T0]);
    const value = linearScale({
      domain: stackedValueDomain(segs),
      range: [0, 100],
      nice: false,
    });
    const hBand = bandScale({ domain: [String(T0)], range: [0, 40], padding: 0 });
    const rects = layoutBarRects(segs, {
      mode: "stacked",
      orientation: "horizontal",
      band: hBand,
      value,
      seriesIds,
    });
    const a = rects.find((r) => r.seriesId === "a")!;
    const b = rects.find((r) => r.seriesId === "b")!;
    expect(a.x).toBe(Math.min(value(0), value(-10)));
    expect(a.width).toBe(Math.abs(value(-10) - value(0)));
    expect(b.x).toBe(Math.min(value(-10), value(-15)));
    expect(b.width).toBe(Math.abs(value(-15) - value(-10)));
    expect(a.y).toBe(hBand(String(T0)));
    expect(a.height).toBe(hBand.bandwidth());
  });

  it("skips a segment whose scaled pixels are not finite", () => {
    const segs = groupSeries(visible([series("a", [10])]), [T0]);
    const band = bandScale({ domain: [String(T0)], range: [0, 100], padding: 0 });
    const broken = linearScale({ domain: [0, 10], range: [0, 100], nice: false });
    const value = Object.assign((n: number) => (n === 10 ? Number.NaN : broken(n)), broken);
    expect(
      layoutBarRects(segs, {
        mode: "stacked",
        orientation: "vertical",
        band,
        value: value as typeof broken,
        seriesIds: ["a"],
      }),
    ).toEqual([]);
  });

  it("skips a grouped segment whose series is not on the inner band", () => {
    const segs = groupSeries(visible([series("a", [10])]), [T0]);
    const band = bandScale({ domain: [String(T0)], range: [0, 100], padding: 0 });
    const value = linearScale({ domain: [0, 10], range: [100, 0], nice: false });
    expect(
      layoutBarRects(segs, {
        mode: "grouped",
        orientation: "vertical",
        band,
        value,
        seriesIds: ["other"],
        groupPadding: 0,
      }),
    ).toEqual([]);
  });

  it("skips a segment whose value is missing", () => {
    const band = bandScale({ domain: [String(T0)], range: [0, 100], padding: 0 });
    const value = linearScale({ domain: [0, 10], range: [100, 0], nice: false });
    expect(
      layoutBarRects(
        [
          {
            seriesId: "a",
            seriesIndex: 0,
            time: T0,
            value: null,
            y0: 0,
            y1: 10,
          },
        ],
        {
          mode: "stacked",
          orientation: "vertical",
          band,
          value,
          seriesIds: ["a"],
        },
      ),
    ).toEqual([]);
  });

  it("skips a segment whose category is not on the band", () => {
    const segs = groupSeries(visible([series("a", [10])]), [T0]);
    const emptyBand = bandScale({ domain: ["other"], range: [0, 100] });
    const value = linearScale({ domain: [0, 10], range: [100, 0], nice: false });
    expect(
      layoutBarRects(segs, {
        mode: "grouped",
        orientation: "vertical",
        band: emptyBand,
        value,
        seriesIds: ["a"],
      }),
    ).toEqual([]);
  });
});

describe("locateBarRect", () => {
  const rects = [
    { x: 0, y: 0, width: 10, height: 10, seriesId: "a", time: T0, value: 1, y0: 0, y1: 1 },
    { x: 10, y: 0, width: 10, height: 10, seriesId: "b", time: T0, value: 2, y0: 0, y1: 2 },
  ];

  it("returns the first containing rectangle", () => {
    expect(locateBarRect(rects, 5, 5)).toBe(0);
    expect(locateBarRect(rects, 10, 5)).toBe(1);
  });

  it("returns -1 when the point is outside every rectangle", () => {
    expect(locateBarRect(rects, 99, 99)).toBe(-1);
    expect(locateBarRect([], 0, 0)).toBe(-1);
  });
});

describe("grouped domain matches the single-series value-domain rule", () => {
  it("is the extent of the individual values, not their sums", () => {
    const model = normalizeSeries([series("a", [10, -2]), series("b", [4, 8])], LENIENT);
    expect(valueDomainOf(model.visible)).toEqual([-2, 10]);
    const stacked = stackedValueDomain(stackSeries(model.visible, categoryTimesOf(model.visible)));
    expect(stacked).toEqual([-2, 14]);
    expect(stacked[1]).toBeGreaterThan(valueDomainOf(model.visible)[1]);
  });
});
