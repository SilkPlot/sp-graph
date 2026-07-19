/**
 * Dashboard time state — the paths a composed-chart suite cannot reach.
 *
 * The chart-level behaviour (one range driving several members, narrowing,
 * empty members) is proved in the charts package against real charts. What is
 * left here is the state layer's own contract: the control's refusal to exist
 * without a dashboard, the start input as against the end one, and the
 * diagnostic path an application takes when it drives an invalid range straight
 * into the dashboard, bypassing the control that would have refused it.
 *
 * That last one is the interesting case. ADR-0007 §5 makes an inverted range a
 * caller bug, and `<Dashboard>` deliberately does NOT throw on one: a throw
 * during render takes every sibling chart down with it and hides which member
 * was misconfigured. So it resolves empty and reports — and "reports" is a
 * promise that needs a test, because a diagnostic nobody receives is the same as
 * no diagnostic.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { Dashboard, DashboardTimeControl, useDashboardTime } from "../src/index";
import type { TimeInterval } from "../src/index";
import type { TimeScopeIssue } from "@silkplot/core";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 2, 1);

/** Build a `datetime-local` value the way the control does — in the local zone. */
function localValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

describe("DashboardTimeControl — outside a dashboard", () => {
  it("throws rather than rendering a form that drives nothing", () => {
    // Loud, not silent. A control with no dashboard behind it looks entirely
    // functional and changes nothing when used, which is the worst of both.
    expect(() => render(() => <DashboardTimeControl />)).toThrow(
      /must be rendered inside a <Dashboard>/,
    );
  });
});

describe("DashboardTimeControl — the start input", () => {
  it("commits a valid start edit, moving the range's near end", () => {
    let seen: TimeInterval | undefined;
    const { container } = render(() => (
      <Dashboard
        defaultRange={{ start: T0, end: T0 + 10 * DAY }}
        onRangeChange={(range) => {
          seen = range;
        }}
      >
        <DashboardTimeControl />
      </Dashboard>
    ));

    const start = container.querySelectorAll("input")[0] as HTMLInputElement;
    start.value = localValue(T0 + 3 * DAY);
    start.dispatchEvent(new Event("input", { bubbles: true }));

    expect(seen?.start).toBe(T0 + 3 * DAY);
    expect(seen?.end).toBe(T0 + 10 * DAY);
    expect(container.querySelector("[data-silkplot-range-error]")).toBeNull();
  });

  it("refuses a start after the end, and reports it", () => {
    let seen: TimeInterval | undefined;
    const { container } = render(() => (
      <Dashboard
        defaultRange={{ start: T0, end: T0 + 2 * DAY }}
        onRangeChange={(range) => {
          seen = range;
        }}
      >
        <DashboardTimeControl />
      </Dashboard>
    ));

    const start = container.querySelectorAll("input")[0] as HTMLInputElement;
    start.value = localValue(T0 + 9 * DAY);
    start.dispatchEvent(new Event("input", { bubbles: true }));

    // Held as a draft, never committed — the symmetric case to the end input.
    expect(seen).toBeUndefined();
    expect(container.querySelector("[data-silkplot-range-error]")).not.toBeNull();
    expect(start.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("Dashboard — an application driving an invalid range directly", () => {
  it("reports the violation and resolves empty instead of throwing mid-render", () => {
    const issues: TimeScopeIssue[] = [];
    let domainKind: string | undefined;

    /** A member that reports what the dashboard resolved for it. */
    function Probe() {
      const time = useDashboardTime();
      domainKind = time?.resolve().kind;
      return <div data-probe="">{domainKind}</div>;
    }

    // `range` is controlled and inverted — end before start. This bypasses the
    // control entirely, which is exactly the case the diagnostic exists for.
    const { container } = render(() => (
      <Dashboard
        defaultRange={{ start: T0, end: T0 + DAY }}
        range={{ start: T0 + 5 * DAY, end: T0 + DAY }}
        onIssue={(issue) => issues.push(issue)}
      >
        <Probe />
      </Dashboard>
    ));

    // Rendered rather than exploded: a sibling chart would still be on screen.
    expect(container.querySelector("[data-probe]")).not.toBeNull();
    expect(domainKind).toBe("empty");

    // And the application was told. Reaching `empty` without a diagnostic would
    // be indistinguishable from a legitimately disjoint selection.
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("inverted-range");
  });
});

describe("Dashboard — controlled and uncontrolled", () => {
  it("lets a controlled parent replace the range, ignoring the internal value", () => {
    const [range, setRange] = createSignal<TimeInterval>({ start: T0, end: T0 + DAY });

    /**
     * The resolution is read INTO THE DOM rather than into a captured variable.
     * A component body runs once; assigning from it would freeze the first value
     * and the second assertion would fail against correct code. Rendering the
     * expression is what puts the read in a tracking scope — the same property
     * the charts rely on to follow a range change.
     */
    function Probe() {
      const time = useDashboardTime();
      return (
        <div data-probe="">
          {(() => {
            const domain = time?.resolve();
            return domain?.kind === "range" ? `${domain.start}-${domain.end}` : "";
          })()}
        </div>
      );
    }

    const { container } = render(() => (
      <Dashboard defaultRange={{ start: 0, end: 1 }} range={range()}>
        <Probe />
      </Dashboard>
    ));
    const probe = () => container.querySelector("[data-probe]")?.textContent;

    // `defaultRange` is deliberately absurd here: if it leaked through, this
    // would read "0-1" rather than the controlled values.
    expect(probe()).toBe(`${T0}-${T0 + DAY}`);

    setRange({ start: T0 + 2 * DAY, end: T0 + 4 * DAY });
    expect(probe()).toBe(`${T0 + 2 * DAY}-${T0 + 4 * DAY}`);
  });
});
