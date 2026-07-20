/**
 * Multi-series line and area — the composed surface over ADR-0008's model.
 *
 * `core`'s suite already proves the normalisation and `solid`'s proves it
 * tracks; neither is repeated here. What is provable only once a chart RENDERS
 * is the part this file is about: that identity survives a reorder in the DOM
 * as well as in the model, that a gap policy reaches the path `d`, that the
 * y domain spans every visible series, and that hiding one moves the axis.
 *
 * The organising caution: a multi-series chart that silently drops a series
 * still renders, and looks fine. So the path COUNT is asserted alongside the
 * geometry in most cases below — a test that only checks the first path passes
 * against a chart drawing one series out of twenty-two.
 */
import { describe, expect, it } from "vitest";
import { createSignal, Show, type JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import type { Series } from "@silkplot/core";
import { Dashboard, DashboardSection } from "@silkplot/solid";
import { AreaChart, LineChart } from "../src/index";
import { assertOneInput } from "../src/scaffold";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  expectNoNaN,
  markPaths,
  moveCount,
  pathXs,
  pathYs,
} from "./support";

const at = (hour: number): Date => new Date(Date.UTC(2026, 2, 1, hour));

function series(id: string, values: readonly (number | null)[], extra: Partial<Series> = {}): Series {
  return {
    id,
    label: id.toUpperCase(),
    data: values.map((y, i) => ({ t: at(i), y })),
    ...extra,
  };
}

const TWO: readonly Series[] = [series("a", [1, 5, 3]), series("b", [10, 4, 8])];

function mountLine(props: Record<string, unknown> = {}) {
  return render(() => (
    <LineChart
      title="Test chart"
      desc="A multi-series test fixture"
      width={WIDTH}
      height={HEIGHT}
      margins={NO_MARGINS}
      curve="linear"
      series={TWO}
      {...props}
    />
  ));
}

describe("one path per visible series", () => {
  it("draws two paths for two series", () => {
    const { container } = mountLine();
    expect(markPaths(container)).toHaveLength(2);
  });

  it("draws one path for one series", () => {
    const { container } = mountLine({ series: [series("only", [1, 2, 3])] });
    expect(markPaths(container)).toHaveLength(1);
  });

  it("scales to 22 series with no hard-coded limit", () => {
    const many = Array.from({ length: 22 }, (_, i) => series(`s${i}`, [i, i + 1, i + 2]));
    const { container } = mountLine({ series: many });

    // The count IS the assertion: a chart that quietly drew the first eight,
    // or the first one, would look entirely plausible.
    expect(markPaths(container)).toHaveLength(22);
    for (const p of markPaths(container)) expect(p.getAttribute("d")).not.toContain("NaN");
  });

  it("emits no non-finite coordinate anywhere", () => {
    const { container } = mountLine();
    expectNoNaN(container, "path", ["d"]);
  });
});

describe("the y domain spans every visible series", () => {
  it("covers the union, not just the first series", () => {
    const { container } = mountLine();
    const [aPath = "", bPath = ""] = markPaths(container).map((p) => p.getAttribute("d") ?? "");

    const ys = [...pathYs(aPath), ...pathYs(bPath)];
    // Under `zero-floor` over a union of [1..5] and [4..10] the domain is
    // [0, 10]. Two consequences, and both discriminate:
    //
    //   - the taller series' maximum (10) reaches the TOP of the plot, which it
    //     cannot if the domain were computed from series `a` alone;
    //   - the overall minimum (1) lands at 270, not at the 300px floor. The
    //     floor is zero but no datum sits there, and asserting the vertex was
    //     at 300 would have been asserting a zero-filled point exists.
    //
    // Series `a` alone would give domain [0,5] and put value 1 at 240.
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys)).toBeCloseTo(270, 5);
  });

  it("rescales when a series is hidden (ADR-0008 §7)", () => {
    const [visible, setVisible] = createSignal<readonly string[] | undefined>(undefined);
    const { container } = render(() => (
      <LineChart
        title="Test chart"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={TWO}
        visibleSeries={visible()}
      />
    ));

    expect(markPaths(container)).toHaveLength(2);
    const before = pathYs(markPaths(container)[0]?.getAttribute("d") ?? "");

    setVisible(["a"]);

    expect(markPaths(container)).toHaveLength(1);
    const after = pathYs(markPaths(container)[0]?.getAttribute("d") ?? "");

    // Series `a` did not change, but its PIXELS did: the domain shrank from
    // [0,10] to [0,5], so the same values now occupy the whole height. This is
    // the visible consequence of the hidden-series domain policy, and asserting
    // the path count alone would not have caught a policy that ignored it.
    expect(after).not.toEqual(before);
    expect(Math.min(...after)).toBeCloseTo(0, 5);
  });
});

describe("gap policy reaches the rendered path", () => {
  it("break splits the path into separate subpaths", () => {
    const { container } = mountLine({
      series: [series("s", [1, null, 3], { nullPolicy: "break" })],
    });
    // Two `M` commands: the generator lifted the pen at the gap.
    expect(moveCount(markPaths(container)[0]?.getAttribute("d") ?? "")).toBe(2);
  });

  it("connect draws straight across as one subpath", () => {
    const { container } = mountLine({
      series: [series("s", [1, null, 3], { nullPolicy: "connect" })],
    });
    expect(moveCount(markPaths(container)[0]?.getAttribute("d") ?? "")).toBe(1);
  });

  it("never places a gap at the zero baseline", () => {
    // The defect this contract exists to forbid: a null scaled as 0. Under
    // `zero-floor` over [5..9], zero is the bottom of the plot, so a zero-filled
    // gap would put a vertex at the very bottom. No vertex may be there.
    const { container } = mountLine({
      series: [series("s", [5, null, 9], { nullPolicy: "break" })],
    });
    const ys = pathYs(markPaths(container)[0]?.getAttribute("d") ?? "");
    expect(ys.every((y) => y < HEIGHT - 0.5)).toBe(true);
  });

  it("applies each series' own policy independently", () => {
    const { container } = mountLine({
      series: [
        series("broken", [1, null, 3], { nullPolicy: "break" }),
        series("joined", [1, null, 3], { nullPolicy: "connect" }),
      ],
    });
    const [broken = "", joined = ""] = markPaths(container).map((p) => p.getAttribute("d") ?? "");
    expect(moveCount(broken)).toBe(2);
    expect(moveCount(joined)).toBe(1);
  });
});

describe("identity survives a reorder in the DOM", () => {
  it("keeps each series' geometry when positions swap", () => {
    const [order, setOrder] = createSignal<readonly Series[]>(TWO);
    const { container } = render(() => (
      <LineChart
        title="Test chart"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={order()}
      />
    ));

    const aBefore = markPaths(container)[0]?.getAttribute("d");
    const bBefore = markPaths(container)[1]?.getAttribute("d");
    expect(aBefore).not.toBe(bBefore);

    setOrder([TWO[1] as Series, TWO[0] as Series]);

    // Same two shapes, swapped positions. If the renderer keyed by POSITION it
    // would hand series 0's rendered path series 1's data, and both `d`s would
    // stay where they were — which is the identity failure ADR-0008 §1 exists
    // to prevent, expressed in the DOM instead of the model.
    expect(markPaths(container)[0]?.getAttribute("d")).toBe(bBefore);
    expect(markPaths(container)[1]?.getAttribute("d")).toBe(aBefore);
  });
});

describe("signed values keep their sign", () => {
  it("places a negative series below the zero line on an area chart", () => {
    const { container } = render(() => (
      <AreaChart
        title="Signed"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={[series("neg", [-2, -6, -4])]}
      />
    ));

    // `zero-baseline` puts zero at the TOP for an all-negative series, so every
    // drawn vertex sits below it. A domain that clamped to zero-floor would put
    // the data at the bottom and the baseline nowhere near it.
    const ys = pathYs(markPaths(container)[1]?.getAttribute("d") ?? "");
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expectNoNaN(container, "path", ["d"]);
  });

  it("spans a domain crossing zero", () => {
    const { container } = mountLine({ series: [series("mixed", [-4, 0, 7])] });
    expectNoNaN(container, "path", ["d"]);
    const ys = pathYs(markPaths(container)[0]?.getAttribute("d") ?? "");
    expect(new Set(ys).size).toBe(3);
  });
});

describe("area charts draw a fill and a stroke per series", () => {
  it("emits two marks per series", () => {
    const { container } = render(() => (
      <AreaChart
        title="Area"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={TWO}
      />
    ));
    // Two series × (fill + stroke).
    expect(markPaths(container)).toHaveLength(4);
  });
});

describe("the redundant non-colour channel (ADR-0005 §5)", () => {
  it("gives each series a distinct dash token", () => {
    const { container } = mountLine();
    const dashes = markPaths(container).map((p) => p.getAttribute("stroke-dasharray"));
    expect(dashes[0]).toContain("--sp-cat-dash-0");
    expect(dashes[1]).toContain("--sp-cat-dash-1");
  });

  it("gives each series a distinct colour token", () => {
    const { container } = mountLine();
    const strokes = markPaths(container).map((p) => p.getAttribute("stroke"));
    expect(strokes[0]).toContain("--sp-cat-0");
    expect(strokes[1]).toContain("--sp-cat-1");
  });

  it("does NOT reshuffle colours when a series is hidden", () => {
    // The common operational case, and the one ADR-0008 §1 is about: hiding a
    // series must not recolour the ones that remain. A reader who has learned
    // "the orange line is the inlet" keeps that after toggling something else
    // off. Keying the palette on VISIBLE position instead of the caller's array
    // position would silently promote series 1 into series 0's colour.
    const { container } = mountLine({ visibleSeries: ["b"] });
    const stroke = markPaths(container)[0]?.getAttribute("stroke");

    // `b` is second in the caller's array, so it keeps slot 1 while alone.
    expect(stroke).toContain("--sp-cat-1");
    expect(stroke).not.toContain("--sp-cat-0");
  });

  it("keeps the dash when the caller overrides only the stroke", () => {
    const { container } = mountLine({
      series: [series("s", [1, 2], { style: { stroke: "#ff0000" } })],
    });
    const path = markPaths(container)[0];
    expect(path?.getAttribute("stroke")).toBe("#ff0000");
    expect(path?.getAttribute("stroke-dasharray")).toContain("--sp-cat-dash-0");
  });
});

describe("the data alternative describes every visible series", () => {
  it("carries one column per visible series", () => {
    const { container } = mountLine();
    const headers = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["Time", "A", "B"]);
  });

  it("drops a hidden series' column", () => {
    const { container } = mountLine({ visibleSeries: ["b"] });
    const headers = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["Time", "B"]);
  });

  it("renders a gap as an empty cell rather than a zero", () => {
    const { container } = mountLine({ series: [series("s", [1, null, 3])] });
    const cells = [...container.querySelectorAll("tbody td")].map((td) => td.textContent);
    expect(cells).toContain("");
    expect(cells).not.toContain("0");
  });
});

describe("reactivity without remounting", () => {
  it("follows a complete replacement", () => {
    const [data, setData] = createSignal<readonly Series[]>([series("a", [1, 2, 3])]);
    const { container } = render(() => (
      <LineChart
        title="Test"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={data()}
      />
    ));
    const before = markPaths(container)[0]?.getAttribute("d");

    setData([series("a", [40, 5, 90, 12])]);

    expect(markPaths(container)[0]?.getAttribute("d")).not.toBe(before);
  });

  it("follows series addition and removal", () => {
    const [data, setData] = createSignal<readonly Series[]>([series("a", [1, 2])]);
    const { container } = render(() => (
      <LineChart
        title="Test"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={data()}
      />
    ));
    expect(markPaths(container)).toHaveLength(1);

    setData([series("a", [1, 2]), series("b", [3, 4]), series("c", [5, 6])]);
    expect(markPaths(container)).toHaveLength(3);

    setData([series("b", [3, 4])]);
    expect(markPaths(container)).toHaveLength(1);
  });

  it("recovers from an empty series list", () => {
    const [data, setData] = createSignal<readonly Series[]>([]);
    const { container } = render(() => (
      <LineChart
        title="Test"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={data()}
      />
    ));
    expect(markPaths(container)).toHaveLength(0);
    expectNoNaN(container, "path", ["d"]);

    setData([series("a", [1, 2])]);
    expect(markPaths(container)).toHaveLength(1);
    expectNoNaN(container, "path", ["d"]);
  });

  it("draws nothing when the visible set is empty, without collapsing the frame", () => {
    const { container } = mountLine({ visibleSeries: [] });
    expect(markPaths(container)).toHaveLength(0);
    // The axes still render — an empty selection is a chart with no series, not
    // a chart that failed to mount.
    expect(container.querySelector("svg")).not.toBeNull();
    expectNoNaN(container, "path", ["d"]);
  });
});

describe("the single-series path is untouched", () => {
  it("still accepts `data` and renders one path", () => {
    const { container } = render(() => (
      <LineChart
        title="Single"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        data={[
          { t: at(0), y: 1 },
          { t: at(1), y: 2 },
        ]}
      />
    ));
    expect(markPaths(container)).toHaveLength(1);
    // The generic headings, not a series label — the single-series contract.
    const headers = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["Time", "Value"]);
  });
});

/**
 * Inside a `<Dashboard>` the scope narrows what each chart draws (ADR-0007).
 *
 * These are here rather than in the composed-dashboard suite because the thing
 * under test is the MULTI-SERIES scope's resolution — that narrowing applies per
 * series, that latest-value picks one present datum per series, and that an
 * empty intersection renders the empty state instead of silently widening.
 */
describe("dashboard scope narrows the multi-series model", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const T0 = Date.UTC(2026, 2, 1);
  const daily = (id: string, values: readonly (number | null)[]): Series => ({
    id,
    label: id.toUpperCase(),
    data: values.map((y, i) => ({ t: new Date(T0 + i * DAY), y })),
  });
  const TEN: readonly Series[] = [daily("a", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])];

  /**
   * The chart is passed as a THUNK, not as created JSX.
   *
   * This is not style. `<LineChart .../>` compiles to `createComponent(...)`,
   * which runs the component immediately where the expression appears — so
   * handing it to a wrapper as an argument executes it OUTSIDE the provider the
   * wrapper is about to install, and `useDashboardTime()` returns undefined.
   * The chart then renders perfectly, unnarrowed, and the only symptom is a
   * table with too many rows. This cost a debugging pass: the scope was correct
   * the whole time and the fixture was mounting it in the wrong place.
   */
  function mountIn(node: (chart: () => JSX.Element) => JSX.Element) {
    return render(() =>
      node(() => (
        <LineChart
          title="Scoped"
          desc="d"
          width={WIDTH}
          height={HEIGHT}
          margins={NO_MARGINS}
          curve="linear"
          series={TEN}
        />
      )),
    );
  }

  it("draws only the points inside the global range", () => {
    const { container } = mountIn((chart) => (
      <Dashboard defaultRange={{ start: T0, end: T0 + 3 * DAY }}>{chart()}</Dashboard>
    ));
    // Four instants in range, so four table rows — the table follows the
    // effective domain, which is what makes it a description of the picture.
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
    expectNoNaN(container, "path", ["d"]);
  });

  it("narrows further inside a section window", () => {
    const { container } = mountIn((chart) => (
      <Dashboard defaultRange={{ start: T0, end: T0 + 9 * DAY }}>
        <DashboardSection label="Recent" window={{ start: T0 + 7 * DAY, end: T0 + 9 * DAY }}>
          {chart()}
        </DashboardSection>
      </Dashboard>
    ));
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("shows exactly one reading per series in latest mode", () => {
    const { container } = mountIn((chart) => (
      <Dashboard defaultRange={{ start: T0, end: T0 + 9 * DAY }}>
        <DashboardSection label="Current" latest>
          {chart()}
        </DashboardSection>
      </Dashboard>
    ));
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("picks a PRESENT datum as the latest, never a gap", () => {
    const withTrailingGap: readonly Series[] = [daily("a", [1, 2, 3, null])];
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0, end: T0 + 3 * DAY }}>
        <DashboardSection label="Current" latest>
          <LineChart
            title="Scoped"
            desc="d"
            width={WIDTH}
            height={HEIGHT}
            margins={NO_MARGINS}
            curve="linear"
            series={withTrailingGap}
          />
        </DashboardSection>
      </Dashboard>
    ));
    // The newest instant carries no reading. A latest-value tile that showed it
    // would announce "no value" as though it were the current measurement, so
    // the newest PRESENT datum is the answer.
    const cells = [...container.querySelectorAll("tbody td")].map((td) => td.textContent);
    expect(cells).toContain("3");
    expect(cells).not.toContain("");
  });

  it("renders the empty state when the range contains nothing", () => {
    const { container } = mountIn((chart) => (
      <Dashboard defaultRange={{ start: T0 + 100 * DAY, end: T0 + 101 * DAY }}>{chart()}</Dashboard>
    ));
    // Empty, not silently widened to the next scope out — that would show a
    // reader data they had excluded, in a chart that looks like it is working.
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(container.textContent).toContain("No data");
    expectNoNaN(container, "path", ["d"]);
  });
});

describe("`data` and `series` are mutually exclusive (ADR-0008 §12)", () => {
  it("throws in development when both are given", () => {
    // The typed props already make this unrepresentable; this is the runtime
    // backstop for a caller arriving untyped — plain JS, a cast, or props spread
    // from a config object. Merging them would draw a series nobody passed.
    expect(() =>
      render(() => {
        const props = {
          title: "Both",
          desc: "d",
          width: WIDTH,
          height: HEIGHT,
          data: [{ t: at(0), y: 1 }],
          series: TWO,
        } as unknown as Parameters<typeof LineChart>[0];
        return <LineChart {...props} />;
      }),
    ).toThrow(/both `data` and `series`/);
  });

  it("does not throw for either one alone", () => {
    expect(() => mountLine()).not.toThrow();
    expect(() =>
      render(() => (
        <LineChart title="Single" desc="d" width={WIDTH} height={HEIGHT} data={[{ t: at(0), y: 1 }]} />
      )),
    ).not.toThrow();
  });
});

describe("the default curve", () => {
  it("renders without an explicit curve on both chart kinds", () => {
    // Exercises the `?? "monotoneX"` default. Worth its own case rather than
    // being folded into another: monotoneX emits bezier `C` commands, so a test
    // that parsed points from this `d` would be reading control points as data —
    // which is why every other case here pins `curve="linear"`.
    const line = render(() => (
      <LineChart title="Default curve" desc="d" width={WIDTH} height={HEIGHT} series={TWO} />
    ));
    expect(markPaths(line.container)).toHaveLength(2);
    expect(markPaths(line.container)[0]?.getAttribute("d")).toContain("C");

    const area = render(() => (
      <AreaChart title="Default curve" desc="d" width={WIDTH} height={HEIGHT} series={TWO} />
    ));
    expect(markPaths(area.container)).toHaveLength(4);
  });
});

describe("the production posture of the both-inputs guard", () => {
  it("warns and prefers `series` rather than throwing", () => {
    // The same three-part posture the rest of the estate uses: development
    // throws, production reports and degrades. Exercised directly rather than
    // through a render, because forcing a production build inside a browser test
    // would mean faking the bundler substitution `isDevelopmentBuild` reads.
    const seen: string[] = [];
    expect(() =>
      assertOneInput({ data: [], series: [] }, { strict: false, onIssue: (m) => seen.push(m) }),
    ).not.toThrow();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("`series` is used and `data` is ignored");
  });

  it("falls back to console.warn when no sink is supplied", () => {
    // The DEFAULT sink, not an injected one. A contract whose default reporting
    // path is never exercised can be broken without any test noticing — the
    // injected-spy cases above would all still pass.
    const original = console.warn;
    const seen: unknown[] = [];
    console.warn = (...args: unknown[]) => void seen.push(args[0]);
    try {
      assertOneInput({ data: [], series: [] }, { strict: false });
    } finally {
      console.warn = original;
    }
    expect(seen).toHaveLength(1);
    expect(String(seen[0])).toContain("both `data` and `series`");
  });

  it("stays silent when only one input is present", () => {
    const seen: string[] = [];
    assertOneInput({ series: [] }, { strict: false, onIssue: (m) => seen.push(m) });
    assertOneInput({ data: [] }, { strict: false, onIssue: (m) => seen.push(m) });
    expect(seen).toHaveLength(0);
  });
});

describe("an area chart's empty state", () => {
  it("renders the caller's wording when a dashboard range excludes everything", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const T0 = Date.UTC(2026, 2, 1);
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: T0 + 500 * DAY, end: T0 + 501 * DAY }}>
        <AreaChart
          title="Empty area"
          desc="d"
          width={WIDTH}
          height={HEIGHT}
          margins={NO_MARGINS}
          curve="linear"
          emptyMessage="Nothing recorded in this window"
          series={[{ id: "a", label: "A", data: [{ t: new Date(T0), y: 1 }] }]}
        />
      </Dashboard>
    ));
    expect(container.textContent).toContain("Nothing recorded in this window");
    expectNoNaN(container, "path", ["d"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Caller formatting (ADR-0008 §9)                                             */
/* -------------------------------------------------------------------------- */

/**
 * `core`'s suite already proves `seriesTable` applies the options; this file is
 * about the part only a rendered chart can show — that the props REACH the
 * surfaces they name, and reach the right one each.
 *
 * The organising caution here is the mirror of the path-count one above: a chart
 * that ignores a formatter renders perfectly, with the library's generic default
 * in place. So each test asserts the formatted text is PRESENT and, where the
 * two surfaces could be crossed, that the other one is unchanged.
 */
describe("caller formatting reaches the surface it names", () => {
  /** Tick labels for one axis. `data-silkplot-axis` carries the orientation. */
  const tickText = (container: HTMLElement, orientation: "bottom" | "left"): string[] =>
    [...container.querySelectorAll(`[data-silkplot-axis="${orientation}"] text`)].map(
      (t) => t.textContent ?? "",
    );

  const cellText = (container: HTMLElement): string[] =>
    [...container.querySelectorAll("tbody td")].map((td) => td.textContent ?? "");

  /**
   * The instant column, which is a `<th scope="row">` and NOT a `td` — that is
   * what makes each row announce its own time to a screen reader. Querying `td`
   * for it silently returns the value cells instead, which reads as the time
   * formatter having been ignored.
   */
  const rowHeaderText = (container: HTMLElement): string[] =>
    [...container.querySelectorAll("tbody th")].map((th) => th.textContent ?? "");

  it("formats x tick labels without touching the y axis", () => {
    const { container } = mountLine({ xTickFormat: (d: Date) => `H${d.getUTCHours()}` });

    expect(tickText(container, "bottom").some((t) => /^H\d+$/.test(t))).toBe(true);
    // The other axis must be untouched — one formatter reaching both axes is
    // the failure a single shared `format` prop would have produced.
    expect(tickText(container, "left").some((t) => /^H\d+$/.test(t))).toBe(false);
  });

  it("formats y tick labels without touching the x axis", () => {
    const { container } = mountLine({ yTickFormat: (n: number) => `${n} u` });

    expect(tickText(container, "left").some((t) => t.endsWith(" u"))).toBe(true);
    expect(tickText(container, "bottom").some((t) => t.endsWith(" u"))).toBe(false);
  });

  it("leaves the axes generic when no formatter is given", () => {
    // The default half of the contract. Without this, a test asserting the
    // formatted text would also pass against a chart that formatted ALWAYS.
    const { container } = mountLine();
    expect(tickText(container, "left").some((t) => t.endsWith(" u"))).toBe(false);
    expect(tickText(container, "bottom").some((t) => /^H\d+$/.test(t))).toBe(false);
  });

  it("formats table cells without touching the axis", () => {
    const { container } = mountLine({ tableValueFormat: (y: number) => `${y} kg` });

    expect(cellText(container).some((c) => c.endsWith(" kg"))).toBe(true);
    expect(tickText(container, "left").some((t) => t.endsWith(" kg"))).toBe(false);
  });

  it("formats the table's instant column independently of the x axis", () => {
    const { container } = mountLine({
      xTickFormat: (d: Date) => `H${d.getUTCHours()}`,
      tableTimeFormat: (d: Date) => `row ${d.getUTCHours()}`,
    });

    // The two surfaces carry the same Date and deliberately different text —
    // the whole reason they are separate props.
    expect(rowHeaderText(container).some((c) => c.startsWith("row "))).toBe(true);
    expect(rowHeaderText(container).some((c) => c.startsWith("H"))).toBe(false);
    expect(tickText(container, "bottom").some((t) => /^H\d+$/.test(t))).toBe(true);
  });

  it("gives each series' cells its own label", () => {
    const { container } = mountLine({
      tableValueFormat: (y: number, label: string) => `${y}${label}`,
    });
    const cells = cellText(container);

    // TWO is [a, b] with labels A and B, so every row must carry one of each.
    expect(cells.some((c) => c.endsWith("A"))).toBe(true);
    expect(cells.some((c) => c.endsWith("B"))).toBe(true);
  });

  it("re-renders the table when a formatter's own signal changes", () => {
    // The reason `tableOptions` is an accessor rather than a value read once. An
    // application that lets a user switch unit or locale gets a stale table if
    // this is spread at mount, and nothing about the chart looks wrong.
    const [unit, setUnit] = createSignal("kg");
    const { container } = render(() => (
      <LineChart
        title="Reactive format"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={TWO}
        tableValueFormat={(y: number) => `${y} ${unit()}`}
      />
    ));

    expect(cellText(container).some((c) => c.endsWith(" kg"))).toBe(true);

    setUnit("lb");
    expect(cellText(container).some((c) => c.endsWith(" lb"))).toBe(true);
    expect(cellText(container).some((c) => c.endsWith(" kg"))).toBe(false);
  });

  it("applies to the area chart on the same props", () => {
    // Both charts share `MultiSeriesInputWithFormat`, so this guards the wiring
    // rather than the contract — AreaChart threading only half of it would
    // otherwise be invisible until a consumer hit it.
    const { container } = render(() => (
      <AreaChart
        title="Formatted area"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={TWO}
        yTickFormat={(n: number) => `${n} u`}
        tableValueFormat={(y: number) => `${y} kg`}
      />
    ));

    expect(tickText(container, "left").some((t) => t.endsWith(" u"))).toBe(true);
    expect(cellText(container).some((c) => c.endsWith(" kg"))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Sizing — zero-size mount, reveal, and repeated resize                       */
/* -------------------------------------------------------------------------- */

/**
 * The failure this block exists for is silent in a specific way: a chart that
 * never got a real measurement, or kept a stale one, renders a perfectly valid
 * `<svg>` with marks that are empty, clipped, or drawn to the previous size.
 * None of that throws and none of it looks like a defect in a screenshot taken
 * at the wrong moment — it looks like an empty dataset, or like the data really
 * did stop there.
 *
 * Multi-series raises the stake: with several paths, a resize that updates some
 * and not others produces a chart that is internally inconsistent, which is
 * harder to spot than one that is uniformly wrong. So these assert across ALL
 * paths rather than the first, and compare paths to each other where the model
 * says they must agree.
 */
describe("sizing", () => {
  /** A container the test controls, so width is a fact rather than a default. */
  function mountSized(width: string, props: Record<string, unknown> = {}) {
    const host = document.createElement("div");
    host.style.width = width;
    document.body.appendChild(host);

    const result = render(
      () => (
        <LineChart
          title="Sized chart"
          desc="A multi-series sizing fixture"
          height={200}
          margins={NO_MARGINS}
          curve="linear"
          series={TWO}
          {...props}
        />
      ),
      { container: host },
    );

    return { ...result, host };
  }

  it("draws nothing rather than NaN geometry at zero width", () => {
    const { host, container } = mountSized("0px");

    // The contract is not "renders marks" — it is that an unmeasurable chart
    // emits no coordinate it cannot compute. A single NaN in a path `d` makes
    // the whole path silently invisible, which is why this is asserted rather
    // than assumed from the absence of a crash.
    expectNoNaN(container, "path", ["d"]);
    for (const p of markPaths(container)) {
      expect(p.getAttribute("d") ?? "").not.toContain("Infinity");
    }
    host.remove();
  });

  it("draws every series once the container becomes measurable", async () => {
    const { host, container } = mountSized("0px");

    host.style.width = "480px";

    // BOTH paths, not just the first: a chart that recovered one series and
    // left the other empty is exactly the internally-inconsistent state a
    // single-path assertion would report as a pass.
    await expect
      .poll(() => markPaths(container).filter((p) => (p.getAttribute("d") ?? "") !== "").length)
      .toBe(2);
    expectNoNaN(container, "path", ["d"]);
    host.remove();
  });

  it("reveals a hidden multi-series chart with real geometry, not a zero-width one", async () => {
    const [shown, setShown] = createSignal(false);
    const host = document.createElement("div");
    host.style.width = "480px";
    document.body.appendChild(host);

    const { container } = render(
      () => (
        <Show when={shown()}>
          <LineChart
            title="Revealed multi-series"
            desc="d"
            height={200}
            margins={NO_MARGINS}
            curve="linear"
            series={TWO}
          />
        </Show>
      ),
      { container: host },
    );

    expect(markPaths(container)).toHaveLength(0);

    setShown(true);

    // A chart mounted into an already-sized container still measures
    // asynchronously, so the meaningful assertion is that it ARRIVES at real
    // geometry — a mark whose `d` stayed empty is the zero-width failure.
    await expect
      .poll(() => markPaths(container).filter((p) => (p.getAttribute("d") ?? "") !== "").length)
      .toBe(2);
    expectNoNaN(container, "path", ["d"]);
    host.remove();
  });

  it("keeps no stale geometry across repeated resizes", async () => {
    const { host, container } = mountSized("200px");

    const widthsSeen: number[][] = [];

    for (const width of ["200px", "600px", "320px", "600px"]) {
      host.style.width = width;
      const px = Number.parseInt(width, 10);

      // Wait for BOTH paths to reach the new width. `x` of the last point is
      // the right probe: under NO_MARGINS the final point sits at the right
      // edge, so it tracks the container exactly.
      await expect
        .poll(() => {
          const ends = markPaths(container).map((p) => {
            const xs = pathXs(p.getAttribute("d") ?? "");
            return xs.length > 0 ? Math.round(xs[xs.length - 1] as number) : -1;
          });
          return ends.length === 2 && ends.every((x) => x === px);
        })
        .toBe(true);

      widthsSeen.push(
        markPaths(container).map((p) => {
          const xs = pathXs(p.getAttribute("d") ?? "");
          return Math.round(xs[xs.length - 1] as number);
        }),
      );
    }

    // Returning to a width already visited must reproduce that width's
    // geometry. A cached scale would make the second 600px render differ from
    // the first, and nothing else in the chart would report it.
    expect(widthsSeen[1]).toEqual(widthsSeen[3]);
    // And the intermediate narrow pass must genuinely have been narrower —
    // otherwise the loop proved only that nothing changed at all.
    expect(widthsSeen[2]?.[0]).toBeLessThan(widthsSeen[1]?.[0] as number);
    expectNoNaN(container, "path", ["d"]);
    host.remove();
  });

  it("resizes the area chart too, fill and stroke together", async () => {
    // The acceptance criterion names BOTH charts, and the earlier cases here
    // all mount a line. Area is not a formality: it draws TWO marks per series
    // — a fill and a top stroke — from one shared mapping, so a resize that
    // reached one and not the other would break the fill away from its own
    // outline. That renders, and reads as a drawing bug rather than a wiring
    // one.
    const host = document.createElement("div");
    host.style.width = "240px";
    document.body.appendChild(host);

    const { container } = render(
      () => (
        <AreaChart
          title="Sized area"
          desc="d"
          height={200}
          margins={NO_MARGINS}
          curve="linear"
          series={TWO}
        />
      ),
      { container: host },
    );

    host.style.width = "560px";

    // Every mark — 2 series x (fill + stroke) — must end at the new right edge.
    await expect
      .poll(() => {
        const ends = markPaths(container).map((p) => {
          const xs = pathXs(p.getAttribute("d") ?? "");
          return xs.length > 0 ? Math.round(Math.max(...xs)) : -1;
        });
        return ends.length >= 2 && ends.every((x) => x === 560);
      })
      .toBe(true);
    expectNoNaN(container, "path", ["d"]);
    host.remove();
  });

  it("reveals a hidden area chart with real geometry", async () => {
    const [shown, setShown] = createSignal(false);
    const host = document.createElement("div");
    host.style.width = "480px";
    document.body.appendChild(host);

    const { container } = render(
      () => (
        <Show when={shown()}>
          <AreaChart
            title="Revealed area"
            desc="d"
            height={200}
            margins={NO_MARGINS}
            curve="linear"
            series={TWO}
          />
        </Show>
      ),
      { container: host },
    );

    expect(markPaths(container)).toHaveLength(0);
    setShown(true);

    await expect
      .poll(() => markPaths(container).filter((p) => (p.getAttribute("d") ?? "") !== "").length)
      .toBeGreaterThanOrEqual(2);
    expectNoNaN(container, "path", ["d"]);
    host.remove();
  });

  it("keeps the series in step with each other through a resize", async () => {
    const { host, container } = mountSized("240px");

    host.style.width = "560px";

    // Both series share one x scale, so their x coordinates must be IDENTICAL
    // at every index. A resize that updated one path's scale and not the other
    // produces two charts in one frame, each individually plausible.
    //
    // The width check is NOT redundant with the agreement check, and leaving it
    // out made this test worthless: if the resize never lands, both paths keep
    // their old geometry and still agree perfectly. Mutating `createResize` to
    // drop its updates left this passing until the width assertion was added —
    // agreement is only meaningful once the resize is known to have happened.
    await expect
      .poll(() => {
        const [a, b] = markPaths(container).map((p) => pathXs(p.getAttribute("d") ?? ""));
        if (a === undefined || b === undefined || a.length === 0) return false;
        const lastA = Math.round(a[a.length - 1] as number);
        return a.join() === b.join() && lastA === 560;
      })
      .toBe(true);
    host.remove();
  });
});
