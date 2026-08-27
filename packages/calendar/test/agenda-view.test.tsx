/**
 * Agenda view — ordered HTML items (events + empty slots), DST day, overlap
 * as text. Same clinic-week fixture as the week-grid suite: America/New_York,
 * spring-forward Sunday, Wednesday overlap cluster. Not a second SVG week.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import { Temporal } from "temporal-polyfill";
import { tokensToCss } from "@silkplot/theme";
import {
  AgendaView,
  CalendarWeek,
  buildAgenda,
  buildTimeGrid,
  resolveCivilDateTime,
  resolveEventLanes,
  type CalendarEvent,
  type TimeGrid,
} from "../src/index";

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

function dayBlock(container: HTMLElement, iso: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-silkplot-agenda-day="${iso}"]`);
  if (!el) throw new Error(`agenda day ${iso} not found`);
  return el;
}

function itemKinds(day: HTMLElement): string[] {
  return [...day.querySelectorAll("[data-silkplot-agenda-item]")].map(
    (el) => el.getAttribute("data-silkplot-agenda-item") ?? "",
  );
}

function itemTexts(day: HTMLElement): string[] {
  return [...day.querySelectorAll("[data-silkplot-agenda-item]")].map((el) => el.textContent ?? "");
}

function eventItem(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-silkplot-agenda-event="${id}"]`);
  if (!el) throw new Error(`agenda event ${id} not found`);
  return el;
}

let sheet: HTMLStyleElement;

beforeAll(() => {
  sheet = document.createElement("style");
  sheet.textContent = tokensToCss();
  document.head.appendChild(sheet);
});

afterAll(() => sheet.remove());

describe("AgendaView — expected items in day/time order", () => {
  const grid = fixtureGrid();
  const events = fixtureEvents();
  const agenda = buildAgenda(events, grid);

  it("is a named HTML region, not an SVG week", () => {
    const { container } = render(() => (
      <AgendaView grid={grid} events={events} title="Clinic week" />
    ));
    const region = container.querySelector("[data-silkplot-agenda]");
    expect(region).not.toBeNull();
    expect(region?.tagName).toBe("SECTION");
    expect(container.querySelector("h2")?.textContent).toBe("Agenda view");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-silkplot-week-grid]")).toBeNull();
  });

  it("groups one day block per TimeGrid service day, in that order", () => {
    const { container } = render(() => <AgendaView grid={grid} events={events} />);
    const days = [...container.querySelectorAll("[data-silkplot-agenda-day]")].map(
      (el) => el.getAttribute("data-silkplot-agenda-day"),
    );
    expect(days).toEqual(grid.days.map((day) => day.date.toString()));
    expect(agenda.map((group) => group.day.date.toString())).toEqual(days);
  });

  it("lists events and empty slots in start-time order on Monday", () => {
    const { container } = render(() => <AgendaView grid={grid} events={events} />);
    const monday = dayBlock(container, "2026-03-02");
    const texts = itemTexts(monday);
    const kinds = itemKinds(monday);

    const eventAt = kinds.indexOf("event");
    expect(eventAt).toBeGreaterThan(0);
    expect(texts[eventAt]).toContain("Dr. Chen consult");
    expect(texts[eventAt]).toContain("09:00");
    expect(texts[eventAt]).toContain("10:00");
    expect(texts[eventAt - 1]).toMatch(/08:00 empty/);
    expect(texts[eventAt + 1]).toMatch(/10:00 empty/);

    const mondayItems = agenda.find((group) => group.day.date.toString() === "2026-03-02")!.items;
    const starts = mondayItems.map((item) =>
      item.kind === "event" ? item.start : item.slot.start.epochMilliseconds,
    );
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(mondayItems.some((item) => item.kind === "event" && item.event.id === "chen-mon")).toBe(
      true,
    );
    expect(
      mondayItems.some(
        (item) =>
          item.kind === "slot" &&
          item.slot.start.hour === 8 &&
          item.slot.start.minute === 0,
      ),
    ).toBe(true);
    expect(
      mondayItems.some(
        (item) => item.kind === "slot" && item.slot.start.hour === 9 && item.slot.start.minute === 0,
      ),
    ).toBe(false);
  });

  it("splits the overnight booking across Friday and Saturday as list items", () => {
    const { container } = render(() => <AgendaView grid={grid} events={events} />);
    expect(eventItem(dayBlock(container, "2026-03-06"), "overnight").textContent).toContain(
      "Overnight lock-in",
    );
    expect(eventItem(dayBlock(container, "2026-03-07"), "overnight").textContent).toContain(
      "Overnight lock-in",
    );
    expect(dayBlock(container, "2026-03-06").querySelector("[data-silkplot-agenda-slot*='T22:']")).toBeNull();
    expect(dayBlock(container, "2026-03-07").querySelector("[data-silkplot-agenda-slot*='T00:']")).toBeNull();
  });
});

describe("AgendaView — DST spring-forward Sunday", () => {
  const grid = fixtureGrid();
  const events = fixtureEvents();

  it("is 23 elapsed hours and lists no 02:00 slot", () => {
    const { container } = render(() => <AgendaView grid={grid} events={events} />);
    const sunday = dayBlock(container, SPRING);
    expect(sunday.getAttribute("data-silkplot-elapsed-hours")).toBe("23");
    expect(sunday.querySelector("h3")?.textContent).toContain("23 elapsed hours");

    const sun = grid.days.find((day) => day.date.toString() === SPRING)!;
    expect(sun.elapsedHours).toBe(23);
    expect(grid.slots.some((slot) => slot.start.toString().startsWith("2026-03-08T02:"))).toBe(
      false,
    );

    const slots = [...sunday.querySelectorAll("[data-silkplot-agenda-slot]")].map(
      (el) => el.getAttribute("data-silkplot-agenda-slot") ?? "",
    );
    expect(slots.some((iso) => iso.includes("T02:"))).toBe(false);
    expect(sunday.textContent).not.toMatch(/02:00/);

    const springCivil = Temporal.PlainDateTime.from({ year: 2026, month: 3, day: 8, hour: 2 });
    expect(() => resolveCivilDateTime(springCivil, NY)).toThrow(/skipped or repeated/);

    const items = sunday.querySelectorAll("[data-silkplot-agenda-item]");
    expect(items).toHaveLength(23);
    expect(eventItem(sunday, "spring-am").textContent).toContain("Post-gap physio");
  });
});

describe("AgendaView — overlap is a text relationship", () => {
  const grid = fixtureGrid();
  const events = fixtureEvents();

  it("names the other titles and does not pack columns", () => {
    const { container } = render(() => <AgendaView grid={grid} events={events} />);
    const wednesday = dayBlock(container, OVERLAP_DAY);
    const a = eventItem(wednesday, "overlap-a").textContent ?? "";
    const b = eventItem(wednesday, "overlap-b").textContent ?? "";
    const c = eventItem(wednesday, "overlap-c").textContent ?? "";

    expect(a).toMatch(/overlaps Triple book B, Triple book C/);
    expect(b).toMatch(/overlaps Triple book A, Triple book C/);
    expect(c).toMatch(/overlaps Triple book A, Triple book B/);

    expect(wednesday.querySelector("[data-silkplot-event]")).toBeNull();
    expect(a).not.toMatch(/lane/i);
    expect(container.querySelector("[data-silkplot-week-grid]")).toBeNull();

    const cluster = [...wednesday.querySelectorAll("[data-silkplot-agenda-event]")];
    expect(cluster).toHaveLength(3);
    const lefts = cluster.map((el) => getComputedStyle(el).left);
    expect(new Set(lefts).size).toBe(1);
  });
});

describe("CalendarWeek — named Agenda view control", () => {
  const grid = fixtureGrid();
  const events = fixtureEvents();
  const rects = resolveEventLanes(events, grid);

  it("exposes an Agenda view button that reveals the HTML list, not a second SVG week", async () => {
    const { container } = render(() => (
      <CalendarWeek
        grid={grid}
        events={events}
        rects={rects}
        width={WIDTH}
        title="Clinic week"
      />
    ));
    const toggle = container.querySelector<HTMLButtonElement>("[data-silkplot-agenda-toggle]");
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe("Agenda view");
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector("[data-silkplot-week-grid]")).not.toBeNull();
    expect(container.querySelector("[data-silkplot-agenda]")).toBeNull();

    await userEvent.click(toggle!);
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-silkplot-agenda]")).not.toBeNull();
    expect(container.querySelector("[data-silkplot-agenda]")?.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-silkplot-week-grid]")).toBeNull();
    expect(eventItem(container, "chen-mon").textContent).toContain("Dr. Chen consult");
  });
});
