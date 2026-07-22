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
import { createContext, createMemo, createSignal, useContext, type Accessor } from "solid-js";
import {
  resolveEffectiveDomain,
  type DynamicSelection,
  type EffectiveDomain,
  type GlobalRange,
  type SectionScope,
  type TimeInterval,
  type TimeScopeIssue,
} from "@silkplot/core";

// The public interval is `Date`-based and defined once, in `@silkplot/core`
// (ADR-0017 §2). It is re-exported here so `@silkplot/solid`'s existing
// consumers keep importing `TimeInterval` from this module unchanged, while
// there is exactly one definition. The dashboard's own arithmetic — feeding
// `resolveEffectiveDomain` — is epoch-ms, so the `Date`→ms conversion happens at
// this boundary and nowhere deeper (ADR-0017 §3, §4).
export type { TimeInterval };

/** What a member reads from the dashboard it is rendered inside. */
export interface DashboardTime {
  /** The dashboard's outer bound — ADR-0007's global range. */
  global: Accessor<GlobalRange>;
  /**
   * The shared DYNAMIC SELECTION — the range a drag on one chart sets, which
   * every unsectioned member follows (ADR-0007's precedence: section > dynamic >
   * global). `undefined` until something drags; a section with its own scope
   * ignores it (dashboard-linked selection).
   */
  dynamic: Accessor<DynamicSelection | undefined>;
  /**
   * Resolve the effective domain for one member, given its section scope. A
   * sectioned member resolves against its section (isolated from the dynamic
   * selection); an unsectioned member follows the dynamic selection, falling back
   * to the global range.
   */
  resolve: (section?: SectionScope) => EffectiveDomain;
  /** Replace the selected global range. Clears the dynamic selection — a fresh
   *  outer range starts from the whole of it, not a stale drag inside the old one. */
  setRange: (interval: TimeInterval) => void;
  /** Set (or, with `undefined`, clear) the shared dynamic selection — the drag
   *  route, and the keyboard route through a member's viewport (dashboard-linked selection). */
  setDynamic: (interval: TimeInterval | undefined) => void;
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
    // The one `Date`→epoch-ms crossing on the dashboard path (ADR-0017 §3): the
    // selection is a `Date` interval at the prop boundary, and the precedence
    // model below it is epoch-ms throughout.
    const { start, end } = spec.interval();
    return { scope: "global", start: start.getTime(), end: end.getTime() };
  });

  // The dynamic selection is dashboard-owned state (not a prop): a drag is a
  // transient view choice, distinct from the global range an application persists.
  const [dynamic, setDynamicRaw] = createSignal<DynamicSelection | undefined>();

  return {
    global,
    dynamic,
    resolve: (section) =>
      resolveEffectiveDomain(
        { global: global(), dynamic: dynamic(), section },
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
    setRange: (interval) => {
      // A new outer range starts fresh: the old drag selection lived inside the
      // previous range and would clamp to a stale sliver of the new one.
      setDynamicRaw(undefined);
      spec.setInterval(interval);
    },
    setDynamic: (interval) =>
      setDynamicRaw(
        interval === undefined
          ? undefined
          : { scope: "dynamic", start: interval.start.getTime(), end: interval.end.getTime() },
      ),
  };
}
