/**
 * Axis — the canonical "no d3-axis" primitive.
 *
 * `d3-axis` is BANNED: it calls `selection.call(axis)` and mutates a DOM node,
 * fighting Solid for ownership. Instead this component asks `@silkplot/core` to
 * COMPUTE ticks from the scale, then renders the tick marks, labels, and domain
 * line with a Solid `<For>`. D3 computes, Solid renders — in one component.
 */
import { createMemo, For, type Component } from "solid-js";
import type { Tick } from "@silkplot/core";
import { useChartBounds } from "./context";
import { resolveTicks, type AxisScale, type TickFormat } from "./scale-ticks";

export type AxisOrientation = "bottom" | "left" | "top" | "right";

export type { AxisScale, TickFormat };

/**
 * Axis LINE / TICK colour, per the theming contract (ADR-0001): read the token
 * with a fallback so an unthemed consumer still renders.
 *
 * `--sp-color-axis` is already the pre-muted scaffolding colour, so it is used
 * at full strength — the old `stroke-opacity="0.4"` is gone. Two places deciding
 * one colour (the token AND an opacity) is exactly the double-dimming the reuse
 * principle forbids: the muting belongs in the token, where high-contrast modes
 * can raise it, not in an opacity the cascade can't reach. In its own value the
 * axis line is decorative low-contrast scaffolding (2.58:1 on white) — permitted
 * for a non-text `aria-hidden` line, and promoted automatically under
 * `prefers-contrast: more`, where the token becomes `#000000` (light) or
 * `#808a9c` (dark, 5.20:1).
 *
 * `currentColor` is the unthemed fallback, deliberately heavier than the token:
 * it renders, and looking too heavy is the honest signal that no theme sheet is
 * loaded — the same choice `Gridlines` makes.
 */
const AXIS_STROKE = "var(--sp-color-axis, currentColor)";

/**
 * Axis tick-LABEL size. Labels stay `fill="currentColor"` (text strength, never
 * the muted axis token, which at 2.58:1 would fail as text) — only their size is
 * tokenised. `--sp-font-sm` already resolves to 11px, so this is a pure
 * token-consumption fix with no visual change, and the `11px` fallback keeps an
 * unthemed axis identical to before.
 */
const AXIS_FONT_SIZE = "var(--sp-font-sm, 11px)";

export interface AxisProps {
  /**
   * The scale to draw an axis for — continuous (linear/time) or a band scale
   * for categorical axes.
   *
   * A d3 scale is itself a FUNCTION, so storing one in a signal and updating it
   * with `setScale(next)` hits Solid's updater overload — the scale is called as
   * `(prev) => next` instead of being stored. Wrap it: `setScale(() => next)`.
   * The failure is silent at the call site and surfaces later inside tick
   * computation.
   */
  scale: AxisScale;
  /** Which edge the axis sits on. Default: "bottom". */
  orientation?: AxisOrientation;
  /** Desired tick count (a hint). Ignored for band scales — every band is a tick. */
  tickCount?: number;
  /** Target px spacing between ticks when `tickCount` is omitted. Ignored for band scales. */
  pixelsPerTick?: number;
  /**
   * Explicit tick-label formatter. The value kind follows the scale: a
   * `(number) => string` for a linear axis, `(Date) => string` for time,
   * `(string) => string` for a band axis. Omit it and each scale kind's default
   * labelling applies. Unlike `tickCount`/`pixelsPerTick`, formatting changes
   * only the LABEL, never a tick's POSITION, so an axis can carry a formatter
   * without disagreeing with gridlines drawn from the same scale.
   */
  format?: TickFormat;
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
    resolveTicks(props.scale, {
      count: props.tickCount,
      pixelsPerTick: props.pixelsPerTick,
      format: props.format,
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
      // "top" and "left" both sit at the origin, as does anything unforeseen.
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
    // Hiding the axis from assistive tech is deliberate, and CONDITIONAL on the
    // information surviving elsewhere. ADR-0005 §1 is explicit: hiding the axes
    // is only defensible once their domain, range, and units live in the
    // chart's description or its semantic data alternative. Left to itself an
    // aria-hidden axis relocates that information nowhere, which is a worse
    // outcome than a noisy tick list.
    //
    // What makes it defensible here is `createChartSemantics`: an informative
    // chart with no `desc`, `summary`, `table`, or `describedBy` raises a
    // `missing-description` issue — a dev-build warning and a production
    // diagnostic. So the axis is hidden because its content is carried, and the
    // case where it is not carried is reported rather than silently accepted.
    //
    // Separately, a bare <g> has no tabindex and is not focusable, so the lint
    // rule's own premise does not hold here.
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a <g> with no tabindex is not focusable
    <g class={props.class} data-silkplot-axis={orientation()} aria-hidden="true">
      <path d={domainPath()} fill="none" stroke={AXIS_STROKE} />
      <For each={ticks()}>
        {(tick) => {
          if (isHorizontal()) {
            const dir = orientation() === "bottom" ? 1 : -1;
            const labelY = orientation() === "bottom" ? tickSize() + 12 : -(tickSize() + 4);
            return (
              <g transform={`translate(${tick.position},${axisOffset()})`}>
                <line y2={dir * tickSize()} stroke={AXIS_STROKE} />
                <text
                  y={labelY}
                  text-anchor="middle"
                  fill="currentColor"
                  font-size={AXIS_FONT_SIZE}
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
              <line x2={dir * tickSize()} stroke={AXIS_STROKE} />
              <text
                x={labelX}
                dy="0.32em"
                text-anchor={anchor}
                fill="currentColor"
                font-size={AXIS_FONT_SIZE}
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
