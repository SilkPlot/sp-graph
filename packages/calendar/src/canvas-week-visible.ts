/**
 * Visible-range selection for the Canvas week. Consumes `TimeGrid` /
 * `EventRect` and returns the same `EventRect` objects — never a second event
 * type. Used only after measurement showed a full-board paint missing the
 * frame budget.
 */
import { eventBlockBox, WEEK_HEADER_HEIGHT, bodyHeightOf, dayIndexByIso } from "./canvas-week-geometry";
import type { EventRect } from "./overlap-resolver";
import type { TimeGrid, TimeGridDay } from "./time-grid";

export interface PixelViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One day-column of overscan; small, and a calendar unit rather than a guess. */
export const DEFAULT_OVERSCAN_PX = 108;

export function inflateViewport(view: PixelViewport, overscan: number): PixelViewport {
  return {
    x: view.x - overscan,
    y: view.y - overscan,
    width: view.width + overscan * 2,
    height: view.height + overscan * 2,
  };
}

export function clipViewport(view: PixelViewport, width: number, height: number): PixelViewport {
  const x = Math.max(0, view.x);
  const y = Math.max(0, view.y);
  const right = Math.min(width, view.x + view.width);
  const bottom = Math.min(height, view.y + view.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function boxesIntersect(a: PixelViewport, b: PixelViewport): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function dayColumnBox(
  index: number,
  columnWidth: number,
  headerHeight: number,
  bodyHeight: number,
): PixelViewport {
  return { x: index * columnWidth, y: 0, width: columnWidth, height: headerHeight + bodyHeight };
}

export function visibleDayIndexes(
  grid: TimeGrid,
  columnWidth: number,
  range: PixelViewport,
): number[] {
  const body = bodyHeightOf(grid);
  const out: number[] = [];
  for (let i = 0; i < grid.days.length; i++) {
    if (boxesIntersect(dayColumnBox(i, columnWidth, WEEK_HEADER_HEIGHT, body), range)) {
      out.push(i);
    }
  }
  return out;
}

export function visibleDays(grid: TimeGrid, columnWidth: number, range: PixelViewport): TimeGridDay[] {
  return visibleDayIndexes(grid, columnWidth, range).map((i) => grid.days[i]!);
}

/**
 * EventRects whose canvas box intersects `range`. Same objects, same type.
 * Off-column rects are rejected by day index so a dense board does not
 * rebuild every pixel box.
 */
export function visibleEventRects(
  grid: TimeGrid,
  rects: readonly EventRect[],
  columnWidth: number,
  range: PixelViewport,
): EventRect[] {
  const visible = new Set(visibleDayIndexes(grid, columnWidth, range));
  const byIso = dayIndexByIso(grid);
  const out: EventRect[] = [];
  for (const rect of rects) {
    const index = byIso.get(rect.day.toString());
    if (index === undefined || !visible.has(index)) continue;
    const box = eventBlockBox(grid, rect, columnWidth);
    if (boxesIntersect(box, range)) out.push(rect);
  }
  return out;
}
