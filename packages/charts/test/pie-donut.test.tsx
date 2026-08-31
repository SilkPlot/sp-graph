/**
 * Pie and donut on Canvas — layout from core, paint on the bitmap, empty
 * SvgLayer for title/desc only. Hover, selection, and a data replacement
 * must all move the same recorded slices.
 */
import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "vitest/browser";
import {
  layoutPieFromObservations,
  type ActivePoint,
  type PieDatum,
  type PieObservation,
} from "@silkplot/core";
import { DonutChart, PieChart } from "../src/PieChart";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  canvasMarksOf,
  paintedSvgInGraphic,
  plotCanvases,
} from "./support";

const SIZE = { width: WIDTH, height: HEIGHT, margins: NO_MARGINS } as const;

const SLICES: PieObservation[] = [
  { label: "North", value: 10 },
  { label: "East", value: 20 },
  { label: "South", value: 30 },
  { label: "West", value: 40 },
];

const AFTER: PieObservation[] = [
  { label: "North", value: 80 },
  { label: "East", value: 5 },
];

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function canvasOf(container: HTMLElement): HTMLCanvasElement {
  const plots = plotCanvases(container);
  expect(plots).toHaveLength(1);
  return plots[0] as HTMLCanvasElement;
}

function slicePaths(container: HTMLElement) {
  return canvasMarksOf(container).filter((m) => m.kind === "path" && m.pattern !== undefined);
}

function sliceLabels(container: HTMLElement) {
  return canvasMarksOf(container).filter((m) => m.kind === "text" && m.role === "slice-label");
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

describe("PieChart paints on Canvas, not SVG marks", () => {
  it("is a named empty SvgLayer with Canvas slices and no painted SVG", () => {
    const { container } = render(() => (
      <PieChart title="Clinic share" desc="Four regions" data={SLICES} {...SIZE} />
    ));
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(container.querySelector("svg title")?.textContent).toBe("Clinic share");
    expect(container.querySelector("svg desc")?.textContent).toBe("Four regions");
    const canvas = canvasOf(container);
    expect(canvas.getAttribute("data-silkplot-clip")).toBe("canvas");
    expect(canvas.hasAttribute("data-silkplot-pattern")).toBe(true);
    expect(slicePaths(container)).toHaveLength(4);
    expect(sliceLabels(container).map((m) => (m.kind === "text" ? m.text : ""))).toEqual([
      "North",
      "East",
      "South",
      "West",
    ]);
    expect(paintedSvgInGraphic(container)).toEqual([]);
    expect(container.querySelector("svg path, svg circle, svg rect, svg line")).toBeNull();
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("[data-silkplot-csv-export]")).not.toBeNull();
  });

  it("encodes a second channel: pattern plus label, colour not unique", () => {
    const { container } = render(() => (
      <PieChart title="Clinic share" desc="Four regions" data={SLICES} {...SIZE} />
    ));
    const paths = slicePaths(container);
    const patterns = paths.map((p) => (p.kind === "path" ? p.pattern : undefined));
    expect(new Set(patterns).size).toBe(4);
    expect(sliceLabels(container)).toHaveLength(4);
    expect(new Set(paths.map((p) => (p.kind === "path" ? p.fill : ""))).size).toBeGreaterThan(1);
    expect(paths.every((p) => p.kind === "path" && p.innerRadius === "0")).toBe(true);
  });

  it("exposes Label/Value/Percent as the semantic alternative", () => {
    const { container } = render(() => (
      <PieChart title="Clinic share" desc="Four regions" data={SLICES} {...SIZE} />
    ));
    const headings = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(headings).toEqual(["Label", "Value", "Percent"]);
    const graphic = container.querySelector("svg[role='img']");
    const table = container.querySelector("table");
    expect(graphic?.getAttribute("aria-details")).toBe(table?.id);
    expect(container.querySelector("tbody th[scope='row']")?.textContent).toBe("North");
    expect(container.querySelector("tbody td")?.textContent).toBe("10");
  });
});

describe("DonutChart is the same pie with a hole", () => {
  it("paints on Canvas with a non-zero inner radius", () => {
    const { container } = render(() => (
      <DonutChart title="Clinic share" desc="Four regions" data={SLICES} {...SIZE} hole={0.4} />
    ));
    expect(canvasOf(container).hasAttribute("data-silkplot-pattern")).toBe(true);
    const paths = slicePaths(container);
    expect(paths).toHaveLength(4);
    expect(paths.every((p) => p.kind === "path" && Number(p.innerRadius) > 0)).toBe(true);
    expect(sliceLabels(container)).toHaveLength(4);
    expect(paintedSvgInGraphic(container)).toEqual([]);
  });

  it("defaults a hole when hole is 0 so the named view stays a donut", () => {
    const { container } = render(() => (
      <DonutChart title="Clinic share" desc="Four regions" data={SLICES} {...SIZE} hole={0} />
    ));
    const inner = slicePaths(container)[0];
    expect(inner?.kind === "path" && Number(inner.innerRadius)).toBeGreaterThan(0);
  });

  it("uses the default hole when the prop is omitted", () => {
    const { container } = render(() => (
      <DonutChart title="Clinic share" desc="Four regions" data={SLICES} {...SIZE} />
    ));
    const inner = slicePaths(container)[0];
    expect(inner?.kind === "path" && Number(inner.innerRadius)).toBeGreaterThan(0);
  });
});

describe("PieChart is interactive and dynamic", () => {
  it("hover writes one active slice, with outline, tooltip, and announcement", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <PieChart
        title="Clinic share"
        desc="Four regions"
        data={SLICES}
        {...SIZE}
        tooltip={(a) => <span data-testid="tt">{a.datum.label}</span>}
        onActivePointChange={onChange}
      />
    ));
    const layout = layoutPieFromObservations(SLICES, {
      width: WIDTH,
      height: HEIGHT,
      hole: 0,
    });
    const first = layout.slices[0]!;
    await hoverPlot(surfaceOf(container), first.centroid.x, first.centroid.y);
    expect(onChange).toHaveBeenCalled();
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<PieDatum> | undefined;
    expect(active?.datum.label).toBe("North");
    expect(container.querySelector('[data-testid="tt"]')?.textContent).toBe("North");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("North");
    expect(slicePaths(container).some((p) => p.kind === "path" && p.strokeWidth === "2")).toBe(true);
  });

  it("keyboard is one listbox tab stop, walks slices, and Enter commits", async () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <PieChart title="Clinic share" desc="Four regions" data={SLICES} {...SIZE} onActivate={onActivate} />
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
    const committed = onActivate.mock.calls.at(-1)?.[0] as ActivePoint<PieDatum>;
    expect(committed.datum.label).toBeDefined();
    await userEvent.keyboard("{Escape}");
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it("a data replacement moves marks, the table, and clamps selection", async () => {
    const [data, setData] = createSignal<readonly PieObservation[]>(SLICES);
    const { container } = render(() => (
      <PieChart title="Clinic share" desc="Four regions" data={data()} {...SIZE} />
    ));
    const surface = surfaceOf(container);
    surface.focus();
    await userEvent.keyboard("{End}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("4");
    const before = slicePaths(container).map((p) => (p.kind === "path" ? p.d : ""));
    const valuesBefore = [...container.querySelectorAll("tbody td:nth-child(2)")].map((td) => td.textContent);
    setData(() => AFTER);
    const after = slicePaths(container).map((p) => (p.kind === "path" ? p.d : ""));
    expect(after).not.toEqual(before);
    expect(slicePaths(container)).toHaveLength(2);
    expect(sliceLabels(container)).toHaveLength(2);
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("2");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-setsize")).toBe("2");
    const valuesAfter = [...container.querySelectorAll("tbody td:nth-child(2)")].map((td) => td.textContent);
    expect(valuesAfter).toEqual(["80", "5"]);
    expect(valuesAfter).not.toEqual(valuesBefore);
    setData(() => []);
    expect(slicePaths(container)).toHaveLength(0);
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it("donut hover misses the hole and hits a ring slice", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <DonutChart
        title="Clinic share"
        desc="Four regions"
        data={SLICES}
        {...SIZE}
        hole={0.5}
        onActivePointChange={onChange}
      />
    ));
    const layout = layoutPieFromObservations(SLICES, {
      width: WIDTH,
      height: HEIGHT,
      hole: 0.5,
    });
    await hoverPlot(surfaceOf(container), layout.cx, layout.cy);
    const afterHole = onChange.mock.calls.at(-1)?.[0] as ActivePoint<PieDatum> | undefined;
    expect(afterHole).toBeUndefined();
    const ring = layout.slices[0]!;
    await hoverPlot(surfaceOf(container), ring.centroid.x, ring.centroid.y);
    const afterRing = onChange.mock.calls.at(-1)?.[0] as ActivePoint<PieDatum> | undefined;
    expect(afterRing?.datum.label).toBe("North");
  });
});

describe("PieChart decorative and custom label", () => {
  it("drops the graphic from the accessibility tree when decorative", () => {
    const { container } = render(() => <PieChart data={SLICES} {...SIZE} decorative />);
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("presentation");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    expect(slicePaths(container)).toHaveLength(4);
  });

  it("uses the caller sliceLabel for the announcement", async () => {
    const { container } = render(() => (
      <PieChart
        title="Clinic share"
        desc="Four regions"
        data={SLICES}
        {...SIZE}
        sliceLabel={(d) => `region ${d.label}`}
      />
    ));
    surfaceOf(container).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("region");
  });

  it("uses a pointer-only surface when the keyboard is off", async () => {
    const { container } = render(() => (
      <PieChart title="Clinic share" desc="Four regions" data={SLICES} {...SIZE} keyboard={false} />
    ));
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    const layout = layoutPieFromObservations(SLICES, { width: WIDTH, height: HEIGHT, hole: 0 });
    const first = layout.slices[0]!;
    await hoverPlot(surfaceOf(container), first.centroid.x, first.centroid.y);
    expect(container.querySelector("[data-silkplot-pointer-surface]")).not.toBeNull();
  });

  it("forwards class onto the named SvgLayer", () => {
    const { container } = render(() => (
      <PieChart title="Clinic share" desc="Four regions" data={SLICES} {...SIZE} class="share-pie" />
    ));
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("share-pie");
  });
});
