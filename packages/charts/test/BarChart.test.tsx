/**
 * BarChart renders one `<rect>` per datum from a bandScale (x) + linearScale
 * (y) composed in @silkplot/core. The subtle part is bar geometry for
 * negative values: a bar always spans from the zero baseline to the datum's
 * value, so `y` must be the smaller pixel coordinate and `height` the
 * absolute distance — a negative `height` attribute is invalid SVG and would
 * silently fail to render. These tests cross-check against the same scale
 * constructors the component uses, never hardcoding d3-derived numbers.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { BarChart } from "../src/index";
import type { CategoryPoint } from "../src/index";
import { bandScale, linearScale, computeBandTicks, extentOf } from "@silkplot/core";
import { DEFAULT_MARGINS, resolveBounds } from "@silkplot/solid";

const WIDTH = 400;
const HEIGHT = 300;

/** Rebuild the same bounds ChartRoot resolves for fixed width/height + default margins. */
function bounds(width = WIDTH, height = HEIGHT) {
  return resolveBounds(width, height, DEFAULT_MARGINS);
}

/** Rebuild the exact x/y scales BarChart composes internally, for cross-checking. */
function expectedScales(data: readonly CategoryPoint[], padding?: number) {
  const b = bounds();
  const x = bandScale({
    domain: data.map((d) => d.label),
    range: [0, b.innerWidth],
    padding,
  });
  const [lo, hi] = extentOf(data, (d) => d.y);
  const y = linearScale({
    domain: [Math.min(0, lo), Math.max(0, hi)],
    range: [b.innerHeight, 0],
  });
  return { x, y };
}

function getBars(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect"));
}

function num(el: Element, attr: string): number {
  const raw = el.getAttribute(attr);
  expect(raw, `expected <${el.tagName}> to have a numeric "${attr}" attribute`).not.toBeNull();
  const value = Number(raw);
  expect(Number.isNaN(value), `"${attr}"="${raw}" parsed as NaN`).toBe(false);
  return value;
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
      <BarChart data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    expect(getBars(container)).toHaveLength(ALL_POSITIVE.length);
  });

  it("gives every bar the band scale's bandwidth as its width", () => {
    const { container } = render(() => (
      <BarChart data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    const { x } = expectedScales(ALL_POSITIVE);
    const bandwidth = x.bandwidth();
    for (const rect of getBars(container)) {
      expect(num(rect, "width")).toBeCloseTo(bandwidth);
    }
  });

  it("positions each bar at the band scale's x for its label", () => {
    const { container } = render(() => (
      <BarChart data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
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
      <BarChart data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
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
      <BarChart data={data} width={WIDTH} height={HEIGHT} />
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
      <BarChart data={MIXED} width={WIDTH} height={HEIGHT} />
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
      <BarChart data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    const { x } = expectedScales(ALL_POSITIVE);
    const expectedTicks = computeBandTicks(x);

    const bottomAxis = container.querySelector('g[data-silkplot-axis="bottom"]');
    expect(bottomAxis).not.toBeNull();
    const labels = Array.from(bottomAxis?.querySelectorAll("text") ?? []).map(
      (t) => t.textContent,
    );
    expect(labels).toEqual(expectedTicks.map((t) => t.label));
  });

  it("renders a left linear axis", () => {
    const { container } = render(() => (
      <BarChart data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} />
    ));
    expect(container.querySelector('g[data-silkplot-axis="left"]')).not.toBeNull();
  });
});

describe("BarChart — edge cases", () => {
  it("empty data does not throw and renders no bars", () => {
    expect(() =>
      render(() => <BarChart data={[]} width={WIDTH} height={HEIGHT} />),
    ).not.toThrow();
    const { container } = render(() => (
      <BarChart data={[]} width={WIDTH} height={HEIGHT} />
    ));
    expect(getBars(container)).toHaveLength(0);
  });

  it("emits no NaN in any rendered geometry attribute", () => {
    const { container } = render(() => (
      <BarChart data={MIXED} width={WIDTH} height={HEIGHT} />
    ));
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    for (const attr of ["x", "y", "width", "height"]) {
      for (const el of Array.from(container.querySelectorAll(`[${attr}]`))) {
        expect(el.getAttribute(attr)).not.toContain("NaN");
      }
    }
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
      <BarChart data={ALL_POSITIVE} width={WIDTH} height={HEIGHT} padding={0.5} />
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
