/**
 * CanvasPlot — the bitmap a cartesian chart paints onto.
 *
 * Sized to the full chart so axes can occupy the margins. Inner drawing is
 * translated to the plot origin. Marks and chrome clip via `ctx.clip` inside
 * the paint pass; this host only clears, translates, and records. Pointer
 * events pass through so the keyboard/hover surface keeps capturing.
 *
 * Live overlay chrome (active point, brush) is composited onto a cached copy
 * of the series/axes bitmap. A keyboard step must not restroke the dense
 * path — that restroke is how W-D derived inspection dropped a frame.
 */
import { createEffect, createSignal, untrack, type JSX } from "solid-js";
import { useChartBounds } from "@silkplot/solid";
import {
  marksOnCanvas,
  rememberCanvasMarks,
  type CanvasMark,
  type LineMark,
  type PathMark,
  type TextMark,
} from "./canvas-marks";
import { clipPlotArea } from "./canvas-paint";
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
  /**
   * Live chrome painted onto a snapshot of `paint`. When present, a change
   * here must not re-invoke `paint` — that is the inspection restroke this
   * host exists to avoid.
   */
  overlay?: PlotPaint;
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
	const drawnPoints = marks
		.filter(
			(mark): mark is PathMark & { pointCount: number } =>
				mark.kind === "path" && Number.isInteger(mark.pointCount),
		)
		.reduce((total, mark) => total + mark.pointCount, 0);
  const hatched = marks.some((m) => m.kind === "rect" && m.hatch !== undefined && m.hatch !== "0");
  const patterned = marks.some(
    (m) =>
      (m.kind === "path" || m.kind === "rect" || m.kind === "circle") && m.pattern !== undefined,
  );
  toggleAttr(el, "data-silkplot-crosshair", hasCross);
  toggleAttr(el, "data-silkplot-hatch", hatched);
  toggleAttr(el, "data-silkplot-pattern", patterned);
  toggleAttr(el, "data-silkplot-brush", hasBrush);
  toggleAttr(el, "data-silkplot-references", hasRefs);
  writeAttr(el, "data-silkplot-empty", empty?.text);
  writeAttr(el, "data-silkplot-label-rotation", rotated?.rotation);
  writeAttr(el, "data-silkplot-axis-labels", axisLabels > 0 ? String(axisLabels) : undefined);
  writeAttr(el, "data-silkplot-mark-d", series?.d);
  writeAttr(el, "data-silkplot-drawn-points", drawnPoints > 0 ? String(drawnPoints) : undefined);
}

function toggleAttr(el: HTMLCanvasElement, name: string, on: boolean): void {
  if (on) writeAttr(el, name, "");
  else writeAttr(el, name, undefined);
}

/** Skip a DOM write when the attribute already holds this value. A live brush
 *  restrokes the same series `d` every frame; rewriting a multi-kilobyte
 *  `data-silkplot-mark-d` is a mutation that does no work for the reader. */
function writeAttr(el: HTMLCanvasElement, name: string, value: string | undefined): void {
  if (value === undefined) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
    return;
  }
  if (el.getAttribute(name) === value) return;
  el.setAttribute(name, value);
}

function copyBitmap(from: HTMLCanvasElement, to: HTMLCanvasElement): void {
  if (to.width !== from.width) to.width = from.width;
  if (to.height !== from.height) to.height = from.height;
  const ctx = to.getContext("2d");
  if (ctx === null) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, to.width, to.height);
  if (from.width > 0 && from.height > 0) ctx.drawImage(from, 0, 0);
}

const BASE_BITMAP = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
const BASE_MARKS = new WeakMap<HTMLCanvasElement, readonly CanvasMark[]>();

function layoutOf(bounds: {
  innerWidth: number;
  innerHeight: number;
  width: number;
  height: number;
  margins: { left: number; top: number };
}): PlotLayout {
  return {
    width: bounds.innerWidth,
    height: bounds.innerHeight,
    originX: bounds.margins.left,
    originY: bounds.margins.top,
    outerWidth: bounds.width,
    outerHeight: bounds.height,
  };
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
  writeAttr(el, "data-silkplot-plot-width", String(layout.width));
  writeAttr(el, "data-silkplot-plot-height", String(layout.height));
  writeAttr(el, "data-silkplot-plot-origin-x", String(layout.originX ?? 0));
  writeAttr(el, "data-silkplot-plot-origin-y", String(layout.originY ?? 0));
  const originX = layout.originX ?? 0;
  const originY = layout.originY ?? 0;
  const outerW = Math.max(0, layout.outerWidth ?? layout.width + originX);
  const outerH = Math.max(0, layout.outerHeight ?? layout.height + originY);
  const dpr = window.devicePixelRatio;
  // Assigning width/height resets the backing store even when the numbers are
  // unchanged. A live brush (and hover chrome) paints every frame at a stable
  // size; reallocating the bitmap is the drop. Resize still has to run before
  // the collapsed-layout guard so a positive → zero-size transition cannot
  // leave stale pixels behind.
  const pixelW = Math.round(outerW * dpr);
  const pixelH = Math.round(outerH * dpr);
  if (el.width !== pixelW) el.width = pixelW;
  if (el.height !== pixelH) el.height = pixelH;
  if (layout.width <= 0 || layout.height <= 0) {
    rememberCanvasMarks(el, []);
    annotateChrome(el, []);
    return;
  }
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

/**
 * Keep a series/axes snapshot of the visible plot. Overlay compositing blits
 * this instead of re-invoking the series painter.
 */
export function snapshotCanvasBase(el: HTMLCanvasElement | undefined): void {
  if (el === undefined) return;
  let cache = BASE_BITMAP.get(el);
  if (cache === undefined) {
    cache = document.createElement("canvas");
    BASE_BITMAP.set(el, cache);
  }
  copyBitmap(el, cache);
  BASE_MARKS.set(el, marksOnCanvas(el));
}

/**
 * Blit the cached series bitmap and paint live chrome on top. Exported so a
 * keyboard restroke can be proven not to re-run the series painter.
 */
export function compositeCanvasOverlay(
  el: HTMLCanvasElement | undefined,
  layout: PlotLayout,
  overlay: PlotPaint,
): void {
  if (el === undefined) return;
  const cache = BASE_BITMAP.get(el);
  if (cache === undefined) return;
  copyBitmap(cache, el);
  writeAttr(el, "data-silkplot-plot-width", String(layout.width));
  writeAttr(el, "data-silkplot-plot-height", String(layout.height));
  writeAttr(el, "data-silkplot-plot-origin-x", String(layout.originX ?? 0));
  writeAttr(el, "data-silkplot-plot-origin-y", String(layout.originY ?? 0));
  if (layout.width <= 0 || layout.height <= 0) {
    rememberCanvasMarks(el, []);
    annotateChrome(el, []);
    return;
  }
  const originX = layout.originX ?? 0;
  const originY = layout.originY ?? 0;
  const dpr = window.devicePixelRatio;
  const ctx = el.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.translate(originX, originY);
  ctx.save();
  clipPlotArea(ctx, layout.width, layout.height);
  const overlayMarks = overlay(
    ctx,
    { width: layout.width, height: layout.height },
    createStyleResolver(el),
  );
  ctx.restore();
  ctx.restore();
  const marks = [...(BASE_MARKS.get(el) ?? []), ...overlayMarks];
  rememberCanvasMarks(el, marks);
  annotateChrome(el, marks);
}

export const CanvasPlot = (props: CanvasPlotProps): JSX.Element => {
  const bounds = useChartBounds();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>();

  createEffect(() => {
    const el = canvas();
    const layout = layoutOf(bounds());
    syncCanvasPlot(el, layout, props.paint);
    const overlay = props.overlay;
    if (overlay === undefined) return;
    snapshotCanvasBase(el);
    untrack(() => compositeCanvasOverlay(el, layout, overlay));
  });

  createEffect(() => {
    const overlay = props.overlay;
    if (overlay === undefined) return;
    const el = canvas();
    compositeCanvasOverlay(el, layoutOf(bounds()), overlay);
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
