/**
 * Overlap resolver — renderer-agnostic event rectangles.
 *
 * Calendar event placement is a DETERMINISTIC interval-packing problem, NOT a
 * physics problem — never use `d3-force`. Core `packOverlaps` assigns lanes;
 * this module composes that packer with `buildTimeGrid` output: clip and split
 * against service-day columns and the visible range, then map lanes to
 * `{ x, width }` in `[0, 1]` of the column. Later free lanes widen a rectangle
 * to the right. That widening is column-count normalisation, composed here
 * rather than added to the packer.
 *
 * Drag/resize SUGGESTION geometry is out of scope — authoritative validity
 * belongs to the backend API, not this layer.
 */
import { packOverlaps, type Interval, type PackedInterval } from "@silkplot/core";
import type { TimeGrid, TimeGridDay } from "./time-grid";

const PREFIX = "[@silkplot/calendar]";

/** A calendar event with a title and a time interval (epoch ms start/end). */
export interface CalendarEvent extends Interval {
  id: string;
  title: string;
}

/**
 * One clipped fragment of an event, placed in a single service-day column.
 *
 * `x` and `width` are fractions of that column in `[0, 1]`. Time extent is the
 * clipped `[start, end)` in epoch ms — the same unit as {@link CalendarEvent}.
 * A renderer maps those instants through `TimeGrid.positionOf`; this record
 * carries no pixels, DOM, or style.
 */
export interface EventRect {
  event: CalendarEvent;
  /** Civil date of the service-day column this fragment occupies. */
  day: TimeGridDay["date"];
  /** Inclusive clipped start, epoch ms. */
  start: number;
  /** Exclusive clipped end, epoch ms. */
  end: number;
  /** Left edge in `[0, 1]` of the day column. */
  x: number;
  /** Width in `(0, 1]` of the day column. */
  width: number;
  /** Zero-based lane from {@link packOverlaps}. */
  lane: number;
  /** Peak concurrency of this fragment's overlap cluster. */
  laneCount: number;
}

interface DayFragment extends Interval {
  id: string;
  event: CalendarEvent;
  day: TimeGridDay;
}

/**
 * Clip events to the grid's visible range and service-day columns, pack each
 * column with the core deterministic packer (event `id` as the identity key),
 * and emit `{ x, width }` rectangles. A multi-day event becomes one rectangle
 * per column it intersects.
 *
 * The same event set always produces the same geometry. When ids are unique,
 * input order does not matter. A duplicate `id` is a caller bug and throws —
 * see `packOverlaps`.
 */
export function resolveEventLanes(
  events: readonly CalendarEvent[],
  grid: TimeGrid,
): EventRect[] {
  assertUniqueIds(events);
  const fragments = clipToColumns(events, grid);
  const out: EventRect[] = [];

  for (const day of grid.days) {
    const column: DayFragment[] = [];
    for (const fragment of fragments) {
      if (fragment.day === day) column.push(fragment);
    }
    if (column.length === 0) continue;

    const packed = packOverlaps(column, { key: (fragment) => fragment.id });
    for (const placed of widenTrailingLanes(packed)) {
      out.push({
        event: placed.item.event,
        day: day.date,
        start: placed.item.start,
        end: placed.item.end,
        x: placed.x,
        width: placed.width,
        lane: placed.lane,
        laneCount: placed.laneCount,
      });
    }
  }

  return out;
}

function assertUniqueIds(events: readonly CalendarEvent[]): void {
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id)) {
      throw new Error(
        `${PREFIX} duplicate event id ${JSON.stringify(event.id)}. An id must uniquely identify ` +
          `an event; two events sharing one would map to two rectangles, which no rendering can express.`,
      );
    }
    seen.add(event.id);
  }
}

function epochMs(value: { epochMilliseconds: number }): number {
  return value.epochMilliseconds;
}

/**
 * Intersect each event with every service-day column and the visible window.
 * Half-open `[start, end)`. A zero-length event is kept when its instant sits
 * inside both the column and the visible range.
 */
function clipToColumns(events: readonly CalendarEvent[], grid: TimeGrid): DayFragment[] {
  const visibleStart = epochMs(grid.config.start);
  const visibleEnd = epochMs(grid.config.end);
  const fragments: DayFragment[] = [];

  for (const event of events) {
    for (const day of grid.days) {
      const dayStart = epochMs(day.start);
      const dayEnd = epochMs(day.end);
      const start = Math.max(event.start, visibleStart, dayStart);
      const end = Math.min(event.end, visibleEnd, dayEnd);
      if (!intersectsColumn(event, start, end, visibleStart, visibleEnd, dayStart, dayEnd)) {
        continue;
      }
      fragments.push({ id: event.id, start, end, event, day });
    }
  }

  return fragments;
}

function intersectsColumn(
  event: CalendarEvent,
  start: number,
  end: number,
  visibleStart: number,
  visibleEnd: number,
  dayStart: number,
  dayEnd: number,
): boolean {
  if (start < end) return true;
  return (
    event.start === event.end &&
    start === end &&
    start >= dayStart &&
    start < dayEnd &&
    start >= visibleStart &&
    start < visibleEnd
  );
}

/**
 * Expand each packed interval rightward through consecutive later lanes that
 * stay free for its entire `[start, end)`. `x = lane / laneCount`,
 * `width = span / laneCount`.
 */
function widenTrailingLanes(
  packed: readonly PackedInterval<DayFragment>[],
): Array<PackedInterval<DayFragment> & { x: number; width: number }> {
  return packed.map((placed) => {
    const { lane, laneCount } = placed;
    let span = 1;
    for (let next = lane + 1; next < laneCount; next++) {
      if (laneOccupiedDuring(packed, placed, next)) break;
      span++;
    }
    return {
      ...placed,
      x: lane / laneCount,
      width: span / laneCount,
    };
  });
}

function laneOccupiedDuring(
  packed: readonly PackedInterval<DayFragment>[],
  self: PackedInterval<DayFragment>,
  lane: number,
): boolean {
  for (const other of packed) {
    if (other === self || other.lane !== lane) continue;
    if (overlaps(self.item, other.item)) return true;
  }
  return false;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
