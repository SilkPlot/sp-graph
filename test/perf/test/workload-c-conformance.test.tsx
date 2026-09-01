import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { w1DashboardDeck } from "../../../packages/charts/test/workload-fixtures";
import { WorkloadC } from "../app/WorkloadC";
import { WC_CHARTS } from "../app/workloads";

const DECK = w1DashboardDeck(WC_CHARTS);
const FIRST_LOCAL_TIME = "2026/01/01, 02:00:00";

const text = (element: Element): string =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim();

const units = (value: number): string => `${value.toFixed(1).replace(".", ",")} units`;

const graphics = (container: Element): SVGSVGElement[] => [
  ...container.querySelectorAll<SVGSVGElement>('[data-perf-deck] svg[role="img"]'),
];

const alternatives = (container: Element): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(
    "[data-perf-deck] [data-silkplot-alternative]",
  ),
];

const surfaceFor = (container: Element, title: string): HTMLElement | undefined =>
  [
    ...container.querySelectorAll<HTMLElement>(
      "[data-perf-deck] [data-silkplot-keyboard-surface]",
    ),
  ].find((surface) => surface.getAttribute("aria-label")?.startsWith(`${title}. `));

async function mountRevealedWorkload(): Promise<HTMLElement> {
  history.replaceState({}, "", location.pathname);
  const { container } = render(() => (
    <div id="root">
      <div id="surface">
        <WorkloadC />
      </div>
    </div>
  ));

  await vi.waitFor(
    () => {
      expect(window.__perf?.workload).toBe("w-c");
      expect(document.documentElement.hasAttribute("data-perf-ready")).toBe(true);
    },
    { timeout: 30_000 },
  );

  const reveal = window.__perf?.reveal;
  expect(reveal).toBeTypeOf("function");
  await reveal!();

  await vi.waitFor(
    () => {
      expect(graphics(container)).toHaveLength(WC_CHARTS);
      expect(alternatives(container)).toHaveLength(WC_CHARTS);
      expect(Number(graphics(container)[0]?.getAttribute("width"))).toBeGreaterThan(0);
    },
    { timeout: 30_000 },
  );
  return container;
}

async function selectFirstDatum(surface: HTMLElement): Promise<void> {
  surface.focus();
  await userEvent.keyboard("{Home}");
  await vi.waitFor(() => {
    expect(document.activeElement).toBe(surface);
    expect(surface.querySelector('[role="option"]')?.getAttribute("aria-posinset")).toBe("1");
  });
}

afterEach(() => {
  window.__perf = undefined;
  document.documentElement.removeAttribute("data-perf-ready");
  history.replaceState({}, "", location.pathname);
});

describe("W-C representative composition", () => {
  it("renders the first line panel's localized Home value in a real tooltip", async () => {
    const panel = DECK[0]!;
    const first = panel.time[0]!;
    expect(panel.family).toBe("line");
    expect(first.t.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(first.y).toBe(0);

    const container = await mountRevealedWorkload();
    const surface = surfaceFor(container, panel.title);
    expect(surface).toBeDefined();
    await selectFirstDatum(surface!);

    const tooltip = surface!.parentElement?.querySelector("[data-silkplot-tooltip]");
    expect(tooltip).not.toBeNull();
    expect(text(tooltip!)).toContain(FIRST_LOCAL_TIME);
    expect(text(tooltip!)).toContain(units(first.y));
  });

  it("renders the first area panel's localized Home value in a real tooltip", async () => {
    const panel = DECK[1]!;
    const first = panel.time[0]!;
    expect(panel.family).toBe("area");
    expect(first.t.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(first.y).toBe(7.7);

    const container = await mountRevealedWorkload();
    const surface = surfaceFor(container, panel.title);
    expect(surface).toBeDefined();
    await selectFirstDatum(surface!);

    const tooltip = surface!.parentElement?.querySelector("[data-silkplot-tooltip]");
    expect(tooltip).not.toBeNull();
    expect(text(tooltip!)).toContain(FIRST_LOCAL_TIME);
    expect(text(tooltip!)).toContain(units(first.y));
  });

  it("renders the first ranked-bar category and formatted value in a real tooltip", async () => {
    const panel = DECK[2]!;
    const first = panel.categories[0]!;
    expect(panel.family).toBe("bar");
    expect(first).toMatchObject({ label: "Cat 1", value: 44 });

    const container = await mountRevealedWorkload();
    const surface = surfaceFor(container, panel.title);
    expect(surface).toBeDefined();
    await selectFirstDatum(surface!);

    const tooltip = surface!.parentElement?.querySelector("[data-silkplot-tooltip]");
    expect(tooltip).not.toBeNull();
    expect(text(tooltip!)).toContain(first.label);
    expect(text(tooltip!)).toContain(units(first.value));
  });

  it("updates the first panel's semantic title and summary after the real narrow resize", async () => {
    const container = await mountRevealedWorkload();
    const firstGraphic = graphics(container)[0]!;
    const firstAlternative = alternatives(container)[0]!;
    expect(firstGraphic.querySelector("title")?.textContent).toBe("Panel 1");
    expect(firstAlternative.querySelector(":scope > p")?.textContent).toBe(
      "Panel 1 of 48 in the mounted deck.",
    );

    const resize = window.__perf?.resize;
    expect(resize).toBeTypeOf("function");
    await resize!(720);

    expect.soft(firstGraphic.querySelector("title")?.textContent).toBe("Panel 1 — narrow");
    expect.soft(firstAlternative.querySelector(":scope > p")?.textContent).toBe(
      "Panel 1 of 48 in the mounted deck, using the narrow layout.",
    );
  });

  it("keeps all forty-eight revealed tables semantic and source-faithful", async () => {
    const container = await mountRevealedWorkload();
    const regions = alternatives(container);
    const expectedRows = DECK.map((panel) =>
      panel.family === "bar" ? panel.categories.length : panel.time.length,
    );

    expect(regions).toHaveLength(WC_CHARTS);
    const tables = regions.map((region, index) => {
      const toggle = region.querySelector<HTMLButtonElement>("[data-silkplot-table-toggle]");
      const table = region.querySelector<HTMLTableElement>("table");
      expect(toggle, `table disclosure for panel ${index + 1}`).not.toBeNull();
      expect(toggle?.getAttribute("aria-expanded")).toBe("false");
      expect(table, `semantic table for panel ${index + 1}`).not.toBeNull();
      expect(table?.querySelector('thead th[scope="col"]')).not.toBeNull();
      expect(table?.querySelector('tbody th[scope="row"]')).not.toBeNull();
      return table!;
    });

    expect(tables.map((table) => table.querySelectorAll("tbody tr").length)).toEqual(
      expectedRows,
    );

    for (const index of [0, 1, 2] as const) {
      const panel = DECK[index]!;
      const region = regions[index]!;
      const table = tables[index]!;
      const toggle = region.querySelector<HTMLButtonElement>("[data-silkplot-table-toggle]")!;

      await userEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(region.querySelector("[data-silkplot-table-scroll]")?.getAttribute("tabindex")).toBe(
        "0",
      );

      const panelHeadings = [...table.querySelectorAll('thead th[scope="col"]')].map((heading) =>
        text(heading),
      );
      const firstRow = table.querySelector("tbody tr");
      const firstCells = [...(firstRow?.children ?? [])].map((cell) => text(cell));

      if (panel.family === "bar") {
        const first = panel.categories[0]!;
        expect(panelHeadings).toEqual(["Category", "Value"]);
        expect(firstCells).toEqual([first.label, String(first.value)]);
      } else {
        const first = panel.time[0]!;
        expect(panelHeadings).toEqual(["Time", "Value"]);
        expect(firstCells).toEqual([first.t.toISOString(), String(first.y)]);
      }
    }
  });
});
