import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { w2History } from "../../../packages/charts/test/workload-fixtures";
import {
  HISTORICAL_COMPOSITION_DIGEST,
  HISTORICAL_COMPOSITION_IDENTITY,
  HISTORICAL_COMPOSITION_MANIFEST,
  REVISION_FAILURE,
  canonicalJson,
  evaluatePageRevision,
} from "../app/composition-revision";
import { WorkloadAV1 } from "../app/WorkloadAV1";
import { WA_POINTS, WA_SERIES } from "../app/workloads";
import {
  CONFORMANCE_FAILURE,
  assertLegendWiring,
  assertTooltipAllSeries,
  assertTooltipMetadata,
  resetPublishedComposition,
} from "./composition-conformance";

const SOURCE = w2History(WA_SERIES, WA_POINTS);
const HOME_METADATA = ["probe-0:0", "observed"] as const;
const UNIT = "°C";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

const expectedReadings = () =>
  sourceAtFirstInstant().map((entry) => ({
    id: entry.id,
    label: entry.label,
    formatted: temperature(entry.value),
  }));

async function mountV1(): Promise<HTMLElement> {
  history.replaceState({}, "", location.pathname);
  const { container } = render(() => (
    <div id="root">
      <WorkloadAV1 />
    </div>
  ));

  await vi.waitFor(
    () => {
      expect(window.__perf?.workload).toBe("w-a");
      expect(document.documentElement.hasAttribute("data-perf-ready")).toBe(true);
      expect(window.__perf?.compositionRevision).toBe(HISTORICAL_COMPOSITION_IDENTITY);
    },
    { timeout: 30_000 },
  );
  return container;
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
  const expected = sourceAtFirstInstant();
  await vi.waitFor(() => {
    expect(window.__perf?.lastActive()).toMatchObject({
      seriesId: expected[0]?.id,
      sourceIndex: 0,
    });
  });
  return surface!;
}

function pointerAtPlot(container: Element): void {
  const surface = container.querySelector<HTMLElement>(
    "[data-perf-surface] [data-silkplot-keyboard-surface]",
  );
  const canvas = container.querySelector<HTMLElement>("[data-silkplot-canvas-plot]");
  expect(surface).not.toBeNull();
  expect(canvas).not.toBeNull();

  const originX = Number(canvas!.getAttribute("data-silkplot-plot-origin-x"));
  const originY = Number(canvas!.getAttribute("data-silkplot-plot-origin-y"));
  const plotWidth = Number(canvas!.getAttribute("data-silkplot-plot-width"));
  const plotHeight = Number(canvas!.getAttribute("data-silkplot-plot-height"));
  expect(plotWidth).toBeGreaterThan(0);
  expect(plotHeight).toBeGreaterThan(0);

  const rect = surface!.getBoundingClientRect();
  const pointer = {
    bubbles: true,
    clientX: rect.left + originX + plotWidth * 0.5,
    clientY: rect.top + originY + plotHeight / 2,
    pointerType: "mouse",
  };
  surface!.dispatchEvent(new PointerEvent("pointerenter", pointer));
  surface!.dispatchEvent(new PointerEvent("pointermove", pointer));
}

afterEach(() => {
  cleanup();
  resetPublishedComposition();
});

describe("pre-correction v1 composition retains omitted-surface failures", () => {
  it("publishes cartesian-dashboard-representative-v1 and is not timing-eligible", async () => {
    await mountV1();
    const root = document.documentElement;
    expect(root.getAttribute("data-perf-composition-revision")).toBe(
      HISTORICAL_COMPOSITION_IDENTITY,
    );
    expect(root.getAttribute("data-perf-composition-digest")).toBe(HISTORICAL_COMPOSITION_DIGEST);
    expect(window.__perf?.compositionDigest).toBe(HISTORICAL_COMPOSITION_DIGEST);
    expect(canonicalJson(window.__perf?.compositionManifest)).toBe(
      canonicalJson(HISTORICAL_COMPOSITION_MANIFEST),
    );
    expect(
      evaluatePageRevision({
        identity: window.__perf?.compositionRevision,
        digest: window.__perf?.compositionDigest,
        manifest: window.__perf?.compositionManifest,
      }).message,
    ).toBe(REVISION_FAILURE.mismatched);
  });

  it("fails the same tooltip assertions after keyboard and pointer inspection", async () => {
    const container = await mountV1();
    await selectHome(container);
    pointerAtPlot(container);
    await vi.waitFor(() => {
      expect(window.__perf?.lastActive()?.seriesId).toBe(sourceAtFirstInstant()[0]?.id);
    });

    const tooltip = container.querySelector("[data-silkplot-tooltip]");
    expect(() => assertTooltipMetadata(tooltip, HOME_METADATA)).toThrowError(
      CONFORMANCE_FAILURE.tooltipMetadata,
    );
    expect(() => assertTooltipAllSeries(tooltip, expectedReadings())).toThrowError(
      CONFORMANCE_FAILURE.tooltipAllSeries,
    );
  });

  it("fails legend wiring, drives the range control, and proves the table by row count", async () => {
    const expected = sourceAtFirstInstant();
    const container = await mountV1();
    await selectHome(container);

    expect(() =>
      assertLegendWiring(
        container,
        expected.map((entry) => entry.id),
      ),
    ).toThrowError(CONFORMANCE_FAILURE.legendWiring);
    expect(container.querySelectorAll("button[data-sp-legend-item]")).toHaveLength(0);

    const endThumb = container.querySelector<HTMLElement>(
      '[data-perf-range] [data-silkplot-range-handle="end"]',
    );
    expect(endThumb).not.toBeNull();
    expect(endThumb?.getAttribute("aria-valuetext") ?? "").toMatch(ISO_DATE);

    const viewportBefore = window.__perf?.counts().viewport ?? 0;
    endThumb!.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await vi.waitFor(() => {
      expect(window.__perf?.counts().viewport).toBeGreaterThan(viewportBefore);
    });
    expect(endThumb?.getAttribute("aria-valuetext") ?? "").toMatch(ISO_DATE);

    const toggle = container.querySelector<HTMLButtonElement>("[data-silkplot-table-toggle]");
    expect(toggle).not.toBeNull();
    if (toggle?.getAttribute("aria-expanded") === "false") {
      await userEvent.click(toggle);
    }
    expect(container.querySelectorAll("[data-silkplot-alternative] tbody tr")).toHaveLength(
      WA_POINTS,
    );
  });
});
