/**
 * Tree, treemap, and pack on Canvas — layout from core, paint on the bitmap,
 * empty SvgLayer for title/desc only. Hover, selection, and a data replacement
 * must all move the same recorded nodes.
 */
import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "vitest/browser";
import {
  layoutPackFromObservations,
  layoutTreeFromObservations,
  layoutTreemapFromObservations,
  type ActivePoint,
  type HierarchyDatum,
  type HierarchyObservation,
} from "@silkplot/core";
import { PackChart, TreeChart, TreemapChart } from "../src/HierarchyChart";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  canvasMarksOf,
  paintedSvgInGraphic,
  plotCanvases,
} from "./support";

const SIZE = { width: WIDTH, height: HEIGHT, margins: NO_MARGINS } as const;
const BOX = { width: WIDTH, height: HEIGHT };

const ORG: HierarchyObservation[] = [
  { id: "clinic", value: 0 },
  { id: "north", parent: "clinic", value: 0 },
  { id: "south", parent: "clinic", value: 0 },
  { id: "n1", parent: "north", value: 10 },
  { id: "n2", parent: "north", value: 20 },
  { id: "s1", parent: "south", value: 30 },
];

const AFTER: HierarchyObservation[] = [
  { id: "clinic", value: 1 },
  { id: "east", parent: "clinic", value: 80 },
];

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function canvasOf(container: HTMLElement): HTMLCanvasElement {
  const plots = plotCanvases(container);
  expect(plots).toHaveLength(1);
  return plots[0] as HTMLCanvasElement;
}

function nodeMarks(container: HTMLElement, kind: "tree" | "treemap" | "pack") {
  const marks = canvasMarksOf(container);
  if (kind === "treemap") return marks.filter((m) => m.kind === "rect" && m.pattern !== undefined);
  return marks.filter((m) => m.kind === "circle" && m.pattern !== undefined);
}

function nodeLabels(container: HTMLElement) {
  return canvasMarksOf(container).filter((m) => m.kind === "text" && m.role === "node-label");
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

function hitPoint(kind: "tree" | "treemap" | "pack"): { x: number; y: number; id: string } {
  if (kind === "tree") {
    const node = layoutTreeFromObservations(ORG, BOX).nodes.find((n) => n.id === "clinic")!;
    return { x: node.x, y: node.y, id: "clinic" };
  }
  if (kind === "treemap") {
    const node = layoutTreemapFromObservations(ORG, BOX).find((n) => n.id === "n1")!;
    return { x: node.x + node.width / 2, y: node.y + node.height / 2, id: "n1" };
  }
  const node = layoutPackFromObservations(ORG, BOX).find((n) => n.id === "n1")!;
  return { x: node.x, y: node.y, id: "n1" };
}

const VIEWS = [
  { kind: "tree" as const, Chart: TreeChart, title: "Clinic tree" },
  { kind: "treemap" as const, Chart: TreemapChart, title: "Clinic treemap" },
  { kind: "pack" as const, Chart: PackChart, title: "Clinic pack" },
];

describe.each(VIEWS)("$kind paints on Canvas, not SVG marks", ({ kind, Chart, title }) => {
  it("is a named empty SvgLayer with Canvas nodes and no painted SVG", () => {
    const { container } = render(() => <Chart title={title} desc="Org units" data={ORG} {...SIZE} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(container.querySelector("svg title")?.textContent).toBe(title);
    expect(container.querySelector("svg desc")?.textContent).toBe("Org units");
    const canvas = canvasOf(container);
    expect(canvas.getAttribute("data-silkplot-clip")).toBe("canvas");
    expect(canvas.hasAttribute("data-silkplot-pattern")).toBe(true);
    expect(nodeMarks(container, kind).length).toBeGreaterThan(1);
    expect(nodeLabels(container).map((m) => (m.kind === "text" ? m.text : ""))).toContain("clinic");
    expect(paintedSvgInGraphic(container)).toEqual([]);
    expect(container.querySelector("svg path, svg circle, svg rect, svg line")).toBeNull();
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("[data-silkplot-csv-export]")).not.toBeNull();
  });

  it("encodes a second channel: pattern plus label, colour not unique", () => {
    const { container } = render(() => <Chart title={title} desc="Org units" data={ORG} {...SIZE} />);
    const nodes = nodeMarks(container, kind);
    const patterns = nodes.map((n) =>
      n.kind === "rect" || n.kind === "circle" || n.kind === "path" ? n.pattern : undefined,
    );
    expect(new Set(patterns).size).toBeGreaterThan(1);
    expect(nodeLabels(container).length).toBe(nodes.length);
    const fills = nodes.map((n) => (n.kind === "rect" || n.kind === "circle" ? n.fill : ""));
    expect(new Set(fills).size).toBeGreaterThan(1);
  });

  it("exposes Id/Parent/Value as the semantic alternative", () => {
    const { container } = render(() => <Chart title={title} desc="Org units" data={ORG} {...SIZE} />);
    const headings = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(headings).toEqual(["Id", "Parent", "Value"]);
    const graphic = container.querySelector("svg[role='img']");
    const table = container.querySelector("table");
    expect(graphic?.getAttribute("aria-details")).toBe(table?.id);
    expect(container.querySelector("tbody th[scope='row']")?.textContent).toBe("clinic");
  });
});

describe("TreeChart draws links as Canvas lines, not SVG", () => {
  it("records one link per parent/child edge", () => {
    const { container } = render(() => (
      <TreeChart title="Clinic tree" desc="Org units" data={ORG} {...SIZE} />
    ));
    const links = canvasMarksOf(container).filter((m) => m.kind === "line" && m.role === "link");
    expect(links).toHaveLength(5);
  });
});

describe.each(VIEWS)("$kind is interactive and dynamic", ({ kind, Chart, title }) => {
  it("hover writes one active node, with outline, tooltip, and announcement", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <Chart
        title={title}
        desc="Org units"
        data={ORG}
        {...SIZE}
        tooltip={(a) => <span data-testid="tt">{a.datum.id}</span>}
        onActivePointChange={onChange}
      />
    ));
    const hit = hitPoint(kind);
    await hoverPlot(surfaceOf(container), hit.x, hit.y);
    expect(onChange).toHaveBeenCalled();
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<HierarchyDatum> | undefined;
    expect(active?.datum.id).toBe(hit.id);
    expect(container.querySelector('[data-testid="tt"]')?.textContent).toBe(hit.id);
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain(hit.id);
    const nodes = nodeMarks(container, kind);
    expect(
      nodes.some(
        (n) => (n.kind === "rect" || n.kind === "circle") && n.strokeWidth === "2",
      ),
    ).toBe(true);
  });

  it("keyboard is one listbox tab stop, walks nodes, and Enter commits", async () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <Chart title={title} desc="Org units" data={ORG} {...SIZE} onActivate={onActivate} />
    ));
    const surface = surfaceOf(container);
    expect(surface.getAttribute("role")).toBe("listbox");
    expect(container.querySelector('[role="application"]')).toBeNull();
    expect(container.querySelectorAll('[tabindex="0"]').length).toBe(1);
    surface.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("1");
    await userEvent.keyboard("{End}");
    const last = String(nodeMarks(container, kind).length);
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe(last);
    await userEvent.keyboard("{Home}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("1");
    await userEvent.keyboard("{PageDown}");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe(last);
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalled();
    const committed = onActivate.mock.calls.at(-1)?.[0] as ActivePoint<HierarchyDatum>;
    expect(committed.datum.id).toBeDefined();
    await userEvent.keyboard("{Escape}");
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it("a data replacement moves marks, the table, and clamps selection", async () => {
    const [data, setData] = createSignal<readonly HierarchyObservation[]>(ORG);
    const { container } = render(() => <Chart title={title} desc="Org units" data={data()} {...SIZE} />);
    const surface = surfaceOf(container);
    surface.focus();
    await userEvent.keyboard("{End}");
    const beforeCount = nodeMarks(container, kind).length;
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe(String(beforeCount));
    const before = nodeMarks(container, kind).map((n) =>
      n.kind === "circle" ? `${n.cx},${n.cy},${n.r}` : n.kind === "rect" ? `${n.x},${n.y},${n.width}` : "",
    );
    setData(() => AFTER);
    const afterMarks = nodeMarks(container, kind);
    expect(afterMarks).toHaveLength(2);
    expect(afterMarks.map((n) => (n.kind === "circle" ? `${n.cx},${n.cy},${n.r}` : n.kind === "rect" ? `${n.x},${n.y},${n.width}` : ""))).not.toEqual(
      before,
    );
    expect(nodeLabels(container)).toHaveLength(2);
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("2");
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-setsize")).toBe("2");
    const idsAfter = [...container.querySelectorAll("tbody th[scope='row']")].map((th) => th.textContent);
    expect(idsAfter).toEqual(["clinic", "east"]);
    setData(() => []);
    expect(nodeMarks(container, kind)).toHaveLength(0);
    expect(container.querySelector('[role="option"]')).toBeNull();
  });
});

describe.each(VIEWS)("$kind decorative and custom label", ({ kind, Chart, title }) => {
  it("drops the graphic from the accessibility tree when decorative", () => {
    const { container } = render(() => <Chart data={ORG} {...SIZE} decorative />);
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("presentation");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    expect(nodeMarks(container, kind).length).toBeGreaterThan(1);
  });

  it("uses the caller nodeLabel for the announcement", async () => {
    const { container } = render(() => (
      <Chart title={title} desc="Org units" data={ORG} {...SIZE} nodeLabel={(d) => `unit ${d.id}`} />
    ));
    surfaceOf(container).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("unit");
  });

  it("uses a pointer-only surface when the keyboard is off", async () => {
    const { container } = render(() => (
      <Chart title={title} desc="Org units" data={ORG} {...SIZE} keyboard={false} />
    ));
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    const hit = hitPoint(kind);
    await hoverPlot(surfaceOf(container), hit.x, hit.y);
    expect(container.querySelector("[data-silkplot-pointer-surface]")).not.toBeNull();
  });

  it("forwards class onto the named SvgLayer", () => {
    const { container } = render(() => (
      <Chart title={title} desc="Org units" data={ORG} {...SIZE} class="org-view" />
    ));
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("org-view");
  });
});
