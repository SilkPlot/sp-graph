/**
 * SvgLayer — an `<svg>` sized to the chart bounds with an inner `<g>` translated
 * by the margins, so children draw in inner-area coordinates (origin at the
 * top-left of the plotting region).
 *
 * Pure Solid rendering. No d3-selection anywhere — Solid owns this subtree.
 *
 * This primitive carries the accessibility RELATIONSHIPS (ADR-0005) but does not
 * enforce the contract: it is the low-level layer, and a caller drawing a
 * genuinely decorative flourish should not have to argue with it. Enforcement
 * lives one level up, in `createChartSemantics`, which every composed chart
 * runs. `title`/`desc` remain accepted directly for that low-level use.
 */
import type { JSX, ParentComponent } from "solid-js";
import { useChartBounds } from "./context";

export interface SvgLayerProps {
  /** Accessible role for the graphic. Default: "img". */
  role?: JSX.AriaAttributes["role"];
  /** Accessible name for screen readers (rendered as <title>). */
  title?: string;
  /** Id applied to the rendered `<title>`, so `ariaLabelledBy` can point at it. */
  titleId?: string;
  /** Longer accessible description (rendered as <desc>). */
  desc?: string;
  /** Id applied to the rendered `<desc>`, so `ariaDescribedBy` can point at it. */
  descId?: string;
  /**
   * Remove the graphic from the accessibility tree entirely.
   *
   * Only correct when the same information is fully available elsewhere on the
   * page. Composed charts reach this exclusively through their explicit
   * `decorative` opt-out — never as a fallback when something is missing.
   */
  decorative?: boolean;
  /** Id reference for the accessible name. Preferred over relying on `<title>` alone. */
  ariaLabelledBy?: string;
  /** Id reference(s) for the accessible description, space-separated. */
  ariaDescribedBy?: string;
  /** Id reference for a structured alternative (a data table) related to this graphic. */
  ariaDetails?: string;
  class?: string;
  children?: JSX.Element;
}

export const SvgLayer: ParentComponent<SvgLayerProps> = (props) => {
  const bounds = useChartBounds();

  return (
    // The rule wants a static <title> child. This primitive takes the
    // accessible name as a `title` prop and renders it conditionally below,
    // which the rule cannot see. Whether the composed charts actually pass one
    // is a separate question, and it now has an answer: `createChartSemantics`
    // makes an unnamed informative chart a compile error and a dev-build throw.
    // biome-ignore lint/a11y/noSvgWithoutTitle: <title> is rendered from the `title` prop below
    <svg
      width={bounds().width}
      height={bounds().height}
      viewBox={`0 0 ${bounds().width} ${bounds().height}`}
      role={props.decorative ? "presentation" : (props.role ?? "img")}
      aria-hidden={props.decorative ? "true" : undefined}
      aria-labelledby={props.decorative ? undefined : props.ariaLabelledBy}
      aria-describedby={props.decorative ? undefined : props.ariaDescribedBy}
      aria-details={props.decorative ? undefined : props.ariaDetails}
      class={props.class}
      style={{ display: "block", overflow: "visible" }}
    >
      {props.title ? <title id={props.titleId}>{props.title}</title> : null}
      {props.desc ? <desc id={props.descId}>{props.desc}</desc> : null}
      <g transform={`translate(${bounds().margins.left},${bounds().margins.top})`}>
        {props.children}
      </g>
    </svg>
  );
};
