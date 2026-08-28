/**
 * Canvas paint for one histogram bar: categorical fill, and a fill pattern
 * when more than one series is present. A single series is distinguished by
 * position and length. Colour may encode; it must not uniquely encode.
 *
 * Geometry (edges, counts, density, pixel rects) is computed in
 * `@silkplot/core`. This file fills, clips the pattern into the rect, and
 * strokes the active outline.
 */
import { seriesColorToken, type HistogramBar } from "@silkplot/core";
import { paintCategoricalPattern } from "./canvas-pattern";
import type { CanvasMark, RectMark } from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";

const ACTIVE_STROKE = "var(--sp-color-cursor, currentColor)";
const ACTIVE_WIDTH = 2;

export function histogramFill(seriesIndex: number): string {
  return seriesColorToken(seriesIndex);
}

export interface HistogramBarSpec {
  active?: boolean;
  /** Overlay the series fill-pattern. Off for a single series. */
  pattern?: boolean;
}

function paintClippedPattern(
  ctx: CanvasRenderingContext2D,
  bar: HistogramBar,
  resolve: StyleResolver,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(bar.x, bar.y, bar.width, bar.height);
  ctx.clip();
  ctx.translate(bar.x + bar.width / 2, bar.y + bar.height / 2);
  paintCategoricalPattern(ctx, Math.hypot(bar.width, bar.height) / 2, bar.pattern, resolve);
  ctx.restore();
}

/** Fill one bin rect, overlay its pattern when asked, and outline when active. */
export function paintHistogramBar(
  ctx: CanvasRenderingContext2D,
  bar: HistogramBar,
  spec: HistogramBarSpec,
  resolve: StyleResolver,
): RectMark | undefined {
  if (!(bar.width > 0) || !(bar.height > 0)) return undefined;
  const fill = histogramFill(bar.seriesIndex);
  const patterned = spec.pattern === true;
  const active = spec.active === true;
  ctx.save();
  ctx.fillStyle = resolve.color(fill);
  ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
  if (patterned) paintClippedPattern(ctx, bar, resolve);
  if (active) {
    ctx.strokeStyle = resolve.color(ACTIVE_STROKE);
    ctx.lineWidth = ACTIVE_WIDTH;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    ctx.strokeRect(bar.x, bar.y, bar.width, bar.height);
  }
  ctx.restore();
  return {
    kind: "rect",
    x: String(bar.x),
    y: String(bar.y),
    width: String(bar.width),
    height: String(bar.height),
    fill,
    stroke: active ? ACTIVE_STROKE : "none",
    strokeWidth: active ? String(ACTIVE_WIDTH) : "0",
    pattern: patterned ? String(bar.pattern) : undefined,
  };
}

export function paintHistogramMarks(
  ctx: CanvasRenderingContext2D,
  marks: readonly HistogramBar[],
  activeIndex: number | undefined,
  resolve: StyleResolver,
  pattern: boolean,
): CanvasMark[] {
  const painted: CanvasMark[] = [];
  for (let i = 0; i < marks.length; i += 1) {
    const mark = paintHistogramBar(
      ctx,
      marks[i] as HistogramBar,
      { active: activeIndex === i, pattern },
      resolve,
    );
    if (mark !== undefined) painted.push(mark);
  }
  return painted;
}
