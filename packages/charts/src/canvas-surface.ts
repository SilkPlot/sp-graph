/**
 * One Canvas paint pass for a cartesian chart: grid, axes, clipped marks,
 * then clipped chrome. Clip is `ctx.clip`. Axes sit outside it so labels
 * occupy the margins.
 */
import type { NormalizedReference } from "@silkplot/core";
import type { AxisScale, TickFormat } from "@silkplot/solid";
import type { CanvasMark } from "./canvas-marks";
import {
  paintBrush,
  paintEmptyMark,
  paintPointMark,
  paintReferences,
} from "./canvas-chrome";
import { paintAxis, paintGridlines } from "./canvas-frame";
import { clipPlotArea } from "./canvas-paint";
import type { PlotPaint, PlotSize } from "./canvas-plot";
import type { StyleResolver } from "./canvas-style";

export interface PlotChrome {
  references?: readonly NormalizedReference[];
  position?: (reference: NormalizedReference) => number;
  brush?: { x0: number; x1: number };
  point?: { cx: number; cy: number };
  empty?: string;
}

export interface CartesianSurfaceArgs {
  grid: boolean;
  xScale: AxisScale;
  yScale: AxisScale;
  xFormat?: TickFormat;
  yFormat?: TickFormat;
  xLabelRotation?: number;
  paintMarks: PlotPaint;
  chrome?: PlotChrome;
}

export function paintCartesianSurface(
  ctx: CanvasRenderingContext2D,
  plot: PlotSize,
  resolve: StyleResolver,
  args: CartesianSurfaceArgs,
): CanvasMark[] {
  const into: CanvasMark[] = [];
  if (args.grid) {
    paintGridlines(ctx, args.yScale, "y", plot, resolve, into);
    paintGridlines(ctx, args.xScale, "x", plot, resolve, into);
  }
  paintAxis(
    ctx,
    { scale: args.yScale, orientation: "left", plot, format: args.yFormat },
    resolve,
    into,
  );
  paintAxis(
    ctx,
    {
      scale: args.xScale,
      orientation: "bottom",
      plot,
      format: args.xFormat,
      labelRotation: args.xLabelRotation,
    },
    resolve,
    into,
  );
  ctx.save();
  clipPlotArea(ctx, plot.width, plot.height);
  into.push(...args.paintMarks(ctx, plot, resolve));
  paintPlotChrome(ctx, plot, resolve, args.chrome, into);
  ctx.restore();
  return into;
}

/**
 * Live overlay chrome — brush, active point, references, empty wording.
 * Exported so a keyboard/hover restroke can paint this onto a cached series
 * bitmap instead of re-deriving grid, axes, and marks.
 */
export function paintPlotChrome(
  ctx: CanvasRenderingContext2D,
  plot: PlotSize,
  resolve: StyleResolver,
  chrome: PlotChrome | undefined,
  into: CanvasMark[],
): void {
  if (chrome === undefined) return;
  if (chrome.references !== undefined && chrome.position !== undefined) {
    paintReferences(ctx, chrome.references, chrome.position, plot, resolve, into);
  }
  if (chrome.brush !== undefined) {
    paintBrush(ctx, chrome.brush.x0, chrome.brush.x1, plot.height, resolve, into);
  }
  if (chrome.point !== undefined) {
    paintPointMark(ctx, chrome.point.cx, chrome.point.cy, plot, resolve, into);
  }
  if (chrome.empty !== undefined) {
    paintEmptyMark(ctx, chrome.empty, plot, resolve, into);
  }
}
