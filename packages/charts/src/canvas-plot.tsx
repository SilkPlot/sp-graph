/**
 * CanvasPlot — the inner-plot bitmap cartesian marks paint onto.
 *
 * Positioned on the inner origin, sized to the inner plot. Neighbour vertices
 * past a plot edge are computed by `marksForPlotInterval` and then hidden by
 * `clipPlotArea` (`ctx.clip`), not by an SVG `clipPath`. Pointer events pass
 * through so the existing keyboard/hover surface keeps capturing.
 *
 * D3 still computes; this component only hosts the context and re-paints when
 * the caller’s paint function reads a reactive input.
 */
import { createEffect, createSignal, type JSX } from "solid-js";
import { useChartBounds } from "@silkplot/solid";
import { rememberCanvasMarks, type CanvasMark } from "./canvas-marks";
import { clipPlotArea } from "./canvas-paint";
import { createStyleResolver, type StyleResolver } from "./canvas-style";

export interface PlotSize {
  width: number;
  height: number;
}

export type PlotPaint = (
  ctx: CanvasRenderingContext2D,
  plot: PlotSize,
  resolve: StyleResolver,
) => readonly CanvasMark[];

export interface CanvasPlotProps {
  paint: PlotPaint;
}

/**
 * Paint one Canvas plot, or no-op when the element is not yet attached or
 * the inner size has collapsed. Exported so the two guards are unit-testable:
 * `CartesianFrame` only mounts this when `hasArea()` is true, so a zero-size
 * plot never reaches the component from production, and Solid assigns `ref`
 * before the first effect, so `el === undefined` is the same shape of gap.
 */
export function syncCanvasPlot(
  el: HTMLCanvasElement | undefined,
  plot: PlotSize,
  paint: PlotPaint,
): void {
  if (el === undefined) return;
  el.setAttribute("data-silkplot-plot-width", String(plot.width));
  el.setAttribute("data-silkplot-plot-height", String(plot.height));
  if (plot.width <= 0 || plot.height <= 0) {
    rememberCanvasMarks(el, []);
    return;
  }
  const dpr = window.devicePixelRatio;
  el.width = Math.round(plot.width * dpr);
  el.height = Math.round(plot.height * dpr);
  const ctx = el.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, plot.width, plot.height);
  ctx.save();
  clipPlotArea(ctx, plot.width, plot.height);
  const marks = paint(ctx, plot, createStyleResolver(el));
  ctx.restore();
  rememberCanvasMarks(el, marks);
}

export const CanvasPlot = (props: CanvasPlotProps): JSX.Element => {
  const bounds = useChartBounds();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>();

  createEffect(() => {
    const el = canvas();
    const b = bounds();
    syncCanvasPlot(el, { width: b.innerWidth, height: b.innerHeight }, props.paint);
  });

  return (
    <canvas
      ref={setCanvas}
      data-silkplot-canvas-plot=""
      data-silkplot-clip="canvas"
      style={{
        position: "absolute",
        left: `${bounds().margins.left}px`,
        top: `${bounds().margins.top}px`,
        width: `${bounds().innerWidth}px`,
        height: `${bounds().innerHeight}px`,
        "pointer-events": "none",
        display: "block",
      }}
    />
  );
};
