/**
 * Canvas week geometry and the booking-density protocol. Pure Temporal / pixel
 * math — no DOM. Civil clocks are read in America/New_York, never from a host
 * `Date` getter.
 */
import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import {
  ACCEPTANCE_MS,
  BOOKING_DENSITY,
  BOOKING_DENSITY_RECORD,
  FRAME_BUDGET_MS,
  bookingBoard,
  bookingEvents,
  bookingHours,
  keepBookingSlot,
  paintPassStats,
} from "../src/canvas-week-budget";
import { WEEK_HEADER_HEIGHT, eventBlockBox, weekCanvasSize } from "../src/canvas-week-geometry";
import { buildTimeGrid } from "../src/time-grid";
import type { EventRect } from "../src/overlap-resolver";
import { boxesIntersect, inflateViewport, visibleEventRects } from "../src/canvas-week-visible";

const NY = "America/New_York";

function zoned(
  civil: { year: number; month: number; day: number },
  hour: number,
  minute = 0,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from({ ...civil, timeZone: NY, hour, minute });
}

describe("eventBlockBox — TimeGrid / EventRect pixels", () => {
  const start = zoned({ year: 2026, month: 3, day: 2 }, 0);
  const grid = buildTimeGrid({
    start: start.toInstant(),
    end: start.add({ days: 1 }).toInstant(),
    slotMinutes: 60,
    axisLength: 240,
    timeZone: NY,
    weekStart: 1,
  });
  const columnWidth = 100;

  it("places a one-hour block from positionOf, origin-shifted, under the header", () => {
    const from = zoned({ year: 2026, month: 3, day: 2 }, 10);
    const to = zoned({ year: 2026, month: 3, day: 2 }, 11);
    const rect: EventRect = {
      event: { id: "consult", title: "Consult", start: from.epochMilliseconds, end: to.epochMilliseconds },
      day: Temporal.PlainDate.from("2026-03-02"),
      start: from.epochMilliseconds,
      end: to.epochMilliseconds,
      x: 0.25,
      width: 0.5,
      lane: 1,
      laneCount: 2,
    };
    const box = eventBlockBox(grid, rect, columnWidth);
    const y0 = grid.positionOf(new Date(from.epochMilliseconds));
    const y1 = grid.positionOf(new Date(to.epochMilliseconds));
    const origin = grid.positionOf(new Date(grid.days[0]!.start.epochMilliseconds));
    expect(box.dayIndex).toBe(0);
    expect(box.x).toBeCloseTo(0.25 * columnWidth, 5);
    expect(box.width).toBeCloseTo(0.5 * columnWidth, 5);
    expect(box.y).toBeCloseTo(WEEK_HEADER_HEIGHT + (y0 - origin), 5);
    expect(box.height).toBeCloseTo(y1 - y0, 5);
  });

  it("returns a zero box when the EventRect day is not a grid column", () => {
    const rect: EventRect = {
      event: { id: "orphan", title: "Orphan", start: 0, end: 1 },
      day: Temporal.PlainDate.from("1999-01-01"),
      start: 0,
      end: 1,
      x: 0,
      width: 1,
      lane: 0,
      laneCount: 1,
    };
    expect(eventBlockBox(grid, rect, columnWidth)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      dayIndex: -1,
    });
  });
});

describe("weekCanvasSize", () => {
  it("is header plus the tallest service-day extent", () => {
    const start = zoned({ year: 2026, month: 3, day: 2 }, 0);
    const grid = buildTimeGrid({
      start: start.toInstant(),
      end: start.add({ days: 7 }).toInstant(),
      slotMinutes: 60,
      axisLength: 1670,
      timeZone: NY,
      weekStart: 1,
    });
    const size = weekCanvasSize(grid, 700);
    expect(size.width).toBe(700);
    expect(size.columnWidth).toBeCloseTo(100, 5);
    expect(size.headerHeight).toBe(WEEK_HEADER_HEIGHT);
    expect(size.height).toBeCloseTo(WEEK_HEADER_HEIGHT + size.bodyHeight, 5);
    expect(size.bodyHeight).toBeGreaterThan(0);
  });
});

describe("booking-density protocol", () => {
  it("names the range, zone, and occupancy rule without reading the host clock", () => {
    expect(BOOKING_DENSITY.timeZone).toBe(NY);
    expect(BOOKING_DENSITY.rangeStart).toEqual({ year: 2026, month: 3, day: 2 });
    expect(BOOKING_DENSITY.rangeWeeks).toBe(4);
    expect(BOOKING_DENSITY.rooms).toBe(8);
    expect(BOOKING_DENSITY.slotMinutes).toBe(30);
    expect(FRAME_BUDGET_MS).toBe(16.7);
    expect(ACCEPTANCE_MS).toBe(17.7);
    expect(bookingHours(7)).toBeUndefined();
    expect(bookingHours(6)).toEqual({ startHour: 8, endHour: 12 });
    expect(bookingHours(1)).toEqual({ startHour: 8, endHour: 18 });
  });

  it("keeps four of every five room-slots (skipEvery 5), deterministically", () => {
    let kept = 0;
    let total = 0;
    for (let room = 0; room < 8; room++) {
      for (let slot = 0; slot < 20; slot++) {
        for (let day = 0; day < 5; day++) {
          total++;
          if (keepBookingSlot(room, slot, day)) kept++;
        }
      }
    }
    expect(kept / total).toBeCloseTo(0.8, 5);
  });

  it("builds a 4-week board whose events stay in the display zone's clinic hours", () => {
    const events = bookingEvents();
    expect(events.length).toBeGreaterThan(1000);
    const ids = new Set(events.map((event) => event.id));
    expect(ids.size).toBe(events.length);
    for (const event of events) {
      const start = Temporal.Instant.fromEpochMilliseconds(event.start).toZonedDateTimeISO(NY);
      const end = Temporal.Instant.fromEpochMilliseconds(event.end).toZonedDateTimeISO(NY);
      expect(start.dayOfWeek).not.toBe(7);
      expect(start.hour).toBeGreaterThanOrEqual(8);
      if (start.dayOfWeek === 6) expect(start.hour).toBeLessThan(12);
      else expect(start.hour).toBeLessThan(18);
      expect(end.epochMilliseconds - start.epochMilliseconds).toBe(BOOKING_DENSITY.slotMinutes * 60_000);
    }
  });

  it("records that the unfiltered paint broke the budget, so the stack virtualizes", () => {
    expect(BOOKING_DENSITY_RECORD.protocol).toBe("calendar-canvas-booking-density");
    expect(BOOKING_DENSITY_RECORD.range.timeZone).toBe(NY);
    expect(BOOKING_DENSITY_RECORD.range.weeks).toBe(4);
    expect(BOOKING_DENSITY_RECORD.budgetMs).toBe(FRAME_BUDGET_MS);
    expect(BOOKING_DENSITY_RECORD.acceptanceMs).toBe(ACCEPTANCE_MS);
    expect(BOOKING_DENSITY_RECORD.virtualization).toBe("visible-range-overscan");
    expect(BOOKING_DENSITY_RECORD.budgetBroke).toBe(true);
    expect(BOOKING_DENSITY_RECORD.unfilteredPaint.p95Ms).toBeGreaterThan(ACCEPTANCE_MS);
    expect(BOOKING_DENSITY_RECORD.overscanPx).toBe(BOOKING_DENSITY.columnWidth);
    expect(BOOKING_DENSITY_RECORD.hardware.cpu.length).toBeGreaterThan(0);
    expect(BOOKING_DENSITY_RECORD.hardware.cores).toBe(4);
  });

  it("computes paint-pass percentiles from the sorted samples, never the mean", () => {
    expect(paintPassStats([])).toEqual({ frames: 0, p50: 0, p95: 0, max: 0 });
    expect(paintPassStats([10, 12, 11, 40, 9])).toEqual({
      frames: 5,
      p50: 11,
      p95: 40,
      max: 40,
    });
  });
});

describe("bookingBoard — grid and resolver, not a second packer", () => {
  it("emits one EventRect per event-column intersection on the 4-week grid", () => {
    const board = bookingBoard();
    expect(board.grid.days).toHaveLength(28);
    expect(board.grid.weeks).toHaveLength(4);
    expect(board.width).toBe(BOOKING_DENSITY.columnWidth * 28);
    expect(board.events).toHaveLength(BOOKING_DENSITY_RECORD.density.events);
    expect(board.rects).toHaveLength(BOOKING_DENSITY_RECORD.density.rects);
    expect(board.grid.slots).toHaveLength(BOOKING_DENSITY_RECORD.density.slots);
    expect(board.rects.length).toBe(board.events.length);
    const spring = board.grid.days.find((day) => day.date.toString() === "2026-03-08");
    expect(spring?.elapsedHours).toBe(23);
  });
});

describe("visibleEventRects — same EventRect, visible-range plus overscan", () => {
  const start = zoned({ year: 2026, month: 3, day: 2 }, 0);
  const grid = buildTimeGrid({
    start: start.toInstant(),
    end: start.add({ days: 7 }).toInstant(),
    slotMinutes: 60,
    axisLength: 1670,
    timeZone: NY,
    weekStart: 1,
  });
  const columnWidth = 100;
  const from = zoned({ year: 2026, month: 3, day: 2 }, 9);
  const to = zoned({ year: 2026, month: 3, day: 2 }, 10);
  const rect: EventRect = {
    event: { id: "consult", title: "Consult", start: from.epochMilliseconds, end: to.epochMilliseconds },
    day: Temporal.PlainDate.from("2026-03-02"),
    start: from.epochMilliseconds,
    end: to.epochMilliseconds,
    x: 0,
    width: 1,
    lane: 0,
    laneCount: 1,
  };
  const box = eventBlockBox(grid, rect, columnWidth);

  it("returns the same EventRect object, not a second event type", () => {
    const viewport = { x: box.x, y: box.y, width: box.width, height: box.height };
    const visible = visibleEventRects(grid, [rect], columnWidth, viewport);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toBe(rect);
  });

  it("keeps a rect in the overscan band and omits one past it", () => {
    const viewport = { x: 400, y: 0, width: 100, height: 400 };
    const overscan = 50;
    const range = inflateViewport(viewport, overscan);
    expect(boxesIntersect(box, range)).toBe(false);
    expect(visibleEventRects(grid, [rect], columnWidth, range)).toEqual([]);
    const near = inflateViewport({ x: box.x + box.width + 20, y: box.y, width: 40, height: 40 }, 50);
    expect(visibleEventRects(grid, [rect], columnWidth, near)).toEqual([rect]);
  });
});

