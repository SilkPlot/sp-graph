/**
 * AreaChart renders a filled `areaPath` beneath a `linePath` stroke, sharing
 * LineChart's time/linear scales. These tests assert structure (an `<svg>`,
 * a non-empty, NaN-free `d` on both paths, both axes present) rather than
 * exact d3-derived path strings or tick counts, which are version-sensitive.
 * Widths/heights are passed explicitly so tests are synchronous and do not
 * depend on ChartRoot's async ResizeObserver measurement.
 *
 * Every case here renders once and never moves. Replacing the series on a
 * MOUNTED chart is the reactive-model surface and lives in
 * `AreaChart-reactive.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { AreaChart } from "../src/index";
import type { TimePoint } from "../src/index";
import { computeTicks, timeScale } from "@silkplot/core";
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
  moveCount,
  pathXs,
  pathYs,
} from "./support";

/** Five points so a middle gap leaves a genuine multi-point region on each side. */
const DATA5: TimePoint[] = [
  { t: new Date(Date.UTC(2026, 0, 1)), y: 3 },
  { t: new Date(Date.UTC(2026, 0, 2)), y: 7 },
  { t: new Date(Date.UTC(2026, 0, 3)), y: 2 },
  { t: new Date(Date.UTC(2026, 0, 4)), y: 9 },
  { t: new Date(Date.UTC(2026, 0, 5)), y: 5 },
];

const DATA: TimePoint[] = [
  { t: new Date(Date.UTC(2026, 0, 1)), y: 3 },
  { t: new Date(Date.UTC(2026, 0, 2)), y: 7 },
  { t: new Date(Date.UTC(2026, 0, 3)), y: 2 },
  { t: new Date(Date.UTC(2026, 0, 4)), y: 9 },
];

/**
 * The y-scale AreaChart composes, rebuilt from the same inputs.
 *
 * `"zero-baseline"` is named here rather than inherited from a shared default:
 * it is what separates AreaChart from LineChart, whose `"zero-floor"` leaves the
 * top bound at the data's own maximum. The two agree on every all-positive
 * series and part company on an all-negative one, which is why this argument is
 * spelled out at the call site instead of being defaulted somewhere central.
 */
function yScaleFor(data: readonly TimePoint[], innerHeight: number) {
  return expectedYScale(
    data.map((d) => d.y),
    "zero-baseline",
    innerHeight,
  );
}

describe("AreaChart — baseline geometry", () => {
  // The area is drawn FROM zero. If 0 falls outside the y-domain the fill's flat
  // edge lands on a pixel the axis labels as some other value — the fill would
  // contradict its own axis. These pin the baseline to the true zero position.
  it("closes on the zero baseline for an all-positive series", () => {
    const { container } = render(() => (
      <AreaChart title="Coverage over time" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const areaD = markD(container);
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
      <AreaChart title="Coverage over time" data={negative} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const areaD = markD(container);
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
    const { container } = render(() => <AreaChart title="Coverage over time" data={DATA} width={WIDTH} height={HEIGHT} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders a filled area <path> with a non-empty d, beneath a stroked line <path>", () => {
    const { container } = render(() => <AreaChart title="Coverage over time" data={DATA} width={WIDTH} height={HEIGHT} />);
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
    const { container } = render(() => <AreaChart title="Coverage over time" data={DATA} width={WIDTH} height={HEIGHT} />);
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
    const { container } = render(() => <AreaChart title="Coverage over time" data={DATA} width={WIDTH} height={HEIGHT} />);
    const x = expectedTimeXScale(DATA.map((d) => d.t), INNER_WIDTH);
    const expectedTicks = computeTicks(x, {});
    expect(axisTicks(container, "bottom")).toHaveLength(expectedTicks.length);
  });

  it("left axis tick count matches computeTicks for the equivalent linear scale", () => {
    const { container } = render(() => <AreaChart title="Coverage over time" data={DATA} width={WIDTH} height={HEIGHT} />);
    const y = yScaleFor(DATA, INNER_HEIGHT);
    const expectedTicks = computeTicks(y, {});
    expect(axisTicks(container, "left")).toHaveLength(expectedTicks.length);
  });
});

describe("AreaChart — empty data", () => {
  it("does not throw and produces no NaN in the area or line path d", () => {
    expect(() => render(() => <AreaChart title="Coverage over time" data={[]} width={WIDTH} height={HEIGHT} />)).not.toThrow();

    const { container } = render(() => <AreaChart title="Coverage over time" data={[]} width={WIDTH} height={HEIGHT} />);
    expectNoNaN(container, "path", ["d"]);
  });
});

describe("AreaChart — props", () => {
  it("applies custom fill, fillOpacity, stroke, and strokeWidth", () => {
    const { container } = render(() => (
      <AreaChart
        title="Coverage over time" data={DATA}
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
    const { container } = render(() => <AreaChart title="Coverage over time" data={DATA} width={WIDTH} height={HEIGHT} />);
    const [areaEl, lineEl] = getPaths(container) as [SVGPathElement, SVGPathElement];
    expect(areaEl.getAttribute("fill")).toBe("currentColor");
    expect(areaEl.getAttribute("fill-opacity")).toBe("0.2");
    expect(lineEl.getAttribute("stroke")).toBe("currentColor");
  });
});

/**
 * Contract 2 (time ordering): the x-domain is the data's EXTENT, not first/last.
 * A scrambled series must still land entirely on canvas — the fix LineChart
 * already carries, mirrored here.
 */
describe("AreaChart — time domain covers the data extent, not first/last", () => {
  it("keeps an out-of-order middle point inside the plot area", () => {
    // Array order [Jan 10, Jan 1, Jan 5]: reading the ends builds the domain
    // [Jan 10, Jan 5], and the true-earliest Jan 1 (the middle element) maps
    // OFF-canvas. The extent domain [Jan 1, Jan 10] keeps every point in range.
    const scrambled: TimePoint[] = [
      { t: new Date(Date.UTC(2026, 0, 10)), y: 3 },
      { t: new Date(Date.UTC(2026, 0, 1)), y: 7 },
      { t: new Date(Date.UTC(2026, 0, 5)), y: 2 },
    ];
    const { container } = render(() => (
      <AreaChart title="Coverage over time" data={scrambled} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const xs = pathXs(markD(container));

    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(WIDTH);
    }

    // Vacuous-pass guard: rebuild the OLD first/last domain and confirm it would
    // genuinely have thrown the middle point past the right edge (x > WIDTH).
    const firstLast = timeScale({
      domain: [scrambled[0]!.t, scrambled[scrambled.length - 1]!.t],
      range: [0, WIDTH],
      nice: false,
    });
    expect(firstLast(scrambled[1]!.t)).toBeGreaterThan(WIDTH);
  });
});

/**
 * Contract 1 (finite-value policy) on the area surface: a rejected or non-finite
 * datum breaks the fill rather than corrupting the whole shape, and never leaks
 * a NaN into the `d`.
 */
describe("AreaChart — gaps and the finite guard", () => {
  it("breaks the fill into separate regions where `defined` returns false", () => {
    const whole = render(() => (
      <AreaChart title="Coverage over time" data={DATA5} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const wholeD = markD(whole.container);
    // One contiguous region: exactly one move command.
    expect(moveCount(wholeD)).toBe(1);

    const gapped = render(() => (
      <AreaChart
        title="Coverage over time" data={DATA5}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        defined={(_d, i) => i !== 2}
      />
    ));
    const gappedD = markD(gapped.container);
    // The gap splits {0,1} from {3,4}: a second move command appears.
    expect(moveCount(gappedD)).toBeGreaterThanOrEqual(2);
    expect(gappedD).not.toBe(wholeD);
  });

  it("treats a non-finite y as a gap and never emits NaN", () => {
    const withHole: TimePoint[] = [
      { t: new Date(Date.UTC(2026, 0, 1)), y: 3 },
      { t: new Date(Date.UTC(2026, 0, 2)), y: 7 },
      { t: new Date(Date.UTC(2026, 0, 3)), y: Number.NaN },
      { t: new Date(Date.UTC(2026, 0, 4)), y: 9 },
      { t: new Date(Date.UTC(2026, 0, 5)), y: 5 },
    ];
    const { container } = render(() => (
      <AreaChart title="Coverage over time" data={withHole} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));

    expectNoNaN(container, "path", ["d"]);
    // Vacuous-pass guard: the non-finite point must actually register as a gap,
    // not silently vanish — the fill splits into two regions.
    const areaD = markD(container);
    expect(moveCount(areaD)).toBeGreaterThanOrEqual(2);
  });

  it("ANDs the finite check with the caller's `defined`, never overriding it", () => {
    // Every point is finite, so any gap here comes solely from the caller's
    // predicate — proof the two conditions compose rather than one masking the other.
    const { container } = render(() => (
      <AreaChart
        title="Coverage over time" data={DATA5}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        defined={(_d, i) => i !== 2}
      />
    ));
    const areaD = markD(container);
    expect(areaD).not.toContain("NaN");
    expect(moveCount(areaD)).toBeGreaterThanOrEqual(2);
  });
});
