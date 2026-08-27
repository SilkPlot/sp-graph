/**
 * Agenda items — events and empty slots as an ordered, day-grouped list.
 *
 * This is the primary non-visual representation of a booking week. It consumes
 * `TimeGrid.days` / `TimeGrid.slots` and `CalendarEvent` start/end. Overlap is
 * a text relationship (who shares an interval), not packed columns. Lane
 * geometry (`EventRect.x` / `width`, `resolveEventLanes`) is not consulted.
 *
 * Empty slots are listed; whether a slot is bookable is the application's
 * question. This module does not offer a book-slot API.
 */
import type { CalendarEvent } from "./overlap-resolver";
import type { TimeGrid, TimeGridDay, TimeSlot } from "./time-grid";

function epochMs(value: { epochMilliseconds: number }): number {
  return value.epochMilliseconds;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** An event clipped to one service day and the visible window. */
export interface AgendaEventItem {
  kind: "event";
  event: CalendarEvent;
  /** Civil date of the {@link TimeGridDay} this fragment belongs to. */
  day: TimeGridDay["date"];
  /** Inclusive clipped start, epoch ms. */
  start: number;
  /** Exclusive clipped end, epoch ms. */
  end: number;
  /** Other events whose `[start, end)` intersects this event's full interval. */
  overlaps: readonly CalendarEvent[];
}

/** A `TimeGrid` slot that no event occupies. */
export interface AgendaSlotItem {
  kind: "slot";
  slot: TimeSlot;
  day: TimeGridDay["date"];
}

export type AgendaItem = AgendaEventItem | AgendaSlotItem;

/** One service day's items, in start-time order. */
export interface AgendaDay {
  day: TimeGridDay;
  items: readonly AgendaItem[];
}

/**
 * Group events and empty slots by service day, then order each day by time.
 *
 * Multi-day events appear once per intersecting {@link TimeGrid.days} entry,
 * clipped to that day — the same split the week grid uses, without lanes.
 */
export function buildAgenda(events: readonly CalendarEvent[], grid: TimeGrid): AgendaDay[] {
  const visibleStart = epochMs(grid.config.start);
  const visibleEnd = epochMs(grid.config.end);
  return grid.days.map((day) => ({
    day,
    items: itemsForDay(day, events, grid.slots, visibleStart, visibleEnd),
  }));
}

function itemsForDay(
  day: TimeGridDay,
  events: readonly CalendarEvent[],
  slots: readonly TimeSlot[],
  visibleStart: number,
  visibleEnd: number,
): AgendaItem[] {
  const eventItems = eventItemsOn(day, events, visibleStart, visibleEnd);
  const slotItems = emptySlotsOn(day, events, slots);
  return [...eventItems, ...slotItems].sort(compareItems);
}

function eventItemsOn(
  day: TimeGridDay,
  events: readonly CalendarEvent[],
  visibleStart: number,
  visibleEnd: number,
): AgendaEventItem[] {
  const items: AgendaEventItem[] = [];
  for (const event of events) {
    const clipped = clipToDay(event, day, visibleStart, visibleEnd);
    if (clipped === undefined) continue;
    items.push({
      kind: "event",
      event,
      day: day.date,
      start: clipped.start,
      end: clipped.end,
      overlaps: overlappingOthers(event, events),
    });
  }
  return items;
}

function clipToDay(
  event: CalendarEvent,
  day: TimeGridDay,
  visibleStart: number,
  visibleEnd: number,
): { start: number; end: number } | undefined {
  const dayStart = epochMs(day.start);
  const dayEnd = epochMs(day.end);
  const start = Math.max(event.start, visibleStart, dayStart);
  const end = Math.min(event.end, visibleEnd, dayEnd);
  if (start < end) return { start, end };
  if (
    event.start === event.end &&
    start === end &&
    start >= dayStart &&
    start < dayEnd &&
    start >= visibleStart &&
    start < visibleEnd
  ) {
    return { start, end };
  }
  return undefined;
}

function overlappingOthers(
  event: CalendarEvent,
  events: readonly CalendarEvent[],
): CalendarEvent[] {
  const others: CalendarEvent[] = [];
  for (const other of events) {
    if (other.id === event.id) continue;
    if (intervalsOverlap(event.start, event.end, other.start, other.end)) {
      others.push(other);
    }
  }
  others.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return others;
}

function emptySlotsOn(
  day: TimeGridDay,
  events: readonly CalendarEvent[],
  slots: readonly TimeSlot[],
): AgendaSlotItem[] {
  const onDay = slotsOn(day, slots);
  const items: AgendaSlotItem[] = [];
  for (let i = 0; i < onDay.length; i++) {
    const slot = onDay[i]!;
    const start = epochMs(slot.start);
    const end = i + 1 < onDay.length ? epochMs(onDay[i + 1]!.start) : epochMs(day.end);
    if (events.some((event) => intervalsOverlap(event.start, event.end, start, end))) {
      continue;
    }
    items.push({ kind: "slot", slot, day: day.date });
  }
  return items;
}

function slotsOn(day: TimeGridDay, slots: readonly TimeSlot[]): TimeSlot[] {
  const start = epochMs(day.start);
  const end = epochMs(day.end);
  return slots.filter((slot) => {
    const at = epochMs(slot.start);
    return at >= start && at < end;
  });
}

function compareItems(a: AgendaItem, b: AgendaItem): number {
  const startA = itemStart(a);
  const startB = itemStart(b);
  if (startA !== startB) return startA - startB;
  if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
  const idA = a.kind === "event" ? a.event.id : a.slot.start.toString();
  const idB = b.kind === "event" ? b.event.id : b.slot.start.toString();
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

function itemStart(item: AgendaItem): number {
  return item.kind === "event" ? item.start : epochMs(item.slot.start);
}
