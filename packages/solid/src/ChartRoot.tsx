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
  DEFAULT_MARGINS,
  resolveBounds,
  type Margins,
} from "./context";
import { createResize } from "./createResize";

export interface ChartRootProps {
  /** Fixed width in px. When omitted, the container is measured. */
  width?: number;
  /** Fixed height in px. When omitted, the container is measured. */
  height?: number;
  /** Insets for axes and labels. Partial values merge over the defaults. */
  margins?: Partial<Margins>;
  /** Extra style applied to the container element. */
  style?: JSX.CSSProperties;
  class?: string;
  children?: JSX.Element;
}

export const ChartRoot: ParentComponent<ChartRootProps> = (props) => {
  const { size, setTarget } = createResize();

  const margins = createMemo<Margins>(() => ({
    ...DEFAULT_MARGINS,
    ...(props.margins ?? {}),
  }));

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
