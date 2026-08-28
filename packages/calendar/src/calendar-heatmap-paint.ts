/**
 * Paint calendar-heatmap cells onto Canvas. Geometry comes from core
 * `layoutHeatmapCells`; hatch lines from `heatmapHatchLines`. No SVG, no
 * second time grid.
 */
import { heatmapHatchLines, type HeatmapCell } from "@silkplot/core";
import { sequentialRamp, tokens } from "@silkplot/theme";

const RAMP = sequentialRamp(24);
const ACTIVE_WIDTH = 2;

export interface CalendarHeatmapRectMark {
  kind: "rect";
  x: string;
  y: string;
  width: string;
  height: string;
  fill: string;
  hatch: string;
  column: string;
  row: string;
  value: string;
  stroke: string;
}

export type CalendarHeatmapMark = CalendarHeatmapRectMark;

const recorded = new WeakMap<HTMLCanvasElement, readonly CalendarHeatmapMark[]>();

export function rememberCalendarHeatmapMarks(
  canvas: HTMLCanvasElement,
  marks: readonly CalendarHeatmapMark[],
): void {
  recorded.set(canvas, marks);
}

export function marksOnCalendarHeatmap(canvas: HTMLCanvasElement): readonly CalendarHeatmapMark[] {
  return recorded.get(canvas) ?? [];
}

export function calendarHeatmapPlotsOf(container: ParentNode): HTMLCanvasElement[] {
  return Array.from(
    container.querySelectorAll<HTMLCanvasElement>("[data-silkplot-calendar-heatmap-plot]"),
  );
}

export function calendarHeatmapFill(t: number): string {
  const last = RAMP.length - 1;
  const clamped = Math.min(1, Math.max(0, t));
  return RAMP[Math.round(clamped * last)] as string;
}

function strokeHatch(ctx: CanvasRenderingContext2D, cell: HeatmapCell): void {
  const lines = heatmapHatchLines(cell);
  if (lines.length === 0) return;
  ctx.save();
  ctx.strokeStyle = tokens.color.text;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.setLineDash([]);
  for (const line of lines) {
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  ctx.restore();
}

export function paintCalendarHeatmapCell(
  ctx: CanvasRenderingContext2D,
  cell: HeatmapCell,
  active: boolean,
): CalendarHeatmapRectMark {
  const fill = calendarHeatmapFill(cell.t);
  ctx.fillStyle = fill;
  ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
  strokeHatch(ctx, cell);
  if (active) {
    ctx.strokeStyle = tokens.color.cursor;
    ctx.lineWidth = ACTIVE_WIDTH;
    ctx.setLineDash([]);
    ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);
  }
  return {
    kind: "rect",
    x: String(cell.x),
    y: String(cell.y),
    width: String(cell.width),
    height: String(cell.height),
    fill,
    hatch: String(cell.hatch),
    column: cell.column,
    row: cell.row,
    value: String(cell.value),
    stroke: active ? tokens.color.cursor : "none",
  };
}

export function paintCalendarHeatmap(
  ctx: CanvasRenderingContext2D,
  cells: readonly HeatmapCell[],
  activeIndex: number,
): CalendarHeatmapMark[] {
  const marks: CalendarHeatmapMark[] = [];
  for (const [i, cell] of cells.entries()) {
    marks.push(paintCalendarHeatmapCell(ctx, cell, i === activeIndex));
  }
  return marks;
}

export function syncCalendarHeatmap(
  el: HTMLCanvasElement | undefined,
  layout: { width: number; height: number; originX: number; originY: number; outerWidth: number; outerHeight: number },
  cells: readonly HeatmapCell[],
  activeIndex: number,
  devicePixelRatio = 1,
): void {
  if (el === undefined) return;
  el.setAttribute("data-silkplot-plot-width", String(layout.width));
  el.setAttribute("data-silkplot-plot-height", String(layout.height));
  const hatched = cells.some((cell) => cell.hatch > 0);
  if (hatched) el.setAttribute("data-silkplot-hatch", "");
  else el.removeAttribute("data-silkplot-hatch");
  if (layout.width <= 0 || layout.height <= 0) {
    rememberCalendarHeatmapMarks(el, []);
    return;
  }
  const dpr = devicePixelRatio;
  el.width = Math.round(layout.outerWidth * dpr);
  el.height = Math.round(layout.outerHeight * dpr);
  const ctx = el.getContext("2d");
  if (ctx === null) {
    rememberCalendarHeatmapMarks(el, []);
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, layout.outerWidth, layout.outerHeight);
  ctx.save();
  ctx.translate(layout.originX, layout.originY);
  const marks = paintCalendarHeatmap(ctx, cells, activeIndex);
  ctx.restore();
  rememberCalendarHeatmapMarks(el, marks);
}
