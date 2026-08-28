/**
 * Canvas paint for one heatmap cell: sequential fill plus hatch.
 *
 * Hatch geometry is computed in `@silkplot/core`. This file only strokes it.
 * Colour is never the only channel — a monochrome copy still separates cells
 * by hatch density.
 */
import { heatmapHatchLines, type HeatmapCell } from "@silkplot/core";
import { sequentialRamp } from "@silkplot/theme";
import type { RectMark } from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";

const RAMP = sequentialRamp(24);
const HATCH_STROKE = "var(--sp-color-text, #16181d)";
const ACTIVE_STROKE = "var(--sp-color-cursor, currentColor)";
const ACTIVE_WIDTH = 2;

export function heatmapFill(t: number): string {
  const last = RAMP.length - 1;
  const clamped = Math.min(1, Math.max(0, t));
  return RAMP[Math.round(clamped * last)] as string;
}

export interface HeatmapCellSpec {
  active?: boolean;
}

function strokeHatch(ctx: CanvasRenderingContext2D, cell: HeatmapCell, resolve: StyleResolver): void {
  const lines = heatmapHatchLines(cell);
  if (lines.length === 0) return;
  ctx.save();
  ctx.strokeStyle = resolve.color(HATCH_STROKE);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.setLineDash([]);
  for (const line of lines) {
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Fill one cell and overlay the hatch channel. Outline when active. */
export function paintHeatmapCell(
  ctx: CanvasRenderingContext2D,
  cell: HeatmapCell,
  spec: HeatmapCellSpec,
  resolve: StyleResolver,
): RectMark {
  const fill = heatmapFill(cell.t);
  ctx.fillStyle = resolve.color(fill);
  ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
  strokeHatch(ctx, cell, resolve);
  const active = spec.active === true;
  if (active) {
    ctx.strokeStyle = resolve.color(ACTIVE_STROKE);
    ctx.lineWidth = ACTIVE_WIDTH;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
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
    stroke: active ? ACTIVE_STROKE : "none",
    strokeWidth: active ? String(ACTIVE_WIDTH) : "0",
    hatch: String(cell.hatch),
  };
}
