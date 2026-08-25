/**
 * Shared SVG clipPath on the plot area, and neighbour inclusion so a segment
 * can enter or leave.
 *
 * The viewport is interval arithmetic; these tests do not reopen it. They
 * prove the paint side: one clipPath whose rect is the inner plot, used by
 * line, area, multi-series, and references, and a narrowed path that reaches
 * both plot-edge x values because it includes one neighbour past each edge.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { timeScale, type TimeInterval } from "@silkplot/core";
import { AreaChart, LineChart } from "../src/index";
import type { TimePoint } from "../src/index";
import { marksForPlotInterval } from "../src/plot-area";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  markD,
  markPaths,
  pathXs,
  pathXsOnPlot,
} from "./support";

const T0 = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const day = (n: number): Date => new Date(T0 + n * DAY);

const DATA: TimePoint[] = [
  { t: day(0), y: 100 },
  { t: day(1), y: 40 },
  { t: day(2), y: 60 },
  { t: day(3), y: 50 },
  { t: day(4), y: 5 },
];

/** A window that sits BETWEEN the first/last points, so the inside set is
 *  days 1..3 and each end has a neighbour outside. Day 1 is not on the left
 *  edge and day 3 is not on the right — that is the geometry that used to
 *  stop short. */
const BETWEEN: TimeInterval = {
  start: new Date(T0 + 0.5 * DAY),
  end: new Date(T0 + 3.5 * DAY),
};

const SERIES = [{ id: "a", label: "A", data: DATA }] as const;
const REFS = [
  { id: "floor", value: 40, label: "Floor" },
  { id: "deploy", time: day(2), label: "Deploy" },
] as const;

function plotArea(container: HTMLElement): SVGGElement {
  const el = container.querySelector<SVGGElement>("[data-silkplot-plot-area]");
  expect(el, "expected a shared plot-area group").not.toBeNull();
  return el as SVGGElement;
}

function clipRectOf(container: HTMLElement): SVGRectElement {
  const area = plotArea(container);
  const raw = area.getAttribute("clip-path") ?? "";
  const id = raw.match(/^url\(#(.+)\)$/)?.[1];
  expect(id, `clip-path should be url(#id), got "${raw}"`).toBeTruthy();
  const clip = container.querySelector(`clipPath#${CSS.escape(id ?? "")}`);
  expect(clip, `expected <clipPath id="${id}">`).not.toBeNull();
  const rect = clip?.querySelector("rect");
  expect(rect, "expected the clipPath rect to be the inner plot").not.toBeNull();
  return rect as SVGRectElement;
}

describe("marksForPlotInterval — neighbour-or-all", () => {
  const time = (d: TimePoint): number => d.t.getTime();

  it("is the identity when no interval is applied (same array reference)", () => {
    expect(marksForPlotInterval(DATA, time, undefined)).toBe(DATA);
  });

  it("is the identity when every point already sits inside the interval", () => {
    const whole = { start: day(0).getTime(), end: day(4).getTime() };
    expect(marksForPlotInterval(DATA, time, whole)).toBe(DATA);
  });

  it("keeps the inside set plus one neighbour past each edge", () => {
    const iv = { start: BETWEEN.start.getTime(), end: BETWEEN.end.getTime() };
    const painted = marksForPlotInterval(DATA, time, iv);
    expect(painted.map((d) => d.t.getTime())).toEqual(DATA.map((d) => d.t.getTime()));
  });

  it("omits a neighbour that does not exist (window flush to an end)", () => {
    const fromStart = { start: day(0).getTime(), end: day(2).getTime() };
    expect(marksForPlotInterval(DATA, time, fromStart).map((d) => d.y)).toEqual([
      100, 40, 60, 50,
    ]);
    const toEnd = { start: day(2).getTime(), end: day(4).getTime() };
    expect(marksForPlotInterval(DATA, time, toEnd).map((d) => d.y)).toEqual([40, 60, 50, 5]);
  });

  it("preserves source order when the series is not sorted", () => {
    const scrambled = [DATA[2]!, DATA[0]!, DATA[4]!, DATA[1]!, DATA[3]!];
    const iv = { start: BETWEEN.start.getTime(), end: BETWEEN.end.getTime() };
    expect(marksForPlotInterval(scrambled, time, iv)).toEqual(scrambled);
  });
});

describe("shared SVG clipPath on the plot area", () => {
  it("is an SVG clipPath whose rect is the inner plot, not overflow:hidden", () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        visibleDomain={BETWEEN}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.style.overflow).toBe("visible");

    const area = plotArea(container);
    expect(getComputedStyle(area).overflow).not.toBe("hidden");
    expect(area.style.overflow).not.toBe("hidden");

    const rect = clipRectOf(container);
    expect(rect.getAttribute("x")).toBe("0");
    expect(rect.getAttribute("y")).toBe("0");
    expect(rect.getAttribute("width")).toBe(String(WIDTH));
    expect(rect.getAttribute("height")).toBe(String(HEIGHT));
  });

  it("is the same clip on line, area, multi-series, and a reference overlay", () => {
    const mounts = [
      {
        name: "line",
        ui: () => (
          <LineChart
            title="Readings"
            data={DATA}
            visibleDomain={BETWEEN}
            width={WIDTH}
            height={HEIGHT}
            margins={NO_MARGINS}
            curve="linear"
          />
        ),
      },
      {
        name: "area",
        ui: () => (
          <AreaChart
            title="Readings"
            data={DATA}
            visibleDomain={BETWEEN}
            width={WIDTH}
            height={HEIGHT}
            margins={NO_MARGINS}
            curve="linear"
          />
        ),
      },
      {
        name: "multi-series + references",
        ui: () => (
          <LineChart
            title="Readings"
            series={SERIES}
            references={REFS}
            visibleDomain={BETWEEN}
            width={WIDTH}
            height={HEIGHT}
            margins={NO_MARGINS}
            curve="linear"
          />
        ),
      },
    ] as const;

    const clipIds: string[] = [];
    for (const mount of mounts) {
      const { container, unmount } = render(mount.ui);
      const area = plotArea(container);
      const raw = area.getAttribute("clip-path") ?? "";
      const id = raw.match(/^url\(#(.+)\)$/)?.[1];
      expect(id, `${mount.name} should use url(#clipId)`).toBeTruthy();
      clipIds.push(id ?? "");

      const rect = clipRectOf(container);
      expect(rect.getAttribute("width"), mount.name).toBe(String(WIDTH));
      expect(rect.getAttribute("height"), mount.name).toBe(String(HEIGHT));

      for (const path of markPaths(container)) {
        expect(area.contains(path), `${mount.name} mark is inside the shared clip`).toBe(true);
      }
      if (mount.name === "multi-series + references") {
        const refs = container.querySelector("[data-silkplot-references]");
        expect(refs, "reference overlay should render").not.toBeNull();
        expect(area.contains(refs), "references use the same plot-area clip").toBe(true);
        expect(refs?.querySelector("clipPath"), "no private reference clip").toBeNull();
      }
      unmount();
    }
    expect(new Set(clipIds).size, "each chart instance has its own clip id").toBe(clipIds.length);
  });
});

describe("entering/leaving segments reach both plot edges", () => {
  it("paints a neighbour past each edge so the path crosses both plot-edge x values", () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        visibleDomain={BETWEEN}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const d = markD(container);
    const xs = pathXs(d);
    const x = timeScale({
      domain: [BETWEEN.start, BETWEEN.end],
      range: [0, WIDTH],
    });

    // Inside the window: days 1, 2, 3 — three vertices on the plot.
    expect(pathXsOnPlot(d, WIDTH)).toHaveLength(3);
    // Plus one neighbour on each side: day 0 left of the plot, day 4 right of it.
    expect(xs).toHaveLength(5);
    expect(xs[0] ?? 0).toBeLessThan(0);
    expect(xs[4] ?? 0).toBeGreaterThan(WIDTH);
    // The painted (clipped) segment therefore crosses both edges. The inside
    // vertices are the ones that used to be the path ends, short of the edge.
    expect(xs[1]).toBeCloseTo(x(day(1)), 3);
    expect(xs[1] ?? 0).toBeGreaterThan(0);
    expect(xs[3]).toBeCloseTo(x(day(3)), 3);
    expect(xs[3] ?? 0).toBeLessThan(WIDTH);
  });

  it("does the same on area, multi-series, and a chart that also draws references", () => {
    const fixtures = [
      () => (
        <AreaChart
          title="Readings"
          data={DATA}
          visibleDomain={BETWEEN}
          width={WIDTH}
          height={HEIGHT}
          margins={NO_MARGINS}
          curve="linear"
        />
      ),
      () => (
        <LineChart
          title="Readings"
          series={SERIES}
          references={REFS}
          visibleDomain={BETWEEN}
          width={WIDTH}
          height={HEIGHT}
          margins={NO_MARGINS}
          curve="linear"
        />
      ),
    ];
    for (const ui of fixtures) {
      const { container, unmount } = render(ui);
      // Area's stroked line is the second path; a line chart's only path is [0].
      const stroked = markD(container, markPaths(container).length > 1 ? 1 : 0);
      const xs = pathXs(stroked);
      expect(xs[0] ?? 0).toBeLessThan(0);
      expect(xs[xs.length - 1] ?? 0).toBeGreaterThan(WIDTH);
      expect(plotArea(container).contains(container.querySelector("svg path") as Node)).toBe(
        true,
      );
      unmount();
    }
  });

  it("leaves an un-narrowed path on the plot edges (identity geometry)", () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const xs = pathXs(markD(container));
    expect(xs).toHaveLength(5);
    expect(xs[0]).toBeCloseTo(0, 3);
    expect(xs[4]).toBeCloseTo(WIDTH, 3);
  });
});
