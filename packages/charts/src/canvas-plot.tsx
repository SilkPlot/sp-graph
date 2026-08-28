/**
 * CanvasPlot — the bitmap a cartesian chart paints onto.
 *
 * Sized to the full chart so axes can occupy the margins. Inner drawing is
 * translated to the plot origin. Marks and chrome clip via `ctx.clip` inside
 * the paint pass; this host only clears, translates, and records. Pointer
 * events pass through so the keyboard/hover surface keeps capturing.
 */
import { createEffect, createSignal, type JSX } from "solid-js";
import { useChartBounds } from "@silkplot/solid";
import {
  rememberCanvasMarks,
  type CanvasMark,
  type LineMark,
  type PathMark,
  type TextMark,
} from "./canvas-marks";
import { createStyleResolver, type StyleResolver } from "./canvas-style";

export interface PlotSize {
  width: number;
  height: number;
}

export interface PlotLayout extends PlotSize {
  originX?: number;
  originY?: number;
  outerWidth?: number;
  outerHeight?: number;
}

export type PlotPaint = (
  ctx: CanvasRenderingContext2D,
  plot: PlotSize,
  resolve: StyleResolver,
) => readonly CanvasMark[];

export interface CanvasPlotProps {
  paint: PlotPaint;
}

function annotateChrome(el: HTMLCanvasElement, marks: readonly CanvasMark[]): void {
  const hasCross = marks.some(
    (m): m is LineMark =>
      m.kind === "line" && (m.role === "crosshair-x" || m.role === "crosshair-y"),
  );
  const hasBrush = marks.some((m) => m.kind === "rect" && m.role === "brush");
  const hasRefs = marks.some((m) => m.kind === "line" && m.role === "reference");
  const empty = marks.find((m): m is TextMark => m.kind === "text" && m.role === "empty");
  const rotated = marks.find(
    (m): m is TextMark => m.kind === "text" && m.role === "axis-label" && m.rotation !== undefined,
  );
  const axisLabels = marks.filter((m) => m.kind === "text" && m.role === "axis-label").length;
  const series = marks.find(
    (m): m is PathMark => m.kind === "path" && m.stroke !== "none" && m.d !== "",
  );
  toggleAttr(el, "data-silkplot-crosshair", hasCross);
  toggleAttr(el, "data-silkplot-brush", hasBrush);
  toggleAttr(el, "data-silkplot-references", hasRefs);
  if (empty !== undefined) el.setAttribute("data-silkplot-empty", empty.text);
  else el.removeAttribute("data-silkplot-empty");
  if (rotated !== undefined) el.setAttribute("data-silkplot-label-rotation", rotated.rotation ?? "");
  else el.removeAttribute("data-silkplot-label-rotation");
  if (axisLabels > 0) el.setAttribute("data-silkplot-axis-labels", String(axisLabels));
  else el.removeAttribute("data-silkplot-axis-labels");
  if (series !== undefined) el.setAttribute("data-silkplot-mark-d", series.d);
  else el.removeAttribute("data-silkplot-mark-d");
}

function toggleAttr(el: HTMLCanvasElement, name: string, on: boolean): void {
  if (on) el.setAttribute(name, "");
  else el.removeAttribute(name);
}

/**
 * Paint one Canvas plot, or no-op when the element is not yet attached or
 * the inner size has collapsed. Exported so the two guards are unit-testable.
 */
export function syncCanvasPlot(
  el: HTMLCanvasElement | undefined,
  layout: PlotLayout,
  paint: PlotPaint,
): void {
  if (el === undefined) return;
  el.setAttribute("data-silkplot-plot-width", String(layout.width));
  el.setAttribute("data-silkplot-plot-height", String(layout.height));
  if (layout.width <= 0 || layout.height <= 0) {
    rememberCanvasMarks(el, []);
    return;
  }
  const originX = layout.originX ?? 0;
  const originY = layout.originY ?? 0;
  const outerW = layout.outerWidth ?? layout.width + originX;
  const outerH = layout.outerHeight ?? layout.height + originY;
  const dpr = window.devicePixelRatio;
  el.width = Math.round(outerW * dpr);
  el.height = Math.round(outerH * dpr);
  const ctx = el.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, outerW, outerH);
  ctx.save();
  ctx.translate(originX, originY);
  const marks = paint(ctx, { width: layout.width, height: layout.height }, createStyleResolver(el));
  ctx.restore();
  rememberCanvasMarks(el, marks);
  annotateChrome(el, marks);
}

export const CanvasPlot = (props: CanvasPlotProps): JSX.Element => {
  const bounds = useChartBounds();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>();

  createEffect(() => {
    const el = canvas();
    const b = bounds();
    syncCanvasPlot(
      el,
      {
        width: b.innerWidth,
        height: b.innerHeight,
        originX: b.margins.left,
        originY: b.margins.top,
        outerWidth: b.width,
        outerHeight: b.height,
      },
      props.paint,
    );
  });

  return (
    <canvas
      ref={setCanvas}
      data-silkplot-canvas-plot=""
      data-silkplot-clip="canvas"
      style={{
        position: "absolute",
        left: "0px",
        top: "0px",
        width: `${bounds().width}px`,
        height: `${bounds().height}px`,
        "pointer-events": "none",
        display: "block",
      }}
    />
  );
};
