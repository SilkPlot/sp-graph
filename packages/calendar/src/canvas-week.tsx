/**
 * Canvas week host — paints `TimeGrid` / `EventRect` onto one bitmap.
 *
 * This is not a rewrite of `WeekGrid`. `WeekGrid` stays SVG. The named graphic
 * here carries title/desc only; marks live on the Canvas. Geometry is
 * consumed, never packed here.
 */
import { createEffect, createSignal, createUniqueId, type Component, type JSX } from "solid-js";
import { cssVar, tokens } from "@silkplot/theme";
import { weekCanvasSize } from "./canvas-week-geometry";
import { syncCanvasWeek } from "./canvas-week-paint";
import type { EventRect } from "./overlap-resolver";
import type { TimeGrid } from "./time-grid";

export interface CanvasWeekProps {
  /** Zoned civil-time geometry from {@link buildTimeGrid}. */
  grid: TimeGrid;
  /** Packed rectangles from {@link resolveEventLanes}. */
  rects: readonly EventRect[];
  /** Pixel width of the week (all day columns). */
  width: number;
  /**
   * CSS-pixel window onto the canvas. When set, paint is visible-range plus
   * a small overscan. When omitted, every `EventRect` is painted.
   */
  viewport?: { x: number; y: number; width: number; height: number };
  overscan?: number;
  title?: string;
  desc?: string;
  class?: string;
}

export const CanvasWeek: Component<CanvasWeekProps> = (props) => {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>();
  const titleId = createUniqueId();
  const descId = createUniqueId();
  const size = () => weekCanvasSize(props.grid, props.width);

  createEffect(() => {
    syncCanvasWeek(
      canvas(),
      props.grid,
      props.rects,
      props.width,
      window.devicePixelRatio,
      props.viewport,
      props.overscan,
    );
  });

  const wrapStyle = (): JSX.CSSProperties => ({
    position: "relative",
    width: `${size().width}px`,
    height: `${size().height}px`,
    background: cssVar("color-surface", tokens.color.surface),
  });

  return (
    <div class={props.class} data-silkplot-canvas-week="" style={wrapStyle()}>
      <svg
        width={size().width}
        height={size().height}
        viewBox={`0 0 ${size().width} ${size().height}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={props.desc ? descId : undefined}
        data-silkplot-canvas-week-name=""
        style={{ position: "absolute", left: "0px", top: "0px", "pointer-events": "none" }}
      >
        <title id={titleId}>{props.title ?? "Week view"}</title>
        {props.desc ? <desc id={descId}>{props.desc}</desc> : null}
      </svg>
      <canvas
        ref={setCanvas}
        data-silkplot-canvas-week-plot=""
        data-silkplot-clip="canvas"
        style={{
          position: "absolute",
          display: "block",
        }}
      />
    </div>
  );
};
