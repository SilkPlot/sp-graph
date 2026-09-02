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

import type {
  CanvasMark,
  CircleMark,
  LineMark,
  LineRole,
  PathMark,
  RectMark,
  TextMark,
  TextRole,
} from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";

export interface StrokeSpec {
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
	pointCount?: number;
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
 * Clip subsequent drawing to the inner plot. Neighbour vertices past a plot
 * edge are painted and then hidden rather than stopping short. Axes live
 * outside this clip so tick labels can occupy the margins.
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
 * Reuse a parsed `Path2D` while the `d` string is unchanged. Live brush chrome
 * restrokes the same series paths every frame; re-parsing a dense SVG `d` is
 * work the picture does not need.
 */
const PATH2D_CACHE = new Map<string, Path2D>();
const PATH2D_CACHE_MAX = 48;

function path2dOf(d: string): Path2D {
  const hit = PATH2D_CACHE.get(d);
  if (hit !== undefined) return hit;
  const path = new Path2D(d);
  if (PATH2D_CACHE.size >= PATH2D_CACHE_MAX) {
    const oldest = PATH2D_CACHE.keys().next().value;
    if (oldest !== undefined) PATH2D_CACHE.delete(oldest);
  }
  PATH2D_CACHE.set(d, path);
  return path;
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
  ctx.stroke(path2dOf(d));
  return {
    kind: "path",
    d,
    fill: "none",
    stroke: spec.stroke ?? "currentColor",
    strokeWidth: String(spec.strokeWidth ?? DEFAULT_STROKE_WIDTH),
    dash: spec.dash,
    fillOpacity: undefined,
		pointCount: spec.pointCount,
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
  ctx.fill(path2dOf(d));
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

export interface LinePaintSpec {
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
  opacity?: number;
}

/**
 * Align a 1 CSS-px stroke so its edges fall on device-pixel boundaries.
 *
 * Canvas centres the stroke on the path. At `devicePixelRatio` 1, a 1px line
 * on an integer coordinate covers two half-pixels and anti-aliases to ~50%
 * coverage. On the dark `--sp-color-axis` (`#667085` on `#14161a`) that smear
 * drops the tick below a visible floor; under light `prefers-contrast: more`
 * the same smear turns `#000000` into washed grey next to the 11px labels.
 */
export function snapHairline(n: number, dpr: number): number {
  return (Math.round(n * dpr - 0.5 * dpr) + 0.5 * dpr) / dpr;
}

function currentScale(ctx: CanvasRenderingContext2D): number {
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b) || 1;
}

function alignHairline(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
): { x1: number; y1: number; x2: number; y2: number } {
  if (strokeWidth !== 1) return { x1, y1, x2, y2 };
  const dpr = currentScale(ctx);
  if (x1 === x2) {
    const x = snapHairline(x1, dpr);
    return { x1: x, y1, x2: x, y2 };
  }
  if (y1 === y2) {
    const y = snapHairline(y1, dpr);
    return { x1, y1: y, x2, y2: y };
  }
  return { x1, y1, x2, y2 };
}

/** Stroke a single segment. Butt caps: these are grid, axis, and chrome rules. */
export function paintLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  spec: LinePaintSpec,
  resolve: StyleResolver,
  role: LineRole,
  extra?: Pick<LineMark, "axis" | "referenceId">,
): LineMark {
  const strokeWidth = spec.strokeWidth ?? 1;
  const aligned = alignHairline(ctx, x1, y1, x2, y2, strokeWidth);
  ctx.save();
  ctx.strokeStyle = resolve.color(spec.stroke ?? "currentColor");
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.setLineDash(spec.dash !== undefined ? resolve.dash(spec.dash) : []);
  if (spec.opacity !== undefined) ctx.globalAlpha = spec.opacity;
  ctx.beginPath();
  ctx.moveTo(aligned.x1, aligned.y1);
  ctx.lineTo(aligned.x2, aligned.y2);
  ctx.stroke();
  ctx.restore();
  return {
    kind: "line",
    x1: String(x1),
    y1: String(y1),
    x2: String(x2),
    y2: String(y2),
    stroke: spec.stroke ?? "currentColor",
    strokeWidth: String(strokeWidth),
    dash: spec.dash,
    role,
    axis: extra?.axis,
    referenceId: extra?.referenceId,
  };
}

export interface TextPaintSpec {
  fill?: string;
  fontSize?: string;
  anchor?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  rotate?: number;
}

/** Fill a label. Rotation is degrees about (x, y), matching Axis. */
export function paintText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  spec: TextPaintSpec,
  resolve: StyleResolver,
  role: TextRole,
  extra?: Pick<TextMark, "axis" | "referenceId">,
): TextMark {
  const fontSize = spec.fontSize ?? "11px";
  const anchor = spec.anchor ?? "start";
  ctx.save();
  ctx.fillStyle = resolve.color(spec.fill ?? "currentColor");
  ctx.font = resolve.font(fontSize);
  ctx.textAlign = anchor;
  ctx.textBaseline = spec.baseline ?? "alphabetic";
  if (spec.rotate !== undefined && spec.rotate !== 0) {
    ctx.translate(x, y);
    ctx.rotate((spec.rotate * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
  return {
    kind: "text",
    x: String(x),
    y: String(y),
    text,
    fill: spec.fill ?? "currentColor",
    anchor,
    role,
    axis: extra?.axis,
    referenceId: extra?.referenceId,
    rotation: spec.rotate !== undefined && spec.rotate !== 0 ? String(spec.rotate) : undefined,
  };
}

export interface RingSpec {
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

/** Stroke a circle (the active-point rings). */
export function paintRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spec: RingSpec,
  resolve: StyleResolver,
): CircleMark {
  const r = spec.radius ?? 7;
  const stroke = spec.stroke ?? "currentColor";
  const strokeWidth = spec.strokeWidth ?? 2;
  ctx.save();
  ctx.strokeStyle = resolve.color(stroke);
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return {
    kind: "circle",
    cx: String(cx),
    cy: String(cy),
    r: String(r),
    fill: "none",
    fillOpacity: "0",
    stroke,
    strokeWidth: String(strokeWidth),
    role: "cursor",
  };
}
