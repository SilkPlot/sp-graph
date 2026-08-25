/**
 * Week-grid Solid layout — rendered block positions must match the same
 * `buildTimeGrid` / `resolveEventLanes` / `positionOf` calls the host used.
 *
 * The fixture week includes one DST-transition day (US spring-forward) and a
 * dense overlap cluster. Layout is measured in a real browser; jsdom cannot
 * give an honest `getBBox`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import { Temporal } from "temporal-polyfill";
import { tokensToCss } from "@silkplot/theme";
import { buildTimeGrid, resolveEventLanes, WeekGrid, type CalendarEvent, type EventRect, type TimeGrid } from "../src/index";

const NY = "America/New_York";
/** Monday of the week that contains 2026-03-08 (US spring-forward). */
const WEEK_START = { year: 2026, month: 3, day: 2 } as const;
const SPRING = "2026-03-08";
const OVERLAP_DAY = "2026-03-04";
const WIDTH = 700;

function zoned(
  civil: { year: number; month: number; day: number },
  hour: number,
  minute = 0,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from({ ...civil, timeZone: NY, hour, minute });
}

function civilOn(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

function ev(
  id: string,
  title: string,
  start: Temporal.ZonedDateTime,
  end: Temporal.ZonedDateTime,
): CalendarEvent {
  return { id, title, start: start.epochMilliseconds, end: end.epochMilliseconds };
}

/** Deterministic clinic week: DST Sunday + a Wednesday triple-overlap + one overnight. */
function fixtureEvents(): CalendarEvent[] {
  return [
    ev("chen-mon", "Dr. Chen consult", zoned(WEEK_START, 9), zoned(WEEK_START, 10)),
    ev("overlap-a", "Triple book A", zoned(civilOn(OVERLAP_DAY), 9), zoned(civilOn(OVERLAP_DAY), 11)),
    ev("overlap-b", "Triple book B", zoned(civilOn(OVERLAP_DAY), 9, 30), zoned(civilOn(OVERLAP_DAY), 11, 30)),
    ev("overlap-c", "Triple book C", zoned(civilOn(OVERLAP_DAY), 10), zoned(civilOn(OVERLAP_DAY), 12)),
    ev(
      "overnight",
      "Overnight lock-in",
      zoned({ year: 2026, month: 3, day: 6 }, 22),
      zoned({ year: 2026, month: 3, day: 7 }, 6),
    ),
    ev("spring-am", "Post-gap physio", zoned(civilOn(SPRING), 9), zoned(civilOn(SPRING), 10)),
  ];
}

function fixtureGrid(): TimeGrid {
  const start = zoned(WEEK_START, 0);
  return buildTimeGrid({
    start: start.toInstant(),
    end: start.add({ days: 7 }).toInstant(),
    slotMinutes: 60,
    axisLength: 1670,
    timeZone: NY,
    weekStart: 1,
  });
}

function expectedBlock(grid: TimeGrid, rect: EventRect, columnWidth: number) {
  const day = grid.days.find((entry) => entry.date.toString() === rect.day.toString());
  if (day === undefined) throw new Error(`no grid day for ${rect.day}`);
  const origin = grid.positionOf(new Date(day.start.epochMilliseconds));
  return {
    x: rect.x * columnWidth,
    y: grid.positionOf(new Date(rect.start)) - origin,
    width: rect.width * columnWidth,
    height: grid.positionOf(new Date(rect.end)) - grid.positionOf(new Date(rect.start)),
  };
}

function eventEl(container: HTMLElement, id: string, day: string): SVGRectElement {
  const el = container.querySelector<SVGRectElement>(
    `[data-silkplot-event="${id}"][data-silkplot-event-day="${day}"]`,
  );
  if (!el) throw new Error(`event ${id} on ${day} not found`);
  return el;
}

function dayEl(container: HTMLElement, iso: string): SVGGElement {
  const el = container.querySelector<SVGGElement>(`[data-silkplot-day="${iso}"]`);
  if (!el) throw new Error(`day ${iso} not found`);
  return el;
}

let sheet: HTMLStyleElement;

beforeAll(() => {
  sheet = document.createElement("style");
  sheet.textContent = tokensToCss();
  document.head.appendChild(sheet);
});

afterAll(() => sheet.remove());

describe("WeekGrid — geometry matches resolver + positionOf", () => {
  const grid = fixtureGrid();
  const events = fixtureEvents();
  const rects = resolveEventLanes(events, grid);
  const columnWidth = WIDTH / grid.days.length;

  it("renders one day column per TimeGrid day, including the 23h spring-forward day", () => {
    const { container } = render(() => (
      <WeekGrid grid={grid} rects={rects} width={WIDTH} title="Clinic week" />
    ));
    const columns = container.querySelectorAll("[data-silkplot-day]");
    expect(columns).toHaveLength(grid.days.length);
    expect(dayEl(container, SPRING).getAttribute("data-silkplot-elapsed-hours")).toBe("23");
    expect(dayEl(container, "2026-03-07").getAttribute("data-silkplot-elapsed-hours")).toBe("24");
  });

  it("places every event rectangle at the exact positionOf / EventRect geometry", () => {
    const { container } = render(() => (
      <WeekGrid grid={grid} rects={rects} width={WIDTH} title="Clinic week" />
    ));

    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      const el = eventEl(container, rect.event.id, rect.day.toString());
      const expected = expectedBlock(grid, rect, columnWidth);
      expect(Number(el.getAttribute("x"))).toBeCloseTo(expected.x, 5);
      expect(Number(el.getAttribute("y"))).toBeCloseTo(expected.y, 5);
      expect(Number(el.getAttribute("width"))).toBeCloseTo(expected.width, 5);
      expect(Number(el.getAttribute("height"))).toBeCloseTo(expected.height, 5);

      const box = el.getBBox();
      expect(box.x).toBeCloseTo(expected.x, 5);
      expect(box.y).toBeCloseTo(expected.y, 5);
      expect(box.width).toBeCloseTo(expected.width, 5);
      expect(box.height).toBeCloseTo(expected.height, 5);
    }
  });

  it("gives the dense overlap cluster distinct x / width fractions from the resolver", () => {
    const cluster = rects.filter((rect) => rect.day.toString() === OVERLAP_DAY);
    expect(cluster.length).toBe(3);
    const xs = new Set(cluster.map((rect) => rect.x));
    expect(xs.size).toBeGreaterThan(1);
    expect(cluster.every((rect) => rect.width < 1)).toBe(true);

    const { container } = render(() => (
      <WeekGrid grid={grid} rects={rects} width={WIDTH} title="Clinic week" />
    ));
    const measured = cluster.map((rect) => Number(eventEl(container, rect.event.id, OVERLAP_DAY).getAttribute("x")));
    expect(new Set(measured).size).toBe(xs.size);
  });

  it("splits the overnight booking across two day columns", () => {
    const fragments = rects.filter((rect) => rect.event.id === "overnight");
    expect(fragments.map((rect) => rect.day.toString())).toEqual(["2026-03-06", "2026-03-07"]);
    const { container } = render(() => (
      <WeekGrid grid={grid} rects={rects} width={WIDTH} title="Clinic week" />
    ));
    expect(eventEl(container, "overnight", "2026-03-06")).not.toBeNull();
    expect(eventEl(container, "overnight", "2026-03-07")).not.toBeNull();
  });

  it("makes the spring-forward day column shorter than a 24h neighbour, by positionOf", () => {
    const { container } = render(() => (
      <WeekGrid grid={grid} rects={rects} width={WIDTH} title="Clinic week" />
    ));
    const sun = grid.days.find((day) => day.date.toString() === SPRING)!;
    const sat = grid.days.find((day) => day.date.toString() === "2026-03-07")!;
    const sunH = Number(dayEl(container, SPRING).querySelector("[data-silkplot-day-frame]")?.getAttribute("height"));
    const satH = Number(dayEl(container, "2026-03-07").querySelector("[data-silkplot-day-frame]")?.getAttribute("height"));
    const sunExpected =
      grid.positionOf(new Date(sun.end.epochMilliseconds)) -
      grid.positionOf(new Date(sun.start.epochMilliseconds));
    const satExpected =
      grid.positionOf(new Date(sat.end.epochMilliseconds)) -
      grid.positionOf(new Date(sat.start.epochMilliseconds));
    expect(sunH).toBeCloseTo(sunExpected, 5);
    expect(satH).toBeCloseTo(satExpected, 5);
    expect(sunH).toBeLessThan(satH);
    expect(sun.elapsedHours).toBe(23);
  });
});

describe("WeekGrid — accessibility", () => {
  const grid = fixtureGrid();
  const events = fixtureEvents();
  const rects = resolveEventLanes(events, grid);

  it("names events with title and civil time in the display zone", () => {
    const { container } = render(() => (
      <WeekGrid grid={grid} rects={rects} width={WIDTH} title="Clinic week" />
    ));
    const el = eventEl(container, "chen-mon", "2026-03-02");
    const name = el.getAttribute("aria-label") ?? "";
    expect(name).toContain("Dr. Chen consult");
    expect(name).toContain("09:00");
    expect(name).toContain("10:00");
    expect(name).toContain(NY);
  });

  it("announces the spring-forward day as 23 elapsed hours, not a 24-row table", () => {
    const { container } = render(() => (
      <WeekGrid grid={grid} rects={rects} width={WIDTH} title="Clinic week" />
    ));
    const label = dayEl(container, SPRING).querySelector("title")?.textContent ?? "";
    expect(label).toContain("23 elapsed hours");
    expect(label).not.toMatch(/24 elapsed hours/);
    expect(grid.days.find((day) => day.date.toString() === SPRING)?.elapsedHours).toBe(23);
    expect(grid.slots.some((slot) => slot.start.toString().startsWith("2026-03-08T02:"))).toBe(false);
    expect(dayEl(container, SPRING).querySelectorAll("[data-silkplot-slot]")).toHaveLength(23);
  });

  it("makes each event focusable with the theme focus class", async () => {
    const { container } = render(() => (
      <WeekGrid grid={grid} rects={rects} width={WIDTH} title="Clinic week" />
    ));
    const first = eventEl(container, "chen-mon", "2026-03-02");
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(first.classList.contains("sp-focusable")).toBe(true);
    first.focus();
    expect(document.activeElement).toBe(first);
    await userEvent.tab();
    expect(document.activeElement).not.toBe(first);
    expect((document.activeElement as Element | null)?.hasAttribute("data-silkplot-event")).toBe(true);
  });
});
