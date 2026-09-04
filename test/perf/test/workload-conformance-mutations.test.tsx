import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { w2History } from "../../../packages/charts/test/workload-fixtures";
import { WorkloadA } from "../app/WorkloadA";
import { WA_POINTS, WA_SERIES } from "../app/workloads";
import { LineChart } from "@silkplot/charts";
import {
  CONFORMANCE_FAILURE,
  assertExplicitFormatter,
  assertLeftAxisLabelsFit,
  assertLegendWiring,
  assertSourceValueCell,
  assertTableRevealControl,
  assertTooltipAllSeries,
  assertTooltipMetadata,
  assertWorkloadRevision,
  captureLeftAxisLabels,
  resetPublishedComposition,
} from "./composition-conformance";

const SOURCE = w2History(WA_SERIES, WA_POINTS);
const HOME_METADATA = ["probe-0:0", "observed"] as const;
const UNIT = "°C";

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

const temperature = (value: number): string =>
  `${new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} ${UNIT}`;

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
    },
    { timeout: 30_000 },
  );
  return container;
}

async function selectHome(container: Element): Promise<Element> {
  const surface = container.querySelector<HTMLElement>(
    "[data-perf-surface] [data-silkplot-keyboard-surface]",
  );
  expect(surface).not.toBeNull();
  await vi.waitFor(() => {
    expect(surface!.getBoundingClientRect().width).toBeGreaterThan(0);
  });
  surface!.focus();
  await userEvent.keyboard("{Home}");
  const expected = sourceAtFirstInstant();
  await vi.waitFor(() => {
    expect(window.__perf?.lastActive()).toMatchObject({
      seriesId: expected[0]?.id,
      sourceIndex: 0,
    });
  });
  const tooltip = container.querySelector("[data-silkplot-tooltip]");
  expect(tooltip).not.toBeNull();
  return tooltip!;
}

async function firstTableRow(container: Element): Promise<Element> {
  const toggle = container.querySelector<HTMLButtonElement>("[data-silkplot-table-toggle]");
  expect(toggle).not.toBeNull();
  if (toggle?.getAttribute("aria-expanded") === "false") {
    await userEvent.click(toggle);
  }
  const row = container.querySelector("[data-silkplot-alternative] tbody tr");
  expect(row).not.toBeNull();
  return row!;
}

const expectedReadings = () =>
  sourceAtFirstInstant().map((entry) => ({
    id: entry.id,
    label: entry.label,
    formatted: temperature(entry.value),
  }));

const expectedSourceCells = () => {
  const expected = sourceAtFirstInstant();
  return [expected[0]!.time.toISOString(), ...expected.map((entry) => String(entry.value))];
};

afterEach(() => {
  cleanup();
  resetPublishedComposition();
});

describe("composition gate mutations retain their exact failure messages", () => {
  it("passes every named claim on the unmutated page", async () => {
    const expected = sourceAtFirstInstant();
    const container = await mountDefaultWorkload();
    const tooltip = await selectHome(container);
    const row = await firstTableRow(container);

    expect(() => assertTooltipMetadata(tooltip, HOME_METADATA)).not.toThrow();
    expect(() => assertTooltipAllSeries(tooltip, expectedReadings())).not.toThrow();
    expect(() =>
      assertLegendWiring(
        container,
        expected.map((entry) => entry.id),
      ),
    ).not.toThrow();
    expect(() => assertExplicitFormatter(row)).not.toThrow();
    expect(() => assertTableRevealControl(container)).not.toThrow();
    expect(() => assertSourceValueCell(row, expectedSourceCells())).not.toThrow();
    expect(() => assertWorkloadRevision(window.__perf)).not.toThrow();
  });

  it("passes the left-axis fit claim on the unmutated page", async () => {
    const capture = captureLeftAxisLabels();
    try {
      await mountDefaultWorkload();
      await vi.waitFor(() => {
        expect(capture.records.length).toBeGreaterThan(0);
      });
    } finally {
      capture.restore();
    }
    expect(() => assertLeftAxisLabelsFit(capture.records)).not.toThrow();
  });

  it("fails with the retained tooltip-metadata message", async () => {
    const container = await mountDefaultWorkload();
    const tooltip = await selectHome(container);
    for (const node of [...tooltip.querySelectorAll("div")]) {
      const content = node.textContent ?? "";
      if (content.includes("Sample") || content.includes("Quality")) node.remove();
    }
    expect(() => assertTooltipMetadata(tooltip, HOME_METADATA)).toThrowError(
      CONFORMANCE_FAILURE.tooltipMetadata,
    );
  });

  it("fails with the retained all-series tooltip message", async () => {
    const container = await mountDefaultWorkload();
    const tooltip = await selectHome(container);
    tooltip.querySelector("[data-perf-tooltip-series]")?.remove();
    expect(() => assertTooltipAllSeries(tooltip, expectedReadings())).toThrowError(
      CONFORMANCE_FAILURE.tooltipAllSeries,
    );
  });

  it("fails with the retained legend-wiring message", async () => {
    const expected = sourceAtFirstInstant();
    const container = await mountDefaultWorkload();
    const button = container.querySelector<HTMLButtonElement>("button[data-sp-legend-item]");
    expect(button).not.toBeNull();
    button!.dataset.spLegendItem = "not-a-series";
    expect(() =>
      assertLegendWiring(
        container,
        expected.map((entry) => entry.id),
      ),
    ).toThrowError(CONFORMANCE_FAILURE.legendWiring);
  });

  it("fails with the retained explicit-formatter message", async () => {
    const container = await mountDefaultWorkload();
    const row = await firstTableRow(container);
    const time = row.querySelector("th");
    expect(time).not.toBeNull();
    time!.textContent = "1 Jan 2026";
    expect(() => assertExplicitFormatter(row)).toThrowError(CONFORMANCE_FAILURE.explicitFormatter);
  });

  it("fails with the retained table-reveal message", async () => {
    const container = await mountDefaultWorkload();
    container.querySelector("[data-silkplot-table-toggle]")?.remove();
    expect(() => assertTableRevealControl(container)).toThrowError(CONFORMANCE_FAILURE.tableReveal);
  });

  it("fails with the retained source-value cell message", async () => {
    const container = await mountDefaultWorkload();
    const row = await firstTableRow(container);
    const value = row.children[1];
    expect(value).toBeDefined();
    value!.textContent = "not-the-source";
    expect(() => assertSourceValueCell(row, expectedSourceCells())).toThrowError(
      CONFORMANCE_FAILURE.sourceValueCell,
    );
  });

  it("fails with the retained left-axis-fit message", async () => {
    // The mutation removes the page's margin reservation: the same series and
    // caller-owned formatter on the library's constant 40px default left
    // margin, which is exactly the composition that clipped every tick to
    // "0,0 °C" on the headed pages on 2026-09-04.
    const capture = captureLeftAxisLabels();
    try {
      render(() => (
        <div style={{ width: "1200px" }}>
          <LineChart
            series={SOURCE}
            height={420}
            title="W-A without its margin reservation"
            summary="Mutation: the caller-owned unit formatter on the default left margin."
            yTickFormat={temperature}
          />
        </div>
      ));
      await vi.waitFor(() => {
        expect(capture.records.length).toBeGreaterThan(0);
      });
    } finally {
      capture.restore();
    }
    expect(() => assertLeftAxisLabelsFit(capture.records)).toThrowError(
      CONFORMANCE_FAILURE.axisLabelFit,
    );
  });

  it("fails with the retained workload-revision message", async () => {
    await mountDefaultWorkload();
    const root = document.documentElement;
    window.__perf = {
      ...window.__perf!,
      compositionRevision: "",
      compositionDigest: "",
    };
    root.removeAttribute("data-perf-composition-revision");
    root.removeAttribute("data-perf-composition-digest");
    document.querySelector("[data-perf-composition-manifest]")?.remove();
    expect(() => assertWorkloadRevision(window.__perf)).toThrowError(
      CONFORMANCE_FAILURE.workloadRevision,
    );
  });
});
