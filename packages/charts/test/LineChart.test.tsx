/**
 * LineChart is the flagship chart: a `linePath` stroke over time/linear
 * scales, with no fill and no baseline. These tests assert structure (an
 * `<svg>`, a single non-empty, NaN-free `d` starting with "M", both axes
 * present), tick counts cross-checked against `computeTicks` on an
 * equivalently-built scale, and the y-domain quirk that sets it apart from
 * Area/Bar: `[Math.min(0, lo), hi]`, NOT `[min(0, lo), max(0, hi)]`, because a
 * line has no baseline to honour. Widths/heights are passed explicitly so
 * tests are synchronous and do not depend on ChartRoot's async
 * ResizeObserver measurement.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { LineChart } from "../src/index";
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
const MARGINS = { top: 8, right: 12, bottom: 24, left: 40 };
const NO_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 };

function getPaths(container: HTMLElement): SVGPathElement[] {
  // Axis domain paths are also <path> elements; the chart's own line path is
  // the one without a `data-silkplot-axis` ancestor.
  return Array.from(container.querySelectorAll("svg > g > path")).filter(
    (p) => !p.closest("[data-silkplot-axis]"),
  ) as SVGPathElement[];
}

/**
 * Y coordinates of every point in a path `d`, in order. Only valid for
 * `curve="linear"` output (M/L commands) — the default monotoneX curve emits
 * bezier `C` segments whose control points are not data positions.
 */
function pathYs(d: string): number[] {
  return Array.from(d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)).map((m) => Number(m[2]));
}

/** The x/y scales LineChart builds internally, rebuilt here from the same inputs. */
function scalesFor(data: readonly TimePoint[], innerWidth: number, innerHeight: number) {
  const x = timeScale({
    domain: [data[0]?.t ?? new Date(0), data[data.length - 1]?.t ?? new Date(1)],
    range: [0, innerWidth],
  });
  const values = data.map((d) => d.y);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = linearScale({
    domain: [Math.min(0, lo), hi],
    range: [innerHeight, 0],
  });
  return { x, y };
}

describe("LineChart — structure", () => {
  it("renders an <svg>", () => {
    const { container } = render(() => <LineChart data={DATA} width={WIDTH} height={HEIGHT} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders exactly one chart <path> with a non-empty, 'M'-starting d, fill none, and a stroke", () => {
    const { container } = render(() => <LineChart data={DATA} width={WIDTH} height={HEIGHT} />);
    const paths = getPaths(container);
    expect(paths).toHaveLength(1);

    const lineEl = paths[0]!;
    const d = lineEl.getAttribute("d") ?? "";
    expect(d.length).toBeGreaterThan(0);
    expect(d.startsWith("M")).toBe(true);
    expect(lineEl.getAttribute("fill")).toBe("none");
    expect(lineEl.getAttribute("stroke")).not.toBeNull();
    expect(lineEl.getAttribute("stroke")).not.toBe("none");
  });

  it("renders both a left and a bottom axis", () => {
    const { container } = render(() => <LineChart data={DATA} width={WIDTH} height={HEIGHT} />);
    expect(container.querySelector('g[data-silkplot-axis="left"]')).not.toBeNull();
    expect(container.querySelector('g[data-silkplot-axis="bottom"]')).not.toBeNull();
  });

  it("applies the accessible title as an <svg><title>", () => {
    const { container } = render(() => (
      <LineChart data={DATA} width={WIDTH} height={HEIGHT} title="Daily readings" />
    ));
    expect(container.querySelector("svg > title")?.textContent).toBe("Daily readings");
  });

  it("applies a custom class to the <svg>", () => {
    const { container } = render(() => (
      <LineChart data={DATA} width={WIDTH} height={HEIGHT} class="my-chart" />
    ));
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("my-chart");
  });
});

describe("LineChart — ticks match @silkplot/core computeTicks", () => {
  it("bottom axis tick count matches computeTicks for the equivalent time scale", () => {
    const { container } = render(() => <LineChart data={DATA} width={WIDTH} height={HEIGHT} />);
    const bottomAxis = container.querySelector('g[data-silkplot-axis="bottom"]') as SVGGElement;
    const innerWidth = WIDTH - MARGINS.left - MARGINS.right;
    const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

    const { x } = scalesFor(DATA, innerWidth, innerHeight);
    const expectedTicks = computeTicks(x, {});
    const tickGroups = bottomAxis.querySelectorAll(":scope > g");
    expect(tickGroups).toHaveLength(expectedTicks.length);
  });

  it("left axis tick count matches computeTicks for the equivalent linear scale", () => {
    const { container } = render(() => <LineChart data={DATA} width={WIDTH} height={HEIGHT} />);
    const leftAxis = container.querySelector('g[data-silkplot-axis="left"]') as SVGGElement;
    const innerWidth = WIDTH - MARGINS.left - MARGINS.right;
    const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

    const { y } = scalesFor(DATA, innerWidth, innerHeight);
    const expectedTicks = computeTicks(y, {});
    const tickGroups = leftAxis.querySelectorAll(":scope > g");
    expect(tickGroups).toHaveLength(expectedTicks.length);
  });
});

describe("LineChart — props", () => {
  it("defaults stroke to currentColor and strokeWidth to 1.5", () => {
    const { container } = render(() => <LineChart data={DATA} width={WIDTH} height={HEIGHT} />);
    const lineEl = getPaths(container)[0]!;
    expect(lineEl.getAttribute("stroke")).toBe("currentColor");
    expect(lineEl.getAttribute("stroke-width")).toBe("1.5");
  });

  it("applies a custom stroke and strokeWidth", () => {
    const { container } = render(() => (
      <LineChart data={DATA} width={WIDTH} height={HEIGHT} stroke="navy" strokeWidth={3} />
    ));
    const lineEl = getPaths(container)[0]!;
    expect(lineEl.getAttribute("stroke")).toBe("navy");
    expect(lineEl.getAttribute("stroke-width")).toBe("3");
  });
});

describe("LineChart — curve behaviour", () => {
  it("defaults to monotoneX: the no-curve-prop path matches an explicit curve='monotoneX' render", () => {
    const { container: defaultContainer } = render(() => (
      <LineChart data={DATA} width={WIDTH} height={HEIGHT} />
    ));
    const { container: explicitContainer } = render(() => (
      <LineChart data={DATA} width={WIDTH} height={HEIGHT} curve="monotoneX" />
    ));
    const defaultD = getPaths(defaultContainer)[0]!.getAttribute("d");
    const explicitD = getPaths(explicitContainer)[0]!.getAttribute("d");
    expect(defaultD).toBe(explicitD);

    // monotoneX emits cubic bezier segments ("C"), never plain lineto ("L").
    expect(defaultD).toContain("C");
    expect(defaultD).not.toContain("L");
  });

  it("curve='linear' emits lineto ('L') commands and differs from the monotoneX default", () => {
    const { container: linearContainer } = render(() => (
      <LineChart data={DATA} width={WIDTH} height={HEIGHT} curve="linear" />
    ));
    const { container: defaultContainer } = render(() => (
      <LineChart data={DATA} width={WIDTH} height={HEIGHT} />
    ));
    const linearD = getPaths(linearContainer)[0]!.getAttribute("d")!;
    const defaultD = getPaths(defaultContainer)[0]!.getAttribute("d")!;

    expect(linearD).toContain("L");
    expect(linearD).not.toContain("C");
    expect(linearD).not.toBe(defaultD);
  });
});

describe("LineChart — y-domain has no forced baseline (unlike Area/Bar)", () => {
  it("for an all-positive series, the y-domain low bound is 0 (min(0, lo)), matching linePath's own scale", () => {
    const { container } = render(() => (
      <LineChart data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const lineD = getPaths(container)[0]!.getAttribute("d")!;
    const { y } = scalesFor(DATA, WIDTH, HEIGHT);
    const ys = pathYs(lineD);

    // The minimum plotted y-value (3) does NOT sit at the bottom of the plot
    // area — the domain's low bound is forced to 0, below the data minimum.
    expect(y(0)).toBeCloseTo(HEIGHT, 3);
    DATA.forEach((d, i) => {
      expect(ys[i]).toBeCloseTo(y(d.y), 3);
    });
  });

  it("for an all-negative series, the y-domain high bound is the data max (not forced to 0)", () => {
    const negative: TimePoint[] = [
      { t: new Date(Date.UTC(2026, 0, 1)), y: -10 },
      { t: new Date(Date.UTC(2026, 0, 2)), y: -2 },
    ];
    const { container } = render(() => (
      <LineChart data={negative} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const lineD = getPaths(container)[0]!.getAttribute("d")!;
    const { y } = scalesFor(negative, WIDTH, HEIGHT);
    const ys = pathYs(lineD);

    // AreaChart/BarChart would force the domain high bound to max(0, hi) = 0,
    // pinning y(0) inside the visible range (at the top). LineChart's domain
    // high bound is just `hi` (the data max, -2 here), so the datum -2 — not
    // 0 — sits at the very top of the plot, and y(0) extrapolates to a
    // negative (off-canvas) pixel.
    expect(y(-2)).toBeCloseTo(0, 3);
    expect(y(0)).toBeLessThan(0);
    negative.forEach((d, i) => {
      expect(ys[i]).toBeCloseTo(y(d.y), 3);
    });
  });
});

describe("LineChart — empty and single-point data", () => {
  it("empty data does not throw and produces no NaN in the path d", () => {
    expect(() => render(() => <LineChart data={[]} width={WIDTH} height={HEIGHT} />)).not.toThrow();

    const { container } = render(() => <LineChart data={[]} width={WIDTH} height={HEIGHT} />);
    container.querySelectorAll("path").forEach((p) => {
      const d = p.getAttribute("d") ?? "";
      expect(d).not.toContain("NaN");
    });
  });

  it("single-point data does not throw and produces no NaN in the path d", () => {
    const single: TimePoint[] = [{ t: new Date(Date.UTC(2026, 0, 1)), y: 5 }];
    expect(() =>
      render(() => <LineChart data={single} width={WIDTH} height={HEIGHT} />),
    ).not.toThrow();

    const { container } = render(() => <LineChart data={single} width={WIDTH} height={HEIGHT} />);
    container.querySelectorAll("path").forEach((p) => {
      const d = p.getAttribute("d") ?? "";
      expect(d).not.toContain("NaN");
    });
  });
});
