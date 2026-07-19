/**
 * Isolated sections and latest-value mode.
 *
 * The failure this suite is shaped around: a section that is NOT isolated looks
 * exactly like one that is. Two charts side by side over different ranges and
 * two charts over the same range render identically apart from their axis
 * labels, so an assertion that each section shows "some data" passes through the
 * defect without noticing.
 *
 * Every case therefore compares the sections AGAINST EACH OTHER and against a
 * chart outside both — three effective ranges from one global selection, which
 * is the shape that cannot survive the boundary being removed.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { Dashboard, DashboardSection } from "@silkplot/solid";
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 2, 1);
const SIZE = { width: 400, height: 200 } as const;

/** Twenty daily points, value = day index, so a row reads back as its day. */
const SERIES: TimePoint[] = Array.from({ length: 20 }, (_, i) => ({
  t: new Date(T0 + i * DAY),
  y: i,
}));

/** The day-index of every row each chart put in its table, per chart. */
function tableDays(container: Element): number[][] {
  return [...container.querySelectorAll("table")].map((table) =>
    [...table.querySelectorAll("tbody tr td")].map((cell) => Number(cell.textContent)),
  );
}

const iso = (day: number) => new Date(T0 + day * DAY).toISOString();

/**
 * A dashboard spanning days 0-9 with two differently-scoped sections and one
 * chart outside both.
 */
function ThreeScopes() {
  return (
    <Dashboard defaultRange={{ start: T0, end: T0 + 9 * DAY }}>
      <DashboardSection label="Narrow" window={{ start: T0 + 2 * DAY, end: T0 + 4 * DAY }}>
        <LineChart title="In narrow" data={SERIES} {...SIZE} />
      </DashboardSection>
      <DashboardSection label="Rolling" last={2 * DAY}>
        <LineChart title="In rolling" data={SERIES} {...SIZE} />
      </DashboardSection>
      <LineChart title="Outside" data={SERIES} {...SIZE} />
    </Dashboard>
  );
}

describe("One global selection, three effective ranges", () => {
  it("gives each section its own range and leaves the outside chart on the global one", () => {
    const { container } = render(() => <ThreeScopes />);
    const [narrow, rolling, outside] = tableDays(container);

    // Days 2-4: the section's own window, inside the global 0-9.
    expect(narrow).toEqual([2, 3, 4]);
    // A rolling two days anchored at the END of the global range: days 7-9.
    // Anchored on the dashboard's selection, not the wall clock, so "the last
    // two days" means the last two days of what is being shown.
    expect(rolling).toEqual([7, 8, 9]);
    // No section: the whole global range.
    expect(outside).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // THE assertion the isolation boundary exists for. Remove it and all three
    // collapse to one range; any two of these being equal is the defect.
    expect(narrow).not.toEqual(rolling);
    expect(rolling).not.toEqual(outside);
  });

  it("clamps a section configured wider than the global range", () => {
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0 + 3 * DAY, end: T0 + 5 * DAY }}>
        <DashboardSection label="Too wide" window={{ start: T0, end: T0 + 19 * DAY }}>
          <LineChart title="Clamped" data={SERIES} {...SIZE} />
        </DashboardSection>
      </Dashboard>
    ));

    // Nothing widens past the global range — the same rule the core unit tests
    // pin, reaching a rendered chart through the same resolver.
    expect(tableDays(container)[0]).toEqual([3, 4, 5]);
  });

  it("keeps one section unchanged when another section's scope moves", () => {
    const [window, setWindow] = createSignal({ start: T0 + 2 * DAY, end: T0 + 3 * DAY });

    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0, end: T0 + 9 * DAY }}>
        <DashboardSection label="Moving" window={window()}>
          <LineChart title="Moving" data={SERIES} {...SIZE} />
        </DashboardSection>
        <DashboardSection label="Still" window={{ start: T0 + 6 * DAY, end: T0 + 7 * DAY }}>
          <LineChart title="Still" data={SERIES} {...SIZE} />
        </DashboardSection>
      </Dashboard>
    ));

    expect(tableDays(container)).toEqual([[2, 3], [6, 7]]);

    setWindow({ start: T0 + 8 * DAY, end: T0 + 9 * DAY });

    // The first moved; the second did not. Asserted as a pair, because a suite
    // that only checked the moved section would pass with isolation broken.
    expect(tableDays(container)).toEqual([[8, 9], [6, 7]]);
  });
});

describe("Latest-value mode", () => {
  it("shows only the most recent datum inside the global range", () => {
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0, end: T0 + 5 * DAY }}>
        <DashboardSection label="Current" latest>
          <LineChart title="Reading" data={SERIES} {...SIZE} />
        </DashboardSection>
      </Dashboard>
    ));

    // Day 5, not day 19: the newest datum WITHIN the selection. A tile showing
    // data outside the selected range would be the one element on the page
    // telling a different story, with nothing to mark it as different.
    const rows = [...container.querySelectorAll("tbody tr th")].map((th) => th.textContent);
    expect(rows).toEqual([iso(5)]);
  });

  it("announces the reading, and the announcement follows new data", async () => {
    const [data, setData] = createSignal(SERIES.slice(0, 3));

    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0, end: T0 + 19 * DAY }}>
        <DashboardSection label="Current" latest>
          <LineChart title="Reading" data={data()} {...SIZE} />
        </DashboardSection>
      </Dashboard>
    ));

    // Named channel, not just "the announcer". A LineChart also carries a
    // KEYBOARD live region, which is silent until the user steps — selecting the
    // first match found the empty one and read as though nothing was announced.
    const live = () =>
      container.querySelector('[data-silkplot-announcer="latest"]')?.textContent ?? "";

    // A reading that changes without being announced is invisible to a screen
    // reader: the datum is redrawn, the table row is replaced, and nothing says
    // anything.
    await expect.poll(live).toContain("Reading");
    expect(live()).toContain(iso(2));

    setData(SERIES.slice(0, 6));
    // Polled rather than read straight back: the announcer throttles and
    // coalesces on purpose, so the trailing write lands after its window. A bare
    // read here would test the throttle, not the announcement.
    await expect.poll(live).toContain(iso(5));
  });

  it("announces without a name prefix when the chart is named by reference", async () => {
    // `labelledBy` names the chart from existing page content, so the chart's
    // own `name()` is empty by design — the referenced element supplies it. The
    // announcement must then be the reading alone rather than ": Time ..." with
    // nothing in front of the colon.
    const { container } = render(() => (
      <>
        <h2 id="reading-heading">Current reading</h2>
        <Dashboard defaultRange={{ start: T0, end: T0 + 5 * DAY }}>
          <DashboardSection label="Current" latest>
            <LineChart labelledBy="reading-heading" data={SERIES} {...SIZE} />
          </DashboardSection>
        </Dashboard>
      </>
    ));

    const live = () =>
      container.querySelector('[data-silkplot-announcer="latest"]')?.textContent ?? "";
    await expect.poll(live).toContain("Time");
    expect(live().startsWith(":")).toBe(false);
  });

  it("tolerates a caller row with fewer cells than there are columns", async () => {
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0, end: T0 + 5 * DAY }}>
        <DashboardSection label="Current" latest>
          <LineChart
            title="Reading"
            data={SERIES}
            {...SIZE}
            // Two headings, one cell. A short row is a caller mistake rather
            // than a crash: the announcement names the empty column instead of
            // reading "undefined" aloud.
            table={{ columns: ["Time", "Value"], rows: [["only-one-cell"]] }}
          />
        </DashboardSection>
      </Dashboard>
    ));

    const live = () =>
      container.querySelector('[data-silkplot-announcer="latest"]')?.textContent ?? "";
    await expect.poll(live).toContain("only-one-cell");
    expect(live()).not.toContain("undefined");
  });

  it("renders the empty state when no datum falls inside the range", () => {
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0 + 40 * DAY, end: T0 + 50 * DAY }}>
        <DashboardSection label="Current" latest>
          <LineChart title="Reading" data={SERIES} {...SIZE} />
        </DashboardSection>
      </Dashboard>
    ));
    expect(container.querySelectorAll("[data-silkplot-empty]")).toHaveLength(1);
  });
});

describe("A section states its own scope", () => {
  it("says what it is showing, visibly and in its accessible name", () => {
    const { container } = render(() => <ThreeScopes />);
    const sections = [...container.querySelectorAll<HTMLElement>("[data-silkplot-section]")];
    expect(sections).toHaveLength(2);

    // Visible: two charts over different ranges look identical apart from their
    // axis labels, so a section that does not say it is narrowed lets the
    // dashboard silently lie about what is being compared.
    const note = sections[0]!.querySelector("[data-silkplot-section-scope]");
    expect(note?.textContent).toContain("Narrow");
    expect(note?.textContent).toContain("Narrowed within the selected range");

    // Reachable: the same claim is in the region's accessible name, not left to
    // be correlated by position.
    expect(sections[0]!.getAttribute("aria-label")).toBe(
      "Narrow. Narrowed within the selected range",
    );
  });

  it("says that a latest-value section is showing only a reading", () => {
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0, end: T0 + 5 * DAY }}>
        <DashboardSection label="Current" latest>
          <LineChart title="Reading" data={SERIES} {...SIZE} />
        </DashboardSection>
      </Dashboard>
    ));
    expect(
      container.querySelector("[data-silkplot-section-scope]")?.textContent,
    ).toContain("Most recent reading only");
  });
});

describe("A section outside a dashboard", () => {
  it("throws rather than silently narrowing nothing", () => {
    expect(() =>
      render(() => (
        <DashboardSection label="Orphan" latest>
          <LineChart title="X" data={SERIES} {...SIZE} />
        </DashboardSection>
      )),
    ).toThrow(/must be rendered inside a <Dashboard>/);
  });
});
