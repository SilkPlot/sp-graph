/**
 * Dashboard time state — the shared selection every member chart follows.
 *
 * This is the reactive half of ADR-0007: the model in `@silkplot/core` decides
 * what an effective domain IS, and this decides who gets to see it. A chart
 * joins by being rendered inside a `<Dashboard>`, so there is no registration
 * call an application can forget and no member list to keep in step with the
 * tree — the tree IS the list.
 *
 * `useDashboardTime()` returns `undefined` outside a dashboard rather than
 * throwing, which is what keeps the feature additive: a chart rendered on its own
 * behaves exactly as it did before this existed. That is deliberately the
 * opposite choice from `useChartBounds()`, which throws — a chart outside a
 * `<ChartRoot>` is a mistake, whereas a chart outside a dashboard is the ordinary
 * case.
 */
import { createContext, createMemo, useContext, type Accessor } from "solid-js";
import {
  resolveEffectiveDomain,
  type EffectiveDomain,
  type GlobalRange,
  type SectionScope,
  type TimeScopeIssue,
} from "@silkplot/core";

/** A selected interval, in epoch milliseconds. */
export interface TimeInterval {
  start: number;
  end: number;
}

/** What a member reads from the dashboard it is rendered inside. */
export interface DashboardTime {
  /** The dashboard's outer bound — ADR-0007's global range. */
  global: Accessor<GlobalRange>;
  /**
   * Resolve the effective domain for one member.
   *
   * Takes the member's own section scope, so the same dashboard state answers
   * differently for an isolated section than for a plain member. Nothing
   * supplies a section yet, so every member currently resolves against the
   * global range; the parameter exists because the resolution belongs here
   * rather than being re-derived inside each section later.
   */
  resolve: (section?: SectionScope) => EffectiveDomain;
  /** Replace the selected range. */
  setRange: (interval: TimeInterval) => void;
}

export const DashboardTimeContext = createContext<DashboardTime>();

/**
 * Read the dashboard a chart is rendered inside, or `undefined` when there is
 * none.
 *
 * The `undefined` is the whole additive-ness of this feature and is not an
 * oversight — see the module comment.
 */
export function useDashboardTime(): DashboardTime | undefined {
  return useContext(DashboardTimeContext);
}

export interface DashboardTimeSpec {
  /** The current selection, as an accessor so members track replacements. */
  interval: Accessor<TimeInterval>;
  /** Commit a new selection. */
  setInterval: (interval: TimeInterval) => void;
  /** Diagnostic hook for a contract violation reaching the model. */
  onIssue?: (issue: TimeScopeIssue) => void;
}

/**
 * Build the dashboard's time state.
 *
 * Separated from the component so the resolution is testable without a rendered
 * tree, and so a controlled/uncontrolled variant does not have to fork the
 * component.
 */
export function createDashboardTime(spec: DashboardTimeSpec): DashboardTime {
  const global = createMemo<GlobalRange>(() => {
    const { start, end } = spec.interval();
    return { scope: "global", start, end };
  });

  return {
    global,
    resolve: (section) =>
      resolveEffectiveDomain(
        { global: global(), section },
        {
          // Never throw from render. The control layer refuses to commit an
          // inverted range — ADR-0007 §5 puts that normalisation at the input
          // boundary — so reaching here with one means an application drove the
          // dashboard directly. That is worth reporting, not worth taking the
          // page down mid-render, where a throw would take every sibling chart
          // with it and hide which one was misconfigured.
          strict: false,
          onIssue: (issue) => spec.onIssue?.(issue),
        },
      ),
    setRange: (interval) => spec.setInterval(interval),
  };
}
