/**
 * Canvas paint for bubble marks: a sized marker path per point, and the
 * size legend in the reserved right margin.
 *
 * Size is the magnitude channel. Series identity is the marker symbol
 * (from the theme's series channel) plus the series label on the table.
 * Colour still varies with series index, but it is never the only one.
 *
 * Geometry (pixels, radius) is computed in `@silkplot/core`. This file
 * fills the marker path and strokes the active outline.
 */
import { seriesColorToken, type BubbleMark, type BubbleSizeTick } from "@silkplot/core";
import { markerPath, seriesChannel, type MarkerShape } from "@silkplot/theme";
import { paintCircle, paintText } from "./canvas-paint";
import type { CanvasMark, CircleMark, PathMark } from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";
import type { PlotSize } from "./canvas-plot";

const ACTIVE_STROKE = "var(--sp-color-cursor, currentColor)";
const ACTIVE_WIDTH = 2;
const DEFAULT_FILL_OPACITY = 0.65;
const LEGEND_FILL = "var(--sp-color-text, #16181d)";
const LEGEND_PAD = 8;
const LEGEND_GAP = 8;
const LEGEND_LABEL_SIZE = "11px";

export const DEFAULT_BUBBLE_FILL_OPACITY = DEFAULT_FILL_OPACITY;

export function bubbleFill(seriesIndex: number): string {
  return seriesColorToken(seriesIndex);
}

export function bubbleSymbol(seriesIndex: number): MarkerShape {
  return seriesChannel(seriesIndex).shape;
}

export interface BubbleMarkSpec {
  active?: boolean;
  fillOpacity?: number;
}

/** Fill one sized marker and outline it when it is the active datum. */
export function paintBubbleMark(
  ctx: CanvasRenderingContext2D,
  mark: BubbleMark,
  spec: BubbleMarkSpec,
  resolve: StyleResolver,
): PathMark | undefined {
  if (!(mark.r > 0)) return undefined;
  const symbol = bubbleSymbol(mark.seriesIndex);
  const d = markerPath(symbol, mark.px, mark.py, mark.r);
  const fill = bubbleFill(mark.seriesIndex);
  const opacity = spec.fillOpacity ?? DEFAULT_FILL_OPACITY;
  const path = new Path2D(d);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = resolve.color(fill);
  ctx.fill(path);
  ctx.restore();
  const active = spec.active === true;
  if (active) {
    ctx.save();
    ctx.strokeStyle = resolve.color(ACTIVE_STROKE);
    ctx.lineWidth = ACTIVE_WIDTH;
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    ctx.stroke(path);
    ctx.restore();
  }
  return {
    kind: "path",
    d,
    fill,
    stroke: active ? ACTIVE_STROKE : "none",
    strokeWidth: active ? String(ACTIVE_WIDTH) : "0",
    dash: undefined,
    fillOpacity: String(opacity),
    symbol,
    r: String(mark.r),
    size: String(mark.size),
  };
}

export function paintBubbleMarks(
  ctx: CanvasRenderingContext2D,
  marks: readonly BubbleMark[],
  currentIndex: number | undefined,
  resolve: StyleResolver,
  fillOpacity?: number,
): CanvasMark[] {
  const painted: CanvasMark[] = [];
  for (const mark of marks) {
    const path = paintBubbleMark(
      ctx,
      mark,
      { active: currentIndex === mark.sourceIndex, fillOpacity },
      resolve,
    );
    if (path !== undefined) painted.push(path);
  }
  return painted;
}

/**
 * Size legend in the right margin (plot-relative x past `plot.width`).
 * Circles, not series symbols: this key is magnitude, not series identity.
 */
export function paintBubbleSizeLegend(
  ctx: CanvasRenderingContext2D,
  ticks: readonly BubbleSizeTick[],
  plot: PlotSize,
  resolve: StyleResolver,
): CanvasMark[] {
  if (ticks.length === 0 || !(plot.height > 0)) return [];
  const maxR = Math.max(...ticks.map((t) => t.r));
  if (!(maxR > 0)) return [];
  const cx = plot.width + LEGEND_PAD + maxR;
  const painted: CanvasMark[] = [];
  let cy = LEGEND_PAD + maxR;
  for (const tick of ticks) {
    const circle = paintCircle(
      ctx,
      cx,
      cy,
      { radius: tick.r, fill: LEGEND_FILL, fillOpacity: DEFAULT_FILL_OPACITY },
      resolve,
    );
    const recorded: CircleMark = {
      ...circle,
      role: "size-legend",
      size: String(tick.size),
    };
    painted.push(recorded);
    painted.push(
      paintText(
        ctx,
        cx + maxR + LEGEND_GAP,
        cy,
        String(tick.size),
        {
          fill: LEGEND_FILL,
          fontSize: LEGEND_LABEL_SIZE,
          anchor: "start",
          baseline: "middle",
        },
        resolve,
        "size-legend",
      ),
    );
    cy += maxR * 2 + LEGEND_GAP;
  }
  return painted;
}
