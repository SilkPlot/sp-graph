/**
 * Pixel geometry for a Canvas week. Consumes `TimeGrid` / `EventRect` — never
 * packs lanes, never invents a second event type. Vertical placement is
 * `positionOf` origin-shifted to the service day; horizontal placement is
 * `EventRect.x` / `width` as fractions of the day column.
 */
import { Temporal } from "temporal-polyfill";
import { tokens } from "@silkplot/theme";
import type { EventRect } from "./overlap-resolver";
import type { TimeGrid, TimeGridDay } from "./time-grid";

export const WEEK_HEADER_HEIGHT =
  Number.parseFloat(tokens.fontSize.lg) + Number.parseFloat(tokens.space.lg);

export function epochMs(value: { epochMilliseconds: number }): number {
  return value.epochMilliseconds;
}

export function atDate(ms: number): Date {
  return new Date(ms);
}

export function dayOrigin(grid: TimeGrid, day: TimeGridDay): number {
  return grid.positionOf(atDate(epochMs(day.start)));
}

export function yOnDay(grid: TimeGrid, day: TimeGridDay, ms: number): number {
  return grid.positionOf(atDate(ms)) - dayOrigin(grid, day);
}

export function dayIndexOf(grid: TimeGrid, date: EventRect["day"]): number {
  return grid.days.findIndex((day) => Temporal.PlainDate.compare(day.date, date) === 0);
}

export function dayIndexByIso(grid: TimeGrid): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < grid.days.length; i++) map.set(grid.days[i]!.date.toString(), i);
  return map;
}

export function columnWidthOf(grid: TimeGrid, width: number): number {
  const count = grid.days.length;
  return count === 0 ? width : width / count;
}

export function bodyHeightOf(grid: TimeGrid): number {
  let max = 0;
  for (const day of grid.days) {
    const extent = yOnDay(grid, day, epochMs(day.end));
    if (extent > max) max = extent;
  }
  return max;
}

export interface WeekCanvasSize {
  width: number;
  height: number;
  columnWidth: number;
  bodyHeight: number;
  headerHeight: number;
}

export function weekCanvasSize(grid: TimeGrid, width: number): WeekCanvasSize {
  const bodyHeight = bodyHeightOf(grid);
  return {
    width,
    height: WEEK_HEADER_HEIGHT + bodyHeight,
    columnWidth: columnWidthOf(grid, width),
    bodyHeight,
    headerHeight: WEEK_HEADER_HEIGHT,
  };
}

export interface EventBlockBox {
  x: number;
  y: number;
  width: number;
  height: number;
  dayIndex: number;
}

/**
 * Absolute canvas box for one `EventRect`, including the day-column offset
 * and the week header. A missing day is a zero box (the resolver does not
 * emit those).
 */
export function eventBlockBox(grid: TimeGrid, rect: EventRect, columnWidth: number): EventBlockBox {
  const dayIndex = dayIndexOf(grid, rect.day);
  const day = grid.days[dayIndex];
  if (day === undefined) {
    return { x: 0, y: 0, width: 0, height: 0, dayIndex: -1 };
  }
  const height = grid.positionOf(atDate(rect.end)) - grid.positionOf(atDate(rect.start));
  return {
    x: (dayIndex + rect.x) * columnWidth,
    y: WEEK_HEADER_HEIGHT + yOnDay(grid, day, rect.start),
    width: rect.width * columnWidth,
    height: Math.max(height, 0),
    dayIndex,
  };
}
