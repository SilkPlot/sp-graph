/**
 * SvgLayer — an `<svg>` sized to the chart bounds with an inner `<g>` translated
 * by the margins, so children draw in inner-area coordinates (origin at the
 * top-left of the plotting region).
 *
 * Pure Solid rendering. No d3-selection anywhere — Solid owns this subtree.
 */
import type { JSX, ParentComponent } from "solid-js";
import { useChartBounds } from "./context";

export interface SvgLayerProps {
  /** Accessible role for the graphic. Default: "img". */
  role?: JSX.AriaAttributes["role"];
  /** Accessible name for screen readers (rendered as <title>). */
  title?: string;
  /** Longer accessible description (rendered as <desc>). */
  desc?: string;
  class?: string;
  children?: JSX.Element;
}

export const SvgLayer: ParentComponent<SvgLayerProps> = (props) => {
  const bounds = useChartBounds();

  return (
    // The rule wants a static <title> child. This primitive takes the
    // accessible name as a `title` prop and renders it conditionally below,
    // which the rule cannot see. Whether the composed charts actually pass one
    // is a separate and real question; the rule is not evidence either way.
    // biome-ignore lint/a11y/noSvgWithoutTitle: <title> is rendered from the `title` prop below
    <svg
      width={bounds().width}
      height={bounds().height}
      viewBox={`0 0 ${bounds().width} ${bounds().height}`}
      role={props.role ?? "img"}
      class={props.class}
      style={{ display: "block", overflow: "visible" }}
    >
      {props.title ? <title>{props.title}</title> : null}
      {props.desc ? <desc>{props.desc}</desc> : null}
      <g transform={`translate(${bounds().margins.left},${bounds().margins.top})`}>
        {props.children}
      </g>
    </svg>
  );
};
