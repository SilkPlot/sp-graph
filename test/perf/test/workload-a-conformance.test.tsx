import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { w2History } from "../../../packages/charts/test/workload-fixtures";
import { WorkloadA } from "../app/WorkloadA";
import { WA_POINTS, WA_SERIES } from "../app/workloads";
import { assertWorkloadRevision, resetPublishedComposition } from "./composition-conformance";

const SOURCE = w2History(WA_SERIES, WA_POINTS);
const UNIT = "°C";
const HOME_METADATA = ["probe-0:0", "observed"] as const;

const sourceAtFirstInstant = () => {
  const instant = SOURCE[0]?.data[0]?.t.getTime();
  if (instant === undefined) throw new Error("W-A source has no first instant");

  return SOURCE.map((series) => {
    const datum = series.data.find((candidate) => candidate.t.getTime() === instant);
    if (datum === undefined || datum.y === null) {
      throw new Error(`W-A source has no present ${series.id} value at its first instant`);
    }
    return { id: series.id, label: series.label, time: datum.t, value: datum.y };
  });
};

const localTime = (instant: Date): string =>
  new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(instant);

const temperature = (value: number): string =>
  `${new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} ${UNIT}`;

const text = (element: Element): string =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim();

async function mountDefaultWorkload(): Promise<HTMLElement> {
  history.replaceState({}, "", location.pathname);
  const { container } = render(() => (
    <div id="root">
      <WorkloadA />
    </div>
  ));

  await vi.waitFor(
    () => {
      expect(window.__perf?.workload).toBe("w-a");
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

describe("W-A representative composition", () => {
  it("renders the keyboard-selected raw datum, metadata, and all four values in its tooltip", async () => {
    const expected = sourceAtFirstInstant();
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
    const content = text(tooltip!);
    expect(content).toContain(localTime(expected[0]!.time));
    for (const entry of expected) {
      expect(content).toContain(entry.label);
      expect(content).toContain(temperature(entry.value));
    }
    for (const metadata of HOME_METADATA) expect(content).toContain(metadata);
  });

  it("mounts four controlled legend buttons that drive the chart's visible series", async () => {
    const expected = sourceAtFirstInstant();
    const container = await mountDefaultWorkload();
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]"),
    ];

    expect(buttons).toHaveLength(expected.length);
    expect(buttons.map((button) => button.dataset.spLegendItem)).toEqual(
      expected.map((entry) => entry.id),
    );
    expect(buttons.map((button) => text(button))).toEqual(
      expected.map((entry) => entry.label),
    );
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    expect(buttons.every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);

    await userEvent.click(buttons[0]!);
    await vi.waitFor(() => {
      expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
      expect(
        [...container.querySelectorAll('thead th[scope="col"]')].map((heading) => text(heading)),
      ).toEqual(["Time", ...expected.slice(1).map((entry) => entry.label)]);
    });

    await userEvent.click(buttons[0]!);
    await vi.waitFor(() => {
      expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
      expect(
        [...container.querySelectorAll('thead th[scope="col"]')].map((heading) => text(heading)),
      ).toEqual(["Time", ...expected.map((entry) => entry.label)]);
    });
  });

  it("reveals a source-faithful semantic table through its public control", async () => {
    const expected = sourceAtFirstInstant();
    const container = await mountDefaultWorkload();
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
    expect([...table!.querySelectorAll('thead th[scope="col"]')].map((heading) => text(heading))).toEqual([
      "Time",
      ...expected.map((entry) => entry.label),
    ]);
    expect(table!.querySelectorAll("tbody tr")).toHaveLength(WA_POINTS);

    const firstRow = table!.querySelector("tbody tr");
    expect(firstRow?.querySelector("th")?.getAttribute("scope")).toBe("row");
    expect([...(firstRow?.children ?? [])].map((cell) => text(cell))).toEqual([
      expected[0]!.time.toISOString(),
      ...expected.map((entry) => String(entry.value)),
    ]);
  });
});
