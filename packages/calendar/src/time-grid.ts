/**
 * Time-grid model — zoned civil-time geometry for a booking calendar.
 *
 * One explicit IANA display zone per view. Slot generation walks elapsed time
 * in that zone so a spring-forward day is 23 hours and a fall-back day is 25.
 * Gap civil times are not slots. A repeated fold hour appears twice, ordered
 * by instant, distinguished by offset.
 *
 * Temporal types are the calendar boundary. `Date` is accepted only on
 * `positionOf`, which is the D3 scale-domain seam.
 *
 * Week start is an explicit input. This module never reads
 * `Intl.Locale.getWeekInfo()`. A service-day anchor is opt-in; the default is
 * calendar midnight in the display zone.
 *
 * Offset-less ISO date-time strings are not accepted.
 */
import { Temporal } from "temporal-polyfill";

/** ISO weekday. 1 = Monday, 7 = Sunday — Temporal's numbering. */
export type WeekStart = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Temporal instant-like values accepted as a visible-range bound.
 * `Date` is not accepted here; convert at `positionOf` only.
 */
export type GridInstant = Temporal.Instant | Temporal.ZonedDateTime;

/** When a service day begins, as civil clock time in the display zone. */
export interface ServiceDayAnchor {
  /** Hour in the display zone, 0–23. */
  hour: number;
  /** Minute in the display zone, 0–59. Default 0. */
  minute?: number;
}

/**
 * Temporal disambiguation for a civil time that is skipped (gap) or repeated
 * (fold). The creation default is `reject`. `compatible` is the documented
 * coerce adapter — pass it explicitly; it is never implied.
 */
export type CivilDisambiguation = "earlier" | "later" | "compatible" | "reject";

export interface TimeGridConfig {
  /** Visible window start (inclusive). */
  start: GridInstant;
  /** Visible window end (exclusive). */
  end: GridInstant;
  /** Slot size in minutes (e.g. 30 for half-hour rows). */
  slotMinutes: number;
  /** Pixel length of the time axis. */
  axisLength: number;
  /** IANA time zone that defines civil time for this view. */
  timeZone: string;
  /** First day of the week. Never inferred from the runtime locale. */
  weekStart: WeekStart;
  /**
   * Optional service-day start in the display zone. Default: calendar
   * midnight. A crossing service-day is an application opt-in.
   */
  serviceDayAnchor?: ServiceDayAnchor;
}

export interface TimeSlot {
  /** Slot start as zoned civil time (offset distinguishes a fold pair). */
  start: Temporal.ZonedDateTime;
  /** Pixel position of this slot's start along the axis. */
  position: number;
  /** True for on-the-hour (major) lines. */
  major: boolean;
}

export interface TimeGridDay {
  /** Civil date of this service day's start in the display zone. */
  date: Temporal.PlainDate;
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
  /** Elapsed hours in this service day (23 / 24 / 25 on DST transition days). */
  elapsedHours: number;
}

export interface TimeGridWeek {
  start: Temporal.PlainDate;
  /** Exclusive civil date of the following week start. */
  end: Temporal.PlainDate;
  days: TimeGridDay[];
}

export interface TimeGrid {
  config: TimeGridConfig;
  slots: TimeSlot[];
  days: TimeGridDay[];
  weeks: TimeGridWeek[];
  /** Map an arbitrary instant to a pixel position on the axis (D3 seam). */
  positionOf(time: Date): number;
}

const PREFIX = "[@silkplot/calendar]";

/**
 * Resolve a civil date-time in `timeZone`.
 *
 * Default disambiguation is `reject`: a gap throws; a fold throws. Pass
 * `earlier` or `later` when the caller has already identified which occurrence
 * was targeted. Pass `compatible` only as the documented coerce adapter.
 */
export function resolveCivilDateTime(
  civil: Temporal.PlainDateTime,
  timeZone: string,
  options?: { readonly disambiguation?: CivilDisambiguation },
): Temporal.ZonedDateTime {
  const disambiguation = options?.disambiguation ?? "reject";
  try {
    return Temporal.ZonedDateTime.from(
      {
        timeZone,
        year: civil.year,
        month: civil.month,
        day: civil.day,
        hour: civil.hour,
        minute: civil.minute,
        second: civil.second,
        millisecond: civil.millisecond,
        microsecond: civil.microsecond,
        nanosecond: civil.nanosecond,
      },
      { disambiguation },
    );
  } catch (error) {
    if (disambiguation === "reject") {
      throw new RangeError(
        `${PREFIX} civil time ${civil.toString()} is skipped or repeated in ${timeZone}`,
        { cause: error },
      );
    }
    throw error;
  }
}

export function buildTimeGrid(config: TimeGridConfig): TimeGrid {
  const normalized = normalizeConfig(config);
  const startMs = normalized.start.epochMilliseconds;
  const endMs = normalized.end.epochMilliseconds;
  const { timeZone, slotMinutes, axisLength, weekStart, serviceDayAnchor } = normalized;

  const days = collectDays(normalized.start, normalized.end, timeZone, serviceDayAnchor);
  const slots = collectSlots(days, startMs, endMs, slotMinutes, axisLength);
  const weeks = collectWeeks(days, weekStart);

  return {
    config: normalized,
    slots,
    days,
    weeks,
    positionOf: (time: Date) => positionAlong(time.getTime(), startMs, endMs, axisLength),
  };
}

function normalizeConfig(config: TimeGridConfig): TimeGridConfig & {
  start: Temporal.Instant;
  end: Temporal.Instant;
} {
  if (!Number.isInteger(config.slotMinutes) || config.slotMinutes <= 0) {
    throw new RangeError(`${PREFIX} slotMinutes must be a positive integer`);
  }
  if (!Number.isFinite(config.axisLength) || config.axisLength < 0) {
    throw new RangeError(`${PREFIX} axisLength must be a finite number ≥ 0`);
  }
  if (!isWeekStart(config.weekStart)) {
    throw new RangeError(`${PREFIX} weekStart must be an integer 1–7 (Monday–Sunday)`);
  }
  if (typeof config.timeZone !== "string" || config.timeZone.length === 0) {
    throw new RangeError(`${PREFIX} timeZone must be a non-empty IANA name`);
  }
  validateTimeZone(config.timeZone);
  const anchor = normalizeAnchor(config.serviceDayAnchor);

  const start = toInstant(config.start);
  const end = toInstant(config.end);
  if (start.epochNanoseconds >= end.epochNanoseconds) {
    throw new RangeError(`${PREFIX} start must be strictly before end`);
  }

  return {
    start,
    end,
    slotMinutes: config.slotMinutes,
    axisLength: config.axisLength,
    timeZone: config.timeZone,
    weekStart: config.weekStart,
    ...(anchor !== undefined ? { serviceDayAnchor: anchor } : {}),
  };
}

function isWeekStart(value: number): value is WeekStart {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function validateTimeZone(timeZone: string): void {
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
  } catch (error) {
    throw new RangeError(`${PREFIX} timeZone is not a valid IANA name: ${timeZone}`, {
      cause: error,
    });
  }
}

function normalizeAnchor(anchor: ServiceDayAnchor | undefined): ServiceDayAnchor | undefined {
  if (anchor === undefined) return undefined;
  const hour = anchor.hour;
  const minute = anchor.minute ?? 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`${PREFIX} serviceDayAnchor.hour must be an integer 0–23`);
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new RangeError(`${PREFIX} serviceDayAnchor.minute must be an integer 0–59`);
  }
  return minute === 0 ? { hour } : { hour, minute };
}

function toInstant(value: GridInstant): Temporal.Instant {
  const nanoseconds =
    "timeZoneId" in value && typeof value.toInstant === "function"
      ? value.toInstant().epochNanoseconds
      : value.epochNanoseconds;
  return Temporal.Instant.fromEpochNanoseconds(nanoseconds);
}

function anchorTime(anchor: ServiceDayAnchor | undefined): Temporal.PlainTime {
  return Temporal.PlainTime.from({ hour: anchor?.hour ?? 0, minute: anchor?.minute ?? 0 });
}

function serviceDayStartContaining(
  instant: Temporal.Instant,
  timeZone: string,
  anchor: ServiceDayAnchor | undefined,
): Temporal.ZonedDateTime {
  const zoned = instant.toZonedDateTimeISO(timeZone);
  const time = zoned.toPlainTime();
  const startTime = anchorTime(anchor);
  const date =
    Temporal.PlainTime.compare(time, startTime) >= 0
      ? zoned.toPlainDate()
      : zoned.toPlainDate().subtract({ days: 1 });
  return resolveCivilDateTime(date.toPlainDateTime(startTime), timeZone, {
    disambiguation: "compatible",
  });
}

function collectDays(
  rangeStart: Temporal.Instant,
  rangeEnd: Temporal.Instant,
  timeZone: string,
  anchor: ServiceDayAnchor | undefined,
): TimeGridDay[] {
  const days: TimeGridDay[] = [];
  let cursor = serviceDayStartContaining(rangeStart, timeZone, anchor);
  while (cursor.epochMilliseconds < rangeEnd.epochMilliseconds) {
    const next = cursor.add({ days: 1 });
    days.push({
      date: cursor.toPlainDate(),
      start: cursor,
      end: next,
      elapsedHours: (next.epochMilliseconds - cursor.epochMilliseconds) / 3_600_000,
    });
    cursor = next;
  }
  return days;
}

function collectSlots(
  days: readonly TimeGridDay[],
  rangeStartMs: number,
  rangeEndMs: number,
  slotMinutes: number,
  axisLength: number,
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const first = days[0];
  if (first === undefined) return slots;

  let cursor = first.start;
  const lastEndMs = days[days.length - 1]!.end.epochMilliseconds;
  while (cursor.epochMilliseconds < lastEndMs) {
    const startMs = cursor.epochMilliseconds;
    if (startMs >= rangeStartMs && startMs < rangeEndMs) {
      slots.push({
        start: cursor,
        position: positionAlong(startMs, rangeStartMs, rangeEndMs, axisLength),
        major: isMajor(cursor),
      });
    }
    cursor = cursor.add({ minutes: slotMinutes });
  }
  return slots;
}

function isMajor(zoned: Temporal.ZonedDateTime): boolean {
  return (
    zoned.minute === 0 &&
    zoned.second === 0 &&
    zoned.millisecond === 0 &&
    zoned.microsecond === 0 &&
    zoned.nanosecond === 0
  );
}

function collectWeeks(days: readonly TimeGridDay[], weekStart: WeekStart): TimeGridWeek[] {
  const groups = new Map<string, { start: Temporal.PlainDate; days: TimeGridDay[] }>();
  for (const day of days) {
    const start = weekStartDate(day.date, weekStart);
    const key = start.toString();
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { start, days: [day] });
    } else {
      group.days.push(day);
    }
  }
  return [...groups.values()].map((group) => ({
    start: group.start,
    end: group.start.add({ days: 7 }),
    days: group.days,
  }));
}

function weekStartDate(date: Temporal.PlainDate, weekStart: WeekStart): Temporal.PlainDate {
  const delta = (date.dayOfWeek - weekStart + 7) % 7;
  return date.subtract({ days: delta });
}

function positionAlong(at: number, startMs: number, endMs: number, axisLength: number): number {
  const span = endMs - startMs;
  if (span === 0) return 0;
  return ((at - startMs) / span) * axisLength;
}
