/**
 * Paint a week of `EventRect`s onto a Canvas 2D context.
 *
 * Geometry is consumed (`TimeGrid.positionOf`, `EventRect.x` / `width`). A
 * viewport selects visible-range plus overscan; without one, every rect paints.
 * Event blocks use `fillRect`, the same primitive cartesian bars use. No SVG,
 * no WebGL, no second event type.
 */
import { Temporal } from "temporal-polyfill";
import { categoricalPalette, seriesDashPatterns, tokens } from "@silkplot/theme";
import {
  WEEK_HEADER_HEIGHT,
  bodyHeightOf,
  columnWidthOf,
  epochMs,
  eventBlockBox,
  weekCanvasSize,
  yOnDay,
} from "./canvas-week-geometry";
import type { CanvasWeekMark } from "./canvas-week-marks";
import { rememberCanvasWeekMarks } from "./canvas-week-marks";
import type { EventRect } from "./overlap-resolver";
import type { TimeGrid, TimeGridDay, TimeSlot } from "./time-grid";
import {
  DEFAULT_OVERSCAN_PX,
  clipViewport,
  inflateViewport,
  visibleDayIndexes,
  visibleEventRects,
  type PixelViewport,
} from "./canvas-week-visible";

export interface CanvasWeekPaintArgs {
  grid: TimeGrid;
  rects: readonly EventRect[];
  width: number;
  /**
   * CSS-pixel window onto the canvas. When set, only days and `EventRect`s
   * intersecting this window plus {@link overscan} are painted.
   */
  viewport?: PixelViewport;
  /** Extra pixels around {@link viewport}. Ignored when viewport is omitted. */
  overscan?: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const LABEL_MIN_HEIGHT = Number.parseFloat(tokens.fontSize.md);
const FONT_XS = `${tokens.fontSize.xs} sans-serif`;
const FONT_SM = `${tokens.fontSize.sm} sans-serif`;
const PAD = Number.parseFloat(tokens.space.xs);

function push(into: CanvasWeekMark[], mark: CanvasWeekMark): void {
  into.push(mark);
}

function parseDash(specified: string): number[] {
  if (specified === "none" || specified === "") return [];
  const out: number[] = [];
  for (const part of specified.split(/[\s,]+/)) {
    if (part === "") continue;
    const n = Number.parseFloat(part);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function channelIndex(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 1)) % 8;
  return n;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatClock(ms: number, timeZone: string, withOffset: boolean): string {
  const zoned = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(timeZone);
  const clock = `${pad2(zoned.hour)}:${pad2(zoned.minute)}`;
  return withOffset ? `${clock} ${zoned.offset}` : clock;
}

function weekdayName(date: Temporal.PlainDate): string {
  return WEEKDAYS[date.dayOfWeek - 1]!;
}

function slotsOn(day: TimeGridDay, slots: readonly TimeSlot[]): TimeSlot[] {
  const start = epochMs(day.start);
  const end = epochMs(day.end);
  return slots.filter((slot) => {
    const at = epochMs(slot.start);
    return at >= start && at < end;
  });
}

function paintHeader(
  ctx: CanvasRenderingContext2D,
  day: TimeGridDay,
  x: number,
  into: CanvasWeekMark[],
): void {
  const iso = day.date.toString();
  const dst = day.elapsedHours !== 24;
  const text = `${weekdayName(day.date)} ${iso}`;
  ctx.fillStyle = tokens.color.text;
  ctx.font = FONT_SM;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  const y = Number.parseFloat(tokens.fontSize.md) + PAD;
  ctx.fillText(text, x + Number.parseFloat(tokens.space.sm), y);
  push(into, { kind: "text", role: "label", x: x + Number.parseFloat(tokens.space.sm), y, text });
  if (!dst) return;
  const sub = `${day.elapsedHours} elapsed hours`;
  const subY = y + Number.parseFloat(tokens.fontSize.xs) + Number.parseFloat(tokens.space.sm);
  ctx.fillStyle = tokens.color.muted;
  ctx.font = FONT_XS;
  ctx.fillText(sub, x + Number.parseFloat(tokens.space.sm), subY);
  push(into, {
    kind: "text",
    role: "label",
    x: x + Number.parseFloat(tokens.space.sm),
    y: subY,
    text: sub,
  });
}

function paintDayFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  dayIso: string,
  into: CanvasWeekMark[],
): void {
  ctx.fillStyle = tokens.color.surface;
  ctx.strokeStyle = tokens.color.axis;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  push(into, { kind: "rect", role: "day-frame", x, y, width, height, day: dayIso });
}

function paintSlots(
  ctx: CanvasRenderingContext2D,
  grid: TimeGrid,
  day: TimeGridDay,
  x: number,
  width: number,
  withOffset: boolean,
  into: CanvasWeekMark[],
): void {
  ctx.strokeStyle = tokens.color.grid;
  ctx.fillStyle = tokens.color.muted;
  ctx.font = FONT_XS;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.setLineDash([]);
  for (const slot of slotsOn(day, grid.slots)) {
    const y = WEEK_HEADER_HEIGHT + yOnDay(grid, day, epochMs(slot.start));
    ctx.lineWidth = slot.major ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    push(into, { kind: "line", role: "slot", x1: x, y1: y, x2: x + width, y2: y, major: slot.major });
    if (!slot.major) continue;
    const text = formatClock(epochMs(slot.start), slot.start.timeZoneId, withOffset);
    ctx.fillText(text, x + PAD, y + Number.parseFloat(tokens.fontSize.xs));
    push(into, { kind: "text", role: "label", x: x + PAD, y: y + Number.parseFloat(tokens.fontSize.xs), text });
  }
}

function paintEvent(
  ctx: CanvasRenderingContext2D,
  grid: TimeGrid,
  rect: EventRect,
  columnWidth: number,
  into: CanvasWeekMark[],
): void {
  const box = eventBlockBox(grid, rect, columnWidth);
  if (box.dayIndex < 0 || box.width <= 0) return;
  const channel = channelIndex(rect.event.id);
  const fill = categoricalPalette[channel] ?? tokens.color.cursor;
  const dash = parseDash(seriesDashPatterns[channel] ?? "none");
  ctx.fillStyle = fill;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = tokens.color.surface;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.setLineDash([]);
  push(into, {
    kind: "rect",
    role: "event",
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    eventId: rect.event.id,
    day: rect.day.toString(),
  });
  if (box.height < LABEL_MIN_HEIGHT) return;
  ctx.fillStyle = tokens.color.surface;
  ctx.font = FONT_XS;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  const tx = box.x + PAD;
  const ty = box.y + Number.parseFloat(tokens.fontSize.xs) + PAD;
  ctx.fillText(rect.event.title, tx, ty);
  push(into, { kind: "text", role: "label", x: tx, y: ty, text: rect.event.title });
}

function paintDays(
  ctx: CanvasRenderingContext2D,
  grid: TimeGrid,
  columnWidth: number,
  dayIndexes: readonly number[],
  into: CanvasWeekMark[],
): void {
  for (const i of dayIndexes) {
    const day = grid.days[i];
    if (day === undefined) continue;
    const x = i * columnWidth;
    const extent = yOnDay(grid, day, epochMs(day.end));
    paintHeader(ctx, day, x, into);
    paintDayFrame(ctx, x, WEEK_HEADER_HEIGHT, columnWidth, extent, day.date.toString(), into);
    paintSlots(ctx, grid, day, x, columnWidth, day.elapsedHours !== 24, into);
  }
}

/**
 * Paint day columns, slot lines, and `EventRect`s onto `ctx`. The context
 * is assumed to be in CSS pixels (caller applies device-pixel scaling).
 * With a viewport, this is visible-range plus overscan; without one, every
 * rect is painted.
 */
export function paintCanvasWeek(
  ctx: CanvasRenderingContext2D,
  args: CanvasWeekPaintArgs,
): CanvasWeekMark[] {
  const columnWidth = columnWidthOf(args.grid, args.width);
  const height = WEEK_HEADER_HEIGHT + bodyHeightOf(args.grid);
  const range =
    args.viewport === undefined
      ? undefined
      : inflateViewport(args.viewport, args.overscan ?? DEFAULT_OVERSCAN_PX);
  const dayIndexes =
    range === undefined
      ? args.grid.days.map((_, i) => i)
      : visibleDayIndexes(args.grid, columnWidth, range);
  const rects =
    range === undefined ? args.rects : visibleEventRects(args.grid, args.rects, columnWidth, range);
  ctx.fillStyle = tokens.color.surface;
  ctx.fillRect(0, 0, args.width, height);
  const into: CanvasWeekMark[] = [];
  paintDays(ctx, args.grid, columnWidth, dayIndexes, into);
  for (const rect of rects) {
    paintEvent(ctx, args.grid, rect, columnWidth, into);
  }
  return into;
}

function eventMarkCount(marks: readonly CanvasWeekMark[]): number {
  let painted = 0;
  for (const mark of marks) {
    if (mark.kind === "rect" && mark.role === "event") painted++;
  }
  return painted;
}

function bindCanvasRange(
  el: HTMLCanvasElement,
  range: { x: number; y: number; width: number; height: number },
  dpr: number,
): CanvasRenderingContext2D | undefined {
  el.width = Math.round(range.width * dpr);
  el.height = Math.round(range.height * dpr);
  el.style.width = `${range.width}px`;
  el.style.height = `${range.height}px`;
  el.style.left = `${range.x}px`;
  el.style.top = `${range.y}px`;
  const ctx = el.getContext("2d");
  if (ctx === null) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(-range.x, -range.y);
  ctx.clearRect(range.x, range.y, range.width, range.height);
  return ctx;
}

/**
 * Size the bitmap, paint, and record marks. No-op when the element is missing
 * or the size has collapsed. Device-pixel ratio is applied here, not in the
 * painter, so a measurement can force 1×. With a viewport the bitmap is the
 * inflated visible range, not the full board.
 */
export function syncCanvasWeek(
  el: HTMLCanvasElement | undefined,
  grid: TimeGrid,
  rects: readonly EventRect[],
  width: number,
  devicePixelRatio = 1,
  viewport?: PixelViewport,
  overscan?: number,
): void {
  if (el === undefined) return;
  const size = weekCanvasSize(grid, width);
  el.setAttribute("data-silkplot-plot-width", String(size.width));
  el.setAttribute("data-silkplot-plot-height", String(size.height));
  if (size.width <= 0 || size.height <= 0) {
    rememberCanvasWeekMarks(el, []);
    return;
  }
  const range =
    viewport === undefined
      ? { x: 0, y: 0, width: size.width, height: size.height }
      : clipViewport(
          inflateViewport(viewport, overscan ?? DEFAULT_OVERSCAN_PX),
          size.width,
          size.height,
        );
  if (range.width <= 0 || range.height <= 0) {
    rememberCanvasWeekMarks(el, []);
    return;
  }
  const ctx = bindCanvasRange(el, range, devicePixelRatio);
  if (ctx === undefined) {
    rememberCanvasWeekMarks(el, []);
    return;
  }
  const marks = paintCanvasWeek(ctx, { grid, rects, width: size.width, viewport, overscan });
  rememberCanvasWeekMarks(el, marks);
  el.setAttribute("data-silkplot-event-count", String(eventMarkCount(marks)));
  el.setAttribute("data-silkplot-day-count", String(grid.days.length));
}

export { weekCanvasSize };
export type { WeekCanvasSize } from "./canvas-week-geometry";
export type { PixelViewport } from "./canvas-week-visible";
export { DEFAULT_OVERSCAN_PX } from "./canvas-week-visible";
