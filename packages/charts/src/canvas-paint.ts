/**
 * Canvas 2D paint primitives for cartesian marks.
 *
 * D3 still computes the path `d` (or the bar / circle geometry). These
 * functions are the Solid-adjacent half: they stroke or fill that geometry
 * onto a context, with the join/cap rules the SVG marks used to carry, and
 * they return the descriptor the test surface records.
 *
 * Round joins on a solid stroke: a mitre on a sharp reversal spikes well
 * past the data. Round caps on a solid stroke; butt caps on a dashed one,
 * because a round cap extends each dash by half a stroke-width and a fine
 * pattern closes into a solid line (ADR-0005 §5).
 */

import type { CanvasMark, CircleMark, PathMark, RectMark } from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";

export interface StrokeSpec {
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
}

export interface FillSpec {
  fill?: string;
  fillOpacity?: number;
}

export interface BarSpec {
  fill?: string;
  active?: boolean;
}

export interface CircleSpec {
  fill?: string;
  fillOpacity?: number;
  radius?: number;
}

const DEFAULT_STROKE_WIDTH = 1.5;
const DEFAULT_FILL_OPACITY = 1;
const ACTIVE_BAR_STROKE = "var(--sp-color-cursor, currentColor)";
const ACTIVE_BAR_WIDTH = 2;

/**
 * Clip subsequent drawing to the inner plot. The canvas bitmap is already
 * that rect when the plot is positioned on the inner origin; `clip` is the
 * named Canvas equivalent of the old SVG `clipPath`, so a neighbour vertex
 * past the edge is painted and then hidden rather than stopping short.
 */
export function clipPlotArea(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
}

function applyStroke(
  ctx: CanvasRenderingContext2D,
  spec: StrokeSpec,
  resolve: StyleResolver,
): void {
  const dashed = spec.dash !== undefined && spec.dash !== "none" && spec.dash !== "";
  ctx.strokeStyle = resolve.color(spec.stroke ?? "currentColor");
  ctx.lineWidth = spec.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = dashed ? "butt" : "round";
  ctx.setLineDash(dashed ? resolve.dash(spec.dash) : []);
}

/**
 * Stroke a path `d`. Empty geometry is a no-op: d3 emits `""` for no points,
 * and stroking that is not a mark.
 */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  d: string,
  spec: StrokeSpec,
  resolve: StyleResolver,
): PathMark | undefined {
  if (d === "") return undefined;
  applyStroke(ctx, spec, resolve);
  ctx.stroke(new Path2D(d));
  return {
    kind: "path",
    d,
    fill: "none",
    stroke: spec.stroke ?? "currentColor",
    strokeWidth: String(spec.strokeWidth ?? DEFAULT_STROKE_WIDTH),
    dash: spec.dash,
    fillOpacity: undefined,
  };
}

/**
 * Fill a path `d` (an area). Empty geometry is a no-op.
 */
export function paintFill(
  ctx: CanvasRenderingContext2D,
  d: string,
  spec: FillSpec,
  resolve: StyleResolver,
): PathMark | undefined {
  if (d === "") return undefined;
  const opacity = spec.fillOpacity ?? 0.2;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = resolve.color(spec.fill ?? "currentColor");
  ctx.fill(new Path2D(d));
  ctx.restore();
  return {
    kind: "path",
    d,
    fill: spec.fill ?? "currentColor",
    stroke: "none",
    strokeWidth: "0",
    dash: undefined,
    fillOpacity: String(opacity),
  };
}

/** Fill one scatter point. */
export function paintCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spec: CircleSpec,
  resolve: StyleResolver,
): CircleMark {
  const r = spec.radius ?? 3;
  const opacity = spec.fillOpacity ?? DEFAULT_FILL_OPACITY;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = resolve.color(spec.fill ?? "currentColor");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return {
    kind: "circle",
    cx: String(cx),
    cy: String(cy),
    r: String(r),
    fill: spec.fill ?? "currentColor",
    fillOpacity: String(opacity),
  };
}

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Fill one bar, and outline it when it is the active datum. The outline is
 * the non-colour channel that survives monochrome (ADR-0005 §5); it used to
 * be an SVG `stroke` on the same `<rect>`.
 */
export function paintBar(
  ctx: CanvasRenderingContext2D,
  rect: BarRect,
  spec: BarSpec,
  resolve: StyleResolver,
): RectMark {
  const fill = spec.fill ?? "currentColor";
  ctx.fillStyle = resolve.color(fill);
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  const active = spec.active === true;
  if (active) {
    ctx.strokeStyle = resolve.color(ACTIVE_BAR_STROKE);
    ctx.lineWidth = ACTIVE_BAR_WIDTH;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
  return {
    kind: "rect",
    x: String(rect.x),
    y: String(rect.y),
    width: String(rect.width),
    height: String(rect.height),
    fill,
    stroke: active ? ACTIVE_BAR_STROKE : "none",
    strokeWidth: active ? String(ACTIVE_BAR_WIDTH) : "0",
  };
}

/** Push a painted mark when the painter produced one. */
export function pushMark(into: CanvasMark[], mark: CanvasMark | undefined): void {
  if (mark !== undefined) into.push(mark);
}
