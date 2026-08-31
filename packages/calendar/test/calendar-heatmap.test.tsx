/**
 * Calendar heatmap on Canvas — binned onto `buildTimeGrid`, HTML name, no SVG.
 * Hover, selection, and a data replacement must all move the recorded cells.
 */
import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "vitest/browser";
import { Temporal } from "temporal-polyfill";
import { tokensToCss } from "@silkplot/theme";
import type { ActivePoint, HeatmapBin } from "@silkplot/core";
import {
  CalendarHeatmap,
  buildTimeGrid,
  calendarHeatmapFill,
  calendarHeatmapPlotsOf,
  marksOnCalendarHeatmap,
  paintCalendarHeatmapCell,
  syncCalendarHeatmap,
  type TimeGrid,
  type TimeGridObservation,
} from "../src/index";

const NY = "America/New_York";
const WEEK_START = { year: 2026, month: 3, day: 2 } as const;
const WIDTH = 400;
const HEIGHT = 300;

function zoned(
  civil: { year: number; month: number; day: number },
  hour: number,
  minute = 0,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from({ ...civil, timeZone: NY, hour, minute });
}

function clinicGrid(): TimeGrid {
  const start = zoned(WEEK_START, 0);
  return buildTimeGrid({
    start: start.toInstant(),
    end: start.add({ days: 2 }).toInstant(),
    slotMinutes: 60,
    axisLength: 240,
    timeZone: NY,
    weekStart: 1,
  });
}

const OBS: TimeGridObservation[] = [
  { time: zoned(WEEK_START, 9).epochMilliseconds, value: 1 },
  { time: zoned(WEEK_START, 10).epochMilliseconds, value: 8 },
  { time: zoned({ year: 2026, month: 3, day: 3 }, 9).epochMilliseconds, value: 3 },
];

const AFTER: TimeGridObservation[] = [
  { time: zoned(WEEK_START, 9).epochMilliseconds, value: 20 },
  { time: zoned(WEEK_START, 10).epochMilliseconds, value: 1 },
  { time: zoned({ year: 2026, month: 3, day: 3 }, 9).epochMilliseconds, value: 3 },
];

const SIZE = { width: WIDTH, height: HEIGHT, margins: { top: 0, right: 0, bottom: 0, left: 0 }, padding: 0 };

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function canvasOf(container: HTMLElement): HTMLCanvasElement {
  const plots = calendarHeatmapPlotsOf(container);
  expect(plots).toHaveLength(1);
  return plots[0] as HTMLCanvasElement;
}

function surfaceOf(container: HTMLElement): HTMLElement {
  const surface =
    container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]") ??
    container.querySelector<HTMLElement>("[data-silkplot-pointer-surface]");
  expect(surface).not.toBeNull();
  return surface as HTMLElement;
}

async function hoverAt(surface: HTMLElement, fx: number, fy: number): Promise<void> {
  const rect = surface.getBoundingClientRect();
  surface.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: rect.left + rect.width * fx,
      clientY: rect.top + rect.height * fy,
    }),
  );
  await frame();
}

let sheet: HTMLStyleElement;

beforeAll(() => {
  sheet = document.createElement("style");
  sheet.textContent = tokensToCss();
  document.head.appendChild(sheet);
});

afterAll(() => {
  sheet.remove();
});

describe("CalendarHeatmap paints on Canvas, not SVG", () => {
  it("is a named HTML graphic with Canvas cells and a table", () => {
    const { container } = render(() => (
      <CalendarHeatmap
        title="Week occupancy"
        desc="Two days of clinic slots"
        grid={clinicGrid()}
        observations={OBS}
        {...SIZE}
      />
    ));
    expect(container.querySelector("[data-silkplot-calendar-heatmap]")?.getAttribute("role")).toBe("img");
    expect(container.querySelector("[data-silkplot-calendar-heatmap-name]")?.textContent).toBe(
      "Week occupancy",
    );
    const canvas = canvasOf(container);
    expect(canvas.getAttribute("data-silkplot-clip")).toBe("canvas");
    expect(canvas.hasAttribute("data-silkplot-hatch")).toBe(true);
    const marks = marksOnCalendarHeatmap(canvas);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.some((mark) => mark.hatch !== "0")).toBe(true);
    expect(new Set(marks.map((mark) => mark.fill)).size).toBeGreaterThan(1);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("table")).not.toBeNull();
    const headings = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(headings).toEqual(["Day", "Slot", "Value"]);
  });
});

describe("CalendarHeatmap is interactive and dynamic", () => {
  it("hover writes one active cell and outlines it", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <CalendarHeatmap
        title="Week occupancy"
        desc="Two days"
        grid={clinicGrid()}
        observations={OBS}
        {...SIZE}
        tooltip={(a) => <span data-testid="tt">{a.datum.row}</span>}
        onActivePointChange={onChange}
      />
    ));
    await hoverAt(surfaceOf(container), 0.2, 0.4);
    expect(onChange).toHaveBeenCalled();
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<HeatmapBin> | undefined;
    expect(active?.datum.column).toBeDefined();
    expect(active?.datum.row).toMatch(/^\d{2}:\d{2}$/);
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).not.toBe("");
  });

  it("keyboard steps and Enter commits", async () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <CalendarHeatmap
        title="Week occupancy"
        desc="Two days"
        grid={clinicGrid()}
        observations={OBS}
        {...SIZE}
        onActivate={onActivate}
      />
    ));
    surfaceOf(container).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector('[role="option"]')).not.toBeNull();
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalled();
  });

  it("a data replacement moves hatch density", () => {
    const [obs, setObs] = createSignal(OBS);
    const { container } = render(() => (
      <CalendarHeatmap
        title="Week occupancy"
        desc="Two days"
        grid={clinicGrid()}
        observations={obs()}
        {...SIZE}
      />
    ));
    const before = marksOnCalendarHeatmap(canvasOf(container)).map((mark) => mark.hatch);
    setObs(() => AFTER);
    const after = marksOnCalendarHeatmap(canvasOf(container)).map((mark) => mark.hatch);
    expect(after).not.toEqual(before);
  });
});

describe("CalendarHeatmap decorative and custom label", () => {
  it("drops the graphic from the accessibility tree when decorative", () => {
    const { container } = render(() => (
      <CalendarHeatmap grid={clinicGrid()} observations={OBS} {...SIZE} decorative />
    ));
    expect(container.querySelector("[data-silkplot-calendar-heatmap]")?.getAttribute("role")).toBe(
      "presentation",
    );
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
  });

  it("uses the caller cellLabel for the announcement", async () => {
    const { container } = render(() => (
      <CalendarHeatmap
        title="Week occupancy"
        desc="Two days"
        grid={clinicGrid()}
        observations={OBS}
        {...SIZE}
        cellLabel={(d) => `slot ${d.row}`}
      />
    ));
    surfaceOf(container).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toContain("slot");
  });

  it("uses a pointer-only surface when the keyboard is off", async () => {
    const { container } = render(() => (
      <CalendarHeatmap
        title="Week occupancy"
        desc="Two days"
        grid={clinicGrid()}
        observations={OBS}
        {...SIZE}
        keyboard={false}
      />
    ));
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    await hoverAt(surfaceOf(container), 0.2, 0.4);
    expect(container.querySelector("[data-silkplot-pointer-surface]")).not.toBeNull();
  });
});

describe("calendar heatmap paint helpers", () => {
  it("clamps fill and records an active outline", () => {
    expect(calendarHeatmapFill(0)).not.toBe(calendarHeatmapFill(1));
    expect(calendarHeatmapFill(-1)).toBe(calendarHeatmapFill(0));
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 40;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    const mark = paintCalendarHeatmapCell(
      ctx,
      { column: "d", row: "09:00", value: 4, x: 0, y: 0, width: 10, height: 10, t: 1, hatch: 4 },
      true,
    );
    expect(mark.hatch).toBe("4");
    expect(mark.stroke).not.toBe("none");
    syncCalendarHeatmap(undefined, { width: 10, height: 10, originX: 0, originY: 0, outerWidth: 10, outerHeight: 10 }, [], -1);
    syncCalendarHeatmap(canvas, { width: 0, height: 0, originX: 0, originY: 0, outerWidth: 0, outerHeight: 0 }, [], -1);
    expect(marksOnCalendarHeatmap(canvas)).toEqual([]);
  });
});
