/**
 * Bubble on Canvas — size channel from core, paint on the bitmap, empty
 * SvgLayer for title/desc only. Hover, selection, and a data replacement
 * must all move the same recorded points, including size.
 */
import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import {
  BUBBLE_SIZE_LEGEND_RIGHT,
  layoutBubbleFromObservations,
  type ActivePoint,
  type BubbleDatum,
  type BubbleObservation,
} from "@silkplot/core";
import { BubbleChart } from "../src/index";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  canvasMarksOf,
  paintedSvgInGraphic,
  plotCanvases,
} from "./support";

const SIZE = { width: WIDTH, height: HEIGHT, margins: NO_MARGINS } as const;
const PLOT = { width: WIDTH - BUBBLE_SIZE_LEGEND_RIGHT, height: HEIGHT };

const CLOUD: BubbleObservation[] = [
  { x: 0, y: 0, size: 1, series: "North" },
  { x: 10, y: 0, size: 4, series: "North" },
  { x: 0, y: 10, size: 2, series: "South" },
  { x: 10, y: 10, size: 8, series: "South" },
];

const AFTER: BubbleObservation[] = [
  { x: 1, y: 1, size: 10, series: "East" },
  { x: 2, y: 8, size: 3, series: "East" },
];

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function canvasOf(container: HTMLElement): HTMLCanvasElement {
  const plots = plotCanvases(container);
  expect(plots.length).toBeGreaterThanOrEqual(1);
  return plots[0] as HTMLCanvasElement;
}

function bubbleMarks(container: HTMLElement) {
  return canvasMarksOf(container).filter((m) => m.kind === "path" && m.symbol !== undefined);
}

function sizeLegendMarks(container: HTMLElement) {
  return canvasMarksOf(container).filter(
    (m) => (m.kind === "circle" || m.kind === "text") && m.role === "size-legend",
  );
}

function surfaceOf(container: HTMLElement): HTMLElement {
  const surface =
    container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]") ??
    container.querySelector<HTMLElement>("[data-silkplot-pointer-surface]");
  expect(surface).not.toBeNull();
  return surface as HTMLElement;
}

async function hoverPlot(surface: HTMLElement, plotX: number, plotY: number): Promise<void> {
  const rect = surface.getBoundingClientRect();
  surface.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: rect.left + plotX,
      clientY: rect.top + plotY,
    }),
  );
  await frame();
}

describe("BubbleChart paints sized markers on Canvas, not SVG marks", () => {
  it("is a named empty SvgLayer with Canvas bubbles and no painted SVG", () => {
    const { container } = render(() => (
      <BubbleChart title="Clinic load" desc="Two regions" data={CLOUD} {...SIZE} />
    ));
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(container.querySelector("svg title")?.textContent).toBe("Clinic load");
    expect(container.querySelector("svg desc")?.textContent).toBe("Two regions");
    const canvas = canvasOf(container);
    expect(canvas.getAttribute("data-silkplot-clip")).toBe("canvas");
    const marks = bubbleMarks(container);
    expect(marks).toHaveLength(4);
    const radii = marks.map((m) => (m.kind === "path" ? Number(m.r) : 0));
    expect(new Set(radii).size).toBeGreaterThan(1);
    expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii));
    expect(paintedSvgInGraphic(container)).toEqual([]);
    expect(container.querySelector("svg path, svg circle, svg rect, svg line")).toBeNull();
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("[data-silkplot-csv-export]")).not.toBeNull();
  });

  it("encodes series by symbol and label; size is magnitude, not the series channel", () => {
    const { container } = render(() => (
      <BubbleChart title="Clinic load" desc="Two regions" data={CLOUD} {...SIZE} />
    ));
    const marks = bubbleMarks(container);
    const symbols = marks.map((m) => (m.kind === "path" ? m.symbol : undefined));
    expect(new Set(symbols).size).toBe(2);
    expect(symbols.slice(0, 2).every((s) => s === symbols[0])).toBe(true);
    expect(symbols[2]).not.toBe(symbols[0]);
    const headings = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(headings).toEqual(["Series", "X", "Y", "Size"]);
    const series = [...container.querySelectorAll("tbody th[scope='row']")].map((th) => th.textContent);
    expect(series).toEqual(["North", "North", "South", "South"]);
    const sizes = [...container.querySelectorAll("tbody td:nth-child(4)")].map((td) => td.textContent);
    expect(sizes).toEqual(["1", "4", "2", "8"]);
    const fills = marks.map((m) => (m.kind === "path" ? m.fill : ""));
    expect(new Set(fills).size).toBeGreaterThan(1);
  });

  it("draws a size legend on Canvas", () => {
    const { container } = render(() => (
      <BubbleChart title="Clinic load" desc="Two regions" data={CLOUD} {...SIZE} />
    ));
    const legend = sizeLegendMarks(container);
    const swatches = legend.filter((m) => m.kind === "circle");
    const labels = legend.filter((m) => m.kind === "text");
    expect(swatches.length).toBeGreaterThan(1);
    expect(labels.length).toBe(swatches.length);
    const legendRadii = swatches.map((m) => (m.kind === "circle" ? Number(m.r) : 0));
    expect(new Set(legendRadii).size).toBe(swatches.length);
    expect(labels.map((m) => (m.kind === "text" ? m.text : ""))).toContain("1");
    expect(labels.map((m) => (m.kind === "text" ? m.text : ""))).toContain("8");
  });
});

describe("BubbleChart is interactive and dynamic", () => {
  it("hover writes one point including size, with outline, tooltip, and announcement", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <BubbleChart
        title="Clinic load"
        desc="Two regions"
        data={CLOUD}
        {...SIZE}
        tooltip={(a) => <span data-testid="tt">{a.datum.size}</span>}
        onActivePointChange={onChange}
      />
    ));
    const laid = layoutBubbleFromObservations(CLOUD, PLOT);
    const first = laid.marks[0]!;
    await hoverPlot(surfaceOf(container), first.px, first.py);
    expect(onChange).toHaveBeenCalled();
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<BubbleDatum> | undefined;
    expect(active?.datum).toEqual({ series: "North", x: 0, y: 0, size: 1 });
    expect(container.querySelector('[data-testid="tt"]')?.textContent).toBe("1");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("1");
    expect(bubbleMarks(container).some((p) => p.kind === "path" && p.strokeWidth === "2")).toBe(true);
  });

  it("keyboard is one listbox tab stop, walks points, and Enter commits", async () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <BubbleChart title="Clinic load" desc="Two regions" data={CLOUD} {...SIZE} onActivate={onActivate} />
    ));
    const surface = surfaceOf(container);
    expect(surface.getAttribute("role")).toBe("listbox");
    expect(container.querySelector('[role="application"]')).toBeNull();
    expect(container.querySelectorAll('[tabindex="0"]').length).toBe(1);
    surface.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("1");
    await userEvent.keyboard("{End}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("4");
    await userEvent.keyboard("{Home}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("1");
    await userEvent.keyboard("{PageDown}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("4");
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalled();
    const committed = onActivate.mock.calls.at(-1)?.[0] as ActivePoint<BubbleDatum>;
    expect(committed.datum.size).toBeDefined();
    await userEvent.keyboard("{Escape}");
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it("a data replacement moves x/y/size, the table, and clamps selection", async () => {
    const [data, setData] = createSignal<readonly BubbleObservation[]>(CLOUD);
    const { container } = render(() => (
      <BubbleChart title="Clinic load" desc="Two regions" data={data()} {...SIZE} />
    ));
    const surface = surfaceOf(container);
    surface.focus();
    await userEvent.keyboard("{End}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("4");
    const before = bubbleMarks(container).map((m) =>
      m.kind === "path" ? `${m.d}|${m.r}|${m.size}` : "",
    );
    const sizesBefore = [...container.querySelectorAll("tbody td:nth-child(4)")].map((td) => td.textContent);
    setData(() => AFTER);
    const afterMarks = bubbleMarks(container);
    expect(afterMarks).toHaveLength(2);
    expect(afterMarks.map((m) => (m.kind === "path" ? `${m.d}|${m.r}|${m.size}` : ""))).not.toEqual(before);
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("2");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-setsize")).toBe("2");
    const sizesAfter = [...container.querySelectorAll("tbody td:nth-child(4)")].map((td) => td.textContent);
    expect(sizesAfter).toEqual(["10", "3"]);
    expect(sizesAfter).not.toEqual(sizesBefore);
    const seriesAfter = [...container.querySelectorAll("tbody th[scope='row']")].map((th) => th.textContent);
    expect(seriesAfter).toEqual(["East", "East"]);
    setData(() => []);
    expect(bubbleMarks(container)).toHaveLength(0);
    expect(sizeLegendMarks(container)).toHaveLength(0);
    expect(container.querySelector('[role="option"]')).toBeNull();
  });
});

describe("BubbleChart decorative and custom label", () => {
  it("drops the graphic from the accessibility tree when decorative", () => {
    const { container } = render(() => <BubbleChart data={CLOUD} {...SIZE} decorative />);
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("presentation");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    expect(bubbleMarks(container).length).toBe(4);
  });

  it("uses the caller pointLabel for the announcement", async () => {
    const { container } = render(() => (
      <BubbleChart
        title="Clinic load"
        desc="Two regions"
        data={CLOUD}
        {...SIZE}
        pointLabel={(d) => `load ${d.size}`}
      />
    ));
    surfaceOf(container).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("load");
  });

  it("uses a pointer-only surface when the keyboard is off", async () => {
    const { container } = render(() => (
      <BubbleChart title="Clinic load" desc="Two regions" data={CLOUD} {...SIZE} keyboard={false} />
    ));
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    const laid = layoutBubbleFromObservations(CLOUD, PLOT);
    const first = laid.marks[0]!;
    await hoverPlot(surfaceOf(container), first.px, first.py);
    expect(container.querySelector("[data-silkplot-pointer-surface]")).not.toBeNull();
  });

  it("forwards class onto the named SvgLayer and honours a radius range", () => {
    const { container } = render(() => (
      <BubbleChart
        title="Clinic load"
        desc="Two regions"
        data={CLOUD}
        {...SIZE}
        class="load-bubble"
        minRadius={6}
        maxRadius={12}
        fillOpacity={0.4}
      />
    ));
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("load-bubble");
    const radii = bubbleMarks(container).map((m) => (m.kind === "path" ? Number(m.r) : 0));
    expect(Math.min(...radii)).toBeCloseTo(6);
    expect(Math.max(...radii)).toBeCloseTo(12);
    expect(bubbleMarks(container).every((m) => m.kind === "path" && m.fillOpacity === "0.4")).toBe(
      true,
    );
  });
});
