/**
 * ChartRoot — the responsive container every chart mounts inside.
 *
 * Measures its own box with `createResize` (ResizeObserver in onMount, SSR-safe)
 * and provides reactive `ChartBounds` via context. Children read those bounds
 * with `useChartBounds()`. Width/height may also be supplied explicitly to opt
 * out of measurement.
 */
import { createMemo } from "solid-js";
import type { JSX, ParentComponent } from "solid-js";
import {
  ChartBoundsContext,
  resolveBounds,
  resolveMargins,
  type Margins,
} from "./context";
import { createResize } from "./createResize";

/**
 * Extra inset reserved beyond the caller/default margins. A floor per edge
 * (`Math.max` with the merged defaults). The function form runs after the
 * outer size is known, so a measured chart can reserve from its inner width
 * without a second layout pass owned by one chart family.
 */
export type MarginReservation =
  | Partial<Margins>
  | ((inner: { width: number; height: number }) => Partial<Margins> | undefined);

export interface ChartRootProps {
  /** Fixed width in px. When omitted, the container is measured. */
  width?: number;
  /** Fixed height in px. When omitted, the container is measured. */
  height?: number;
  /** Insets for axes and labels. Partial values merge over the defaults. */
  margins?: Partial<Margins>;
  /**
   * Extra room a chart must keep — rotated category labels, or an opted-in
   * measured left for horizontal category labels.
   * Applied through `resolveMargins`, the same path every chart already uses.
   */
  reserved?: MarginReservation;
  /** Extra style applied to the container element. */
  style?: JSX.CSSProperties;
  class?: string;
  children?: JSX.Element;
}

export const ChartRoot: ParentComponent<ChartRootProps> = (props) => {
  const { size, setTarget } = createResize();

  const margins = createMemo<Margins>(() => {
    const measured = size();
    const width = props.width ?? measured.width;
    const height = props.height ?? measured.height;
    const base = resolveMargins(props.margins);
    const inner = {
      width: Math.max(0, width - base.left - base.right),
      height: Math.max(0, height - base.top - base.bottom),
    };
    const reserved =
      typeof props.reserved === "function" ? props.reserved(inner) : props.reserved;
    return resolveMargins(props.margins, reserved);
  });

  const bounds = createMemo(() => {
    const measured = size();
    const width = props.width ?? measured.width;
    const height = props.height ?? measured.height;
    return resolveBounds(width, height, margins());
  });

  const containerStyle = createMemo<JSX.CSSProperties>(() => ({
    position: "relative",
    width: props.width !== undefined ? `${props.width}px` : "100%",
    height: props.height !== undefined ? `${props.height}px` : "100%",
    // Bind chart chrome to the default theme tokens (ADR-0001). Fallbacks are
    // the light `:root` values so an unthemed page still gets the default
    // surface rather than the user-agent colour.
    color: "var(--sp-color-text, #16181d)",
    background: "var(--sp-color-surface, #ffffff)",
    ...props.style,
  }));

  return (
    <div ref={setTarget} class={props.class} style={containerStyle()}>
      <ChartBoundsContext.Provider value={bounds}>
        {props.children}
      </ChartBoundsContext.Provider>
    </div>
  );
};
