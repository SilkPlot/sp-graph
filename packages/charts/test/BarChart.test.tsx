/**
 * BarChart renders one `<rect>` per datum from a bandScale (x) + linearScale
 * (y) composed in @silkplot/core. The subtle part is bar geometry for
 * negative values: a bar always spans from the zero baseline to the datum's
 * value, so `y` must be the smaller pixel coordinate and `height` the
 * absolute distance — a negative `height` attribute is invalid SVG and would
 * silently fail to render. These tests cross-check against the same scale
 * constructors the component uses, never hardcoding d3-derived numbers.
 *
 * Every case here renders once and never moves. Replacing the series on a
 * MOUNTED chart is the reactive-model surface and lives in
 * `BarChart-reactive.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { BarChart } from "../src/index";
import type { CategoryPoint } from "../src/index";
import { bandScale, computeBandTicks } from "@silkplot/core";
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
 * `"zero-baseline"` is named here rather than inherited from a shared default:
 * bars are drawn FROM zero, so the domain must contain it. That is AreaChart's
 * policy and deliberately NOT LineChart's `"zero-floor"`, which would leave the
 * top bound at the data maximum and put an all-negative chart's baseline
 * off-canvas.
 */
function expectedScales(data: readonly CategoryPoint[], padding?: number) {
  return {
    x: bandScale({ domain: data.map((d) => d.label), range: [0, INNER_WIDTH], padding }),
    y: expectedYScale(data.map((d) => d.y), "zero-baseline", INNER_HEIGHT),
  };
}

const ALL_POSITIVE: CategoryPoint[] = [
  { label: "a", y: 10 },
  { label: "b", y: 25 },
  { label: "c", y: 5 },
];

const MIXED: CategoryPoint[] = [
  { label: "a", y: 10 },
  { label: "b", y: -15 },
  { label: "c", y: -3 },
  { label: "d", y: 7 },
];

describe("BarChart — bar count and geometry", () => {
  it("renders one <rect> per datum", () => {
    const { container } = render(() => (
      <BarChart title="Sales by region" data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    expect(getBars(container)).toHaveLength(ALL_POSITIVE.length);
  });

  it("gives every bar the band scale's bandwidth as its width", () => {
    const { container } = render(() => (
      <BarChart title="Sales by region" data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    const { x } = expectedScales(ALL_POSITIVE);
    const bandwidth = x.bandwidth();
    for (const rect of getBars(container)) {
      expect(num(rect, "width")).toBeCloseTo(bandwidth);
    }
  });

  it("positions each bar at the band scale's x for its label", () => {
    const { container } = render(() => (
      <BarChart title="Sales by region" data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    const { x } = expectedScales(ALL_POSITIVE);
    const bars = getBars(container);
    ALL_POSITIVE.forEach((d, i) => {
      const expectedX = x(d.label);
      expect(expectedX).toBeDefined();
      expect(num(bars[i] as SVGRectElement, "x")).toBeCloseTo(expectedX as number);
    });
  });

  it("all-positive data: every bar's y sits at or above the zero baseline", () => {
    const { container } = render(() => (
      <BarChart title="Sales by region" data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    const { y } = expectedScales(ALL_POSITIVE);
    const baseline = y(0);
    for (const rect of getBars(container)) {
      expect(num(rect, "y")).toBeLessThanOrEqual(baseline);
      expect(num(rect, "height")).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("BarChart — negative values", () => {
  it("gives a negative datum a positive height and a y at (not below) the baseline", () => {
    const data: CategoryPoint[] = [{ label: "only", y: -20 }];
    const { container } = render(() => (
      <BarChart title="Sales by region" data={data} width={WIDTH} height={HEIGHT} />
    ));
    const { y } = expectedScales(data);
    const baseline = y(0);
    const bars = getBars(container);
    expect(bars).toHaveLength(1);
    const rect = bars[0] as SVGRectElement;

    const rectY = num(rect, "y");
    const rectHeight = num(rect, "height");

    // Negative bar hangs BELOW the baseline: its top (y) is at the baseline,
    // and it extends downward by `height`.
    expect(rectY).toBeCloseTo(baseline);
    expect(rectHeight).toBeGreaterThan(0);
    expect(rectY + rectHeight).toBeCloseTo(y(-20));
  });

  it("mixed positive/negative data: every bar has non-negative height, and negative bars sit below the baseline", () => {
    const { container } = render(() => (
      <BarChart title="Sales by region" data={MIXED} width={WIDTH} height={HEIGHT} />
    ));
    const { y } = expectedScales(MIXED);
    const baseline = y(0);
    const bars = getBars(container);
    expect(bars).toHaveLength(MIXED.length);

    MIXED.forEach((d, i) => {
      const rect = bars[i] as SVGRectElement;
      const rectY = num(rect, "y");
      const rectHeight = num(rect, "height");
      expect(rectHeight).toBeGreaterThanOrEqual(0);

      if (d.y >= 0) {
        expect(rectY).toBeLessThanOrEqual(baseline);
        expect(rectY + rectHeight).toBeCloseTo(baseline);
      } else {
        expect(rectY).toBeCloseTo(baseline);
        expect(rectY + rectHeight).toBeCloseTo(y(d.y));
      }
    });
  });
});

describe("BarChart — axes", () => {
  it("renders a bottom band axis with one label per category, matching computeBandTicks", () => {
    const { container } = render(() => (
      <BarChart title="Sales by region" data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    const { x } = expectedScales(ALL_POSITIVE);
    const expectedTicks = computeBandTicks(x);

    expect(container.querySelector('g[data-silkplot-axis="bottom"]')).not.toBeNull();
    expect(axisLabels(container, "bottom")).toEqual(expectedTicks.map((t) => t.label));
  });

  it("renders a left linear axis", () => {
    const { container } = render(() => (
      <BarChart title="Sales by region" data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    expect(container.querySelector('g[data-silkplot-axis="left"]')).not.toBeNull();
  });
});

describe("BarChart — edge cases", () => {
  it("empty data does not throw and renders no bars", () => {
    expect(() =>
      render(() => <BarChart title="Sales by region" data={[]} width={WIDTH} height={HEIGHT} />),
    ).not.toThrow();
    const { container } = render(() => (
      <BarChart title="Sales by region" data={[]} width={WIDTH} height={HEIGHT} />
    ));
    expect(getBars(container)).toHaveLength(0);
  });

  it("emits no NaN in any rendered geometry attribute", () => {
    const { container } = render(() => (
      <BarChart title="Sales by region" data={MIXED} width={WIDTH} height={HEIGHT} />
    ));
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expectNoNaN(container, "*", RECT_ATTRS);
  });

  it("applies the accessible title", () => {
    const { container } = render(() => (
      <BarChart data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} title="Category totals" />
    ));
    expect(container.querySelector("svg > title")?.textContent).toBe("Category totals");
  });
});

describe("BarChart — padding prop", () => {
  it("passes an explicit padding through to the band scale, changing bandwidth", () => {
    const { container: narrow } = render(() => (
      <BarChart title="Sales by region" data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} padding={0.5} />
    ));
    const { x: xNarrow } = expectedScales(ALL_POSITIVE, 0.5);
    const bars = getBars(narrow);
    for (const rect of bars) {
      expect(num(rect, "width")).toBeCloseTo(xNarrow.bandwidth());
    }
    // Sanity: a larger padding must shrink bandwidth relative to the default.
    const { x: xDefault } = expectedScales(ALL_POSITIVE);
    expect(xNarrow.bandwidth()).toBeLessThan(xDefault.bandwidth());
  });
});
