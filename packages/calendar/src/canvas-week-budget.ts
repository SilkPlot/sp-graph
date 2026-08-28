/**
 * Booking-density protocol for the Canvas week paint budget.
 *
 * This is the measurement the leftover virtualization question is gated on:
 * paint a realistic clinic board on the Canvas stack, on named hardware, and
 * only then decide whether visible-range filtering is needed. The constants
 * are the protocol. The recorded result is filled from a timed paint pass,
 * not from a preference about virtualization.
 *
 * Frame budget is ADR-0002's 16.7 ms (60 fps). Acceptance adds the same 1 ms
 * timer tolerance the workload harness declares before measuring. This pass
 * is a paint, not a pointer-move stream, so it is not CPU-throttled.
 */
import { Temporal } from "temporal-polyfill";
import { paintCanvasWeek, syncCanvasWeek, type CanvasWeekPaintArgs } from "./canvas-week-paint";
import { weekCanvasSize } from "./canvas-week-geometry";
import { buildTimeGrid, type TimeGrid } from "./time-grid";
import { resolveEventLanes, type CalendarEvent, type EventRect } from "./overlap-resolver";

export const FRAME_BUDGET_MS = 16.7;
export const TIMER_TOLERANCE_MS = 1.0;
export const ACCEPTANCE_MS = FRAME_BUDGET_MS + TIMER_TOLERANCE_MS;

export const BOOKING_DENSITY = {
  timeZone: "America/New_York",
  weekStart: 1 as const,
  rangeWeeks: 4,
  rangeStart: { year: 2026, month: 3, day: 2 } as const,
  slotMinutes: 30,
  rooms: 8,
  weekdayStartHour: 8,
  weekdayEndHour: 18,
  saturdayStartHour: 8,
  saturdayEndHour: 12,
  skipEvery: 5,
  columnWidth: 108,
  axisLengthPerWeek: 1670,
  warmupPasses: 5,
  timedPasses: 30,
  devicePixelRatio: 1,
  viewport: { x: 0, y: 0, width: 1200, height: 900 },
  overscanPx: 108,
} as const;

export interface BookingHours {
  startHour: number;
  endHour: number;
}

export function bookingHours(dayOfWeek: number): BookingHours | undefined {
  if (dayOfWeek === 7) return undefined;
  if (dayOfWeek === 6) {
    return { startHour: BOOKING_DENSITY.saturdayStartHour, endHour: BOOKING_DENSITY.saturdayEndHour };
  }
  return { startHour: BOOKING_DENSITY.weekdayStartHour, endHour: BOOKING_DENSITY.weekdayEndHour };
}

export function slotClocks(hours: BookingHours, slotMinutes: number): { hour: number; minute: number }[] {
  const clocks: { hour: number; minute: number }[] = [];
  for (let hour = hours.startHour; hour < hours.endHour; hour++) {
    for (let minute = 0; minute < 60; minute += slotMinutes) {
      clocks.push({ hour, minute });
    }
  }
  return clocks;
}

export function keepBookingSlot(room: number, slotIndex: number, dayIndex: number): boolean {
  return (room + slotIndex + dayIndex) % BOOKING_DENSITY.skipEvery !== 0;
}

function eventsOnDay(
  civil: Temporal.PlainDate,
  dayIndex: number,
  hours: BookingHours,
): CalendarEvent[] {
  const clocks = slotClocks(hours, BOOKING_DENSITY.slotMinutes);
  const events: CalendarEvent[] = [];
  for (let slotIndex = 0; slotIndex < clocks.length; slotIndex++) {
    const clock = clocks[slotIndex]!;
    for (let room = 0; room < BOOKING_DENSITY.rooms; room++) {
      if (!keepBookingSlot(room, slotIndex, dayIndex)) continue;
      const start = Temporal.ZonedDateTime.from({
        timeZone: BOOKING_DENSITY.timeZone,
        year: civil.year,
        month: civil.month,
        day: civil.day,
        hour: clock.hour,
        minute: clock.minute,
      });
      events.push({
        id: `d${dayIndex}-r${room}-s${slotIndex}`,
        title: `Room ${room + 1}`,
        start: start.epochMilliseconds,
        end: start.add({ minutes: BOOKING_DENSITY.slotMinutes }).epochMilliseconds,
      });
    }
  }
  return events;
}

export function bookingEvents(): CalendarEvent[] {
  const origin = Temporal.ZonedDateTime.from({
    ...BOOKING_DENSITY.rangeStart,
    timeZone: BOOKING_DENSITY.timeZone,
    hour: 0,
  });
  const dayCount = BOOKING_DENSITY.rangeWeeks * 7;
  const events: CalendarEvent[] = [];
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const zoned = origin.add({ days: dayIndex });
    const hours = bookingHours(zoned.dayOfWeek);
    if (hours === undefined) continue;
    events.push(...eventsOnDay(zoned.toPlainDate(), dayIndex, hours));
  }
  return events;
}

export interface BookingBoard {
  grid: TimeGrid;
  events: CalendarEvent[];
  rects: EventRect[];
  width: number;
}

export function bookingBoard(): BookingBoard {
  const origin = Temporal.ZonedDateTime.from({
    ...BOOKING_DENSITY.rangeStart,
    timeZone: BOOKING_DENSITY.timeZone,
    hour: 0,
  });
  const grid = buildTimeGrid({
    start: origin.toInstant(),
    end: origin.add({ days: BOOKING_DENSITY.rangeWeeks * 7 }).toInstant(),
    slotMinutes: BOOKING_DENSITY.slotMinutes,
    axisLength: BOOKING_DENSITY.axisLengthPerWeek * BOOKING_DENSITY.rangeWeeks,
    timeZone: BOOKING_DENSITY.timeZone,
    weekStart: BOOKING_DENSITY.weekStart,
  });
  const events = bookingEvents();
  return {
    grid,
    events,
    rects: resolveEventLanes(events, grid),
    width: BOOKING_DENSITY.columnWidth * grid.days.length,
  };
}

export interface PaintPassStats {
  frames: number;
  p50: number;
  p95: number;
  max: number;
}

export function paintPassStats(samples: readonly number[]): PaintPassStats {
  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 0) return { frames: 0, p50: 0, p95: 0, max: 0 };
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
  return {
    frames: sorted.length,
    p50: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    max: +sorted[sorted.length - 1]!.toFixed(2),
  };
}

export function timePaintPasses(
  ctx: CanvasRenderingContext2D,
  args: CanvasWeekPaintArgs,
  warmup = BOOKING_DENSITY.warmupPasses,
  timed = BOOKING_DENSITY.timedPasses,
): number[] {
  for (let i = 0; i < warmup; i++) paintCanvasWeek(ctx, args);
  const samples: number[] = [];
  for (let i = 0; i < timed; i++) {
    const t0 = performance.now();
    paintCanvasWeek(ctx, args);
    samples.push(performance.now() - t0);
  }
  return samples;
}

/** Timed production path: bitmap sized to visible-range plus overscan. */
export function timeSyncPasses(
  el: HTMLCanvasElement,
  board: BookingBoard,
  devicePixelRatio = BOOKING_DENSITY.devicePixelRatio,
  warmup = BOOKING_DENSITY.warmupPasses,
  timed = BOOKING_DENSITY.timedPasses,
): number[] {
  const run = (): void => {
    syncCanvasWeek(
      el,
      board.grid,
      board.rects,
      board.width,
      devicePixelRatio,
      BOOKING_DENSITY.viewport,
      BOOKING_DENSITY.overscanPx,
    );
  };
  for (let i = 0; i < warmup; i++) run();
  const samples: number[] = [];
  for (let i = 0; i < timed; i++) {
    const t0 = performance.now();
    run();
    samples.push(performance.now() - t0);
  }
  return samples;
}

export interface BookingDensityRecord {
  protocol: "calendar-canvas-booking-density";
  measuredAt: string;
  hardware: {
    os: string;
    cpu: string;
    cores: number;
    ramGiB: number;
    runtime: string;
  };
  range: {
    timeZone: string;
    startCivil: string;
    weeks: number;
    days: number;
  };
  density: {
    rooms: number;
    slotMinutes: number;
    events: number;
    rects: number;
    slots: number;
  };
  viewport: { x: number; y: number; width: number; height: number };
  overscanPx: number;
  unfilteredPaint: {
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  };
  paint: {
    canvasCssPx: { width: number; height: number };
    devicePixelRatio: number;
    passes: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  };
  budgetMs: number;
  acceptanceMs: number;
  budgetBroke: boolean;
  virtualization: "none" | "visible-range-overscan";
}

/**
 * Filled from the Chromium paint pass on this branch's hardware. The numbers
 * are a dated measurement, not a live CI gate. `budgetBroke` is the decision
 * the leftover virtualization item is allowed to make.
 */
export const BOOKING_DENSITY_RECORD: BookingDensityRecord = {
  protocol: "calendar-canvas-booking-density",
  measuredAt: "2026-08-28",
  hardware: {
    os: "Linux 6.12.94 x86_64 (KVM)",
    cpu: "Intel Xeon Processor @ 2400 MHz",
    cores: 4,
    ramGiB: 15,
    runtime: "Chromium (Vitest browser / Playwright), devicePixelRatio 1",
  },
  range: {
    timeZone: BOOKING_DENSITY.timeZone,
    startCivil: "2026-03-02",
    weeks: BOOKING_DENSITY.rangeWeeks,
    days: BOOKING_DENSITY.rangeWeeks * 7,
  },
  density: {
    rooms: BOOKING_DENSITY.rooms,
    slotMinutes: BOOKING_DENSITY.slotMinutes,
    events: 2766,
    rects: 2766,
    slots: 1342,
  },
  viewport: BOOKING_DENSITY.viewport,
  overscanPx: BOOKING_DENSITY.overscanPx,
  unfilteredPaint: {
    p50Ms: 56.2,
    p95Ms: 81.3,
    maxMs: 83.2,
  },
  paint: {
    canvasCssPx: { width: 1308, height: 271 },
    devicePixelRatio: BOOKING_DENSITY.devicePixelRatio,
    passes: BOOKING_DENSITY.timedPasses,
    p50Ms: 12.9,
    p95Ms: 33.6,
    maxMs: 33.7,
  },
  budgetMs: FRAME_BUDGET_MS,
  acceptanceMs: ACCEPTANCE_MS,
  budgetBroke: true,
  virtualization: "visible-range-overscan",
};

export function boardPaintArgs(board: BookingBoard): CanvasWeekPaintArgs {
  return {
    grid: board.grid,
    rects: board.rects,
    width: board.width,
    viewport: BOOKING_DENSITY.viewport,
    overscan: BOOKING_DENSITY.overscanPx,
  };
}

export function boardPaintArgsUnfiltered(board: BookingBoard): CanvasWeekPaintArgs {
  return { grid: board.grid, rects: board.rects, width: board.width };
}

export function boardCanvasSize(board: BookingBoard) {
  return weekCanvasSize(board.grid, board.width);
}
