/**
 * Ordinary heatmap on Canvas — layout from core, paint on the cartesian
 * bitmap, HTML name rather than SVG. Hover, selection, and a data replacement
 * must all move the same recorded cells.
 */
import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import type { ActivePoint, HeatmapBin } from "@silkplot/core";
import { HeatmapChart } from "../src/index";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  bars,
  canvasMarksOf,
  hasAxis,
  paintedSvgInGraphic,
  plotCanvases,
} from "./support";

const SIZE = { width: WIDTH, height: HEIGHT, margins: NO_MARGINS, padding: 0 } as const;

const CELLS = [
  { x: "a", y: "n", value: 1 },
  { x: "b", y: "n", value: 2 },
  { x: "a", y: "s", value: 8 },
  { x: "b", y: "s", value: 10 },
] as const;

const AFTER = [
  { x: "a", y: "n", value: 40 },
  { x: "b", y: "n", value: 2 },
  { x: "a", y: "s", value: 8 },
  { x: "b", y: "s", value: 3 },
] as const;

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function canvasOf(container: HTMLElement): HTMLCanvasElement {
  const plots = plotCanvases(container);
  expect(plots).toHaveLength(1);
  return plots[0] as HTMLCanvasElement;
}

function surfaceOf(container: HTMLElement): HTMLElement {
  const surface =
    container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]") ??
    container.querySelector<HTMLElement>("[data-silkplot-pointer-surface]");
  expect(surface).not.toBeNull();
  return surface as HTMLElement;
}

async function hoverAt(surface: HTMLElement, fx: number, fy: number): Promise<void> {
  const rect = surface.getBoundingClientRect();
  surface.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: rect.left + rect.width * fx,
      clientY: rect.top + rect.height * fy,
    }),
  );
  await frame();
}

describe("HeatmapChart paints on Canvas, not SVG", () => {
  it("is a named HTML graphic with Canvas cells and no painted SVG", () => {
    const { container } = render(() => (
      <HeatmapChart title="Clinic load" desc="Two rooms, two shifts" data={CELLS} {...SIZE} />
    ));
    expect(container.querySelector("[data-silkplot-heatmap]")?.getAttribute("role")).toBe("img");
    expect(container.querySelector("[data-silkplot-heatmap-name]")?.textContent).toBe("Clinic load");
    const canvas = canvasOf(container);
    expect(canvas.getAttribute("data-silkplot-clip")).toBe("canvas");
    expect(canvas.hasAttribute("data-silkplot-hatch")).toBe(true);
    expect(bars(container)).toHaveLength(4);
    expect(hasAxis(container, "bottom")).toBe(true);
    expect(hasAxis(container, "left")).toBe(true);
    expect(container.querySelector("svg")).toBeNull();
    expect(paintedSvgInGraphic(container)).toEqual([]);
    expect(container.querySelector("table")).not.toBeNull();
  });

  it("encodes a second channel: the hottest cell is more hatched than the coldest", () => {
    const { container } = render(() => (
      <HeatmapChart title="Clinic load" desc="Two rooms" data={CELLS} {...SIZE} />
    ));
    const hatches = bars(container).map((cell) => Number(cell.getAttribute("data-silkplot-hatch")));
    expect(Math.max(...hatches)).toBeGreaterThan(Math.min(...hatches));
    expect(new Set(bars(container).map((cell) => cell.getAttribute("fill"))).size).toBeGreaterThan(1);
  });

  it("exposes Column/Row/Value as the semantic alternative", () => {
    const { container } = render(() => (
      <HeatmapChart title="Clinic load" desc="Two rooms" data={CELLS} {...SIZE} />
    ));
    const headings = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(headings).toEqual(["Column", "Row", "Value"]);
    const graphic = container.querySelector("[data-silkplot-heatmap]");
    const table = container.querySelector("table");
    expect(graphic?.getAttribute("aria-details")).toBe(table?.id);
  });
});

describe("HeatmapChart is interactive and dynamic", () => {
  it("hover writes one active cell, with hatch outline, tooltip, and announcement", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <HeatmapChart
        title="Clinic load"
        desc="Two rooms"
        data={CELLS}
        {...SIZE}
        tooltip={(a) => <span data-testid="tt">{a.datum.column}</span>}
        onActivePointChange={onChange}
      />
    ));
    await hoverAt(surfaceOf(container), 0.25, 0.25);
    expect(onChange).toHaveBeenCalled();
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<HeatmapBin> | undefined;
    expect(active?.datum.column).toBe("a");
    expect(active?.datum.row).toBe("n");
    expect(container.querySelector('[data-testid="tt"]')?.textContent).toBe("a");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("a");
    expect(bars(container).some((cell) => cell.getAttribute("stroke-width") === "2")).toBe(true);
  });

  it("keyboard steps and Enter commits the selection", async () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <HeatmapChart title="Clinic load" desc="Two rooms" data={CELLS} {...SIZE} onActivate={onActivate} />
    ));
    const surface = surfaceOf(container);
    surface.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("1");
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalled();
    const committed = onActivate.mock.calls.at(-1)?.[0] as ActivePoint<HeatmapBin>;
    expect(committed.datum.column).toBeDefined();
    expect(committed.datum.row).toBeDefined();
  });

  it("a data replacement moves the recorded cells", () => {
    const [data, setData] = createSignal<readonly { x: string; y: string; value: number }[]>(CELLS);
    const { container } = render(() => (
      <HeatmapChart title="Clinic load" desc="Two rooms" data={data()} {...SIZE} />
    ));
    const before = bars(container).map((cell) => cell.getAttribute("data-silkplot-hatch"));
    setData(() => AFTER);
    const after = bars(container).map((cell) => cell.getAttribute("data-silkplot-hatch"));
    expect(after).not.toEqual(before);
  });
});

describe("HeatmapChart decorative and custom label", () => {
  it("drops the graphic from the accessibility tree when decorative", () => {
    const { container } = render(() => <HeatmapChart data={CELLS} {...SIZE} decorative />);
    expect(container.querySelector("[data-silkplot-heatmap]")?.getAttribute("role")).toBe("presentation");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
  });

  it("uses the caller cellLabel for the announcement", async () => {
    const { container } = render(() => (
      <HeatmapChart
        title="Clinic load"
        desc="Two rooms"
        data={CELLS}
        {...SIZE}
        cellLabel={(d) => `room ${d.column}`}
      />
    ));
    const surface = surfaceOf(container);
    surface.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("room");
  });

  it("still paints when gridlines are off and when numeric bins are set", () => {
    const { container: noGrid } = render(() => (
      <HeatmapChart title="Clinic load" desc="Two rooms" data={CELLS} {...SIZE} gridlines={false} />
    ));
    expect(canvasMarksOf(noGrid).some((mark) => mark.kind === "line" && mark.role === "grid")).toBe(
      false,
    );
    expect(bars(noGrid)).toHaveLength(4);
    const { container: numeric } = render(() => (
      <HeatmapChart
        title="Clinic load"
        desc="Binned"
        data={[
          { x: 0, y: 0, value: 1 },
          { x: 9, y: 9, value: 8 },
        ]}
        xBins={2}
        yBins={2}
        {...SIZE}
      />
    ));
    expect(bars(numeric)).toHaveLength(4);
  });

  it("uses a pointer-only surface when the keyboard is off", async () => {
    const { container } = render(() => (
      <HeatmapChart title="Clinic load" desc="Two rooms" data={CELLS} {...SIZE} keyboard={false} />
    ));
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    await hoverAt(surfaceOf(container), 0.25, 0.25);
    expect(container.querySelector("[data-silkplot-pointer-surface]")).not.toBeNull();
  });
});
