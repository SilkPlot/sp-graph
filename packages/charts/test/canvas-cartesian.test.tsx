/**
 * Cartesian marks on Canvas — the item this branch exists to land.
 *
 * The per-family suites already prove geometry through the recorded mark
 * surface. This file proves the substrate contract those suites assume:
 * one Canvas plot per chart, clip named as Canvas, hover and keyboard still
 * writing the same active-datum state, a data replacement moving the bitmap's
 * recorded path, and grouped bars painting on the same surface. Axes, grid,
 * references, brush, and the active point paint on that Canvas. The named
 * graphic carries title/desc only.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { fireEvent, render } from "@solidjs/testing-library";
import { userEvent } from "vitest/browser";
import { ChartRoot } from "@silkplot/solid";
import type { Series } from "@silkplot/core";
import { AreaChart, BarChart, LineChart, ScatterChart } from "../src/index";
import type { TimePoint, XYPoint } from "../src/index";
import { paintPointMark } from "../src/canvas-chrome";
import type { CanvasMark } from "../src/canvas-marks";
import { CanvasPlot } from "../src/canvas-plot";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  bars,
  canvasMarksOf,
  circles,
  hasAxis,
  markD,
  markPaths,
  paintedSvgInGraphic,
  plotCanvases,
} from "./support";

const T0 = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const at = (n: number): Date => new Date(T0 + n * DAY);

const TIME: TimePoint[] = [
  { t: at(0), y: 3 },
  { t: at(1), y: 7 },
  { t: at(2), y: 2 },
  { t: at(3), y: 9 },
];

const XY: XYPoint[] = [
  { x: 1, y: 3 },
  { x: 4, y: 7 },
  { x: 2, y: -2 },
];

const CATS = [
  { id: "a", label: "Alpha", value: 10 },
  { id: "b", label: "Bravo", value: 40 },
  { id: "c", label: "Charlie", value: 25 },
] as const;

const GROUPED: Series[] = [
  {
    id: "inlet",
    label: "Inlet",
    data: [
      { t: at(0), y: 4 },
      { t: at(1), y: 8 },
    ],
  },
  {
    id: "outlet",
    label: "Outlet",
    data: [
      { t: at(0), y: -2 },
      { t: at(1), y: 3 },
    ],
  },
];

const SIZE = { width: WIDTH, height: HEIGHT, margins: NO_MARGINS } as const;

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function canvasOf(container: HTMLElement): HTMLCanvasElement {
  const plots = plotCanvases(container);
  expect(plots).toHaveLength(1);
  const canvas = plots[0];
  expect(canvas, "expected a Canvas plot").toBeTruthy();
  return canvas as HTMLCanvasElement;
}

describe("every cartesian family paints on one Canvas plot", () => {
  it("is a Canvas whose clip is named canvas, not an SVG mark path", () => {
    const mounts = [
      () => <LineChart title="Readings" data={TIME} {...SIZE} />,
      () => <AreaChart title="Readings" data={TIME} {...SIZE} />,
      () => <BarChart title="Spend" desc="By programme" categories={[...CATS]} {...SIZE} />,
      () => <ScatterChart title="Cloud" data={XY} {...SIZE} />,
      () => (
        <BarChart
          title="Grouped"
          desc="Two series"
          mode="grouped"
          series={GROUPED}
          {...SIZE}
        />
      ),
    ];
    for (const ui of mounts) {
      const { container, unmount } = render(ui);
      const canvas = canvasOf(container);
      expect(canvas.getAttribute("data-silkplot-clip")).toBe("canvas");
      expect(canvas.style.pointerEvents).toBe("none");
      expect(container.querySelector("[data-silkplot-plot-overlay]")).toBeNull();
      expect(container.querySelector("clipPath")).toBeNull();
      expect(paintedSvgInGraphic(container), "no painted SVG on the named graphic").toEqual([]);
      unmount();
    }
  });

  it("records line, area, bar, scatter, and grouped geometry on that surface", () => {
    const line = render(() => <LineChart title="Readings" data={TIME} {...SIZE} curve="linear" />);
    expect(markPaths(line.container)).toHaveLength(1);
    expect(markD(line.container).startsWith("M")).toBe(true);

    const area = render(() => <AreaChart title="Readings" data={TIME} {...SIZE} curve="linear" />);
    expect(markPaths(area.container)).toHaveLength(2);

    const bar = render(() => (
      <BarChart title="Spend" desc="By programme" categories={[...CATS]} {...SIZE} />
    ));
    expect(bars(bar.container)).toHaveLength(CATS.length);

    const scatter = render(() => <ScatterChart title="Cloud" data={XY} {...SIZE} />);
    expect(circles(scatter.container)).toHaveLength(XY.length);
    expect(scatter.container.querySelectorAll("svg circle")).toHaveLength(0);
    expect(paintedSvgInGraphic(scatter.container)).toEqual([]);

    const grouped = render(() => (
      <BarChart title="Grouped" desc="Two series" mode="grouped" series={GROUPED} {...SIZE} />
    ));
    expect(bars(grouped.container)).toHaveLength(4);
  });
});

describe("interaction still writes one active-datum state", () => {
  it("hover drives the Canvas crosshair without needing an SVG mark path", async () => {
    const { container } = render(() => (
      <LineChart
        title="Weekly bookings"
        desc="Four days"
        data={TIME}
        {...SIZE}
        tooltip={(a) => <span data-testid="tt">{String(a.datum.y)}</span>}
      />
    ));
    expect(markPaths(container)).toHaveLength(1);
    const surface = container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]");
    expect(surface).not.toBeNull();
    const rect = surface!.getBoundingClientRect();
    surface!.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: rect.left + rect.width * 0.8,
        clientY: rect.top + rect.height * 0.5,
      }),
    );
    await frame();
    expect(container.querySelector("[data-silkplot-crosshair]")).not.toBeNull();
    expect(container.querySelector("[data-testid='tt']")?.textContent).toBeTruthy();
    const canvas = canvasOf(container);
    expect(canvas.hasAttribute("data-silkplot-crosshair")).toBe(true);
    expect(container.querySelector("[data-silkplot-plot-overlay]")).toBeNull();
    expect(paintedSvgInGraphic(container)).toEqual([]);
  });

  it("keyboard selection still steps, and a ranked bar records the active outline on Canvas", async () => {
    const line = render(() => (
      <LineChart title="Weekly bookings" desc="Four days" data={TIME} {...SIZE} />
    ));
    const lineSurface = line.container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]");
    expect(lineSurface).not.toBeNull();
    lineSurface!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(line.container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("1");
    expect(line.container.querySelector("[data-silkplot-crosshair]")).not.toBeNull();
    expect(paintedSvgInGraphic(line.container)).toEqual([]);
    const lineCanvas = canvasOf(line.container);
    const pathBefore = lineCanvas.getAttribute("data-silkplot-mark-d");
    expect(pathBefore).toBeTruthy();
    await userEvent.keyboard("{ArrowRight}");
    expect(line.container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("2");
    expect(lineCanvas.getAttribute("data-silkplot-mark-d")).toBe(pathBefore);
    expect(lineCanvas.hasAttribute("data-silkplot-crosshair")).toBe(true);

    const bar = render(() => (
      <BarChart title="Spend" desc="By programme" categories={[...CATS]} {...SIZE} />
    ));
    const barSurface = bar.container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]");
    expect(barSurface).not.toBeNull();
    barSurface!.focus();
    fireEvent.keyDown(barSurface!, { key: "ArrowRight" });
    const stroked = bars(bar.container).filter((r) => r.getAttribute("stroke") !== "none");
    expect(stroked).toHaveLength(1);
    expect(stroked[0]?.getAttribute("stroke-width")).toBe("2");
  });

  it("does not re-run the series painter when only overlay chrome moves", () => {
    const [point, setPoint] = createSignal<{ cx: number; cy: number } | undefined>();
    let paints = 0;
    const { container } = render(() => (
      <ChartRoot width={WIDTH} height={HEIGHT}>
        <CanvasPlot
          paint={() => {
            paints += 1;
            return [];
          }}
          overlay={(ctx, plot, resolve) => {
            const cursor = point();
            if (cursor === undefined) return [];
            const into: CanvasMark[] = [];
            paintPointMark(ctx, cursor.cx, cursor.cy, plot, resolve, into);
            return into;
          }}
        />
      </ChartRoot>
    ));
    const afterMount = paints;
    expect(afterMount).toBeGreaterThan(0);
    setPoint({ cx: 12, cy: 14 });
    expect(paints).toBe(afterMount);
    const canvas = canvasOf(container);
    expect(canvas.hasAttribute("data-silkplot-crosshair")).toBe(true);
  });
});

describe("data updates and empty paint", () => {
  it("replaces the recorded line when the series is replaced on a mounted chart", () => {
    const [data, setData] = createSignal<TimePoint[]>(TIME);
    const { container } = render(() => (
      <LineChart title="Readings" data={data()} {...SIZE} curve="linear" />
    ));
    const before = markD(container);
    expect(before).not.toBe("");
    setData([
      { t: at(0), y: 100 },
      { t: at(1), y: 150 },
      { t: at(2), y: 80 },
      { t: at(3), y: 200 },
    ]);
    expect(markD(container)).not.toBe(before);
    expect(markPaths(container)).toHaveLength(1);
  });

  it("skips a visible series whose drawn set is empty rather than stroking nothing", () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        desc="One empty series beside a real one"
        {...SIZE}
        curve="linear"
        series={[
          { id: "empty", label: "Empty", data: [] },
          {
            id: "live",
            label: "Live",
            data: TIME,
          },
        ]}
      />
    ));
    expect(markPaths(container)).toHaveLength(1);
  });

  it("omits grid lines when gridlines is false, and still paints axes on Canvas", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={TIME} {...SIZE} gridlines={false} curve="linear" />
    ));
    const marks = canvasMarksOf(container);
    expect(marks.some((m) => m.kind === "line" && m.role === "grid")).toBe(false);
    expect(hasAxis(container, "left")).toBe(true);
    expect(hasAxis(container, "bottom")).toBe(true);
    expect(paintedSvgInGraphic(container)).toEqual([]);
  });
});
