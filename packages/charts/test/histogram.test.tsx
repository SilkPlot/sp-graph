/**
 * Histogram on Canvas — D3 bins from core, bin rects on the bitmap, empty
 * SvgLayer for title/desc only. Hover, selection, and a data replacement
 * must all move the same recorded bins.
 */
import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "vitest/browser";
import {
  layoutHistogramFromObservations,
  type ActivePoint,
  type HistogramDatum,
  type HistogramObservation,
} from "@silkplot/core";
import { HistogramChart } from "../src/HistogramChart";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  bars,
  canvasMarksOf,
  paintedSvgInGraphic,
  plotCanvases,
} from "./support";

const SIZE = { width: WIDTH, height: HEIGHT, margins: NO_MARGINS } as const;
const BINS = { thresholds: 4, domain: [0, 10] as const };

const SPREAD: HistogramObservation[] = [
  { value: 0 },
  { value: 1 },
  { value: 2 },
  { value: 3 },
  { value: 4 },
  { value: 5 },
  { value: 6 },
  { value: 7 },
  { value: 8 },
  { value: 9 },
];

const AFTER: HistogramObservation[] = [{ value: 1 }, { value: 2 }];

const MULTI: HistogramObservation[] = [
  { value: 1, series: "North" },
  { value: 2, series: "North" },
  { value: 8, series: "South" },
  { value: 9, series: "South" },
];

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function canvasOf(container: HTMLElement): HTMLCanvasElement {
  const plots = plotCanvases(container);
  expect(plots.length).toBeGreaterThanOrEqual(1);
  return plots[0] as HTMLCanvasElement;
}

function binRects(container: HTMLElement) {
  return canvasMarksOf(container).filter((m) => m.kind === "rect" && m.role !== "brush");
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

describe("HistogramChart paints bin rects on Canvas, not SVG marks", () => {
  it("is a named empty SvgLayer with Canvas bins and no painted SVG", () => {
    const { container } = render(() => (
      <HistogramChart title="Wait times" desc="Ten visits" data={SPREAD} {...BINS} {...SIZE} />
    ));
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(container.querySelector("svg title")?.textContent).toBe("Wait times");
    expect(container.querySelector("svg desc")?.textContent).toBe("Ten visits");
    const canvas = canvasOf(container);
    expect(canvas.getAttribute("data-silkplot-clip")).toBe("canvas");
    expect(binRects(container)).toHaveLength(4);
    expect(bars(container)).toHaveLength(4);
    expect(paintedSvgInGraphic(container)).toEqual([]);
    expect(container.querySelector("svg path, svg circle, svg rect, svg line")).toBeNull();
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("[data-silkplot-csv-export]")).not.toBeNull();
  });

  it("exposes bin start, bin end, and count as the semantic alternative", () => {
    const { container } = render(() => (
      <HistogramChart title="Wait times" desc="Ten visits" data={SPREAD} {...BINS} {...SIZE} />
    ));
    const headings = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(headings).toEqual(["Bin start", "Bin end", "Count"]);
    const starts = [...container.querySelectorAll("tbody th[scope='row']")].map((th) => th.textContent);
    expect(starts).toEqual(["0", "2.5", "5", "7.5"]);
    const counts = [...container.querySelectorAll("tbody td:nth-child(3)")].map((td) => td.textContent);
    expect(counts).toEqual(["3", "2", "3", "2"]);
  });

  it("adds density to the table when that channel is drawn", () => {
    const { container } = render(() => (
      <HistogramChart
        title="Wait times"
        desc="Ten visits"
        data={SPREAD}
        {...BINS}
        {...SIZE}
        value="density"
      />
    ));
    const headings = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(headings).toEqual(["Bin start", "Bin end", "Count", "Density"]);
    expect(container.querySelector("tbody td:nth-child(4)")?.textContent).not.toBe("");
  });

  it("keeps series labels when density is the drawn channel", () => {
    const { container } = render(() => (
      <HistogramChart
        title="Wait times"
        desc="Two clinics"
        data={MULTI}
        {...BINS}
        {...SIZE}
        value="density"
      />
    ));
    const headings = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(headings).toEqual(["Series", "Bin start", "Bin end", "Count", "Density"]);
  });

  it("encodes multi-series by fill pattern and labels, not colour alone", () => {
    const { container } = render(() => (
      <HistogramChart title="Wait times" desc="Two clinics" data={MULTI} {...BINS} {...SIZE} />
    ));
    expect(canvasOf(container).hasAttribute("data-silkplot-pattern")).toBe(true);
    const marks = binRects(container);
    expect(marks.length).toBeGreaterThan(1);
    const patterns = marks.map((m) => (m.kind === "rect" ? m.pattern : undefined));
    expect(new Set(patterns).size).toBeGreaterThan(1);
    const headings = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(headings).toEqual(["Series", "Bin start", "Bin end", "Count"]);
    const series = [...container.querySelectorAll("tbody th[scope='row']")].map((th) => th.textContent);
    expect(series).toContain("North");
    expect(series).toContain("South");
    const fills = marks.map((m) => (m.kind === "rect" ? m.fill : ""));
    expect(new Set(fills).size).toBeGreaterThan(1);
  });

  it("does not uniquely encode a single series with a fill pattern", () => {
    const { container } = render(() => (
      <HistogramChart title="Wait times" desc="Ten visits" data={SPREAD} {...BINS} {...SIZE} />
    ));
    expect(canvasOf(container).hasAttribute("data-silkplot-pattern")).toBe(false);
    expect(binRects(container).every((m) => m.kind === "rect" && m.pattern === undefined)).toBe(true);
  });
});

describe("HistogramChart is interactive and dynamic", () => {
  it("hover writes one bin (interval plus count), with outline, tooltip, and announcement", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <HistogramChart
        title="Wait times"
        desc="Ten visits"
        data={SPREAD}
        {...BINS}
        {...SIZE}
        tooltip={(a) => <span data-testid="tt">{a.datum.count}</span>}
        onActivePointChange={onChange}
      />
    ));
    const laid = layoutHistogramFromObservations(SPREAD, {
      width: WIDTH,
      height: HEIGHT,
      ...BINS,
    });
    const first = laid.marks[0]!;
    await hoverPlot(surfaceOf(container), first.x + first.width / 2, first.y + first.height / 2);
    expect(onChange).toHaveBeenCalled();
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<HistogramDatum> | undefined;
    expect(active?.datum.x0).toBe(0);
    expect(active?.datum.x1).toBe(2.5);
    expect(active?.datum.count).toBe(3);
    expect(active?.datum.density).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="tt"]')?.textContent).toBe("3");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("3");
    expect(binRects(container).some((m) => m.kind === "rect" && m.strokeWidth === "2")).toBe(true);
  });

  it("hover on a density histogram resolves density as the drawn measure", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <HistogramChart
        title="Wait times"
        desc="Ten visits"
        data={SPREAD}
        {...BINS}
        {...SIZE}
        value="density"
        onActivePointChange={onChange}
      />
    ));
    const laid = layoutHistogramFromObservations(SPREAD, {
      width: WIDTH,
      height: HEIGHT,
      ...BINS,
      value: "density",
    });
    const first = laid.marks[0]!;
    await hoverPlot(surfaceOf(container), first.x + first.width / 2, first.y + first.height / 2);
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<HistogramDatum> | undefined;
    expect(active?.datum.density).toBe(first.density);
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain(String(first.density));
  });

  it("keyboard is one listbox tab stop, walks bins, and Enter commits", async () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <HistogramChart
        title="Wait times"
        desc="Ten visits"
        data={SPREAD}
        {...BINS}
        {...SIZE}
        onActivate={onActivate}
      />
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
    const committed = onActivate.mock.calls.at(-1)?.[0] as ActivePoint<HistogramDatum>;
    expect(committed.datum.x0).toBeDefined();
    expect(committed.datum.x1).toBeDefined();
    expect(committed.datum.count).toBeDefined();
    await userEvent.keyboard("{Escape}");
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it("a data replacement recomputes bins, moves the table, and clamps selection", async () => {
    const [data, setData] = createSignal<readonly HistogramObservation[]>(SPREAD);
    const { container } = render(() => (
      <HistogramChart title="Wait times" desc="Ten visits" data={data()} {...BINS} {...SIZE} />
    ));
    const surface = surfaceOf(container);
    surface.focus();
    await userEvent.keyboard("{End}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("4");
    const before = binRects(container).map((m) =>
      m.kind === "rect" ? `${m.x}|${m.width}|${m.height}` : "",
    );
    const countsBefore = [...container.querySelectorAll("tbody td:nth-child(3)")].map(
      (td) => td.textContent,
    );
    setData(() => AFTER);
    const afterMarks = binRects(container);
    expect(afterMarks).toHaveLength(1);
    expect(afterMarks.map((m) => (m.kind === "rect" ? `${m.x}|${m.width}|${m.height}` : ""))).not.toEqual(
      before,
    );
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("1");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-setsize")).toBe("1");
    const countsAfter = [...container.querySelectorAll("tbody td:nth-child(3)")].map(
      (td) => td.textContent,
    );
    expect(countsAfter).not.toEqual(countsBefore);
    expect(countsAfter.reduce((n, c) => n + Number(c), 0)).toBe(2);
    setData(() => []);
    expect(binRects(container)).toHaveLength(0);
    expect(container.querySelector('[role="option"]')).toBeNull();
  });
});

describe("HistogramChart decorative and custom label", () => {
  it("drops the graphic from the accessibility tree when decorative", () => {
    const { container } = render(() => (
      <HistogramChart data={SPREAD} {...BINS} {...SIZE} decorative />
    ));
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("presentation");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    expect(binRects(container).length).toBe(4);
  });

  it("uses the caller binLabel for the announcement", async () => {
    const { container } = render(() => (
      <HistogramChart
        title="Wait times"
        desc="Ten visits"
        data={SPREAD}
        {...BINS}
        {...SIZE}
        binLabel={(d) => `interval ${d.x0}`}
      />
    ));
    surfaceOf(container).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("interval");
  });

  it("uses a pointer-only surface when the keyboard is off", async () => {
    const { container } = render(() => (
      <HistogramChart title="Wait times" desc="Ten visits" data={SPREAD} {...BINS} {...SIZE} keyboard={false} />
    ));
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    const laid = layoutHistogramFromObservations(SPREAD, { width: WIDTH, height: HEIGHT, ...BINS });
    const first = laid.marks[0]!;
    await hoverPlot(surfaceOf(container), first.x + first.width / 2, first.y + first.height / 2);
    expect(container.querySelector("[data-silkplot-pointer-surface]")).not.toBeNull();
  });

  it("forwards class onto the named SvgLayer", () => {
    const { container } = render(() => (
      <HistogramChart
        title="Wait times"
        desc="Ten visits"
        data={SPREAD}
        {...BINS}
        {...SIZE}
        class="wait-hist"
      />
    ));
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("wait-hist");
  });
});
