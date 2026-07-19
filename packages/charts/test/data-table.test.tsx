/**
 * The inspectable data table — the surface a reader would actually choose to
 * use, rather than one only assistive technology ever meets.
 *
 * The table itself is not new; the accessibility contract built it. What is new
 * is that it renders WITHOUT configuration, and that a control reveals it. Both
 * are reversals of earlier deliberate decisions, so the tests that matter here
 * are the ones that pin what did NOT change with them:
 *
 *   - a defaulted table must not silence the missing-description diagnostic,
 *     because it carries values without units;
 *   - collapsing must not remove the table from the accessibility tree, or the
 *     "reachable data alternative" guarantee quietly becomes "reachable after
 *     you find a button";
 *   - a decorative chart still exposes nothing at all.
 *
 * Each of those is a way the new default could have taken something away while
 * looking like it only added.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import { AreaChart, BarChart, LineChart, ScatterChart } from "../src/index";
import type { CategoryPoint, TimePoint, XYPoint } from "../src/index";

const T0 = Date.UTC(2026, 2, 1);
const DAY = 24 * 60 * 60 * 1000;

const TIME: TimePoint[] = [
  { t: new Date(T0), y: 3 },
  { t: new Date(T0 + DAY), y: 11 },
  { t: new Date(T0 + 2 * DAY), y: 5 },
];
const CATEGORY: CategoryPoint[] = [
  { label: "Jan", y: 3 },
  { label: "Feb", y: 11 },
];
const XY: XYPoint[] = [
  { x: 1, y: 3 },
  { x: 2, y: 11 },
];

const SIZE = { width: 400, height: 200 } as const;

const headings = (c: Element): string[] =>
  [...c.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent ?? "");
const toggle = (c: Element) => c.querySelector<HTMLButtonElement>("[data-silkplot-table-toggle]");
const region = (c: Element) => c.querySelector<HTMLElement>("[data-silkplot-table-scroll]");
const table = (c: Element) => c.querySelector<HTMLTableElement>("table");

describe("Every informative chart renders a table with no configuration", () => {
  it("gives a time series generic Time/Value headings", () => {
    const { container } = render(() => <LineChart title="Daily" data={TIME} {...SIZE} />);
    expect(table(container)).not.toBeNull();
    expect(headings(container)).toEqual(["Time", "Value"]);
  });

  it("gives an area chart the same time-series headings", () => {
    const { container } = render(() => <AreaChart title="Daily" data={TIME} {...SIZE} />);
    expect(headings(container)).toEqual(["Time", "Value"]);
  });

  it("gives a categorical chart Category/Value", () => {
    const { container } = render(() => <BarChart title="Monthly" data={CATEGORY} {...SIZE} />);
    expect(headings(container)).toEqual(["Category", "Value"]);
  });

  it("gives a point cloud X/Y", () => {
    const { container } = render(() => <ScatterChart title="Cloud" data={XY} {...SIZE} />);
    expect(headings(container)).toEqual(["X", "Y"]);
  });

  it("carries the values the marks were drawn from, not axis-formatted strings", () => {
    const { container } = render(() => <LineChart title="Daily" data={TIME} {...SIZE} />);
    const values = [...container.querySelectorAll("tbody td")].map((td) => td.textContent);
    expect(values).toEqual(["3", "11", "5"]);
    // Instants go out as ISO 8601 — unambiguous and locale-independent, where a
    // friendlier rendering would be domain wording the library is inventing.
    const first = container.querySelector("tbody th");
    expect(first?.textContent).toBe(new Date(T0).toISOString());
  });

  it("lets the application's headings win over the generic ones", () => {
    const { container } = render(() => (
      <LineChart title="Daily" data={TIME} {...SIZE} table={{ columns: ["Day", "Bookings"] }} />
    ));
    // The default is honest, not good. An application that knows the units says
    // so, and nothing about the default should make that harder.
    expect(headings(container)).toEqual(["Day", "Bookings"]);
  });

  it("exposes nothing at all for a decorative chart", () => {
    const { container } = render(() => <LineChart decorative data={TIME} {...SIZE} />);
    expect(table(container)).toBeNull();
    expect(toggle(container)).toBeNull();
    expect(container.querySelector("[data-silkplot-alternative]")).toBeNull();
  });
});

describe("A defaulted table does not silence the description diagnostic", () => {
  it("still reports a missing description when nothing carries the axis units", () => {
    const issues: string[] = [];
    render(() => (
      <LineChart
        title="Daily"
        data={TIME}
        {...SIZE}
        onSemanticsIssue={(issue) => issues.push(issue.code)}
      />
    ));

    // THE regression this file exists for. The check counts a table as a
    // description channel, so a table present on every chart by default would
    // have silenced this diagnostic everywhere at once — turning a contract into
    // a formality without a single test going red.
    expect(issues).toContain("missing-description");
  });

  it("accepts a caller-supplied table as a real description channel", () => {
    const issues: string[] = [];
    render(() => (
      <LineChart
        title="Daily"
        data={TIME}
        {...SIZE}
        table={{ columns: ["Day", "Bookings"] }}
        onSemanticsIssue={(issue) => issues.push(issue.code)}
      />
    ));
    // The distinction is units, not markup: these headings carry domain meaning
    // the library could not have invented.
    expect(issues).not.toContain("missing-description");
  });
});

describe("The disclosure reveals the table without hiding it from assistive technology", () => {
  it("offers a labelled button that reports its own state", () => {
    const { container } = render(() => <LineChart title="Daily" data={TIME} {...SIZE} />);
    const button = toggle(container);
    expect(button).not.toBeNull();
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.textContent).toBe("Show data table");
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(button?.getAttribute("aria-controls")).toBeTruthy();
  });

  it("keeps the table in the accessibility tree while collapsed", () => {
    const { container } = render(() => <LineChart title="Daily" data={TIME} {...SIZE} />);
    const t = table(container);
    expect(t).not.toBeNull();

    // Clipped, never `display: none` or `hidden`. Both of those remove content
    // from the accessibility tree as well as the page, which would take the data
    // alternative away from exactly the users it was built for.
    const controlled = container.querySelector<HTMLElement>(
      `#${CSS.escape(toggle(container)!.getAttribute("aria-controls")!)}`,
    );
    expect(getComputedStyle(controlled!).display).not.toBe("none");
    expect(getComputedStyle(controlled!).position).toBe("absolute");
    expect(t!.querySelectorAll("tbody tr")).toHaveLength(TIME.length);
  });

  it("shows and hides on activation, and updates the control's name and state", async () => {
    const { container } = render(() => <LineChart title="Daily" data={TIME} {...SIZE} />);
    const button = toggle(container)!;

    await userEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.textContent).toBe("Hide data table");

    await userEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toBe("Show data table");
  });

  it("offers no control when the application has opted into presenting the data itself", () => {
    const { container } = render(() => (
      <LineChart title="Daily" data={TIME} {...SIZE} tableHidden />
    ));
    // `tableHidden` already means "I will present this myself", so a reveal
    // control would contradict the prop that was just passed.
    expect(toggle(container)).toBeNull();
    expect(table(container)).not.toBeNull();
  });
});

describe("The scroll region is reachable by keyboard only when it is visible", () => {
  it("is not a tab stop while collapsed", () => {
    const { container } = render(() => <LineChart title="Daily" data={TIME} {...SIZE} />);
    // A focusable element inside a clip-hidden container is a tab stop that
    // lands on nothing a sighted keyboard user can see — a visible-focus failure
    // rather than an accessibility win.
    expect(region(container)?.getAttribute("tabindex")).toBeNull();
  });

  it("becomes a named, focusable region once revealed", async () => {
    const { container } = render(() => <LineChart title="Daily" data={TIME} {...SIZE} />);
    await userEvent.click(toggle(container)!);

    const scroll = region(container)!;
    expect(scroll.getAttribute("tabindex")).toBe("0");
    // A scrollable area only a pointer can reach is unreachable for a
    // keyboard-only reader, and an unnamed focus stop announces nothing.
    expect(scroll.tagName).toBe("SECTION");
    expect(scroll.getAttribute("aria-label")).toBe("Daily");
  });

  it("bounds its own height so a long series does not become the page", async () => {
    const long = Array.from({ length: 400 }, (_, i) => ({
      t: new Date(T0 + i * DAY),
      y: i,
    }));
    const { container } = render(() => <LineChart title="Long" data={long} {...SIZE} />);
    await userEvent.click(toggle(container)!);

    const scroll = region(container)!;
    // Every row is present — the bound is on the box, not on the data. A table
    // that silently truncated would be a table that disagrees with its chart.
    expect(container.querySelectorAll("tbody tr")).toHaveLength(400);
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    expect(scroll.clientHeight).toBeLessThanOrEqual(400);
  });
});

describe("A table does not make the page scroll sideways", () => {
  it("keeps horizontal overflow inside its own box at a phone width", async () => {
    // 390px is the measurement the documentation site already pays attention to,
    // and the failure it caught once was a table reaching out of library output
    // to move the whole document.
    const { container } = render(() => (
      <LineChart
        title="Wide"
        data={TIME}
        {...SIZE}
        table={{ columns: ["A rather long heading indeed", "Another long heading"] }}
      />
    ));
    await userEvent.click(toggle(container)!);

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
    // Non-vacuous: the region really is the thing absorbing it.
    const scroll = region(container)!;
    expect(getComputedStyle(scroll).overflowX).toBe("auto");
  });
});
