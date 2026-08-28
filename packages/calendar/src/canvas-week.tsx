/**
 * Canvas week host — paints `TimeGrid` / `EventRect` onto one bitmap.
 *
 * This is not a rewrite of `WeekGrid`. `WeekGrid` stays SVG. Title and desc
 * live on HTML so this surface does not mount an SVG at all. Marks live on
 * the Canvas. Geometry is consumed, never packed here.
 */
import { createEffect, createSignal, createUniqueId, type Component, type JSX } from "solid-js";
import { cssVar, tokens } from "@silkplot/theme";
import { weekCanvasSize } from "./canvas-week-geometry";
import { syncCanvasWeek } from "./canvas-week-paint";
import type { EventRect } from "./overlap-resolver";
import type { TimeGrid } from "./time-grid";

/**
 * Clip an element out of view while leaving it in the accessibility tree.
 * `display: none` / `visibility: hidden` would drop title/desc from AT.
 */
const VISUALLY_HIDDEN: JSX.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  "white-space": "nowrap",
  "border-width": "0",
};

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
    <div
      class={props.class}
      data-silkplot-canvas-week=""
      role="img"
      aria-labelledby={titleId}
      aria-describedby={props.desc ? descId : undefined}
      style={wrapStyle()}
    >
      <p id={titleId} data-silkplot-canvas-week-name="" style={VISUALLY_HIDDEN}>
        {props.title ?? "Week view"}
      </p>
      {props.desc ? (
        <p id={descId} data-silkplot-canvas-week-desc="" style={VISUALLY_HIDDEN}>
          {props.desc}
        </p>
      ) : null}
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
