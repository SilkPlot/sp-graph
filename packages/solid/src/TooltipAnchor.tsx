/**
 * TooltipAnchor — positions caller-supplied content over the chart.
 *
 * HTML, not SVG, and a sibling of `SvgLayer` rather than a child: tooltips are
 * text, and wrapping, selection and layout all work in HTML and are painful in
 * SVG. It works without new structure because `ChartRoot` is already
 * `position: relative`.
 *
 * It owns two things the caller must not re-derive, because a cursor and a
 * tooltip given the same point have to land on the same pixel:
 *   - the inner → container coordinate conversion (adding the margins), and
 *   - clamping to the container, so a tooltip near an edge stays on screen.
 *
 * The content is entirely the caller's. See
 * docs/decisions/adr-0002-crosshair-and-tooltip-anchor.md.
 */
import { createMemo, type Component, type JSX } from "solid-js";
import { useChartBounds } from "./context";
import { createResize } from "./createResize";

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

export interface TooltipAnchorProps {
  /** Inner-x of the point being described. */
  x: number;
  /** Inner-y of the point being described. */
  y: number;
  /** Gap in px between the point and the content. Default: 8. */
  offset?: number;
  class?: string;
  children?: JSX.Element;
}

export const TooltipAnchor: Component<TooltipAnchorProps> = (props) => {
  const bounds = useChartBounds();
  // Its own size is measured, not read per pointer event: `getBoundingClientRect`
  // on every move forces a synchronous layout. A ResizeObserver reports the size
  // when the CONTENT changes, which is the only time it can change.
  const { size, setTarget } = createResize();

  const position = createMemo(() => {
    const b = bounds();
    const { width: w, height: h } = size();
    const offset = props.offset ?? 8;

    // Inner → container space. The caller passes the same coordinates it gives
    // the crosshair; exactly one of the two adds the margins, and it is this.
    const anchorX = b.margins.left + props.x;
    const anchorY = b.margins.top + props.y;

    // Centred above the point by default; flipped below when there is no room,
    // which matters most for the topmost datum — the one a user reaches for.
    const preferredTop = anchorY - h - offset;
    const top = preferredTop < 0 ? anchorY + offset : preferredTop;

    return {
      left: clamp(anchorX - w / 2, 0, b.width - w),
      top: clamp(top, 0, b.height - h),
    };
  });

  return (
    <div
      ref={setTarget}
      class={props.class}
      data-silkplot-tooltip
      // Hidden from assistive tech on purpose: it is a visual duplicate of what
      // the live announcement carries. A tooltip that were itself announced
      // would fire on every pointer move.
      aria-hidden="true"
      style={{
        position: "absolute",
        left: `${position().left}px`,
        top: `${position().top}px`,
        // Without this the tooltip sits under the cursor, swallows the very
        // pointer events that positioned it, and flickers.
        "pointer-events": "none",
      }}
    >
      {props.children}
    </div>
  );
};
