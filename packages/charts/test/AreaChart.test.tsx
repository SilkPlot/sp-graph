/**
 * AreaChart renders a filled `areaPath` beneath a `linePath` stroke, sharing
 * LineChart's time/linear scales. These tests assert structure (an `<svg>`,
 * a non-empty, NaN-free `d` on both paths, both axes present) rather than
 * exact d3-derived path strings or tick counts, which are version-sensitive.
 * Widths/heights are passed explicitly so tests are synchronous and do not
 * depend on ChartRoot's async ResizeObserver measurement.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { AreaChart } from "../src/index";
import type { TimePoint } from "../src/index";
import { computeTicks, timeScale, linearScale } from "@silkplot/core";

const DATA: TimePoint[] = [
  { t: new Date(Date.UTC(2026, 0, 1)), y: 3 },
  { t: new Date(Date.UTC(2026, 0, 2)), y: 7 },
  { t: new Date(Date.UTC(2026, 0, 3)), y: 2 },
  { t: new Date(Date.UTC(2026, 0, 4)), y: 9 },
];

const WIDTH = 400;
const HEIGHT = 300;

function getPaths(container: HTMLElement): SVGPathElement[] {
  // Axis domain paths are also <path> elements; the chart's own area/line
  // paths are the ones without a `data-silkplot-axis` ancestor.
  return Array.from(container.querySelectorAll("svg > g > path")).filter(
    (p) => !p.closest("[data-silkplot-axis]"),
  ) as SVGPathElement[];
}

const NO_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Y coordinates of every point in a path `d`, in order. Only valid for
 * `curve="linear"` output (M/L commands) — the default monotoneX curve emits
 * bezier `C` segments whose control points are not data positions.
 */
function pathYs(d: string): number[] {
  return Array.from(d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)).map((m) => Number(m[2]));
}

/** The y-scale AreaChart builds internally, rebuilt here from the same inputs. */
function yScaleFor(data: readonly TimePoint[], innerHeight: number) {
  const values = data.map((d) => d.y);
  return linearScale({
    domain: [Math.min(0, ...values), Math.max(0, ...values)],
    range: [innerHeight, 0],
  });
}

describe("AreaChart — baseline geometry", () => {
  // The area is drawn FROM zero. If 0 falls outside the y-domain the fill's flat
  // edge lands on a pixel the axis labels as some other value — the fill would
  // contradict its own axis. These pin the baseline to the true zero position.
  it("closes on the zero baseline for an all-positive series", () => {
    const { container } = render(() => (
      <AreaChart data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const areaD = getPaths(container)[0]!.getAttribute("d")!;
    const zeroY = yScaleFor(DATA, HEIGHT)(0);

    // The closing edge (the last two points before Z) is the baseline.
    const ys = pathYs(areaD);
    expect(ys.at(-1)).toBeCloseTo(zeroY, 3);
    expect(ys.at(-2)).toBeCloseTo(zeroY, 3);
    expect(zeroY).toBeCloseTo(HEIGHT, 3); // all-positive -> zero at the bottom
  });

  it("keeps the zero baseline in range for an all-negative series", () => {
    const negative: TimePoint[] = [
      { t: new Date(Date.UTC(2026, 0, 1)), y: -10 },
      { t: new Date(Date.UTC(2026, 0, 2)), y: -2 },
    ];
    const { container } = render(() => (
      <AreaChart data={negative} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const areaD = getPaths(container)[0]!.getAttribute("d")!;
    const y = yScaleFor(negative, HEIGHT);
    const ys = pathYs(areaD);

    expect(ys.at(-1)).toBeCloseTo(y(0), 3);
    expect(y(0)).toBeCloseTo(0, 3); // all-negative -> zero at the top

    // The -2 datum must sit BELOW the baseline, not on it. Regression guard:
    // with a domain that excluded 0, -2 collapsed onto the baseline and that
    // end of the area had no height at all.
    expect(y(-2)).toBeGreaterThan(y(0));
    expect(ys.some((v) => Math.abs(v - y(-2)) < 0.001)).toBe(true);
  });
});

describe("AreaChart — structure", () => {
  it("renders an <svg>", () => {
    const { container } = render(() => <AreaChart data={DATA} width={WIDTH} height={HEIGHT} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders a filled area <path> with a non-empty d, beneath a stroked line <path>", () => {
    const { container } = render(() => <AreaChart data={DATA} width={WIDTH} height={HEIGHT} />);
    const paths = getPaths(container);
    expect(paths).toHaveLength(2);

    const [areaEl, lineEl] = paths as [SVGPathElement, SVGPathElement];
    const areaD = areaEl.getAttribute("d") ?? "";
    const lineD = lineEl.getAttribute("d") ?? "";

    expect(areaD.length).toBeGreaterThan(0);
    expect(areaD.startsWith("M")).toBe(true);
    expect(areaEl.getAttribute("fill")).not.toBe("none");
    expect(areaEl.getAttribute("fill")).not.toBeNull();

    expect(lineD.length).toBeGreaterThan(0);
    expect(lineD.startsWith("M")).toBe(true);
    expect(lineEl.getAttribute("fill")).toBe("none");
    expect(lineEl.getAttribute("stroke")).not.toBe("none");
  });

  it("renders both a left and a bottom axis", () => {
    const { container } = render(() => <AreaChart data={DATA} width={WIDTH} height={HEIGHT} />);
    expect(container.querySelector('g[data-silkplot-axis="left"]')).not.toBeNull();
    expect(container.querySelector('g[data-silkplot-axis="bottom"]')).not.toBeNull();
  });

  it("applies the accessible title as an <svg><title>", () => {
    const { container } = render(() => (
      <AreaChart data={DATA} width={WIDTH} height={HEIGHT} title="Daily totals" />
    ));
    expect(container.querySelector("svg > title")?.textContent).toBe("Daily totals");
  });
});

describe("AreaChart — ticks match @silkplot/core computeTicks", () => {
  it("bottom axis tick count matches computeTicks for the equivalent time scale", () => {
    const { container } = render(() => <AreaChart data={DATA} width={WIDTH} height={HEIGHT} />);
    const bottomAxis = container.querySelector('g[data-silkplot-axis="bottom"]') as SVGGElement;
    const margins = { top: 8, right: 12, bottom: 24, left: 40 };
    const innerWidth = WIDTH - margins.left - margins.right;

    const x = timeScale({
      domain: [DATA[0]!.t, DATA[DATA.length - 1]!.t],
      range: [0, innerWidth],
    });
    const expectedTicks = computeTicks(x, {});
    const tickGroups = bottomAxis.querySelectorAll(":scope > g");
    expect(tickGroups).toHaveLength(expectedTicks.length);
  });

  it("left axis tick count matches computeTicks for the equivalent linear scale", () => {
    const { container } = render(() => <AreaChart data={DATA} width={WIDTH} height={HEIGHT} />);
    const leftAxis = container.querySelector('g[data-silkplot-axis="left"]') as SVGGElement;
    const margins = { top: 8, right: 12, bottom: 24, left: 40 };
    const innerHeight = HEIGHT - margins.top - margins.bottom;

    const values = DATA.map((d) => d.y);
    const lo = Math.min(0, ...values);
    const hi = Math.max(...values);
    const y = linearScale({ domain: [lo, hi], range: [innerHeight, 0] });
    const expectedTicks = computeTicks(y, {});
    const tickGroups = leftAxis.querySelectorAll(":scope > g");
    expect(tickGroups).toHaveLength(expectedTicks.length);
  });
});

describe("AreaChart — empty data", () => {
  it("does not throw and produces no NaN in the area or line path d", () => {
    expect(() => render(() => <AreaChart data={[]} width={WIDTH} height={HEIGHT} />)).not.toThrow();

    const { container } = render(() => <AreaChart data={[]} width={WIDTH} height={HEIGHT} />);
    const paths = container.querySelectorAll("path");
    paths.forEach((p) => {
      const d = p.getAttribute("d") ?? "";
      expect(d).not.toContain("NaN");
    });
  });
});

describe("AreaChart — props", () => {
  it("applies custom fill, fillOpacity, stroke, and strokeWidth", () => {
    const { container } = render(() => (
      <AreaChart
        data={DATA}
        width={WIDTH}
        height={HEIGHT}
        fill="steelblue"
        fillOpacity={0.5}
        stroke="navy"
        strokeWidth={3}
      />
    ));
    const [areaEl, lineEl] = getPaths(container) as [SVGPathElement, SVGPathElement];
    expect(areaEl.getAttribute("fill")).toBe("steelblue");
    expect(areaEl.getAttribute("fill-opacity")).toBe("0.5");
    expect(lineEl.getAttribute("stroke")).toBe("navy");
    expect(lineEl.getAttribute("stroke-width")).toBe("3");
  });

  it("defaults fill/stroke to currentColor and fillOpacity to 0.2", () => {
    const { container } = render(() => <AreaChart data={DATA} width={WIDTH} height={HEIGHT} />);
    const [areaEl, lineEl] = getPaths(container) as [SVGPathElement, SVGPathElement];
    expect(areaEl.getAttribute("fill")).toBe("currentColor");
    expect(areaEl.getAttribute("fill-opacity")).toBe("0.2");
    expect(lineEl.getAttribute("stroke")).toBe("currentColor");
  });
});
