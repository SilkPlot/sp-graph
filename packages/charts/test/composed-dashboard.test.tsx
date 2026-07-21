/**
 * The composed dashboard, verified as a whole.
 *
 * Every phase before this one verified its own piece, and each passed. The
 * failures that matter in a composed surface are the ones BETWEEN pieces: two
 * charts sharing state, a table that stops matching after a replacement, a page
 * that scrolls sideways only once three charts and their tables are present.
 * Those are invisible to per-component suites by construction — each component
 * is correct, and the composition is not.
 *
 * So nothing here tests a component. Every case renders the whole fixture and
 * asserts across members.
 */
import { describe, expect, it } from "vitest";
import { createSignal, Show } from "solid-js";
import { render } from "@solidjs/testing-library";
import { Dashboard, DashboardSection } from "@silkplot/solid";
import { AreaChart, LineChart } from "../src/index";
import type { TimePoint } from "../src/index";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 2, 1);

const series = (count: number): TimePoint[] =>
  Array.from({ length: count }, (_, i) => ({ t: new Date(T0 + i * DAY), y: i }));

/**
 * Four members: two in one section, one in a latest-value section, one outside
 * both. Sized in px so the assertions do not depend on the harness viewport,
 * except where a case is deliberately about the viewport.
 */
function Fixture(props: { data?: TimePoint[]; width?: number }) {
  const w = () => props.width ?? 320;
  return (
    <Dashboard defaultRange={{ start: new Date(T0), end: new Date(T0 + 9 * DAY) }}>
      <DashboardSection label="Recent" window={{ start: new Date(T0 + 5 * DAY), end: new Date(T0 + 9 * DAY) }}>
        <LineChart title="Line in section" data={props.data ?? series(10)} width={w()} height={160} />
        <AreaChart title="Area in section" data={props.data ?? series(10)} width={w()} height={160} />
      </DashboardSection>

      <DashboardSection label="Current" latest>
        <LineChart title="Latest reading" data={props.data ?? series(10)} width={w()} height={160} />
      </DashboardSection>

      <LineChart title="Outside sections" data={props.data ?? series(10)} width={w()} height={160} />
    </Dashboard>
  );
}

const charts = (c: Element) => [...c.querySelectorAll("svg")];
const tables = (c: Element) => [...c.querySelectorAll("table")];

describe("The accessibility contract holds across the composition", () => {
  it("gives every member a name, a table, and an export control", () => {
    const { container } = render(() => <Fixture />);

    expect(charts(container)).toHaveLength(4);
    expect(tables(container)).toHaveLength(4);
    expect(container.querySelectorAll("[data-silkplot-csv-export]")).toHaveLength(4);
    expect(container.querySelectorAll("[data-silkplot-table-toggle]")).toHaveLength(4);

    // Each named, and named DIFFERENTLY: four charts all announcing the same
    // name is the composed failure a per-chart suite cannot see, because each
    // chart is individually correct.
    const names = charts(container).map(
      (svg) => svg.querySelector("title")?.textContent ?? "",
    );
    expect(new Set(names).size).toBe(4);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });

  it("keeps one tab stop per chart rather than one per mark", () => {
    const { container } = render(() => <Fixture />);
    // The single-entry composite, across four charts at once. A roving tabindex
    // that regressed to per-mark stops would show up here as tens of surfaces.
    const surfaces = container.querySelectorAll("[data-silkplot-keyboard-surface]");
    expect(surfaces.length).toBeLessThanOrEqual(4);
    for (const surface of surfaces) {
      expect(surface.getAttribute("tabindex")).toBe("0");
    }
  });

  it("relates every chart to its own table, not to another member's", () => {
    const { container } = render(() => <Fixture />);
    const details = charts(container).map((svg) => svg.getAttribute("aria-details"));
    const tableIds = tables(container).map((t) => t.id);

    // Four distinct relationships. Two charts pointing at one table is a
    // failure that renders perfectly and reads perfectly to a sighted user.
    expect(new Set(details).size).toBe(4);
    for (const id of details) {
      expect(tableIds).toContain(id);
    }
  });
});

describe("Data replacement across the composition", () => {
  it("updates every member's marks and table together, and leaves none stale", () => {
    const [data, setData] = createSignal(series(10));
    const { container } = render(() => <Fixture data={data()} />);

    const rowCounts = () =>
      tables(container).map((t) => t.querySelectorAll("tbody tr").length);

    // Section window covers days 5-9, latest shows one, outside shows 0-9.
    expect(rowCounts()).toEqual([5, 5, 1, 10]);

    setData(series(4));

    // Days 5-9 now contain nothing; latest resolves to day 3; the outside chart
    // shows all four. Asserted as a SET across members, because a replacement
    // that updated three of four is the composed defect.
    expect(rowCounts()).toEqual([0, 0, 1, 4]);
  });

  it("keeps the same chart nodes across a replacement", () => {
    const [data, setData] = createSignal(series(10));
    const { container } = render(() => <Fixture data={data()} />);

    const before = charts(container);
    setData(series(6));
    const after = charts(container);

    // Fine-grained reactivity updates in place. A re-created tree would discard
    // any internal state a chart was holding — an open table, a keyboard
    // position — without anything failing.
    for (const [i, node] of before.entries()) {
      expect(after[i]).toBe(node);
    }
  });
});

describe("Layout under a narrow viewport", () => {
  it("does not scroll the document sideways with every table open", async () => {
    const { container } = render(() => <Fixture width={360} />);

    // Open every table: a collapsed table cannot overflow, so a suite that left
    // them closed would prove nothing about the case that broke the site once.
    for (const toggle of container.querySelectorAll<HTMLButtonElement>(
      "[data-silkplot-table-toggle]",
    )) {
      toggle.click();
    }
    await Promise.resolve();

    expect(container.querySelectorAll("[data-silkplot-table-scroll]")).toHaveLength(4);
    // Measured on the document, at a real viewport — the failure mode is the
    // PAGE moving, not the table having width.
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
  });
});

describe("A member revealed after being hidden", () => {
  it("measures its container rather than staying at zero width", async () => {
    const [shown, setShown] = createSignal(false);

    const { container } = render(() => (
      <Dashboard defaultRange={{ start: new Date(T0), end: new Date(T0 + 9 * DAY) }}>
        <Show when={shown()}>
          <LineChart title="Revealed" data={series(10)} width={300} height={160} />
        </Show>
      </Dashboard>
    ));

    expect(charts(container)).toHaveLength(0);

    setShown(true);
    // `createResize` exists for exactly this: a container that was not
    // measurable when the chart mounted. A chart that stayed at zero width
    // renders an svg with no marks, which looks like an empty dataset.
    await expect
      .poll(() => container.querySelector("path")?.getAttribute("d") ?? "")
      .not.toBe("");
    expect(charts(container)).toHaveLength(1);
  });
});
