/**
 * `resolveEventLanes` — renderer-agnostic rectangle geometry.
 *
 * Classic packer fixtures are re-stated here as exact `{ x, width }` data, not
 * as a second implementation of the packer. Day-boundary splits, visible-range
 * clips, and trailing-lane widening are this module's own contract.
 */
import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import { packOverlaps } from "@silkplot/core";
import { buildTimeGrid, type TimeGrid, type TimeGridConfig } from "../src/time-grid";
import { resolveEventLanes, type CalendarEvent, type EventRect } from "../src/overlap-resolver";

const NY = "America/New_York";
const LONDON = "Europe/London";

/** 2026-06-15 — a 24-hour Monday in America/New_York. */
const DAY = { year: 2026, month: 6, day: 15 } as const;

function zoned(
  civil: { year: number; month: number; day: number },
  hour: number,
  minute = 0,
  timeZone = NY,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from({ ...civil, timeZone, hour, minute });
}

function dayGrid(
  civil: { year: number; month: number; day: number } = DAY,
  days = 1,
  timeZone = NY,
  extra: Partial<TimeGridConfig> = {},
): TimeGrid {
  const start = zoned(civil, 0, 0, timeZone);
  return buildTimeGrid({
    start: start.toInstant(),
    end: start.add({ days }).toInstant(),
    slotMinutes: 60,
    axisLength: 1000,
    timeZone,
    weekStart: 1,
    ...extra,
  });
}

function ev(
  id: string,
  startHour: number,
  endHour: number,
  civil: { year: number; month: number; day: number } = DAY,
  timeZone = NY,
): CalendarEvent {
  return {
    id,
    title: id,
    start: zoned(civil, startHour, 0, timeZone).epochMilliseconds,
    end: zoned(civil, endHour, 0, timeZone).epochMilliseconds,
  };
}

function at(
  hour: number,
  civil: { year: number; month: number; day: number } = DAY,
  timeZone = NY,
): number {
  return zoned(civil, hour, 0, timeZone).epochMilliseconds;
}

function geometryOf(rects: readonly EventRect[]) {
  return rects.map((rect) => ({
    id: rect.event.id,
    day: rect.day.toString(),
    start: rect.start,
    end: rect.end,
    x: rect.x,
    width: rect.width,
    lane: rect.lane,
    laneCount: rect.laneCount,
  }));
}

function byId(rects: readonly EventRect[]) {
  return Object.fromEntries(geometryOf(rects).map((row) => [row.id, row]));
}

describe("resolveEventLanes — empty and single", () => {
  const grid = dayGrid();

  it("returns an empty array for empty input", () => {
    expect(resolveEventLanes([], grid)).toEqual([]);
  });

  it("places a lone event as a full-width rectangle in its day column", () => {
    const a = ev("a", 9, 10);
    expect(geometryOf(resolveEventLanes([a], grid))).toEqual([
      { id: "a", day: "2026-06-15", start: a.start, end: a.end, x: 0, width: 1, lane: 0, laneCount: 1 },
    ]);
  });
});

describe("resolveEventLanes — classic fixtures as exact rectangles", () => {
  const grid = dayGrid();

  it("gives two overlapping events half the column each", () => {
    const a = ev("a", 9, 11);
    const b = ev("b", 10, 12);
    expect(byId(resolveEventLanes([a, b], grid))).toEqual({
      a: { id: "a", day: "2026-06-15", start: a.start, end: a.end, x: 0, width: 0.5, lane: 0, laneCount: 2 },
      b: { id: "b", day: "2026-06-15", start: b.start, end: b.end, x: 0.5, width: 0.5, lane: 1, laneCount: 2 },
    });
  });

  it("gives two disjoint events each a full-width rectangle in their own cluster", () => {
    const a = ev("a", 8, 9);
    const b = ev("b", 16, 17);
    expect(byId(resolveEventLanes([a, b], grid))).toEqual({
      a: { id: "a", day: "2026-06-15", start: a.start, end: a.end, x: 0, width: 1, lane: 0, laneCount: 1 },
      b: { id: "b", day: "2026-06-15", start: b.start, end: b.end, x: 0, width: 1, lane: 0, laneCount: 1 },
    });
  });

  it("treats touching intervals as non-overlapping — each full width", () => {
    const a = ev("a", 9, 10);
    const b = ev("b", 10, 11);
    expect(byId(resolveEventLanes([a, b], grid))).toEqual({
      a: { id: "a", day: "2026-06-15", start: a.start, end: a.end, x: 0, width: 1, lane: 0, laneCount: 1 },
      b: { id: "b", day: "2026-06-15", start: b.start, end: b.end, x: 0, width: 1, lane: 0, laneCount: 1 },
    });
  });

  it("packs a chain (A overlaps B, B overlaps C, A misses C) into two lanes", () => {
    const a = ev("a", 8, 11);
    const b = ev("b", 10, 14);
    const c = ev("c", 13, 16);
    // packOverlaps: a lane 0, b lane 1, c reuses lane 0; peak 2.
    expect(byId(resolveEventLanes([a, b, c], grid))).toEqual({
      a: { id: "a", day: "2026-06-15", start: a.start, end: a.end, x: 0, width: 0.5, lane: 0, laneCount: 2 },
      b: { id: "b", day: "2026-06-15", start: b.start, end: b.end, x: 0.5, width: 0.5, lane: 1, laneCount: 2 },
      c: { id: "c", day: "2026-06-15", start: c.start, end: c.end, x: 0, width: 0.5, lane: 0, laneCount: 2 },
    });
  });

  it("packs a containment pyramid into three equal columns", () => {
    const outer = ev("outer", 8, 18);
    const mid = ev("mid", 10, 16);
    const inner = ev("inner", 12, 14);
    expect(byId(resolveEventLanes([outer, mid, inner], grid))).toEqual({
      outer: {
        id: "outer",
        day: "2026-06-15",
        start: outer.start,
        end: outer.end,
        x: 0,
        width: 1 / 3,
        lane: 0,
        laneCount: 3,
      },
      mid: {
        id: "mid",
        day: "2026-06-15",
        start: mid.start,
        end: mid.end,
        x: 1 / 3,
        width: 1 / 3,
        lane: 1,
        laneCount: 3,
      },
      inner: {
        id: "inner",
        day: "2026-06-15",
        start: inner.start,
        end: inner.end,
        x: 2 / 3,
        width: 1 / 3,
        lane: 2,
        laneCount: 3,
      },
    });
  });

  it("sorts simultaneous starts by end, then assigns distinct lanes", () => {
    const mid = ev("mid", 8, 13);
    const short = ev("short", 8, 10);
    const long = ev("long", 8, 18);
    // Sorted by end: short, mid, long → lanes 0, 1, 2. None can expand right.
    expect(byId(resolveEventLanes([mid, short, long], grid))).toEqual({
      short: {
        id: "short",
        day: "2026-06-15",
        start: short.start,
        end: short.end,
        x: 0,
        width: 1 / 3,
        lane: 0,
        laneCount: 3,
      },
      mid: {
        id: "mid",
        day: "2026-06-15",
        start: mid.start,
        end: mid.end,
        x: 1 / 3,
        width: 1 / 3,
        lane: 1,
        laneCount: 3,
      },
      long: {
        id: "long",
        day: "2026-06-15",
        start: long.start,
        end: long.end,
        x: 2 / 3,
        width: 1 / 3,
        lane: 2,
        laneCount: 3,
      },
    });
  });

  it("reuses a freed lane inside a cluster without opening a third", () => {
    const a = ev("a", 8, 18);
    const b = ev("b", 9, 10);
    const c = ev("c", 12, 13);
    expect(byId(resolveEventLanes([a, b, c], grid))).toEqual({
      a: { id: "a", day: "2026-06-15", start: a.start, end: a.end, x: 0, width: 0.5, lane: 0, laneCount: 2 },
      b: { id: "b", day: "2026-06-15", start: b.start, end: b.end, x: 0.5, width: 0.5, lane: 1, laneCount: 2 },
      c: { id: "c", day: "2026-06-15", start: c.start, end: c.end, x: 0.5, width: 0.5, lane: 1, laneCount: 2 },
    });
  });

  it("widens an early event into later lanes that stay free for its whole span", () => {
    const a = ev("a", 8, 18);
    const b = ev("b", 9, 10);
    const c = ev("c", 16, 18);
    const d = ev("d", 16, 18);
    // a starts first → lane 0. Peak 3 at 16–18. During 9–10 lane 2 is unused, so
    // b (lane 1) spans two columns. Same-start would sort the short event first
    // and park it in lane 0, where a later-lane expand cannot fire.
    expect(byId(resolveEventLanes([a, b, c, d], grid))).toEqual({
      a: { id: "a", day: "2026-06-15", start: a.start, end: a.end, x: 0, width: 1 / 3, lane: 0, laneCount: 3 },
      b: { id: "b", day: "2026-06-15", start: b.start, end: b.end, x: 1 / 3, width: 2 / 3, lane: 1, laneCount: 3 },
      c: { id: "c", day: "2026-06-15", start: c.start, end: c.end, x: 1 / 3, width: 1 / 3, lane: 1, laneCount: 3 },
      d: { id: "d", day: "2026-06-15", start: d.start, end: d.end, x: 2 / 3, width: 1 / 3, lane: 2, laneCount: 3 },
    });
  });
});

describe("resolveEventLanes — day-boundary and visible-range clipping", () => {
  it("splits a multi-day event into one rectangle per service-day column", () => {
    const grid = dayGrid(DAY, 2);
    const next = { year: 2026, month: 6, day: 16 };
    const overnight: CalendarEvent = {
      id: "overnight",
      title: "overnight",
      start: at(22),
      end: at(10, next),
    };
    expect(geometryOf(resolveEventLanes([overnight], grid))).toEqual([
      {
        id: "overnight",
        day: "2026-06-15",
        start: at(22),
        end: at(0, next),
        x: 0,
        width: 1,
        lane: 0,
        laneCount: 1,
      },
      {
        id: "overnight",
        day: "2026-06-16",
        start: at(0, next),
        end: at(10, next),
        x: 0,
        width: 1,
        lane: 0,
        laneCount: 1,
      },
    ]);
  });

  it("clips an event that overruns the visible window to the visible instants", () => {
    const start = zoned(DAY, 10);
    const end = zoned(DAY, 14);
    const grid = buildTimeGrid({
      start: start.toInstant(),
      end: end.toInstant(),
      slotMinutes: 60,
      axisLength: 400,
      timeZone: NY,
      weekStart: 1,
    });
    const wide = ev("wide", 8, 16);
    expect(geometryOf(resolveEventLanes([wide], grid))).toEqual([
      {
        id: "wide",
        day: "2026-06-15",
        start: start.epochMilliseconds,
        end: end.epochMilliseconds,
        x: 0,
        width: 1,
        lane: 0,
        laneCount: 1,
      },
    ]);
  });

  it("omits an event that does not intersect the visible range", () => {
    const start = zoned(DAY, 10);
    const grid = buildTimeGrid({
      start: start.toInstant(),
      end: zoned(DAY, 14).toInstant(),
      slotMinutes: 60,
      axisLength: 400,
      timeZone: NY,
      weekStart: 1,
    });
    expect(resolveEventLanes([ev("before", 0, 9), ev("after", 15, 18)], grid)).toEqual([]);
  });

  it("assigns a pre-anchor hour to the previous service-day column", () => {
    const start = zoned(DAY, 1);
    const grid = buildTimeGrid({
      start: start.toInstant(),
      end: zoned(DAY, 3).toInstant(),
      slotMinutes: 60,
      axisLength: 100,
      timeZone: NY,
      weekStart: 1,
      serviceDayAnchor: { hour: 6 },
    });
    const late = ev("late", 1, 3);
    expect(geometryOf(resolveEventLanes([late], grid))).toEqual([
      {
        id: "late",
        day: "2026-06-14",
        start: late.start,
        end: late.end,
        x: 0,
        width: 1,
        lane: 0,
        laneCount: 1,
      },
    ]);
  });
});

describe("resolveEventLanes — DST days stay elapsed-time columns", () => {
  it("places an event on the New York spring-forward 23-hour day", () => {
    const spring = { year: 2026, month: 3, day: 8 };
    const grid = dayGrid(spring);
    expect(grid.days[0]!.elapsedHours).toBe(23);
    const meeting = ev("meeting", 9, 10, spring);
    expect(geometryOf(resolveEventLanes([meeting], grid))).toEqual([
      {
        id: "meeting",
        day: "2026-03-08",
        start: meeting.start,
        end: meeting.end,
        x: 0,
        width: 1,
        lane: 0,
        laneCount: 1,
      },
    ]);
  });

  it("places an event on the London fall-back 25-hour day", () => {
    const fall = { year: 2026, month: 10, day: 25 };
    const grid = dayGrid(fall, 1, LONDON);
    expect(grid.days[0]!.elapsedHours).toBe(25);
    const meeting = ev("meeting", 14, 16, fall, LONDON);
    expect(geometryOf(resolveEventLanes([meeting], grid))).toEqual([
      {
        id: "meeting",
        day: "2026-10-25",
        start: meeting.start,
        end: meeting.end,
        x: 0,
        width: 1,
        lane: 0,
        laneCount: 1,
      },
    ]);
  });
});

describe("resolveEventLanes — determinism and purity", () => {
  const grid = dayGrid();
  const events: CalendarEvent[] = [
    ev("a1", 8, 12),
    ev("a2", 8, 12),
    ev("b", 9, 10),
    ev("c", 14, 16),
    ev("d", 15, 18),
  ];

  it("yields the same geometry for the same set on every call", () => {
    expect(geometryOf(resolveEventLanes(events, grid))).toEqual(geometryOf(resolveEventLanes(events, grid)));
  });

  it("is independent of input order when ids are unique", () => {
    const reference = byId(resolveEventLanes(events, grid));
    const permutations: CalendarEvent[][] = [
      [...events].reverse(),
      [events[2]!, events[4]!, events[0]!, events[3]!, events[1]!],
      [events[4]!, events[3]!, events[2]!, events[1]!, events[0]!],
    ];
    for (const order of permutations) {
      expect(byId(resolveEventLanes(order, grid))).toEqual(reference);
    }
  });

  it("does not mutate the caller's events or the grid days", () => {
    const snapshot = events.map((event) => ({ ...event }));
    const order = [...events];
    const days = [...grid.days];
    resolveEventLanes(events, grid);
    expect(events).toEqual(snapshot);
    events.forEach((event, i) => {
      expect(event).toBe(order[i]);
    });
    expect(grid.days).toEqual(days);
  });

  it("throws on a duplicate event id", () => {
    const a = ev("dup", 9, 10);
    const b = ev("dup", 14, 15);
    expect(() => resolveEventLanes([a, b], grid)).toThrow(/duplicate event id/);
  });
});

describe("resolveEventLanes — packer composition, not a second packer", () => {
  it("uses the same lanes packOverlaps would assign for a single-day column", () => {
    const grid = dayGrid();
    const events = [ev("z", 8, 18), ev("y", 9, 11), ev("x", 10, 12)];
    const packed = packOverlaps(events, { key: (event) => event.id });
    const byEvent = new Map(packed.map((row) => [row.item.id, row]));
    for (const rect of resolveEventLanes(events, grid)) {
      const expected = byEvent.get(rect.event.id)!;
      expect(rect.lane).toBe(expected.lane);
      expect(rect.laneCount).toBe(expected.laneCount);
    }
  });

  it("emits only numeric column fractions — no style or element fields", () => {
    const rect = resolveEventLanes([ev("a", 9, 10)], dayGrid())[0]!;
    expect(rect).toEqual({
      event: ev("a", 9, 10),
      day: Temporal.PlainDate.from("2026-06-15"),
      start: at(9),
      end: at(10),
      x: 0,
      width: 1,
      lane: 0,
      laneCount: 1,
    });
    expect("style" in rect).toBe(false);
    expect("element" in rect).toBe(false);
    expect("className" in rect).toBe(false);
  });
});

describe("resolveEventLanes — zero-length and inverted", () => {
  const grid = dayGrid();

  it("packs a zero-length event inside another interval into a second lane", () => {
    const a = ev("a", 8, 12);
    const point: CalendarEvent = { id: "point", title: "point", start: at(10), end: at(10) };
    expect(byId(resolveEventLanes([a, point], grid))).toEqual({
      a: { id: "a", day: "2026-06-15", start: a.start, end: a.end, x: 0, width: 0.5, lane: 0, laneCount: 2 },
      point: { id: "point", day: "2026-06-15", start: at(10), end: at(10), x: 0.5, width: 0.5, lane: 1, laneCount: 2 },
    });
  });

  it("drops an inverted interval (end before start)", () => {
    const inverted: CalendarEvent = { id: "inv", title: "inv", start: at(12), end: at(9) };
    expect(resolveEventLanes([inverted], grid)).toEqual([]);
  });
});
