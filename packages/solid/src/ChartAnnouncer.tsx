/**
 * ChartAnnouncer — the live region that speaks the active datum.
 *
 * This is the accessible half of the cursor/tooltip pair. The tooltip is
 * `aria-hidden` and this carries the text, because a tooltip that were itself
 * a live region would re-announce on every pointer move and reduce a screen
 * reader to noise.
 *
 * `polite` rather than `assertive`: a hover is not an emergency, and assertive
 * would interrupt the reader mid-sentence on every move.
 *
 * It is visually hidden rather than `display: none` or `visibility: hidden` —
 * both of those remove the element from the accessibility tree, which is
 * exactly the thing that would make it silent while still looking correct in
 * the DOM.
 *
 * See docs/decisions/adr-0002-crosshair-and-tooltip-anchor.md.
 */
import type { Component, JSX } from "solid-js";

const VISUALLY_HIDDEN: JSX.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  "clip-path": "inset(50%)",
  "white-space": "nowrap",
  border: "0",
};

export interface ChartAnnouncerProps {
  /**
   * What to announce. Give the whole sentence a reader should hear — the
   * region is read as a unit, so "Mar 4, 42 units" beats a bare number.
   *
   * Empty or undefined announces nothing, which is the no-active-point state.
   */
  message?: string;
}

export const ChartAnnouncer: Component<ChartAnnouncerProps> = (props) => {
  return (
    <div
      data-silkplot-announcer
      role="status"
      aria-live="polite"
      style={VISUALLY_HIDDEN}
    >
      {props.message ?? ""}
    </div>
  );
};
