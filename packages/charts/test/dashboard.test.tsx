/**
 * The dashboard surface — one selection, several charts, one shared range.
 *
 * What makes this suite worth having is the failure it is shaped to catch.
 * Charts joining a dashboard by CONTEXT rather than by registration means the
 * wiring is invisible: nothing in an application's code says "this chart is a
 * member", so a broken provider does not raise, it just leaves every chart
 * quietly drawing its own extent again. That failure renders perfectly. So the
 * assertions below compare the members AGAINST EACH OTHER, not only against an
 * expected value — three charts drawing three different ranges is the signature,
 * and a suite that checked each chart alone against its own data would pass
 * straight through it.
 *
 * Each chart is given a DIFFERENT data span on purpose. If the context breaks
 * and they fall back to their own extents, their rendered domains diverge; if
 * they all had the same data, the broken and working cases would look identical.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import {
  ChartEmptyMark,
  ChartEmptyState,
  ChartRoot,
  Dashboard,
  DashboardTimeContext,
  DashboardTimeControl,
} from "@silkplot/solid";
import type { DashboardTime } from "@silkplot/solid";
import type { EffectiveDomain } from "@silkplot/core";
import { AreaChart, LineChart } from "../src/index";
import type { TimePoint } from "../src/index";

const DAY = 24 * 60 * 60 * 1000;
/** 2026-03-01T00:00:00Z, so every instant below is a readable offset from it. */
const T0 = Date.UTC(2026, 2, 1);

/** A series of `count` daily points starting `offsetDays` after T0. */
function series(offsetDays: number, count: number): TimePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(T0 + (offsetDays + i) * DAY),
    y: 10 + i * 3,
  }));
}

/** Every ISO timestamp the chart put in its own data table, in order. */
function tableTimestamps(container: Element): string[][] {
  return [...container.querySelectorAll("table")].map((table) =>
    [...table.querySelectorAll("tbody tr th:first-child")].map((cell) => cell.textContent ?? ""),
  );
}

/**
 * The X-axis tick labels each chart rendered, per chart.
 *
 * Scoped to `[data-silkplot-axis="bottom"]` rather than every `<text>` in the
 * svg, and that is load-bearing. The y axis is EXPECTED to differ between
 * members: y follows the visible data, so three members holding different values
 * legitimately carry different y labels. Comparing all text would fail on
 * correct behaviour — and, worse, would then be "fixed" by weakening the
 * assertion that catches the real defect.
 */
function xAxisLabels(container: Element): string[][] {
  return [...container.querySelectorAll("svg")].map((svg) =>
    [...svg.querySelectorAll('[data-silkplot-axis="bottom"] text')].map(
      (t) => t.textContent ?? "",
    ),
  );
}

/**
 * Three members spanning days 0-9, 5-14, and 20-29.
 *
 * The third is deliberately disjoint from a day 2-7 selection, so the same
 * fixture exercises both the shared-range case and the empty-member case without
 * a second tree.
 */
function ThreeMembers(props: { start: number; end: number }) {
  return (
    <Dashboard defaultRange={{ start: props.start, end: props.end }}>
      <LineChart
        title="Early"
        data={series(0, 10)}
        width={400}
        height={200}
        table={{ columns: ["Time", "Value"] }}
      />
      <LineChart
        title="Middle"
        data={series(5, 10)}
        width={400}
        height={200}
        table={{ columns: ["Time", "Value"] }}
      />
      <AreaChart
        title="Late"
        data={series(20, 10)}
        width={400}
        height={200}
        table={{ columns: ["Time", "Value"] }}
      />
    </Dashboard>
  );
}

describe("Dashboard — one selection drives every member", () => {
  it("renders all three members against the same range, not their own extents", () => {
    const { container } = render(() => (
      <ThreeMembers start={T0 + 2 * DAY} end={T0 + 7 * DAY} />
    ));

    const labels = xAxisLabels(container);
    expect(labels).toHaveLength(3);

    // THE assertion. Every member's axis carries the same labels because every
    // member is drawing the same domain. Were the context broken, each would
    // show its own span — days 0-9, 5-14, 20-29 — and these would differ.
    expect(labels[0]).toEqual(labels[1]);
    expect(labels[1]).toEqual(labels[2]);
    // Non-vacuous: an axis that rendered nothing would also "agree".
    expect(labels[0]!.length).toBeGreaterThan(0);
  });

  it("narrows each member's drawn data to the selected range", () => {
    const { container } = render(() => (
      <ThreeMembers start={T0 + 2 * DAY} end={T0 + 7 * DAY} />
    ));

    const [early, middle, late] = tableTimestamps(container);

    // Days 2-7 of a 0-9 series: six points.
    expect(early).toEqual([2, 3, 4, 5, 6, 7].map((d) => new Date(T0 + d * DAY).toISOString()));
    // Days 5-7 of a 5-14 series: three points.
    expect(middle).toEqual([5, 6, 7].map((d) => new Date(T0 + d * DAY).toISOString()));
    // A 20-29 series has nothing in a 2-7 window.
    expect(late).toEqual([]);
  });

  it("shows a stated, announced empty state for a member with no data in range", () => {
    const { container } = render(() => (
      <ThreeMembers start={T0 + 2 * DAY} end={T0 + 7 * DAY} />
    ));

    // Drawn: exactly one member is empty, and it says so rather than going blank.
    const marks = container.querySelectorAll("[data-silkplot-empty]");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("No data in the selected range");

    // Announced: a polite live region carries the same wording, so the state is
    // not visual-only. An empty chart and a broken one look identical without it.
    const live = [...container.querySelectorAll('[aria-live="polite"]')].map(
      (el) => el.textContent ?? "",
    );
    expect(live).toContain("No data in the selected range");
  });
});

describe("Dashboard — changing the range", () => {
  it("moves every member without remounting them", () => {
    const [range, setRange] = createSignal({ start: T0 + 2 * DAY, end: T0 + 7 * DAY });

    const { container } = render(() => (
      <Dashboard defaultRange={range()} range={range()}>
        <LineChart
          title="Early"
          data={series(0, 10)}
          width={400}
          height={200}
          table={{ columns: ["Time", "Value"] }}
        />
        <LineChart
          title="Middle"
          data={series(5, 10)}
          width={400}
          height={200}
          table={{ columns: ["Time", "Value"] }}
        />
      </Dashboard>
    ));

    // Identity captured BEFORE the change. Fine-grained reactivity should update
    // these nodes in place; a re-created tree would hand back different objects
    // and silently discard any internal state a chart was holding.
    const before = [...container.querySelectorAll("svg")];
    expect(before).toHaveLength(2);

    setRange({ start: T0 + 6 * DAY, end: T0 + 12 * DAY });

    const after = [...container.querySelectorAll("svg")];
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);

    // And the change actually took effect — otherwise "did not remount" would be
    // satisfied by a dashboard that did nothing at all.
    const [early, middle] = tableTimestamps(container);
    expect(early).toEqual([6, 7, 8, 9].map((d) => new Date(T0 + d * DAY).toISOString()));
    expect(middle).toEqual(
      [6, 7, 8, 9, 10, 11, 12].map((d) => new Date(T0 + d * DAY).toISOString()),
    );
  });
});

describe("Dashboard — a chart outside one is unaffected", () => {
  it("draws its own extent, with no empty state and no narrowing", () => {
    const { container } = render(() => (
      <LineChart
        title="Standalone"
        data={series(0, 10)}
        width={400}
        height={200}
        table={{ columns: ["Time", "Value"] }}
      />
    ));

    // All ten points, whatever any dashboard elsewhere might have selected.
    expect(tableTimestamps(container)[0]).toHaveLength(10);
    expect(container.querySelectorAll("[data-silkplot-empty]")).toHaveLength(0);
  });
});

/**
 * The two resolutions nothing produces YET.
 *
 * `latest` and `empty` are reachable from the precedence table the moment a
 * section supplies a scope, which is the next phase's work. Rather than ship the
 * chart's handling of them untested until then, the dashboard context is
 * provided directly with the resolution under test. That is a legitimate way to
 * test a consumer against a contract: the chart's job is to render what it is
 * handed, and what hands it over is a separate question.
 */
describe("A chart handed a resolution nothing supplies yet", () => {
  const provide = (domain: EffectiveDomain, data: TimePoint[]) => {
    const time: DashboardTime = {
      global: () => ({ scope: "global", start: T0, end: T0 + 30 * DAY }),
      resolve: () => domain,
      setRange: () => {},
    };
    return render(() => (
      <DashboardTimeContext.Provider value={time}>
        <LineChart
          title="Member"
          data={data}
          width={400}
          height={200}
          table={{ columns: ["Time", "Value"] }}
        />
      </DashboardTimeContext.Provider>
    ));
  };

  it("shows exactly the newest in-bounds datum for a latest-value resolution", () => {
    const { container } = provide(
      { kind: "latest", bounds: { start: T0 + 2 * DAY, end: T0 + 6 * DAY } },
      // Deliberately out of chronological order: the newest IN BOUNDS is day 6,
      // and picking "the last element" instead would wrongly return day 3.
      [
        { t: new Date(T0 + 4 * DAY), y: 1 },
        { t: new Date(T0 + 6 * DAY), y: 2 },
        { t: new Date(T0 + 9 * DAY), y: 3 },
        { t: new Date(T0 + 3 * DAY), y: 4 },
      ],
    );

    expect(tableTimestamps(container)[0]).toEqual([new Date(T0 + 6 * DAY).toISOString()]);
    // Day 9 is newer but out of bounds, so it is not shown — the bound is what
    // answers "what if the newest reading is outside the selection?".
    expect(container.querySelectorAll("[data-silkplot-empty]")).toHaveLength(0);
  });

  it("renders the empty state when latest-value finds nothing in bounds", () => {
    const { container } = provide(
      { kind: "latest", bounds: { start: T0 + 40 * DAY, end: T0 + 50 * DAY } },
      [{ t: new Date(T0), y: 1 }],
    );

    expect(tableTimestamps(container)[0]).toEqual([]);
    expect(container.querySelectorAll("[data-silkplot-empty]")).toHaveLength(1);
  });

  it("renders the empty state for an empty resolution, drawing no marks", () => {
    const { container } = provide({ kind: "empty", reason: "disjoint" }, [
      { t: new Date(T0), y: 1 },
      { t: new Date(T0 + DAY), y: 2 },
    ]);

    expect(tableTimestamps(container)[0]).toEqual([]);
    expect(container.querySelectorAll("[data-silkplot-empty]")).toHaveLength(1);
    // An `empty` resolution carries no interval of its own, so the x scale has
    // nothing to span. It must still produce a drawable chart rather than a
    // NaN-strewn one.
    for (const path of container.querySelectorAll("path")) {
      expect(path.getAttribute("d") ?? "").not.toContain("NaN");
    }
  });

  it("can suppress the announcement without suppressing the drawn message", () => {
    const time: DashboardTime = {
      global: () => ({ scope: "global", start: T0, end: T0 + DAY }),
      resolve: () => ({ kind: "empty", reason: "disjoint" }),
      setRange: () => {},
    };
    const { container } = render(() => (
      <DashboardTimeContext.Provider value={time}>
        <ChartRoot width={400} height={200}>
          {/*
            Named, even as a fixture. An unnamed `role="img"` is the exact
            failure ADR-0005 exists to prevent, and a test file is not a
            carve-out from it — the linter caught this and was right to.
          */}
          <svg role="img" aria-label="Empty state fixture">
            <ChartEmptyState when={true} announce={false} />
            <ChartEmptyMark message="Nothing here" />
          </svg>
        </ChartRoot>
      </DashboardTimeContext.Provider>
    ));

    // The drawn half stays; the live region does not, so a group that announces
    // once for several members is not forced to repeat itself per chart.
    expect(container.querySelector("[data-silkplot-empty]")?.textContent).toBe("Nothing here");
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(0);
  });
});

describe("DashboardTimeControl — an inverted range is reported, not applied", () => {
  const control = (container: Element) => ({
    start: container.querySelectorAll("input")[0] as HTMLInputElement,
    end: container.querySelectorAll("input")[1] as HTMLInputElement,
    error: () => container.querySelector("[data-silkplot-range-error]"),
  });

  it("is labelled and keyboard-reachable", () => {
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0 + 2 * DAY, end: T0 + 7 * DAY }}>
        <DashboardTimeControl />
      </Dashboard>
    ));

    const inputs = [...container.querySelectorAll("input")];
    expect(inputs).toHaveLength(2);
    // Native inputs inside a <label>: reachable by Tab without a tabindex, and
    // named by their own label rather than a title attribute.
    for (const input of inputs) {
      expect(input.closest("label")).not.toBeNull();
      expect(input.tabIndex).toBe(0);
    }
    expect(container.querySelector("legend")?.textContent).toBe("Time range");
  });

  it("reports an end before the start and leaves the members on the old range", () => {
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0 + 2 * DAY, end: T0 + 7 * DAY }}>
        <DashboardTimeControl />
        <LineChart
          title="Member"
          data={series(0, 10)}
          width={400}
          height={200}
          table={{ columns: ["Time", "Value"] }}
        />
      </Dashboard>
    ));

    const c = control(container);
    expect(c.error()).toBeNull();

    // Type an end BEFORE the start.
    c.end.value = "2026-03-01T00:00";
    c.end.dispatchEvent(new Event("input", { bubbles: true }));

    // Visible: reported where the user is looking, with an alert role.
    const error = c.error();
    expect(error).not.toBeNull();
    expect(error?.getAttribute("role")).toBe("alert");
    expect(c.end.getAttribute("aria-invalid")).toBe("true");
    expect(c.end.getAttribute("aria-describedby")).toBe(error?.id);

    // NOT applied, and NOT silently swapped: the member still shows days 2-7.
    // A swap would have selected 1-2, which nobody asked for.
    expect(tableTimestamps(container)[0]).toEqual(
      [2, 3, 4, 5, 6, 7].map((d) => new Date(T0 + d * DAY).toISOString()),
    );
  });

  it("applies a valid edit and clears the error", () => {
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0 + 2 * DAY, end: T0 + 7 * DAY }}>
        <DashboardTimeControl />
        <LineChart
          title="Member"
          data={series(0, 10)}
          width={400}
          height={200}
          table={{ columns: ["Time", "Value"] }}
        />
      </Dashboard>
    ));

    const c = control(container);
    // The control reads and writes in the BROWSER's zone, so build the value the
    // same way the component does rather than from an ISO string, which is UTC.
    const target = new Date(T0 + 4 * DAY);
    const pad = (n: number) => String(n).padStart(2, "0");
    c.end.value =
      `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}` +
      `T${pad(target.getHours())}:${pad(target.getMinutes())}`;
    c.end.dispatchEvent(new Event("input", { bubbles: true }));

    expect(c.error()).toBeNull();
    expect(tableTimestamps(container)[0]).toEqual(
      [2, 3, 4].map((d) => new Date(T0 + d * DAY).toISOString()),
    );
  });
});
