/**
 * Map observations onto landed `buildTimeGrid` days and slots, then bin with
 * the same `binHeatmap` the ordinary heatmap uses. This module does not
 * invent a second time grid.
 */
import {
  binHeatmap,
  firstSeenKeys,
  type HeatmapGrid,
  type HeatmapObservation,
} from "@silkplot/core";
import type { TimeGrid, TimeSlot } from "./time-grid";

/** An instant to count on the calendar heatmap. Absent `value` counts as 1. */
export interface TimeGridObservation {
  time: number;
  value?: number;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Clock-of-day key from a zoned slot start — hour and minute in the grid's zone. */
export function clockKey(slot: Pick<TimeSlot["start"], "hour" | "minute">): string {
  return `${pad2(slot.hour)}:${pad2(slot.minute)}`;
}

export function timeGridColumns(grid: TimeGrid): string[] {
  return grid.days.map((day) => day.date.toString());
}

export function timeGridRows(grid: TimeGrid): string[] {
  return firstSeenKeys(grid.slots.map((slot) => clockKey(slot.start)));
}

export function assignTimeGridCell(
  grid: TimeGrid,
  timeMs: number,
): { column: string; row: string } | undefined {
  const column = dayColumn(grid, timeMs);
  const row = slotRow(grid, timeMs);
  if (column === undefined || row === undefined) return undefined;
  return { column, row };
}

/**
 * Bin instants onto `grid.days` × unique slot clock-times, using core
 * `binHeatmap`. Empty combinations stay as zero cells.
 */
export function binOntoTimeGrid(
  grid: TimeGrid,
  observations: readonly TimeGridObservation[],
): HeatmapGrid {
  const columns = timeGridColumns(grid);
  const rows = timeGridRows(grid);
  const mapped: HeatmapObservation[] = [];
  for (const observation of observations) {
    if (!Number.isFinite(observation.time)) continue;
    const at = assignTimeGridCell(grid, observation.time);
    if (at === undefined) continue;
    mapped.push({ x: at.column, y: at.row, value: observation.value });
  }
  return binHeatmap({ observations: mapped, columns, rows });
}

function epochMs(value: { epochMilliseconds: number }): number {
  return value.epochMilliseconds;
}

function dayColumn(grid: TimeGrid, timeMs: number): string | undefined {
  for (const day of grid.days) {
    if (timeMs >= epochMs(day.start) && timeMs < epochMs(day.end)) {
      return day.date.toString();
    }
  }
  return undefined;
}

function slotRow(grid: TimeGrid, timeMs: number): string | undefined {
  const slots = grid.slots;
  const endMs = epochMs(grid.config.end);
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const start = epochMs(slot.start);
    const end = i + 1 < slots.length ? epochMs(slots[i + 1]!.start) : endMs;
    if (timeMs >= start && timeMs < end) return clockKey(slot.start);
  }
  return undefined;
}
