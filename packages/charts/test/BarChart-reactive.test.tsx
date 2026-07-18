/**
 * BarChart under a series REPLACEMENT on a mounted chart — the reactive-model
 * surface, split out from `BarChart.test.tsx` (whose cases each render once and
 * never move). See `LineChart-reactive.test.tsx` for why the fixed-data tests
 * cannot reach this and why these watch Y.
 *
 * BarChart is the sharpest case of the underlying split. Its band x scale is
 * built inside the `x` thunk, which was always reactive, and each `<rect>` reads
 * `props.data` live — so against the captured-data bug the bars moved to their
 * new categories at their new widths while `model.y()` stayed on the old domain.
 * Every bar was positioned correctly across and wrongly up. A test that checked
 * only `x`/`width` would have passed and proved nothing.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { BarChart } from "../src/index";
import type { CategoryPoint } from "../src/index";
import { bandScale } from "@silkplot/core";
import {
  HEIGHT,
  INNER_HEIGHT,
  INNER_WIDTH,
  WIDTH,
  axisLabels,
  bars as getBars,
  expectNoNaN,
  expectedYScale,
  num,
} from "./support";

/** The geometry attributes a `<rect>` can silently render nothing from. */
const RECT_ATTRS = ["x", "y", "width", "height"] as const;

/**
 * Rebuild the x/y scales BarChart composes, for cross-checking.
 *
 * `"zero-baseline"` is named here rather than imported from a shared default —
 * `support.ts` deliberately refuses to pick a policy for its callers, so each
 * suite declares the one its chart is supposed to hold. Bars are drawn FROM
 * zero, so the domain must contain it. That is AreaChart's policy and
 * deliberately NOT LineChart's `"zero-floor"`, which would leave the top bound
 * at the data maximum and put an all-negative chart's baseline off-canvas.
 */
function expectedScales(data: readonly CategoryPoint[], padding?: number) {
  return {
    x: bandScale({ domain: data.map((d) => d.label), range: [0, INNER_WIDTH], padding }),
    y: expectedYScale(data.map((d) => d.y), "zero-baseline", INNER_HEIGHT),
  };
}

describe("BarChart — data replacement", () => {
  const BEFORE: CategoryPoint[] = [
    { label: "a", y: 10 },
    { label: "b", y: 25 },
    { label: "c", y: 5 },
  ];
  // Not a uniform scaling of BEFORE: a proportional series lands on the same
  // pixels and cannot tell a live scale from a frozen one.
  const AFTER: CategoryPoint[] = [
    { label: "a", y: 400 },
    { label: "b", y: 900 },
    { label: "c", y: 30 },
  ];

  /** Assert every bar's geometry is the one the CURRENT series implies. */
  function expectBarsTrack(container: HTMLElement, data: readonly CategoryPoint[]): void {
    const { x, y } = expectedScales(data);
    const baseline = y(0);
    const bars = getBars(container);
    expect(bars).toHaveLength(data.length);

    data.forEach((d, i) => {
      const rect = bars[i] as SVGRectElement;
      const rectX = num(rect, "x");
      const rectY = num(rect, "y");
      const rectHeight = num(rect, "height");
      const value = y(d.y);

      expect(Number.isFinite(rectY)).toBe(true);
      expect(Number.isFinite(rectHeight)).toBe(true);
      expect(rectX).toBeCloseTo(x(d.label) as number);
      expect(num(rect, "width")).toBeCloseTo(x.bandwidth());
      // A bar spans baseline -> value, so `y` is the smaller pixel coordinate
      // and `height` the absolute distance, whichever side of zero it is on.
      expect(rectY).toBeCloseTo(Math.min(baseline, value));
      expect(rectHeight).toBeCloseTo(Math.abs(value - baseline));
      expect(rectY).toBeGreaterThanOrEqual(-1e-6);
      expect(rectY + rectHeight).toBeLessThanOrEqual(INNER_HEIGHT + 1e-6);
    });
  }

  it("rescales y when the values change", () => {
    const [data, setData] = createSignal<CategoryPoint[]>(BEFORE);
    const { container } = render(() => <BarChart title="Sales by region" data={data()} width={WIDTH} height={HEIGHT} />);
    expectBarsTrack(container, BEFORE);

    setData(AFTER);

    expectBarsTrack(container, AFTER);
    // Guard against a vacuous pass: a shared y-domain would satisfy the
    // assertions above without the scale ever recomputing.
    expect(expectedScales(AFTER).y.domain()).not.toEqual(expectedScales(BEFORE).y.domain());
  });

  it("rescales y and rebuilds the band domain when the categories change", () => {
    const relabelled: CategoryPoint[] = [
      { label: "x", y: 300 },
      { label: "y", y: 60 },
      { label: "z", y: 800 },
    ];
    const [data, setData] = createSignal<CategoryPoint[]>(BEFORE);
    const { container } = render(() => <BarChart title="Sales by region" data={data()} width={WIDTH} height={HEIGHT} />);

    setData(relabelled);

    expectBarsTrack(container, relabelled);
    // The band axis must relabel too — the categories are entirely new.
    expect(axisLabels(container, "bottom")).toEqual(relabelled.map((d) => d.label));
    expect(expectedScales(relabelled).y.domain()).not.toEqual(expectedScales(BEFORE).y.domain());
  });

  it("rescales y when the cardinality changes", () => {
    const longer: CategoryPoint[] = [
      { label: "a", y: 10 },
      { label: "b", y: 25 },
      { label: "c", y: 5 },
      { label: "d", y: 120 },
      { label: "e", y: 60 },
    ];
    const [data, setData] = createSignal<CategoryPoint[]>(BEFORE);
    const { container } = render(() => <BarChart title="Sales by region" data={data()} width={WIDTH} height={HEIGHT} />);

    setData(longer);

    // More bars, each narrower, and a domain grown to fit the new maximum.
    expectBarsTrack(container, longer);
    expect(expectedScales(longer).x.bandwidth()).toBeLessThan(expectedScales(BEFORE).x.bandwidth());
    expect(expectedScales(longer).y.domain()).not.toEqual(expectedScales(BEFORE).y.domain());
  });

  it("moves the zero baseline when a negative series is replaced by a positive one", () => {
    const negative: CategoryPoint[] = [
      { label: "a", y: -20 },
      { label: "b", y: -5 },
    ];
    const positive: CategoryPoint[] = [
      { label: "a", y: 12 },
      { label: "b", y: 30 },
    ];
    const [data, setData] = createSignal<CategoryPoint[]>(negative);
    const { container } = render(() => <BarChart title="Sales by region" data={data()} width={WIDTH} height={HEIGHT} />);
    // All-negative: every bar hangs from a baseline at the top of the area.
    expect(expectedScales(negative).y(0)).toBeCloseTo(0);
    expectBarsTrack(container, negative);

    setData(positive);

    // All-positive: the baseline is now the bottom. A stale scale would leave
    // every bar hanging off the top edge with a wildly wrong height.
    expect(expectedScales(positive).y(0)).toBeCloseTo(INNER_HEIGHT);
    expectBarsTrack(container, positive);
    // Guard: this case only means anything because the baseline pixel MOVED.
    expect(expectedScales(positive).y(0)).not.toBeCloseTo(expectedScales(negative).y(0));
  });

  it("survives empty -> populated -> empty without emitting NaN", () => {
    const [data, setData] = createSignal<CategoryPoint[]>([]);
    const { container } = render(() => <BarChart title="Sales by region" data={data()} width={WIDTH} height={HEIGHT} />);
    const noNaN = (): void => expectNoNaN(container, "*", RECT_ATTRS);
    expect(getBars(container)).toHaveLength(0);
    noNaN();

    setData(AFTER);
    expectBarsTrack(container, AFTER);
    noNaN();

    setData([]);
    expect(getBars(container)).toHaveLength(0);
    noNaN();
  });
});
