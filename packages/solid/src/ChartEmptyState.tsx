/**
 * ChartEmptyState — "there is nothing here", said out loud.
 *
 * A chart whose data falls entirely outside the selected range must not render
 * as a blank box. Blank is indistinguishable from broken: the reader cannot tell
 * whether the selection excluded everything, the fetch failed, or the component
 * crashed, and a non-visual reader gets nothing at all.
 *
 * So the empty case is a STATED result. It draws a centred message inside the
 * plotting area and mirrors it through a polite live region, because a range
 * change is a state change the user committed to — exactly the kind ADR-0005 §4
 * says to announce, as against the transient hover it says not to.
 *
 * The announcement is de-duplicated and throttled by `ChartAnnouncer`, so a
 * member that is already empty and stays empty across a further range change
 * does not repeat itself.
 */
import { Show, type Component } from "solid-js";
import { ChartAnnouncer } from "./ChartAnnouncer";
import { useChartBounds } from "./context";

export interface ChartEmptyStateProps {
  /** Render the empty state. */
  when: boolean;
  /**
   * The wording. Default is honest but generic; the application knows what its
   * data is called and should say so — the same library/application split
   * ADR-0005 §6 draws for every other piece of chart wording.
   */
  message?: string;
  /**
   * Announce through a polite live region as well as drawing. Default true. Set
   * false where the surrounding surface already announces the change once for a
   * group, so several members do not each say the same thing.
   */
  announce?: boolean;
}

export const DEFAULT_EMPTY_MESSAGE = "No data in the selected range";

/**
 * The drawn half. Rendered INSIDE the svg, so it must be `<text>` rather than
 * HTML, and it is positioned from the measured bounds rather than a percentage
 * because an svg `<text>` does not accept percentage positioning the way a div
 * would.
 */
export const ChartEmptyMark: Component<{ message: string }> = (props) => {
  const bounds = useChartBounds();
  return (
    <text
      x={bounds().margins.left + bounds().innerWidth / 2}
      y={bounds().margins.top + bounds().innerHeight / 2}
      text-anchor="middle"
      dominant-baseline="middle"
      // No `aria-hidden` here, and it is not an omission. `SvgLayer` renders
      // `role="img"`, which is a leaf in the accessibility tree — its subtree is
      // not exposed, so this text reaches assistive technology through the live
      // region below and nowhere else. Adding the attribute would restate what
      // the role already guarantees, and the linter is right to object to it.
      fill="var(--sp-color-axis, currentColor)"
      font-size="var(--sp-font-sm, 12px)"
      data-silkplot-empty=""
    >
      {props.message}
    </text>
  );
};

/** The announced half. Rendered OUTSIDE the svg, as a sibling of the chart. */
export const ChartEmptyState: Component<ChartEmptyStateProps> = (props) => (
  <Show when={props.when && (props.announce ?? true)}>
    <ChartAnnouncer message={props.message ?? DEFAULT_EMPTY_MESSAGE} />
  </Show>
);
