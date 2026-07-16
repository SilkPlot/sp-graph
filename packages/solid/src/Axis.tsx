/**
 * Axis — the canonical "no d3-axis" primitive.
 *
 * `d3-axis` is BANNED: it calls `selection.call(axis)` and mutates a DOM node,
 * fighting Solid for ownership. Instead this component asks `@silkplot/core` to
 * COMPUTE ticks from the scale, then renders the tick marks, labels, and domain
 * line with a Solid `<For>`. D3 computes, Solid renders — in one component.
 */
import { createMemo, For, type Component } from "solid-js";
import { computeTicks, type ContinuousScale, type Tick } from "@silkplot/core";
import { useChartBounds } from "./context";

export type AxisOrientation = "bottom" | "left" | "top" | "right";

export interface AxisProps {
  /**
   * The scale to draw an axis for (linear or time).
   *
   * A d3 scale is itself a FUNCTION, so storing one in a signal and updating it
   * with `setScale(next)` hits Solid's updater overload — the scale is called as
   * `(prev) => next` instead of being stored. Wrap it: `setScale(() => next)`.
   * The failure is silent at the call site and surfaces later inside tick
   * computation.
   */
  scale: ContinuousScale;
  /** Which edge the axis sits on. Default: "bottom". */
  orientation?: AxisOrientation;
  /** Desired tick count (a hint passed to the scale). */
  tickCount?: number;
  /** Target px spacing between ticks when `tickCount` is omitted. */
  pixelsPerTick?: number;
  /** Length of the tick marks in px. Default: 6. */
  tickSize?: number;
  class?: string;
}

export const Axis: Component<AxisProps> = (props) => {
  const bounds = useChartBounds();
  const orientation = (): AxisOrientation => props.orientation ?? "bottom";
  const isHorizontal = (): boolean =>
    orientation() === "bottom" || orientation() === "top";

  const ticks = createMemo<Tick[]>(() =>
    computeTicks(props.scale, {
      count: props.tickCount,
      pixelsPerTick: props.pixelsPerTick,
    }),
  );

  const tickSize = (): number => props.tickSize ?? 6;

  // Where the axis line sits within the inner drawing area.
  const axisOffset = createMemo(() => {
    switch (orientation()) {
      case "bottom":
        return bounds().innerHeight;
      case "right":
        return bounds().innerWidth;
      case "top":
      case "left":
      default:
        return 0;
    }
  });

  const domainPath = createMemo(() => {
    const inner = bounds();
    if (isHorizontal()) {
      const y = axisOffset();
      return `M0,${y}H${inner.innerWidth}`;
    }
    const x = axisOffset();
    return `M${x},0V${inner.innerHeight}`;
  });

  return (
    <g class={props.class} data-silkplot-axis={orientation()} aria-hidden="true">
      <path d={domainPath()} fill="none" stroke="currentColor" stroke-opacity="0.4" />
      <For each={ticks()}>
        {(tick) => {
          if (isHorizontal()) {
            const dir = orientation() === "bottom" ? 1 : -1;
            const labelY = orientation() === "bottom" ? tickSize() + 12 : -(tickSize() + 4);
            return (
              <g transform={`translate(${tick.position},${axisOffset()})`}>
                <line y2={dir * tickSize()} stroke="currentColor" stroke-opacity="0.4" />
                <text
                  y={labelY}
                  text-anchor="middle"
                  fill="currentColor"
                  font-size="11"
                >
                  {tick.label}
                </text>
              </g>
            );
          }
          const dir = orientation() === "right" ? 1 : -1;
          const labelX = orientation() === "right" ? tickSize() + 4 : -(tickSize() + 4);
          const anchor = orientation() === "right" ? "start" : "end";
          return (
            <g transform={`translate(${axisOffset()},${tick.position})`}>
              <line x2={dir * tickSize()} stroke="currentColor" stroke-opacity="0.4" />
              <text
                x={labelX}
                dy="0.32em"
                text-anchor={anchor}
                fill="currentColor"
                font-size="11"
              >
                {tick.label}
              </text>
            </g>
          );
        }}
      </For>
    </g>
  );
};
