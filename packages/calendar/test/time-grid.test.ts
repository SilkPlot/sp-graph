/**
 * `buildTimeGrid` — zoned civil-time geometry.
 *
 * Transition-day fixtures are the load-bearing cases: a spring-forward day is
 * 23 elapsed hours with a gap that is not a slot; a fall-back day is 25 elapsed
 * hours with the repeated hour appearing twice, ordered by instant. Those
 * fixtures run in two IANA zones so a single tzdb quirk cannot green the suite.
 *
 * Creation defaults are `reject`: a gap throws; a fold throws unless the
 * caller already named earlier/later. `compatible` is an explicit adapter.
 */
import { describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";
import {
  buildTimeGrid,
  resolveCivilDateTime,
  type TimeGrid,
  type TimeGridConfig,
  type TimeSlot,
  type WeekStart,
} from "../src/time-grid";

const NY = "America/New_York";
const LONDON = "Europe/London";

/** 2026-03-08 — US spring-forward (02:00 EST → 03:00 EDT). */
const NY_SPRING = { year: 2026, month: 3, day: 8 } as const;
/** 2026-11-01 — US fall-back (02:00 EDT → 01:00 EST). */
const NY_FALL = { year: 2026, month: 11, day: 1 } as const;
/** 2026-03-29 — UK spring-forward (01:00 GMT → 02:00 BST). */
const LONDON_SPRING = { year: 2026, month: 3, day: 29 } as const;
/** 2026-10-25 — UK fall-back (02:00 BST → 01:00 GMT). */
const LONDON_FALL = { year: 2026, month: 10, day: 25 } as const;

function dayRange(timeZone: string, civil: { year: number; month: number; day: number }) {
  const start = Temporal.ZonedDateTime.from({ ...civil, timeZone, hour: 0 });
  return { start: start.toInstant(), end: start.add({ days: 1 }).toInstant() };
}

function grid(partial: TimeGridConfig): TimeGrid {
  return buildTimeGrid(partial);
}

function civilKeys(slots: readonly TimeSlot[]) {
  return slots.map((slot) => ({
    iso: slot.start.toString(),
    epoch: slot.start.epochMilliseconds,
    offset: slot.start.offset,
    hour: slot.start.hour,
    minute: slot.start.minute,
    position: slot.position,
    major: slot.major,
  }));
}

function geometryOf(built: TimeGrid) {
  return {
    start: built.config.start instanceof Temporal.Instant ? built.config.start.epochNanoseconds.toString() : "",
    end: built.config.end instanceof Temporal.Instant ? built.config.end.epochNanoseconds.toString() : "",
    timeZone: built.config.timeZone,
    weekStart: built.config.weekStart,
    slotMinutes: built.config.slotMinutes,
    axisLength: built.config.axisLength,
    serviceDayAnchor: built.config.serviceDayAnchor ?? null,
    slots: civilKeys(built.slots),
    days: built.days.map((day) => ({
      date: day.date.toString(),
      start: day.start.toString(),
      end: day.end.toString(),
      elapsedHours: day.elapsedHours,
    })),
    weeks: built.weeks.map((week) => ({
      start: week.start.toString(),
      end: week.end.toString(),
      days: week.days.map((day) => day.date.toString()),
    })),
  };
}

function hoursOf(timeZone: string, civil: { year: number; month: number; day: number }, slotMinutes: number) {
  const { start, end } = dayRange(timeZone, civil);
  return grid({
    start,
    end,
    slotMinutes,
    axisLength: 1000,
    timeZone,
    weekStart: 1,
  });
}

describe("buildTimeGrid — no longer a throwing stub", () => {
  it("returns slot, day, and week geometry for a civil day", () => {
    const built = hoursOf(NY, { year: 2026, month: 6, day: 15 }, 60);
    expect(built.slots).toHaveLength(24);
    expect(built.days).toHaveLength(1);
    expect(built.days[0]!.elapsedHours).toBe(24);
    expect(built.weeks).toHaveLength(1);
    expect(built.positionOf).toBeTypeOf("function");
  });
});

describe.each([
  {
    zone: NY,
    spring: NY_SPRING,
    fall: NY_FALL,
    springGap: { hour: 2, minute: 30 },
    fallFold: { hour: 1, minute: 0 },
  },
  {
    zone: LONDON,
    spring: LONDON_SPRING,
    fall: LONDON_FALL,
    springGap: { hour: 1, minute: 30 },
    fallFold: { hour: 1, minute: 0 },
  },
])("DST geometry in $zone", ({ zone, spring, fall, springGap, fallFold }) => {
  it.each([15, 30, 60] as const)("spring-forward is 23 elapsed hours at %s-minute slots", (slotMinutes) => {
    const built = hoursOf(zone, spring, slotMinutes);
    expect(built.days[0]!.elapsedHours).toBe(23);
    expect(built.slots).toHaveLength((23 * 60) / slotMinutes);
    expect(
      built.slots.some((slot) => slot.start.hour === springGap.hour && slot.start.minute === springGap.minute),
    ).toBe(false);
  });

  it.each([15, 30, 60] as const)("fall-back is 25 elapsed hours at %s-minute slots", (slotMinutes) => {
    const built = hoursOf(zone, fall, slotMinutes);
    expect(built.days[0]!.elapsedHours).toBe(25);
    expect(built.slots).toHaveLength((25 * 60) / slotMinutes);
    const folds = built.slots.filter(
      (slot) => slot.start.hour === fallFold.hour && slot.start.minute === fallFold.minute,
    );
    expect(folds).toHaveLength(2);
    expect(folds[0]!.start.epochMilliseconds).toBeLessThan(folds[1]!.start.epochMilliseconds);
    expect(folds[0]!.start.offset).not.toBe(folds[1]!.start.offset);
  });
});

describe("week-start is an explicit input", () => {
  const start = Temporal.ZonedDateTime.from({
    timeZone: NY,
    year: 2026,
    month: 3,
    day: 7,
    hour: 0,
  }).toInstant();
  const end = Temporal.ZonedDateTime.from({
    timeZone: NY,
    year: 2026,
    month: 3,
    day: 9,
    hour: 0,
  }).toInstant();

  it.each([
    { weekStart: 1 as WeekStart, weeks: ["2026-03-02"], days: ["2026-03-07", "2026-03-08"] },
    { weekStart: 7 as WeekStart, weeks: ["2026-03-01", "2026-03-08"], days: ["2026-03-07", "2026-03-08"] },
  ])("weekStart $weekStart groups $weeks", ({ weekStart, weeks, days }) => {
    const built = grid({
      start,
      end,
      slotMinutes: 60,
      axisLength: 100,
      timeZone: NY,
      weekStart,
    });
    expect(built.days.map((day) => day.date.toString())).toEqual(days);
    expect(built.weeks.map((week) => week.start.toString())).toEqual(weeks);
  });

  it("does not read Intl.Locale.getWeekInfo", () => {
    const proto = Intl.Locale.prototype as Intl.Locale & { getWeekInfo?: () => unknown };
    const spy = proto.getWeekInfo === undefined ? undefined : vi.spyOn(proto, "getWeekInfo");
    grid({
      start,
      end,
      slotMinutes: 60,
      axisLength: 100,
      timeZone: NY,
      weekStart: 1,
    });
    if (spy !== undefined) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe("service-day anchor is opt-in", () => {
  it("defaults to calendar midnight in the display zone", () => {
    const built = hoursOf(NY, { year: 2026, month: 6, day: 12 }, 60);
    expect(built.days[0]!.start.hour).toBe(0);
    expect(built.days[0]!.start.minute).toBe(0);
    expect(built.config.serviceDayAnchor).toBeUndefined();
  });

  it("assigns a pre-anchor hour to the previous service day", () => {
    const start = Temporal.ZonedDateTime.from({
      timeZone: NY,
      year: 2026,
      month: 3,
      day: 7,
      hour: 1,
    }).toInstant();
    const end = Temporal.ZonedDateTime.from({
      timeZone: NY,
      year: 2026,
      month: 3,
      day: 7,
      hour: 3,
    }).toInstant();
    const built = grid({
      start,
      end,
      slotMinutes: 60,
      axisLength: 100,
      timeZone: NY,
      weekStart: 1,
      serviceDayAnchor: { hour: 6 },
    });
    expect(built.days).toHaveLength(1);
    expect(built.days[0]!.date.toString()).toBe("2026-03-06");
    expect(built.days[0]!.start.hour).toBe(6);
  });
});

describe("identical inputs produce deeply-equal geometry", () => {
  it("is deterministic across two builds of the same config", () => {
    const { start, end } = dayRange(NY, NY_FALL);
    const config: TimeGridConfig = {
      start,
      end,
      slotMinutes: 30,
      axisLength: 2500,
      timeZone: NY,
      weekStart: 7,
      serviceDayAnchor: { hour: 0, minute: 0 },
    };
    expect(geometryOf(buildTimeGrid(config))).toEqual(geometryOf(buildTimeGrid(config)));
  });
});

describe("positionOf is the Date / D3 seam", () => {
  it("maps the range start to 0 and the exclusive end to axisLength", () => {
    const { start, end } = dayRange(LONDON, { year: 2026, month: 6, day: 1 });
    const built = grid({
      start,
      end,
      slotMinutes: 60,
      axisLength: 230,
      timeZone: LONDON,
      weekStart: 1,
    });
    expect(built.positionOf(new Date(start.epochMilliseconds))).toBe(0);
    expect(built.positionOf(new Date(end.epochMilliseconds))).toBe(230);
    const mid = new Date((start.epochMilliseconds + end.epochMilliseconds) / 2);
    expect(built.positionOf(mid)).toBeCloseTo(115);
  });
});

describe("creation defaults", () => {
  it("rejects a civil time in a spring-forward gap (both zones)", () => {
    expect(() =>
      resolveCivilDateTime(Temporal.PlainDateTime.from({ ...NY_SPRING, hour: 2, minute: 30 }), NY),
    ).toThrowError(/skipped or repeated/);
    expect(() =>
      resolveCivilDateTime(Temporal.PlainDateTime.from({ ...LONDON_SPRING, hour: 1, minute: 30 }), LONDON),
    ).toThrowError(/skipped or repeated/);
  });

  it("rejects a fold unless the caller already named earlier or later", () => {
    const nyFold = Temporal.PlainDateTime.from({ ...NY_FALL, hour: 1, minute: 30 });
    const londonFold = Temporal.PlainDateTime.from({ ...LONDON_FALL, hour: 1, minute: 30 });
    expect(() => resolveCivilDateTime(nyFold, NY)).toThrowError(/skipped or repeated/);
    expect(() => resolveCivilDateTime(londonFold, LONDON)).toThrowError(/skipped or repeated/);

    const nyEarlier = resolveCivilDateTime(nyFold, NY, { disambiguation: "earlier" });
    const nyLater = resolveCivilDateTime(nyFold, NY, { disambiguation: "later" });
    expect(nyEarlier.offset).not.toBe(nyLater.offset);
    expect(nyEarlier.epochMilliseconds).toBeLessThan(nyLater.epochMilliseconds);

    const londonEarlier = resolveCivilDateTime(londonFold, LONDON, { disambiguation: "earlier" });
    const londonLater = resolveCivilDateTime(londonFold, LONDON, { disambiguation: "later" });
    expect(londonEarlier.epochMilliseconds).toBeLessThan(londonLater.epochMilliseconds);
  });

  it("treats compatible as an explicit coerce adapter, not the default", () => {
    const gap = Temporal.PlainDateTime.from({ ...NY_SPRING, hour: 2, minute: 30 });
    expect(() => resolveCivilDateTime(gap, NY)).toThrow();
    const coerced = resolveCivilDateTime(gap, NY, { disambiguation: "compatible" });
    expect(coerced.hour).not.toBe(2);
  });
});

describe("config validation", () => {
  const { start, end } = dayRange(NY, { year: 2026, month: 6, day: 1 });
  const base = {
    start,
    end,
    slotMinutes: 30,
    axisLength: 100,
    timeZone: NY,
    weekStart: 1 as WeekStart,
  };

  it("rejects a missing or invalid IANA zone", () => {
    expect(() => grid({ ...base, timeZone: "" })).toThrowError(/IANA/);
    expect(() => grid({ ...base, timeZone: "Not/AZone" })).toThrowError(/IANA/);
  });

  it("rejects a silent week-start omission by requiring 1–7", () => {
    expect(() => grid({ ...base, weekStart: 0 as WeekStart })).toThrowError(/weekStart/);
    expect(() => grid({ ...base, weekStart: 8 as WeekStart })).toThrowError(/weekStart/);
  });

  it("rejects an inverted visible range", () => {
    expect(() => grid({ ...base, start: end, end: start })).toThrowError(/start must be strictly before end/);
  });

  it("rejects a non-positive slot size or a negative axis", () => {
    expect(() => grid({ ...base, slotMinutes: 0 })).toThrowError(/slotMinutes/);
    expect(() => grid({ ...base, axisLength: -1 })).toThrowError(/axisLength/);
  });

  it("rejects an out-of-range service-day anchor", () => {
    expect(() => grid({ ...base, serviceDayAnchor: { hour: 24 } })).toThrowError(/hour/);
    expect(() => grid({ ...base, serviceDayAnchor: { hour: 6, minute: 60 } })).toThrowError(/minute/);
  });

  it("accepts a ZonedDateTime visible range and a non-zero minute anchor", () => {
    const start = Temporal.ZonedDateTime.from({
      timeZone: NY,
      year: 2026,
      month: 6,
      day: 1,
      hour: 17,
    });
    const end = start.add({ hours: 2 });
    const built = grid({
      start,
      end,
      slotMinutes: 30,
      axisLength: 0,
      timeZone: NY,
      weekStart: 1,
      serviceDayAnchor: { hour: 17, minute: 30 },
    });
    expect(built.days[0]!.start.hour).toBe(17);
    expect(built.days[0]!.start.minute).toBe(30);
    expect(built.positionOf(new Date(start.epochMilliseconds))).toBe(0);
  });
});
