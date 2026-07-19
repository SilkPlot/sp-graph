/**
 * DashboardSection — a part of a dashboard looking at something narrower than
 * the rest.
 *
 * Three scopes, exactly one per section:
 *
 *   - `window` — an explicit interval;
 *   - `last` — a rolling duration, anchored at the end of the global range
 *     unless a `now` is supplied;
 *   - `latest` — only the most recent reading, which is a value rather than a
 *     range and resolves as one (ADR-0007 §4).
 *
 * ## It renders an element, unlike `<Dashboard>`
 *
 * The dashboard owns time and not placement, so it renders nothing. A section is
 * different: it makes a CLAIM about what its contents are showing, and a claim
 * has to be visible or the dashboard silently lies about what is being compared.
 * Two charts side by side over different ranges look exactly like two charts
 * over the same one.
 *
 * So a section is a labelled `<section>` whose scope is stated in text — visible
 * to a sighted reader, reachable by a screen reader, and part of the accessible
 * name of the region rather than a caption a reader has to correlate by
 * position. What it does NOT do is lay its children out; that is still the
 * application's.
 */
import { createMemo, type JSX, type ParentComponent } from "solid-js";
import type { SectionScope } from "@silkplot/core";
import { DashboardSectionContext, rollingWindow } from "./dashboard-section";
import { useDashboardTime } from "./dashboard-time";

interface SectionCommon {
  /**
   * What this section is, in the application's words: "Last five minutes",
   * "Current reading". Required, because an unlabelled section is the silent
   * lie this component exists to prevent.
   */
  label: string;
  /** Additional description of the scope, rendered beside the label. */
  scopeNote?: string;
  class?: string;
  children?: JSX.Element;
}

export type DashboardSectionProps = SectionCommon &
  (
    | { window: { start: number; end: number }; last?: never; latest?: never; now?: never }
    | { window?: never; last: number; latest?: never; now?: number }
    | { window?: never; last?: never; latest: true; now?: never }
  );

export const DashboardSection: ParentComponent<DashboardSectionProps> = (props) => {
  const dashboard = useDashboardTime();
  if (!dashboard) {
    throw new Error(
      "[@silkplot/solid] <DashboardSection> must be rendered inside a <Dashboard>. " +
        "A section narrows within a global range; without one there is nothing to narrow.",
    );
  }
  const time = dashboard;

  const scope = createMemo<SectionScope>(() => {
    if (props.latest === true) return { scope: "section-latest" };
    if (props.window !== undefined) {
      return { scope: "section-window", start: props.window.start, end: props.window.end };
    }
    // The rolling case. Anchored at the global range's end by default so "the
    // last five minutes" means the last five minutes of what the dashboard is
    // showing, rather than silently jumping to the present.
    return rollingWindow(props.last as number, props.now ?? time.global().end);
  });

  /**
   * The scope, said out loud.
   *
   * Rendered rather than inferred: a reader comparing two sections cannot see
   * that one of them is narrower, and neither can a screen reader.
   */
  const scopeText = (): string => {
    if (props.scopeNote !== undefined) return props.scopeNote;
    if (props.latest === true) return "Most recent reading only";
    return "Narrowed within the selected range";
  };

  return (
    <DashboardSectionContext.Provider value={scope}>
      <section class={props.class} aria-label={`${props.label}. ${scopeText()}`} data-silkplot-section="">
        <p data-silkplot-section-scope="">
          <strong>{props.label}</strong> — {scopeText()}
        </p>
        {props.children}
      </section>
    </DashboardSectionContext.Provider>
  );
};
