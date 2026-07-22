/**
 * Dashboard — the shared time scope several charts render against.
 *
 * It renders NO element of its own. That is a decision, not an omission: the
 * dashboard owns time, not placement. A wrapper here would start answering
 * layout questions — grid, gap, responsive columns — that belong to the
 * application, and every one of them would be a default somebody has to fight.
 * Wrap it in whatever layout you already have.
 *
 * Controlled and uncontrolled both work. Pass `range` and the application owns
 * the selection; omit it and the dashboard keeps its own, seeded from
 * `defaultRange`. `onRangeChange` fires either way, so a controlled parent and a
 * persistence layer see the same events.
 */
import { createMemo, createSignal, type JSX, type ParentComponent } from "solid-js";
import type { TimeScopeIssue } from "@silkplot/core";
import {
  DashboardTimeContext,
  createDashboardTime,
  type TimeInterval,
} from "./dashboard-time";
import { ChartAnnouncer } from "./ChartAnnouncer";

export interface DashboardProps {
  /**
   * The selected range, as a pair of `Date`s (ADR-0017 §2). Supply it to control
   * the dashboard from application state; omit it to let the dashboard hold its
   * own.
   */
  range?: TimeInterval;
  /** Initial selection when `range` is not supplied. */
  defaultRange: TimeInterval;
  /** Called whenever a new range is committed, controlled or not. */
  onRangeChange?: (range: TimeInterval) => void;
  /**
   * Diagnostic hook for a contract violation reaching the time model — an
   * inverted range driven straight into `range`, bypassing the control that
   * would have refused it.
   */
  onIssue?: (issue: TimeScopeIssue) => void;
  /**
   * The wording announced once when a drag or keyboard selection SETTLES the
   * shared dynamic selection (dashboard-linked selection). Receives the new range (`undefined` when
   * cleared back to the global range). Default: an ISO range, which is honest but
   * generic — supply domain wording. The announcer coalesces and de-duplicates, so
   * it speaks once per settled selection, not per pointer move.
   */
  announceSelection?: (range: TimeInterval | undefined) => string;
  children?: JSX.Element;
}

export const Dashboard: ParentComponent<DashboardProps> = (props) => {
  const [uncontrolled, setUncontrolled] = createSignal<TimeInterval>(props.defaultRange);

  // Read through `props` on every call rather than capturing once, so a
  // controlled parent replacing `range` moves every member. Capturing here is
  // the same mistake `CartesianModelSpec.data` exists to prevent (ADR-0003).
  const interval = createMemo<TimeInterval>(() => props.range ?? uncontrolled());

  const time = createDashboardTime({
    interval,
    setInterval: (next) => {
      // The internal signal is written even when controlled. If it were not, a
      // parent that renders `range` but forgets `onRangeChange` would show a
      // control that moves and charts that do not — and the uncontrolled value
      // is ignored by `interval` while `props.range` is present anyway, so
      // writing it costs nothing and removes a whole class of half-wired parent.
      setUncontrolled(next);
      props.onRangeChange?.(next);
    },
    onIssue: (issue) => props.onIssue?.(issue),
  });

  // The settled-selection announcement. `dynamic()` changes once per settled
  // selection — a brush commits on release, a keyboard step on the press — so the
  // live region speaks once, not per pointer move. Empty when there is no dynamic
  // selection, which clears the region rather than removing it.
  const selectionMessage = createMemo<string>(() => {
    const d = time.dynamic();
    const range = d ? { start: new Date(d.start), end: new Date(d.end) } : undefined;
    if (props.announceSelection) return props.announceSelection(range);
    return range === undefined
      ? ""
      : `Selected ${range.start.toISOString()} to ${range.end.toISOString()}`;
  });

  return (
    <DashboardTimeContext.Provider value={time}>
      {props.children}
      <ChartAnnouncer channel="selection" message={selectionMessage()} />
    </DashboardTimeContext.Provider>
  );
};
