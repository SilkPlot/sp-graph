/**
 * Time-grid model — STUB (roadmap Phase 3: booking calendar).
 *
 * The calendar is a first-class consumer of the SAME temporal foundation as the
 * charts: one time scale can feed a time-series chart, a day/week grid, or a
 * scrolling timeline. This model maps a date to a coordinate along a day/week
 * axis and enumerates slot lines.
 *
 * TODO(Phase 3): implement `buildTimeGrid` using `d3-time` intervals
 *   (timeHour/timeMinute) for slot generation, plus a `now` indicator, snap
 *   sizes, and visible-range virtualisation with overscan. Must handle time
 *   zones / DST explicitly — D3 time helpers sit on ECMAScript `Date` and
 *   booking products need product-level rules beyond that.
 */

export interface TimeGridConfig {
  /** Visible window start (inclusive). */
  start: Date;
  /** Visible window end (exclusive). */
  end: Date;
  /** Slot size in minutes (e.g. 30 for half-hour rows). */
  slotMinutes: number;
  /** Pixel length of the time axis. */
  axisLength: number;
}

export interface TimeSlot {
  time: Date;
  /** Pixel position along the axis. */
  position: number;
  /** True for on-the-hour (major) lines. */
  major: boolean;
}

export interface TimeGrid {
  config: TimeGridConfig;
  slots: TimeSlot[];
  /** Map an arbitrary instant to a pixel position on the axis. */
  positionOf(time: Date): number;
}

/** TODO(Phase 3): real implementation. Placeholder throws to stay honest. */
export function buildTimeGrid(_config: TimeGridConfig): TimeGrid {
  throw new Error(
    "[@silkplot/calendar] buildTimeGrid is not implemented yet (roadmap Phase 3).",
  );
}
