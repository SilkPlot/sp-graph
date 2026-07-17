/**
 * Axis is the "no d3-axis" primitive: it asks `computeTicks` (real d3 math,
 * no DOM) for tick data, then renders it with a Solid `<For>`. These tests
 * cross-check the RENDERED tick count/labels against `computeTicks` called
 * with the same arguments, since d3 treats tick count as a hint and its
 * formatters are version-sensitive — nothing here hardcodes a d3 output.
 */
import { describe, expect, it } from "vitest";
import { createSignal, type Accessor, type JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import {
  Axis,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
} from "../src/index";
import type { AxisOrientation, ChartBounds } from "../src/index";
import { computeTicks, linearScale, timeScale } from "@silkplot/core";
import type { ContinuousScale } from "@silkplot/core";

const BOUNDS: ChartBounds = resolveBounds(400, 300, DEFAULT_MARGINS);

/** Mount children inside an <svg>, under a fixed (non-measuring) bounds
 * context — Axis renders SVG elements and requires both. */
function mount(
  children: () => JSX.Element,
  boundsAccessor: Accessor<ChartBounds> = () => BOUNDS,
) {
  return render(() => (
    // A bare test harness element, present only to give the axis under test an
    // SVG parent. It is never shown to anyone, so a name would describe nothing.
    // biome-ignore lint/a11y/noSvgWithoutTitle: test harness element, never rendered to a user
    <svg>
      <ChartBoundsContext.Provider value={boundsAccessor}>
        {children()}
      </ChartBoundsContext.Provider>
    </svg>
  ));
}

function getAxisGroup(container: HTMLElement): SVGGElement {
  const g = container.querySelector("g[data-silkplot-axis]");
  expect(g, "expected an axis <g data-silkplot-axis>").not.toBeNull();
  return g as SVGGElement;
}

function getDomainPath(axisGroup: SVGGElement): SVGPathElement {
  const path = axisGroup.querySelector(":scope > path");
  expect(path, "expected a domain <path> as a direct child of the axis group").not.toBeNull();
  return path as SVGPathElement;
}

function getTickGroups(axisGroup: SVGGElement): SVGGElement[] {
  return Array.from(axisGroup.querySelectorAll(":scope > g"));
}

/** Match a domain path against a shape regex, returning its two numeric captures. */
function matchDomainPath(d: string, re: RegExp): [number, number] {
  const match = d.match(re);
  expect(match, `domain path "${d}" did not match expected shape ${re}`).not.toBeNull();
  const m = match as RegExpMatchArray;
  return [Number(m[1] ?? NaN), Number(m[2] ?? NaN)];
}

const linear = linearScale({ domain: [0, 100], range: [0, BOUNDS.innerWidth] });

describe("Axis — ticks match @silkplot/core computeTicks", () => {
  it("renders one tick group per computed tick, plus a domain path", () => {
    const { container } = mount(() => <Axis scale={linear} />);
    const axisGroup = getAxisGroup(container);
    const expectedTicks = computeTicks(linear, {});

    // Sanity: the fixture must actually produce ticks, or this test would
    // pass vacuously.
    expect(expectedTicks.length).toBeGreaterThan(0);
    getDomainPath(axisGroup);
    expect(getTickGroups(axisGroup)).toHaveLength(expectedTicks.length);
  });

  it("renders a line and a text label for each tick, matching computeTicks output in order", () => {
    const { container } = mount(() => <Axis scale={linear} />);
    const axisGroup = getAxisGroup(container);
    const expectedTicks = computeTicks(linear, {});
    const tickGroups = getTickGroups(axisGroup);

    expect(tickGroups).toHaveLength(expectedTicks.length);
    tickGroups.forEach((g, i) => {
      const expected = expectedTicks[i];
      expect(expected).toBeDefined();
      expect(g.querySelector("line")).not.toBeNull();
      expect(g.querySelector("text")?.textContent).toBe(expected?.label);
    });
  });

  it("passes tickCount through to computeTicks as the count hint", () => {
    const { container } = mount(() => <Axis scale={linear} tickCount={3} />);
    const axisGroup = getAxisGroup(container);
    const expectedTicks = computeTicks(linear, { count: 3 });
    expect(getTickGroups(axisGroup)).toHaveLength(expectedTicks.length);
  });

  it("passes pixelsPerTick through to computeTicks as the spacing hint", () => {
    const { container } = mount(() => <Axis scale={linear} pixelsPerTick={200} />);
    const axisGroup = getAxisGroup(container);
    const expectedTicks = computeTicks(linear, { pixelsPerTick: 200 });
    expect(getTickGroups(axisGroup)).toHaveLength(expectedTicks.length);
  });
});

describe("Axis — orientation", () => {
  const cases: Array<{
    orientation: AxisOrientation;
    axis: "horizontal" | "vertical";
    expectedOffset: number;
  }> = [
    { orientation: "bottom", axis: "horizontal", expectedOffset: BOUNDS.innerHeight },
    { orientation: "top", axis: "horizontal", expectedOffset: 0 },
    { orientation: "left", axis: "vertical", expectedOffset: 0 },
    { orientation: "right", axis: "vertical", expectedOffset: BOUNDS.innerWidth },
  ];

  cases.forEach(({ orientation, axis, expectedOffset }) => {
    it(`orientation="${orientation}" sets data-silkplot-axis and produces a ${axis} domain path`, () => {
      const { container } = mount(() => <Axis scale={linear} orientation={orientation} />);
      const axisGroup = getAxisGroup(container);
      expect(axisGroup.getAttribute("data-silkplot-axis")).toBe(orientation);

      const d = getDomainPath(axisGroup).getAttribute("d") ?? "";
      if (axis === "horizontal") {
        // M0,{y}H{innerWidth}
        const [y, x1] = matchDomainPath(d, /^M0,(-?[\d.]+)H(-?[\d.]+)$/);
        expect(y).toBe(expectedOffset);
        expect(x1).toBe(BOUNDS.innerWidth);
      } else {
        // M{x},0V{innerHeight}
        const [x, y1] = matchDomainPath(d, /^M(-?[\d.]+),0V(-?[\d.]+)$/);
        expect(x).toBe(expectedOffset);
        expect(y1).toBe(BOUNDS.innerHeight);
      }
    });
  });
});

describe("Axis — defaults", () => {
  it('defaults orientation to "bottom" when omitted', () => {
    const { container } = mount(() => <Axis scale={linear} />);
    expect(getAxisGroup(container).getAttribute("data-silkplot-axis")).toBe("bottom");
  });

  it("defaults tickSize to 6 (tick line length) when omitted", () => {
    const { container } = mount(() => <Axis scale={linear} />);
    const tickGroups = getTickGroups(getAxisGroup(container));
    expect(tickGroups.length).toBeGreaterThan(0);
    tickGroups.forEach((g) => {
      expect(g.querySelector("line")?.getAttribute("y2")).toBe("6");
    });
  });

  it("applies a custom tickSize to every tick line", () => {
    const { container } = mount(() => <Axis scale={linear} tickSize={20} />);
    const tickGroups = getTickGroups(getAxisGroup(container));
    expect(tickGroups.length).toBeGreaterThan(0);
    tickGroups.forEach((g) => {
      expect(g.querySelector("line")?.getAttribute("y2")).toBe("20");
    });
  });

  it('marks the axis group aria-hidden="true" (decorative — accessible name lives on the parent SVG)', () => {
    const { container } = mount(() => <Axis scale={linear} />);
    expect(getAxisGroup(container).getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Axis — scale kinds", () => {
  it("renders correctly for a linear scale", () => {
    const { container } = mount(() => <Axis scale={linear} />);
    const axisGroup = getAxisGroup(container);
    const expectedTicks = computeTicks(linear, {});
    expect(getTickGroups(axisGroup)).toHaveLength(expectedTicks.length);
  });

  it("renders correctly for a time scale using fixed UTC dates", () => {
    const time = timeScale({
      domain: [new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2024, 11, 31))],
      range: [0, BOUNDS.innerWidth],
    });
    const { container } = mount(() => <Axis scale={time} orientation="bottom" />);
    const axisGroup = getAxisGroup(container);
    const expectedTicks = computeTicks(time, {});
    const tickGroups = getTickGroups(axisGroup);

    expect(expectedTicks.length).toBeGreaterThan(0);
    expect(tickGroups).toHaveLength(expectedTicks.length);
    tickGroups.forEach((g, i) => {
      expect(g.querySelector("text")?.textContent).toBe(expectedTicks[i]?.label);
    });
  });
});

describe("Axis — reactivity", () => {
  it("recomputes ticks (the ticks createMemo reruns) when the scale prop signal changes", () => {
    const scaleA = linearScale({ domain: [0, 10], range: [0, BOUNDS.innerWidth] });
    const scaleB = linearScale({ domain: [0, 100000], range: [0, BOUNDS.innerWidth] });
    const [scale, setScale] = createSignal<ContinuousScale>(scaleA);

    const { container } = mount(() => <Axis scale={scale()} />);
    const axisGroup = getAxisGroup(container);
    const labelsNow = () =>
      getTickGroups(axisGroup).map((g) => g.querySelector("text")?.textContent);

    const expectedA = computeTicks(scaleA, {}).map((t) => t.label);
    expect(labelsNow()).toEqual(expectedA);

    // A d3 scale is itself a callable function, so it must be set via the
    // updater form (`() => scaleB`) — passing it directly would make Solid
    // treat it as an `(prev) => next` updater and invoke it instead of
    // storing it.
    setScale(() => scaleB);

    const expectedB = computeTicks(scaleB, {}).map((t) => t.label);
    expect(labelsNow()).toEqual(expectedB);
    // Guard against a vacuous pass: if the two scales produced the same
    // labels, this test couldn't distinguish "recomputed" from "stale".
    expect(expectedB).not.toEqual(expectedA);
  });
});
