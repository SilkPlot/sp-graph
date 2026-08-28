/**
 * Canvas paint for one pie/donut slice: categorical fill, a fill pattern, and
 * a label. Colour is never the only channel — a monochrome copy still
 * separates slices by pattern and by the label sitting on each one.
 *
 * Geometry (angles, hole, path `d`, centroid) is computed in `@silkplot/core`.
 * This file fills, clips the pattern into the slice, and strokes the active
 * outline. The path is centred at (0, 0); the painter translates to the pie
 * origin.
 */
import { seriesColorToken, type PieSlice } from "@silkplot/core";
import { paintText } from "./canvas-paint";
import type { CanvasMark, PathMark } from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";

const PATTERN_STROKE = "var(--sp-color-text, #16181d)";
const LABEL_FILL = "var(--sp-color-text, #16181d)";
const ACTIVE_STROKE = "var(--sp-color-cursor, currentColor)";
const ACTIVE_WIDTH = 2;
const LABEL_SIZE = "11px";

type PatternPaint = (ctx: CanvasRenderingContext2D, radius: number) => void;

const PATTERNS: readonly PatternPaint[] = [
  (ctx, radius) => paintDots(ctx, radius, 8),
  (ctx, radius) => paintStripes(ctx, radius, 6, Math.PI / 4),
  (ctx, radius) => paintStripes(ctx, radius, 6, -Math.PI / 4),
  (ctx, radius) => paintStripes(ctx, radius, 6, 0),
  (ctx, radius) => paintStripes(ctx, radius, 6, Math.PI / 2),
  (ctx, radius) => {
    paintStripes(ctx, radius, 8, 0);
    paintStripes(ctx, radius, 8, Math.PI / 2);
  },
  (ctx, radius) => paintDots(ctx, radius, 5),
  (ctx, radius) => {
    paintStripes(ctx, radius, 7, Math.PI / 6);
    paintStripes(ctx, radius, 7, -Math.PI / 6);
  },
];

export function pieFill(pattern: number): string {
  return seriesColorToken(pattern);
}

export interface PieSliceSpec {
  active?: boolean;
}

function paintDots(ctx: CanvasRenderingContext2D, radius: number, step: number): void {
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle;
  for (let y = -radius; y <= radius; y += step) {
    for (let x = -radius; x <= radius; x += step) {
      ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
  }
  ctx.restore();
}

function paintStripes(ctx: CanvasRenderingContext2D, radius: number, step: number, angle: number): void {
  const span = radius * 2;
  ctx.save();
  ctx.rotate(angle);
  for (let y = -span; y <= span; y += step) {
    ctx.beginPath();
    ctx.moveTo(-span, y);
    ctx.lineTo(span, y);
    ctx.stroke();
  }
  ctx.restore();
}

function paintSlicePattern(
  ctx: CanvasRenderingContext2D,
  radius: number,
  pattern: number,
  resolve: StyleResolver,
): void {
  ctx.strokeStyle = resolve.color(PATTERN_STROKE);
  ctx.fillStyle = resolve.color(PATTERN_STROKE);
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.setLineDash([]);
  const slot = ((pattern % PATTERNS.length) + PATTERNS.length) % PATTERNS.length;
  PATTERNS[slot]!(ctx, radius);
}

function paintSliceBody(
  ctx: CanvasRenderingContext2D,
  slice: PieSlice,
  spec: PieSliceSpec,
  resolve: StyleResolver,
): PathMark | undefined {
  if (slice.d === "" || !(slice.outerRadius > 0)) return undefined;
  const fill = pieFill(slice.pattern);
  const path = new Path2D(slice.d);
  ctx.save();
  ctx.translate(slice.cx, slice.cy);
  ctx.fillStyle = resolve.color(fill);
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  paintSlicePattern(ctx, slice.outerRadius, slice.pattern, resolve);
  ctx.restore();
  const active = spec.active === true;
  if (active) {
    ctx.strokeStyle = resolve.color(ACTIVE_STROKE);
    ctx.lineWidth = ACTIVE_WIDTH;
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    ctx.stroke(path);
  }
  ctx.restore();
  return {
    kind: "path",
    d: slice.d,
    fill,
    stroke: active ? ACTIVE_STROKE : "none",
    strokeWidth: active ? String(ACTIVE_WIDTH) : "0",
    dash: undefined,
    fillOpacity: undefined,
    pattern: String(slice.pattern),
    innerRadius: String(slice.innerRadius),
    outerRadius: String(slice.outerRadius),
  };
}

/** Fill one slice, overlay its pattern, label it, and outline when active. */
export function paintPieSlice(
  ctx: CanvasRenderingContext2D,
  slice: PieSlice,
  spec: PieSliceSpec,
  resolve: StyleResolver,
): CanvasMark[] {
  const path = paintSliceBody(ctx, slice, spec, resolve);
  if (path === undefined) return [];
  const label = paintText(
    ctx,
    slice.centroid.x,
    slice.centroid.y,
    slice.label,
    { fill: LABEL_FILL, fontSize: LABEL_SIZE, anchor: "center", baseline: "middle" },
    resolve,
    "slice-label",
  );
  return [path, label];
}
