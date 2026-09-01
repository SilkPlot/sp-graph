import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  W1_REFERENCE_COUNT,
  W1_SERIES_COUNT,
  w1DenseSeries,
  w1References,
} from "../../../packages/charts/test/workload-fixtures";
import { WorkloadB } from "../app/WorkloadB";
import { assertWorkloadRevision, resetPublishedComposition } from "./composition-conformance";

const SOURCE = w1DenseSeries();
const REFERENCES = w1References();
const TITLE = "W-B — twenty-two sensors with three references";
const SUMMARY =
  "Twenty-two same-domain sensor series crossing zero, with two value references and one temporal reference.";
const FIRST_LOCAL_TIME = "2026/01/01, 02:00:00";
const MAINTENANCE_LOCAL_TIME = "2026/01/19, 02:00:00";

const sourceAtFirstInstant = () => {
  const instant = SOURCE[0]?.data[0]?.t.getTime();
  if (instant === undefined) throw new Error("W-B source has no first instant");

  return SOURCE.map((series) => {
    const datum = series.data.find((candidate) => candidate.t.getTime() === instant);
    if (datum === undefined || datum.y === null) {
      throw new Error(`W-B source has no present ${series.id} value at its first instant`);
    }
    return { id: series.id, label: series.label, time: datum.t, value: datum.y };
  });
};

const power = (value: number): string => `${value.toFixed(1).replace(".", ",")} kW`;

const text = (element: Element): string =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim();

const headings = (container: Element): string[] =>
  [...container.querySelectorAll('thead th[scope="col"]')].map((heading) => text(heading));

async function mountDefaultWorkload(): Promise<HTMLElement> {
  history.replaceState({}, "", location.pathname);
  const { container } = render(() => (
    <div id="root">
      <div id="surface">
        <WorkloadB />
      </div>
    </div>
  ));

  await vi.waitFor(
    () => {
      expect(window.__perf?.workload).toBe("w-b");
      expect(document.documentElement.hasAttribute("data-perf-ready")).toBe(true);
      assertWorkloadRevision(window.__perf);
    },
    { timeout: 30_000 },
  );
  return container;
}

afterEach(() => {
  cleanup();
  resetPublishedComposition();
});

describe("W-B representative composition", () => {
  it("renders the Home instant and all twenty-two same-time values in its tooltip", async () => {
    const expected = sourceAtFirstInstant();
    expect(expected).toHaveLength(W1_SERIES_COUNT);
    expect(expected[0]?.time.toISOString()).toBe("2026-01-01T00:00:00.000Z");

    const container = await mountDefaultWorkload();
    const surface = container.querySelector<HTMLElement>(
      "[data-perf-surface] [data-silkplot-keyboard-surface]",
    );
    expect(surface).not.toBeNull();

    surface!.focus();
    await userEvent.keyboard("{Home}");

    await vi.waitFor(() => {
      expect(window.__perf?.lastActive()).toMatchObject({
        seriesId: expected[0]?.id,
        sourceIndex: 0,
        time: expected[0]?.time.toISOString(),
        y: expected[0]?.value,
      });
    });

    const tooltip = container.querySelector("[data-silkplot-tooltip]");
    expect(tooltip).not.toBeNull();
    expect(text(tooltip!)).toContain(FIRST_LOCAL_TIME);

    const rows = [
      ...tooltip!.querySelectorAll<HTMLElement>("[data-perf-tooltip-series]"),
    ];
    expect(rows).toHaveLength(W1_SERIES_COUNT);
    for (const entry of expected) {
      const row = rows.find((candidate) => candidate.dataset.perfTooltipSeries === entry.id);
      expect(row, `tooltip row for ${entry.id}`).toBeDefined();
      expect(text(row!)).toContain(entry.label);
      expect(text(row!)).toContain(power(entry.value));
    }
  });

  it("formats all three labelled references with caller-owned time and power wording", async () => {
    const container = await mountDefaultWorkload();
    const items = [
      ...container.querySelectorAll<HTMLElement>("[data-silkplot-reference-item]"),
    ];

    expect(REFERENCES).toHaveLength(W1_REFERENCE_COUNT);
    expect(items).toHaveLength(W1_REFERENCE_COUNT);
    expect(items.map((item) => item.dataset.silkplotReferenceItem)).toEqual(
      REFERENCES.map((reference) => reference.id),
    );
    expect(items.map((item) => text(item))).toEqual([
      `Upper limit: ${power(18)}`,
      `Warning: ${power(16.5)}`,
      `Maintenance: ${MAINTENANCE_LOCAL_TIME}`,
    ]);
  });

  it("keeps its twenty-two-button legend controlled by the chart's visible-series state", async () => {
    const expected = sourceAtFirstInstant();
    const container = await mountDefaultWorkload();
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]"),
    ];

    expect(buttons).toHaveLength(W1_SERIES_COUNT);
    expect(buttons.map((button) => button.dataset.spLegendItem)).toEqual(
      expected.map((entry) => entry.id),
    );
    expect(buttons.map((button) => text(button))).toEqual(
      expected.map((entry) => entry.label),
    );
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    expect(buttons.every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(headings(container)).toEqual(["Time", ...expected.map((entry) => entry.label)]);

    const first = buttons.find((button) => button.dataset.spLegendItem === "sensor-0");
    expect(first).toBeDefined();
    await userEvent.click(first!);

    await vi.waitFor(() => {
      expect(first?.getAttribute("aria-pressed")).toBe("false");
      expect(headings(container)).toEqual([
        "Time",
        ...expected.slice(1).map((entry) => entry.label),
      ]);
    });
  });

  it("exposes its title, summary, and source-faithful table through the reveal control", async () => {
    const expected = sourceAtFirstInstant();
    const expectedRowCount = new Set(
      SOURCE.flatMap((series) => series.data.map((datum) => datum.t.getTime())),
    ).size;
    expect(expectedRowCount).toBe(28);

    const container = await mountDefaultWorkload();
    expect(container.querySelector("svg title")?.textContent).toBe(TITLE);
    expect(container.querySelector("[data-silkplot-alternative] > p")?.textContent).toBe(SUMMARY);

    const toggle = container.querySelector<HTMLButtonElement>("[data-silkplot-table-toggle]");
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.textContent).toBe("Show data table");

    await userEvent.click(toggle!);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.textContent).toBe("Hide data table");

    const region = container.querySelector<HTMLElement>("[data-silkplot-table-scroll]");
    const table = region?.querySelector("table");
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(table).not.toBeNull();
    expect(table?.querySelector("caption")?.textContent).toBe(TITLE);
    expect(headings(table!)).toEqual(["Time", ...expected.map((entry) => entry.label)]);
    expect(table!.querySelectorAll("tbody tr")).toHaveLength(expectedRowCount);

    const firstRow = table!.querySelector("tbody tr");
    expect(firstRow?.querySelector("th")?.getAttribute("scope")).toBe("row");
    expect([...(firstRow?.children ?? [])].map((cell) => text(cell))).toEqual([
      expected[0]!.time.toISOString(),
      ...expected.map((entry) => String(entry.value)),
    ]);
  });
});
