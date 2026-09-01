import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  W4_SECOND_COUNT,
  w4Seconds,
  w4ValueAt,
} from "../../../packages/charts/test/workload-fixtures";
import { WorkloadD } from "../app/WorkloadD";
import { WD_TARGET_POINTS } from "../app/workloads";
import { assertWorkloadRevision, resetPublishedComposition } from "./composition-conformance";

const TARGET_FRACTION = 0.62;
const TARGET_INDEX = 53_567;
const TARGET_ISO = "2026-01-01T14:52:47.000Z";
const TARGET_LOCAL_TIME = "2026/01/01, 16:52:47";
const TARGET_METADATA = ["raw:53567", "observed"] as const;
const TITLE = "W-D — one day at one-second resolution";
const SUMMARY =
  "Eighty-six thousand four hundred one-second readings across a single day, with a diurnal swell, a fast oscillation, and eight isolated excursions.";

const SOURCE = w4Seconds(TARGET_INDEX + 1)[0]!;
const FIRST = SOURCE.data[0]!;
const TARGET = SOURCE.data[TARGET_INDEX]!;

const text = (element: Element): string =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim();

const headings = (container: Element): string[] =>
  [...container.querySelectorAll('thead th[scope="col"]')].map((heading) => text(heading));

const cells = (row: Element): string[] =>
  [...row.children].map((cell) => text(cell));

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
  }).format(value)} °C`;

afterEach(() => {
  cleanup();
  resetPublishedComposition();
});

describe("W-D representative composition", () => {
  it(
    "keeps dense inspection raw while paint is bounded and the full source table remains available",
    async () => {
      const independentlyDerivedIndex = Math.round(
        (W4_SECOND_COUNT - 1) * TARGET_FRACTION,
      );
      expect(independentlyDerivedIndex).toBe(TARGET_INDEX);
      expect(SOURCE).toMatchObject({
        id: "raw",
        label: "One day at one-second resolution",
      });
      expect(FIRST).toMatchObject({
        t: new Date("2026-01-01T00:00:00.000Z"),
        y: w4ValueAt(0),
      });
      expect(TARGET).toMatchObject({
        t: new Date(TARGET_ISO),
        y: w4ValueAt(independentlyDerivedIndex),
      });
      expect(TARGET.y).toBe(210.2);
      expect(localTime(TARGET.t)).toBe(TARGET_LOCAL_TIME);
      expect(temperature(TARGET.y!)).toBe("210,2 °C");

      history.replaceState({}, "", location.pathname);
      const { container } = render(() => (
        <div id="root">
          <WorkloadD />
        </div>
      ));

      await vi.waitFor(
        () => {
          expect(window.__perf?.workload).toBe("w-d");
          expect(document.documentElement.hasAttribute("data-perf-ready")).toBe(true);
          assertWorkloadRevision(window.__perf);
        },
        { timeout: 60_000 },
      );

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
      expect(originX).toBeGreaterThanOrEqual(0);
      expect(originY).toBeGreaterThanOrEqual(0);
      expect(plotWidth).toBeGreaterThan(0);
      expect(plotHeight).toBeGreaterThan(0);

      const expected = window.__perf?.inspectionExpected?.("raw", TARGET_FRACTION);
      expect(expected).toEqual({
        seriesId: "raw",
        sourceIndex: TARGET_INDEX,
        time: TARGET_ISO,
        y: TARGET.y,
      });
      const target = window.__perf?.inspectionTarget?.(TARGET_FRACTION);
      expect(target?.rawDomainFraction).toBe(TARGET_FRACTION);
      expect(target?.plotFraction).toBeGreaterThan(0);
      expect(target?.plotFraction).toBeLessThan(1);

      const rect = surface!.getBoundingClientRect();
      const pointer = {
        bubbles: true,
        clientX: rect.left + originX + plotWidth * target!.plotFraction,
        clientY: rect.top + originY + plotHeight / 2,
        pointerType: "mouse",
      };
      surface!.dispatchEvent(new PointerEvent("pointerenter", pointer));
      surface!.dispatchEvent(new PointerEvent("pointermove", pointer));

      await vi.waitFor(
        () => expect(window.__perf?.lastActive()).toEqual(expected),
        { timeout: 10_000 },
      );

      const tooltip = container.querySelector("[data-silkplot-tooltip]");
      expect.soft(tooltip, "real rendered W-D tooltip").not.toBeNull();
      if (tooltip !== null) {
        const content = text(tooltip);
        expect.soft(content).toContain(TARGET_LOCAL_TIME);
        expect.soft(content).toContain(temperature(TARGET.y!));
        for (const metadata of TARGET_METADATA) expect.soft(content).toContain(metadata);
      }

      const drawnPoints = window.__perf?.paintDecimation?.drawnPoints();
      expect(window.__perf?.paintDecimation?.budget).toBe(WD_TARGET_POINTS);
      expect(drawnPoints).not.toBeNull();
      expect(drawnPoints).toBeGreaterThan(0);
      expect(drawnPoints).toBeLessThanOrEqual(WD_TARGET_POINTS);
      expect(Number(canvas!.getAttribute("data-silkplot-drawn-points"))).toBe(drawnPoints);
      expect(window.__perf?.lastActive()).toEqual(expected);

      expect(container.querySelector("svg title")?.textContent).toBe(TITLE);
      const alternative = container.querySelector<HTMLElement>("[data-silkplot-alternative]");
      expect(alternative).not.toBeNull();
      expect(alternative?.querySelector(":scope > p")?.textContent).toBe(SUMMARY);

      const toggle = alternative!.querySelector<HTMLButtonElement>(
        "[data-silkplot-table-toggle]",
      );
      expect(toggle).not.toBeNull();
      expect(toggle?.getAttribute("aria-expanded")).toBe("false");
      expect(toggle?.textContent).toBe("Show data table");
      await userEvent.click(toggle!);
      expect(toggle?.getAttribute("aria-expanded")).toBe("true");
      expect(toggle?.textContent).toBe("Hide data table");

      const region = alternative!.querySelector<HTMLElement>("[data-silkplot-table-scroll]");
      const table = region?.querySelector<HTMLTableElement>("table");
      expect(region?.getAttribute("tabindex")).toBe("0");
      expect(table).not.toBeNull();
      expect(table?.querySelector("caption")?.textContent).toBe(TITLE);
      expect(headings(table!)).toEqual(["Time", SOURCE.label]);

      const rows = table!.querySelectorAll("tbody tr");
      expect(window.__perf?.tableRows).toBe(W4_SECOND_COUNT);
      expect(rows).toHaveLength(W4_SECOND_COUNT);
      expect(rows[0]?.querySelector("th")?.getAttribute("scope")).toBe("row");
      expect(cells(rows[0]!)).toEqual([FIRST.t.toISOString(), String(FIRST.y)]);
      expect(cells(rows[TARGET_INDEX]!)).toEqual([
        TARGET.t.toISOString(),
        String(TARGET.y),
      ]);

      const legendButtons = [
        ...container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]"),
      ];
      expect.soft(legendButtons, "one controlled W-D legend button").toHaveLength(1);
      if (legendButtons.length === 1) {
        const rawButton = legendButtons[0]!;
        expect.soft(rawButton.dataset.spLegendItem).toBe(SOURCE.id);
        expect.soft(text(rawButton)).toBe(SOURCE.label);
        expect.soft(rawButton.getAttribute("aria-pressed")).toBe("true");

        await userEvent.click(rawButton);
        await vi.waitFor(() => {
          expect(rawButton.getAttribute("aria-pressed")).toBe("false");
          expect(headings(table!)).toEqual(["Time"]);
          expect(table!.querySelectorAll("tbody tr")).toHaveLength(0);
        });
      }
    },
    120_000,
  );
});
