/**
 * Axes and gridlines on the Canvas cartesian surface.
 *
 * Tick positions come from the same `resolveTicks` Axis and Gridlines use, so
 * a grid line cannot land off its label. The SVG primitives stay for
 * playground / primitive tests; composed charts paint through here.
 */
import type { Tick } from "@silkplot/core";
import { resolveTicks, type AxisScale, type TickFormat } from "@silkplot/solid";
import type { AxisSide, CanvasMark } from "./canvas-marks";
import { paintLine, paintText, pushMark } from "./canvas-paint";
import type { PlotSize } from "./canvas-plot";
import type { StyleResolver } from "./canvas-style";

const AXIS_STROKE = "var(--sp-color-axis, currentColor)";
const AXIS_LABEL_FILL = "var(--sp-color-text, currentColor)";
const AXIS_FONT_SIZE = "var(--sp-font-sm, 11px)";
const GRID_STROKE = "var(--sp-color-grid, currentColor)";
const TICK_SIZE = 6;

export function paintGridlines(
  ctx: CanvasRenderingContext2D,
  scale: AxisScale,
  axis: "x" | "y",
  plot: PlotSize,
  resolve: StyleResolver,
  into: CanvasMark[],
): void {
  const ticks = resolveTicks(scale);
  for (const tick of ticks) {
    const vertical = axis === "x";
    pushMark(
      into,
      paintLine(
        ctx,
        vertical ? tick.position : 0,
        vertical ? 0 : tick.position,
        vertical ? tick.position : plot.width,
        vertical ? plot.height : tick.position,
        { stroke: GRID_STROKE },
        resolve,
        "grid",
        { axis },
      ),
    );
  }
}

export interface AxisPaintArgs {
  scale: AxisScale;
  orientation: AxisSide;
  plot: PlotSize;
  format?: TickFormat;
  labelRotation?: number;
}

export function paintAxis(
  ctx: CanvasRenderingContext2D,
  args: AxisPaintArgs,
  resolve: StyleResolver,
  into: CanvasMark[],
): void {
  const ticks = resolveTicks(args.scale, { format: args.format });
  if (args.orientation === "bottom" || args.orientation === "top") {
    paintHorizontalAxis(ctx, args, ticks, resolve, into);
    return;
  }
  paintVerticalAxis(ctx, args, ticks, resolve, into);
}

function paintHorizontalAxis(
  ctx: CanvasRenderingContext2D,
  args: AxisPaintArgs,
  ticks: readonly Tick[],
  resolve: StyleResolver,
  into: CanvasMark[],
): void {
  const y = args.orientation === "bottom" ? args.plot.height : 0;
  const dir = args.orientation === "bottom" ? 1 : -1;
  const extra = args.orientation === "bottom" ? 12 : 4;
  const labelY = y + dir * (TICK_SIZE + extra);
  const rotation = args.orientation === "bottom" ? (args.labelRotation ?? 0) : 0;
  paintRule(ctx, 0, y, args.plot.width, y, resolve, into, "axis-domain", args.orientation);
  for (const tick of ticks) {
    paintRule(
      ctx,
      tick.position,
      y,
      tick.position,
      y + dir * TICK_SIZE,
      resolve,
      into,
      "axis-tick",
      args.orientation,
    );
    pushMark(
      into,
      paintText(
        ctx,
        tick.position,
        labelY,
        tick.label,
        {
          fill: AXIS_LABEL_FILL,
          fontSize: AXIS_FONT_SIZE,
          anchor: rotation !== 0 ? "end" : "center",
          rotate: rotation !== 0 ? rotation : undefined,
        },
        resolve,
        "axis-label",
        { axis: args.orientation },
      ),
    );
  }
}

function paintVerticalAxis(
  ctx: CanvasRenderingContext2D,
  args: AxisPaintArgs,
  ticks: readonly Tick[],
  resolve: StyleResolver,
  into: CanvasMark[],
): void {
  const x = args.orientation === "right" ? args.plot.width : 0;
  const dir = args.orientation === "right" ? 1 : -1;
  const labelX = x + dir * (TICK_SIZE + 4);
  const anchor = args.orientation === "right" ? "start" : "end";
  paintRule(ctx, x, 0, x, args.plot.height, resolve, into, "axis-domain", args.orientation);
  for (const tick of ticks) {
    paintRule(
      ctx,
      x,
      tick.position,
      x + dir * TICK_SIZE,
      tick.position,
      resolve,
      into,
      "axis-tick",
      args.orientation,
    );
    pushMark(
      into,
      paintText(
        ctx,
        labelX,
        tick.position,
        tick.label,
        {
          fill: AXIS_LABEL_FILL,
          fontSize: AXIS_FONT_SIZE,
          anchor,
          baseline: "middle",
        },
        resolve,
        "axis-label",
        { axis: args.orientation },
      ),
    );
  }
}

function paintRule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  resolve: StyleResolver,
  into: CanvasMark[],
  role: "axis-tick" | "axis-domain",
  axis: AxisSide,
): void {
  pushMark(
    into,
    paintLine(ctx, x1, y1, x2, y2, { stroke: AXIS_STROKE }, resolve, role, { axis }),
  );
}
