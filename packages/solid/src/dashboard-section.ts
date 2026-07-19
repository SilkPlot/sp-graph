/**
 * Section scope — the third of ADR-0007's three scopes, as context.
 *
 * A section is how a dashboard says "this part is looking at something narrower
 * than the rest". Charts join it exactly as they join the dashboard: by being
 * rendered inside it. There is no registration and no member list, so a section
 * cannot fall out of step with the tree it describes.
 *
 * `useDashboardSection()` returns `undefined` outside a section, and a chart in
 * that position resolves against the global range alone — which is what makes a
 * section additive rather than a mode the whole dashboard has to know about.
 */
import { createContext, useContext, type Accessor } from "solid-js";
import type { SectionScope } from "@silkplot/core";

/** Carries an accessor so a section whose scope moves re-resolves its members. */
export const DashboardSectionContext = createContext<Accessor<SectionScope>>();

/** The scope of the section a chart is rendered inside, or `undefined`. */
export function useDashboardSection(): Accessor<SectionScope> | undefined {
  return useContext(DashboardSectionContext);
}

/**
 * Resolve a rolling duration to an interval, anchored at the end of the range it
 * sits inside.
 *
 * ADR-0007 §6 keeps the resolver free of the clock, so a rolling window cannot
 * be a scope kind the model understands — it would have to read "now" to mean
 * anything. It is derived HERE instead, before resolution, and the model still
 * sees an ordinary interval.
 *
 * The anchor defaults to the global range's end rather than the wall clock, and
 * that is the useful default rather than a compromise: it makes "the last five
 * minutes" mean the last five minutes OF WHAT THE DASHBOARD IS SHOWING, so the
 * section stays inside the selection a reader made instead of quietly jumping to
 * the present. A live dashboard passes its own `now` and gets the other reading.
 */
export function rollingWindow(
  duration: number,
  anchor: number,
): { readonly scope: "section-window"; readonly start: number; readonly end: number } {
  return { scope: "section-window", start: anchor - duration, end: anchor };
}
