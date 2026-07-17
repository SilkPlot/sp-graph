/**
 * Overlap resolver — STUB wrapper (deferred booking-calendar roadmap).
 *
 * Calendar event placement is a DETERMINISTIC interval-packing problem, NOT a
 * physics problem — never use `d3-force`. The core lane
 * assignment already lives in `@silkplot/core`'s `packOverlaps`. This module
 * will layer calendar-specific concerns on top of it.
 *
 * TODO(deferred calendar): convert packed lanes into `{ x, width }` rectangles within a
 *   day column, widen events to fill trailing free lanes, and clip to the
 *   visible range with overscan. Also emit drag/resize SUGGESTION geometry —
 *   authoritative validity belongs to the backend API, not this layer.
 */
import { packOverlaps, type Interval, type PackedInterval } from "@silkplot/core";

/** A calendar event with a title and a time interval (epoch ms start/end). */
export interface CalendarEvent extends Interval {
  id: string;
  title: string;
}

/**
 * Resolve concurrent events into lanes via the core deterministic packer. This
 * thin re-export exists so calendar consumers do not reach into @silkplot/core
 * directly, and gives the deferred calendar work a home for rectangle geometry.
 */
export function resolveEventLanes(
  events: readonly CalendarEvent[],
): PackedInterval<CalendarEvent>[] {
  return packOverlaps(events);
}
