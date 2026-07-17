/**
 * Gridlines exists to agree with Axis. So these tests check the lines land on
 * ticks computed independently in the test — via `computeTicks` /
 * `computeBandTicks` called with the same arguments — never against a d3 output
 * string, whose formatting and exact count are version-sensitive hints rather
 * than contract.
 *
 * The load-bearing case is the last one: Gridlines and Axis, given the same
 * scale, must produce the same positions. That is the defect this component is
 * shaped to prevent, and it is the only test here that would catch a second
 * copy of the tick math drifting from the first.
 */
import { describe, expect, it } from "vitest";
import { createSignal, type Accessor, type JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import { computeTicks, computeBandTicks, linearScale, bandScale } from "@silkplot/core";
import {
  Gridlines,
  Axis,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
  type ChartBounds,
} from "../src/index";

const BOUNDS = resolveBounds(400, 300, DEFAULT_MARGINS);

function renderWithBounds(
  children: () => JSX.Element,
  boundsAccessor: Accessor<ChartBounds> = () => BOUNDS,
) {
  return render(() => (
    // biome-ignore lint/a11y/noSvgWithoutTitle: test harness element, never rendered to a user
    <svg>
      <ChartBoundsContext.Provider value={boundsAccessor}>
        {children()}
      </ChartBoundsContext.Provider>
    </svg>
  ));
}

const linesOf = (container: HTMLElement, axis: "x" | "y") =>
  Array.from(
    container.querySelectorAll(`[data-silkplot-gridlines="${axis}"] line`),
  );

const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

describe("Gridlines — continuous scale", () => {
  const scale = () => linearScale({ domain: [0, 100], range: [BOUNDS.innerHeight, 0] });

  it("draws one horizontal line per y tick, at the tick's position", () => {
    const { container } = renderWithBounds(() => <Gridlines scale={scale()} axis="y" />);
    const expected = computeTicks(scale());
    const lines = linesOf(container, "y");

    expect(lines).toHaveLength(expected.length);
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((line, i) => {
      expect(num(line, "y1")).toBeCloseTo(expected[i]!.position);
      expect(num(line, "y2")).toBeCloseTo(expected[i]!.position);
    });
  });

  it("spans a y line across the full inner width", () => {
    const { container } = renderWithBounds(() => <Gridlines scale={scale()} axis="y" />);
    for (const line of linesOf(container, "y")) {
      expect(num(line, "x1")).toBe(0);
      expect(num(line, "x2")).toBe(BOUNDS.innerWidth);
    }
  });

  it("draws x gridlines vertically — down the height, at the tick's position", () => {
    const xScale = linearScale({ domain: [0, 10], range: [0, BOUNDS.innerWidth] });
    const { container } = renderWithBounds(() => <Gridlines scale={xScale} axis="x" />);
    const expected = computeTicks(xScale);
    const lines = linesOf(container, "x");

    expect(lines).toHaveLength(expected.length);
    lines.forEach((line, i) => {
      expect(num(line, "x1")).toBeCloseTo(expected[i]!.position);
      expect(num(line, "x2")).toBeCloseTo(expected[i]!.position);
      expect(num(line, "y1")).toBe(0);
      expect(num(line, "y2")).toBe(BOUNDS.innerHeight);
    });
  });

  it("defaults to the y axis", () => {
    const { container } = renderWithBounds(() => <Gridlines scale={scale()} />);
    expect(linesOf(container, "y").length).toBeGreaterThan(0);
    expect(linesOf(container, "x")).toHaveLength(0);
  });

  it("honours a tick count hint", () => {
    const { container } = renderWithBounds(() => (
      <Gridlines scale={scale()} axis="y" tickCount={3} />
    ));
    // d3 treats count as a hint, so compare against the same hint rather than 3.
    const expected = computeTicks(scale(), { count: 3 });
    expect(linesOf(container, "y")).toHaveLength(expected.length);
  });
});

describe("Gridlines — band scale", () => {
  const scale = () => bandScale({ domain: ["a", "b", "c"], range: [0, BOUNDS.innerWidth] });

  it("draws a line per band, centred on the band", () => {
    const { container } = renderWithBounds(() => <Gridlines scale={scale()} axis="x" />);
    const expected = computeBandTicks(scale());
    const lines = linesOf(container, "x");

    expect(lines).toHaveLength(expected.length);
    expect(lines).toHaveLength(3);
    lines.forEach((line, i) => {
      expect(num(line, "x1")).toBeCloseTo(expected[i]!.position);
    });
  });

  it("ignores a tick count hint, because every band is a tick", () => {
    const { container } = renderWithBounds(() => (
      <Gridlines scale={scale()} axis="x" tickCount={99} />
    ));
    expect(linesOf(container, "x")).toHaveLength(3);
  });
});

describe("Gridlines — reactivity and theming", () => {
  it("re-spans and re-positions when the bounds change", () => {
    const [bounds, setBounds] = createSignal(BOUNDS);
    const scale = () =>
      linearScale({ domain: [0, 100], range: [bounds().innerHeight, 0] });
    const { container } = renderWithBounds(
      () => <Gridlines scale={scale()} axis="y" />,
      bounds,
    );
    expect(linesOf(container, "y")[0]).toBeDefined();

    const next = resolveBounds(800, 600, DEFAULT_MARGINS);
    setBounds(next);

    for (const line of linesOf(container, "y")) {
      expect(num(line, "x2")).toBe(next.innerWidth);
    }
  });

  it("reads the grid token with a fallback, per the theming contract", () => {
    const { container } = renderWithBounds(() => <Gridlines scale={linearScale({ domain: [0, 100], range: [BOUNDS.innerHeight, 0] })} axis="y" />);
    const stroke = linesOf(container, "y")[0]?.getAttribute("stroke");
    // The fallback is what keeps an unthemed consumer legible; without it an
    // undefined var on `stroke` inherits the parent's colour instead.
    expect(stroke).toBe("var(--sp-color-grid, currentColor)");
  });

  it("is hidden from assistive tech — it restates the axis labels", () => {
    const { container } = renderWithBounds(() => <Gridlines scale={linearScale({ domain: [0, 100], range: [BOUNDS.innerHeight, 0] })} axis="y" />);
    const g = container.querySelector("[data-silkplot-gridlines]");
    expect(g?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Gridlines and Axis agree", () => {
  it("puts a line at every tick position the Axis labels, for a continuous scale", () => {
    const scale = linearScale({ domain: [0, 100], range: [BOUNDS.innerHeight, 0] });
    const { container } = renderWithBounds(() => (
      <>
        <Gridlines scale={scale} axis="y" />
        <Axis scale={scale} orientation="left" />
      </>
    ));

    const gridY = linesOf(container, "y").map((l) => num(l, "y1"));
    // Axis renders each tick as a <g transform="translate(x,y)">.
    const axisY = Array.from(
      container.querySelectorAll('[data-silkplot-axis="left"] > g'),
    ).map((g) => {
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute("transform") ?? "");
      return Number(m?.[2]);
    });

    expect(gridY.length).toBeGreaterThan(0);
    expect(gridY).toEqual(axisY);
  });

  it("agrees for a band scale too", () => {
    const scale = bandScale({ domain: ["a", "b", "c"], range: [0, BOUNDS.innerWidth] });
    const { container } = renderWithBounds(() => (
      <>
        <Gridlines scale={scale} axis="x" />
        <Axis scale={scale} orientation="bottom" />
      </>
    ));

    const gridX = linesOf(container, "x").map((l) => num(l, "x1"));
    const axisX = Array.from(
      container.querySelectorAll('[data-silkplot-axis="bottom"] > g'),
    ).map((g) => {
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute("transform") ?? "");
      return Number(m?.[1]);
    });

    expect(gridX.length).toBeGreaterThan(0);
    expect(gridX).toEqual(axisX);
  });
});
