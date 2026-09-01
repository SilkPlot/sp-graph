import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { w1DashboardDeck } from "../../../packages/charts/test/workload-fixtures";
import { WorkloadA } from "../app/WorkloadA";
import { WorkloadB } from "../app/WorkloadB";
import { WorkloadC } from "../app/WorkloadC";
import { WorkloadD } from "../app/WorkloadD";
import { WC_CHARTS } from "../app/workloads";
import {
  CONFORMANCE_FAILURE,
  assertDefaultSurfaceAcceptance,
  assertWorkloadRevision,
  resetPublishedComposition,
} from "./composition-conformance";

const DECK = w1DashboardDeck(WC_CHARTS);

const text = (element: Element): string =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim();

const tableRows = (container: Element): number =>
  container.querySelectorAll("[data-silkplot-alternative] tbody tr").length;

const openTableNone = (): void => {
  history.replaceState({}, "", `${location.pathname}?table=none`);
};

async function waitReady(workload: string, timeout = 30_000): Promise<void> {
  await vi.waitFor(
    () => {
      expect(window.__perf?.workload).toBe(workload);
      expect(document.documentElement.hasAttribute("data-perf-ready")).toBe(true);
    },
    { timeout },
  );
}

async function selectHome(container: Element): Promise<HTMLElement> {
  const surface = container.querySelector<HTMLElement>(
    "[data-perf-surface] [data-silkplot-keyboard-surface]",
  );
  expect(surface).not.toBeNull();
  await vi.waitFor(() => {
    expect(surface!.getBoundingClientRect().width).toBeGreaterThan(0);
  });
  surface!.focus();
  await userEvent.keyboard("{Home}");
  await vi.waitFor(() => {
    expect(window.__perf?.lastActive()?.sourceIndex).toBe(0);
  });
  return surface!;
}

afterEach(() => {
  cleanup();
  resetPublishedComposition();
});

describe("table=none is an attribution instrument, not the default surface", () => {
  it("keeps W-A marks and interactions while refusing default-surface acceptance", async () => {
    openTableNone();
    const { container } = render(() => (
      <div id="root">
        <WorkloadA />
      </div>
    ));
    await waitReady("w-a");

    expect(window.__perf?.tableMode).toBe("none");
    expect(container.querySelector("[data-perf-surface]")?.getAttribute("data-perf-table")).toBe(
      "none",
    );
    expect(tableRows(container)).toBe(0);
    assertWorkloadRevision(window.__perf);
    expect(() => assertDefaultSurfaceAcceptance(container)).toThrowError(
      CONFORMANCE_FAILURE.defaultSurface,
    );

    await selectHome(container);
    const tooltip = container.querySelector("[data-silkplot-tooltip]");
    expect(tooltip).not.toBeNull();
    expect(text(tooltip!)).toContain("observed");

    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]"),
    ];
    expect(buttons.length).toBeGreaterThan(0);
    await userEvent.click(buttons[0]!);
    await vi.waitFor(() => {
      expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    });
    expect(tableRows(container)).toBe(0);
  });

  it("keeps W-B marks and interactions while refusing default-surface acceptance", async () => {
    openTableNone();
    const { container } = render(() => (
      <div id="root">
        <div id="surface">
          <WorkloadB />
        </div>
      </div>
    ));
    await waitReady("w-b");

    expect(window.__perf?.tableMode).toBe("none");
    expect(container.querySelector("[data-perf-surface]")?.getAttribute("data-perf-table")).toBe(
      "none",
    );
    expect(tableRows(container)).toBe(0);
    assertWorkloadRevision(window.__perf);
    expect(() => assertDefaultSurfaceAcceptance(container)).toThrowError(
      CONFORMANCE_FAILURE.defaultSurface,
    );

    await selectHome(container);
    const tooltip = container.querySelector("[data-silkplot-tooltip]");
    expect(tooltip).not.toBeNull();
    expect(tooltip!.querySelectorAll("[data-perf-tooltip-series]").length).toBeGreaterThan(1);

    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]"),
    ];
    expect(buttons.length).toBeGreaterThan(1);
    await userEvent.click(buttons[0]!);
    await vi.waitFor(() => {
      expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    });
    expect(tableRows(container)).toBe(0);
  });

  it("keeps W-D marks and interactions while refusing default-surface acceptance", async () => {
    openTableNone();
    const { container } = render(() => (
      <div id="root">
        <WorkloadD />
      </div>
    ));
    await waitReady("w-d", 60_000);

    expect(window.__perf?.tableMode).toBe("none");
    expect(container.querySelector("[data-perf-surface]")?.getAttribute("data-perf-table")).toBe(
      "none",
    );
    expect(tableRows(container)).toBe(0);
    expect(window.__perf?.tableRows).toBe(0);
    assertWorkloadRevision(window.__perf);
    expect(() => assertDefaultSurfaceAcceptance(container)).toThrowError(
      CONFORMANCE_FAILURE.defaultSurface,
    );

    await selectHome(container);
    const tooltip = container.querySelector("[data-silkplot-tooltip]");
    expect(tooltip).not.toBeNull();
    expect(text(tooltip!)).toContain("observed");

    const legend = container.querySelector<HTMLButtonElement>("button[data-sp-legend-item]");
    expect(legend).not.toBeNull();
    await userEvent.click(legend!);
    await vi.waitFor(() => {
      expect(legend?.getAttribute("aria-pressed")).toBe("false");
    });
    expect(tableRows(container)).toBe(0);
  }, 120_000);

  it("keeps W-C on the derived table even when the query asks for none", async () => {
    openTableNone();
    const { container } = render(() => (
      <div id="root">
        <div id="surface">
          <WorkloadC />
        </div>
      </div>
    ));
    await waitReady("w-c");

    expect(window.__perf?.tableMode).toBe("derived");
    expect(container.querySelector("[data-perf-surface]")?.getAttribute("data-perf-table")).toBe(
      "derived",
    );
    assertWorkloadRevision(window.__perf);

    const reveal = window.__perf?.reveal;
    expect(reveal).toBeTypeOf("function");
    await reveal!();

    await vi.waitFor(
      () => {
        expect(
          container.querySelectorAll("[data-perf-deck] [data-silkplot-alternative]"),
        ).toHaveLength(WC_CHARTS);
      },
      { timeout: 30_000 },
    );

    const expectedRows = DECK.map((panel) =>
      panel.family === "bar" ? panel.categories.length : panel.time.length,
    );
    const tables = [
      ...container.querySelectorAll<HTMLTableElement>(
        "[data-perf-deck] [data-silkplot-alternative] table",
      ),
    ];
    expect(tables).toHaveLength(WC_CHARTS);
    expect(tables.map((table) => table.querySelectorAll("tbody tr").length)).toEqual(expectedRows);
    expect(() => assertDefaultSurfaceAcceptance(container)).not.toThrow();
  }, 60_000);
});
