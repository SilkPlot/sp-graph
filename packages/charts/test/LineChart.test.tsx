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
 *
 * Every case here renders once and never moves. Replacing the series on a
 * MOUNTED chart is the reactive-model surface and lives in
 * `LineChart-reactive.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";
import { computeTicks } from "@silkplot/core";
import {
  HEIGHT,
  INNER_HEIGHT,
  INNER_WIDTH,
  NO_MARGINS,
  WIDTH,
  axisTicks,
  expectNoNaN,
  expectedTimeXScale,
  expectedYScale,
  markD,
  markPaths as getPaths,
  pathYs,
} from "./support";

const DATA: TimePoint[] = [
  { t: new Date(Date.UTC(2026, 0, 1)), y: 3 },
  { t: new Date(Date.UTC(2026, 0, 2)), y: 7 },
  { t: new Date(Date.UTC(2026, 0, 3)), y: 2 },
  { t: new Date(Date.UTC(2026, 0, 4)), y: 9 },
];

/**
 * The scales LineChart composes, rebuilt from the same inputs.
 *
 * `"zero-floor"` is named here, not inherited from a shared default: it is
 * LineChart's own policy and the one thing that separates it from Area and Bar.
 * Passing `"zero-baseline"` here would make these tests agree with the wrong
 * chart, which is why the policy is spelled out at the call site.
 */
function scalesFor(data: readonly TimePoint[], innerWidth: number, innerHeight: number) {
  return {
    x: expectedTimeXScale(
      data.map((d) => d.t),
      innerWidth,
    ),
    y: expectedYScale(
      data.map((d) => d.y),
      "zero-floor",
      innerHeight,
    ),
  };
}

describe("LineChart — structure", () => {
  it("renders an <svg>", () => {
    const { container } = render(() => <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders exactly one chart <path> with a non-empty, 'M'-starting d, fill none, and a stroke", () => {
    const { container } = render(() => <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} />);
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
    const { container } = render(() => <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} />);
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
      <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} class="my-chart" />
    ));
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("my-chart");
  });
});

describe("LineChart — ticks match @silkplot/core computeTicks", () => {
  it("bottom axis tick count matches computeTicks for the equivalent time scale", () => {
    const { container } = render(() => <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} />);
    const { x } = scalesFor(DATA, INNER_WIDTH, INNER_HEIGHT);
    const expectedTicks = computeTicks(x, {});
    expect(axisTicks(container, "bottom")).toHaveLength(expectedTicks.length);
  });

  it("left axis tick count matches computeTicks for the equivalent linear scale", () => {
    const { container } = render(() => <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} />);
    const { y } = scalesFor(DATA, INNER_WIDTH, INNER_HEIGHT);
    const expectedTicks = computeTicks(y, {});
    expect(axisTicks(container, "left")).toHaveLength(expectedTicks.length);
  });
});

describe("LineChart — props", () => {
  it("defaults stroke to currentColor and strokeWidth to 1.5", () => {
    const { container } = render(() => <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} />);
    const lineEl = getPaths(container)[0]!;
    expect(lineEl.getAttribute("stroke")).toBe("currentColor");
    expect(lineEl.getAttribute("stroke-width")).toBe("1.5");
  });

  it("applies a custom stroke and strokeWidth", () => {
    const { container } = render(() => (
      <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} stroke="navy" strokeWidth={3} />
    ));
    const lineEl = getPaths(container)[0]!;
    expect(lineEl.getAttribute("stroke")).toBe("navy");
    expect(lineEl.getAttribute("stroke-width")).toBe("3");
  });
});

describe("LineChart — curve behaviour", () => {
  it("defaults to monotoneX: the no-curve-prop path matches an explicit curve='monotoneX' render", () => {
    const { container: defaultContainer } = render(() => (
      <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} />
    ));
    const { container: explicitContainer } = render(() => (
      <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} curve="monotoneX" />
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
      <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} curve="linear" />
    ));
    const { container: defaultContainer } = render(() => (
      <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} />
    ));
    const linearD = markD(linearContainer);
    const defaultD = markD(defaultContainer);

    expect(linearD).toContain("L");
    expect(linearD).not.toContain("C");
    expect(linearD).not.toBe(defaultD);
  });
});

describe("LineChart — y-domain has no forced baseline (unlike Area/Bar)", () => {
  it("for an all-positive series, the y-domain low bound is 0 (min(0, lo)), matching linePath's own scale", () => {
    const { container } = render(() => (
      <LineChart title="Daily readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const lineD = markD(container);
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
      <LineChart title="Daily readings" data={negative} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const lineD = markD(container);
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
    expect(() => render(() => <LineChart title="Daily readings" data={[]} width={WIDTH} height={HEIGHT} />)).not.toThrow();

    const { container } = render(() => <LineChart title="Daily readings" data={[]} width={WIDTH} height={HEIGHT} />);
    expectNoNaN(container, "path", ["d"]);
  });

  it("single-point data does not throw and produces no NaN in the path d", () => {
    const single: TimePoint[] = [{ t: new Date(Date.UTC(2026, 0, 1)), y: 5 }];
    expect(() =>
      render(() => <LineChart title="Daily readings" data={single} width={WIDTH} height={HEIGHT} />),
    ).not.toThrow();

    const { container } = render(() => <LineChart title="Daily readings" data={single} width={WIDTH} height={HEIGHT} />);
    expectNoNaN(container, "path", ["d"]);
  });
});
