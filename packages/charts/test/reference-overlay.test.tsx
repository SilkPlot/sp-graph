/**
 * Reference overlays on a composed chart — ADR-0008 §10, rendered.
 *
 * `core`'s suite proves the normalisation; none of it is repeated here. What is
 * provable only once a chart RENDERS is what this file is about: that a
 * reference reads the SAME scale as the marks, that domain participation
 * actually moves the axis, that a dashboard scope beats a reference rather than
 * being widened by one, that labels stack instead of overprinting, and that the
 * meaning survives in the accessible list when the drawn label cannot.
 *
 * The organising caution, inherited from `multi-series.test.tsx` and sharpened
 * by what this feature does: **a chart that drops a reference still renders and
 * looks completely fine.** So the reference COUNT is asserted alongside the
 * geometry almost everywhere — a test reading only the first line passes against
 * a chart drawing one threshold out of three.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import type { ReferenceValue, Series } from "@silkplot/core";
import { Dashboard } from "@silkplot/solid";
import { AreaChart, LineChart } from "../src/index";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  expectNoNaN,
  expectedYScale,
  markPaths,
  num,
  pathXs,
  pathYs,
} from "./support";

const at = (hour: number): Date => new Date(Date.UTC(2026, 2, 1, hour));

const series = (id: string, values: readonly (number | null)[]): Series => ({
  id,
  label: id.toUpperCase(),
  data: values.map((y, i) => ({ t: at(i), y })),
});

/** Three points, non-uniform: two points occupy the same two pixels whatever
 * their values under some policies, so a two-point fixture cannot tell a live
 * scale from a frozen one. */
const ONE: readonly Series[] = [series("a", [10, 30, 20])];

function mount(props: Record<string, unknown> = {}) {
  return render(() => (
    <LineChart
      title="Test chart"
      desc="A reference-overlay test fixture"
      width={WIDTH}
      height={HEIGHT}
      margins={NO_MARGINS}
      curve="linear"
      series={ONE}
      {...props}
    />
  ));
}

const refLines = (c: HTMLElement): SVGLineElement[] =>
  Array.from(c.querySelectorAll("[data-silkplot-reference] line"));

const refLine = (c: HTMLElement, id: string): SVGLineElement => {
  const el = c.querySelector<SVGLineElement>(`[data-silkplot-reference="${id}"] line`);
  expect(el, `no reference line rendered for id "${id}"`).not.toBeNull();
  return el as SVGLineElement;
};

const refLabels = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll("[data-silkplot-reference-label]")).map(
    (t) => t.textContent ?? "",
  );

const listItems = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll("[data-silkplot-reference-item]")).map(
    (li) => li.textContent ?? "",
  );

describe("geometry — a reference reads the chart's own scale", () => {
  it("draws a horizontal line at the y position the marks use", () => {
    // The defect this catches is SCALE DRIFT: an overlay that builds its own
    // scale renders a plausible line at the wrong height, and the picture stays
    // beautiful. So the assertion is not "a line exists at some y" — it is that
    // the line's y equals the y the SERIES path puts that same value at.
    const { container } = mount({ references: [{ id: "sla", value: 20, label: "SLA" }] });

    const ys = pathYs(markPaths(container)[0]?.getAttribute("d") ?? "");
    // The series' third point IS 20, so its pixel is the oracle — read off the
    // rendered marks rather than recomputed, so a drifting scale cannot satisfy
    // both.
    const yOfTwenty = ys[2] as number;

    const line = refLine(container, "sla");
    expect(num(line, "y1")).toBeCloseTo(yOfTwenty, 6);
    expect(num(line, "y2")).toBeCloseTo(yOfTwenty, 6);
    // Horizontal: spans the plot, does not slope.
    expect(num(line, "x1")).toBe(0);
    expect(num(line, "x2")).toBe(WIDTH);
  });

  it("draws a vertical line at the x position the marks use", () => {
    const { container } = mount({
      references: [{ id: "deploy", time: at(1), label: "Deploy" }],
    });
    // at(1) is the middle of a three-point series spanning at(0)..at(2), so it
    // lands at the horizontal centre. A scale built independently would have to
    // agree on both the domain AND the range to hit this.
    const line = refLine(container, "deploy");
    expect(num(line, "x1")).toBeCloseTo(WIDTH / 2, 6);
    expect(num(line, "x2")).toBeCloseTo(WIDTH / 2, 6);
    expect(num(line, "y1")).toBe(0);
    expect(num(line, "y2")).toBe(HEIGHT);
  });

  it("renders all three of three references, not just the first", () => {
    const { container } = mount({
      references: [
        { id: "a", value: 12, label: "A" },
        { id: "b", value: 18, label: "B" },
        { id: "c", time: at(1), label: "C" },
      ],
    });
    expect(refLines(container)).toHaveLength(3);
    expectNoNaN(container, "[data-silkplot-reference] line", ["x1", "y1", "x2", "y2"]);
  });
});

describe("domain participation — §10's default, and its cost", () => {
  it("expands the y domain to contain a reference above the data", () => {
    // Without participation this line has nowhere to be drawn, and a line drawn
    // nowhere looks exactly like a working chart — which is why the default is
    // `true` rather than the cheaper `false`.
    const { container } = mount({ references: [{ id: "sla", value: 95, label: "SLA" }] });

    // Line is `zero-floor`; the domain must now span the reference too.
    const expected = expectedYScale([10, 30, 20, 95], "zero-floor", HEIGHT);
    const ys = pathYs(markPaths(container)[0]?.getAttribute("d") ?? "");
    expect(ys[1]).toBeCloseTo(expected(30), 6);
    expect(num(refLine(container, "sla"), "y1")).toBeCloseTo(expected(95), 6);
  });

  it("leaves the domain alone when a reference opts out", () => {
    // The case the opt-out exists for: 4000 would compress the series into a
    // band. The series must be scaled as though the reference were not there.
    const withOptOut = mount({
      references: [
        { id: "design", value: 4000, label: "Design maximum", includeInDomain: false },
      ],
    });
    const bare = mount();

    const yOf = (r: ReturnType<typeof mount>): number[] =>
      pathYs(markPaths(r.container)[0]?.getAttribute("d") ?? "");
    expect(yOf(withOptOut)).toEqual(yOf(bare));
  });

  it("does not draw an opted-out reference that falls outside the plot", () => {
    // Clipped, not drawn at the edge and not drawn at zero. A line pinned to the
    // top of the plot would claim the threshold is reachable.
    const { container } = mount({
      references: [
        { id: "design", value: 4000, label: "Design maximum", includeInDomain: false },
      ],
    });
    expect(refLines(container)).toHaveLength(0);
  });

  it("still lists an undrawn reference in the accessible list", () => {
    // The property that makes clipping acceptable at all: the threshold's
    // meaning does not live in the drawn line.
    const { container } = mount({
      references: [
        { id: "design", value: 4000, label: "Design maximum", includeInDomain: false },
      ],
    });
    expect(listItems(container)).toEqual(["Design maximum: 4000"]);
  });

  it("expands the y domain DOWNWARD for a reference below a signed series", () => {
    // Signed data is where a one-sided implementation shows up: folding
    // references into `Math.max` only would silently ignore a floor.
    const signed: readonly Series[] = [series("s", [-5, 4, -2])];
    const { container } = mount({
      series: signed,
      references: [{ id: "floor", value: -40, label: "Floor" }],
    });
    const expected = expectedYScale([-5, 4, -2, -40], "zero-floor", HEIGHT);
    expect(num(refLine(container, "floor"), "y1")).toBeCloseTo(expected(-40), 6);
  });
});

describe("the dashboard scope beats a reference", () => {
  it("does not widen a dashboard's time domain to reach a reference", () => {
    // ADR-0007 §3's precedence is TOTAL, and a reference is not a scope. If a
    // reference could widen it, this tile would show a different interval from
    // the dashboard's own range control with nothing marking it as such.
    const outside = at(50);
    const { container } = render(() => (
      <Dashboard
        defaultRange={{ start: at(0).valueOf(), end: at(2).valueOf() }}
        range={{ start: at(0).valueOf(), end: at(2).valueOf() }}
      >
        <LineChart
          title="Scoped chart"
          desc="Reference outside the dashboard range"
          width={WIDTH}
          height={HEIGHT}
          margins={NO_MARGINS}
          curve="linear"
          series={ONE}
          references={[{ id: "late", time: outside, label: "Late" }]}
        />
      </Dashboard>
    ));

    // Clipped rather than drawn, and the plot still spans exactly the scope: the
    // rightmost mark sits at the right edge, which it would not if the domain
    // had stretched out to `at(50)` — at(2) would then land at about 4% across.
    expect(refLines(container)).toHaveLength(0);
    const xs = pathXs(markPaths(container)[0]?.getAttribute("d") ?? "");
    expect(xs).toHaveLength(3);
    expect(xs[0]).toBeCloseTo(0, 6);
    expect(xs[2]).toBeCloseTo(WIDTH, 6);
  });

  it("DOES widen the standalone time domain for the same reference", () => {
    // The other half of the exception, and the reason it is an exception rather
    // than a blanket rule: with no scope in force there is nothing whose
    // authority the reference would be overriding, so §10's default applies.
    const { container } = mount({
      references: [{ id: "late", time: at(4), label: "Late" }],
    });
    // Data spans at(0)..at(2) and the reference sits at at(4), so the domain now
    // runs 0..4 and the reference takes the right edge.
    expect(num(refLine(container, "late"), "x1")).toBeCloseTo(WIDTH, 6);
    // The load-bearing half: the DATA was pushed left by the widening. The last
    // point sat at WIDTH before and must now sit at half of it (at(2) of at(0)..
    // at(4)). Without this, a chart that widened nothing would still pass above.
    const xs = pathXs(markPaths(container)[0]?.getAttribute("d") ?? "");
    expect(xs).toHaveLength(3);
    expect(xs[2]).toBeCloseTo(WIDTH / 2, 6);
  });
});

describe("labels — collision, and what happens when one cannot be placed", () => {
  it("does not overprint two labels at the same value", () => {
    // Two thresholds a pixel apart is the ordinary operational case (a warning
    // just under an SLA). Overprinted, both are unreadable and nothing reports
    // it — the failure is purely visual and completely silent.
    const { container } = mount({
      references: [
        { id: "sla", value: 20, label: "SLA floor" },
        { id: "warn", value: 20.0001, label: "Warning" },
      ],
    });
    const labels = Array.from(
      container.querySelectorAll<SVGTextElement>("[data-silkplot-reference-label]"),
    );
    expect(labels).toHaveLength(2);
    const [a, b] = labels as [SVGTextElement, SVGTextElement];
    // Same y band, so they must have been separated on x.
    expect(num(a, "x")).not.toBeCloseTo(num(b, "x"), 1);
  });

  it("keeps both labels when the values are far apart", () => {
    // The other direction: a collision solver that always offsets would push a
    // label off the plot for two references that never collided.
    const { container } = mount({
      references: [
        { id: "lo", value: 12, label: "Low" },
        { id: "hi", value: 28, label: "High" },
      ],
    });
    const xs = Array.from(
      container.querySelectorAll<SVGTextElement>("[data-silkplot-reference-label]"),
    ).map((t) => num(t, "x"));
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeCloseTo(xs[1] as number, 6);
  });

  it("drops a label it cannot place rather than spilling it, and keeps the line", () => {
    // A narrow container. The line still carries the position; only the text is
    // dropped, and the accessible list below is why that is survivable.
    const { container } = mount({
      width: 60,
      references: [
        { id: "a", value: 20, label: "A very long threshold label indeed" },
        { id: "b", value: 20.0001, label: "Another very long threshold label" },
      ],
    });
    expect(refLines(container)).toHaveLength(2);
    expect(refLabels(container).length).toBeLessThan(2);
  });

  it("lists every reference regardless of what was drawn", () => {
    // The invariant the whole collision fallback rests on. If this ever narrows
    // to "the ones that fitted", dropping a label becomes information loss.
    const { container } = mount({
      width: 60,
      references: [
        { id: "a", value: 20, label: "A very long threshold label indeed" },
        { id: "b", value: 20.0001, label: "Another very long threshold label" },
      ],
    });
    expect(listItems(container)).toHaveLength(2);
  });
});

describe("the accessible carrier", () => {
  it("renders no list at all when there are no references", () => {
    // An empty heading with an empty list is still an element a reader lands on.
    const { container } = mount();
    expect(container.querySelector("[data-silkplot-reference-list]")).toBeNull();
  });

  it("words a value reference with the caller's y tick formatter", () => {
    // Not a third formatter prop: the reference sits ON this axis, so it must
    // read the way the axis reads. ADR-0010.
    const { container } = mount({
      references: [{ id: "sla", value: 95, label: "SLA floor" }],
      yTickFormat: (v: number) => `${v} kW`,
    });
    expect(listItems(container)).toEqual(["SLA floor: 95 kW"]);
  });

  it("words a time reference with the caller's x tick formatter", () => {
    const { container } = mount({
      references: [{ id: "deploy", time: at(1), label: "Deploy" }],
      xTickFormat: () => "01:00",
    });
    expect(listItems(container)).toEqual(["Deploy: 01:00"]);
  });

  it("falls back to an ISO instant and a bare number with no formatter", () => {
    // §9's generic-and-honest default. A library-invented "1 Mar, 1am" would be
    // confidently wrong in a second language.
    const { container } = mount({
      references: [
        { id: "sla", value: 95, label: "SLA floor" },
        { id: "deploy", time: at(1), label: "Deploy" },
      ],
    });
    expect(listItems(container)).toEqual([
      "SLA floor: 95",
      `Deploy: ${at(1).toISOString()}`,
    ]);
  });

  it("carries meaning in a non-colour channel as well as colour", () => {
    // ADR-0005 §5: colour may encode, never uniquely encode. The reference is
    // dashed by default AND labelled, so a monochrome rendering still separates
    // it from the solid marks.
    const { container } = mount({ references: [{ id: "sla", value: 20, label: "SLA" }] });
    const dash = refLine(container, "sla").getAttribute("stroke-dasharray");
    expect(dash).toBeTruthy();
    expect(dash).not.toBe("none");
  });

  it("serialises a caller's dash array the way a series style does", () => {
    const { container } = mount({
      references: [{ id: "sla", value: 20, label: "SLA", style: { dash: [2, 2] } }],
    });
    expect(refLine(container, "sla").getAttribute("stroke-dasharray")).toBe("2 2");
  });
});

describe("reactivity — references are dynamic", () => {
  it("moves a reference when its value is replaced", () => {
    // The STALE REFERENCE defect: an overlay that reads its position once
    // renders a line that stops tracking, and the chart still looks right. Watch
    // y, and use a non-uniform change — a uniform rescale maps to identical
    // pixels under some policies.
    const [value, setValue] = createSignal(12);
    const { container } = render(() => (
      <LineChart
        title="Reactive"
        desc="Reference value replaced"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={ONE}
        references={[{ id: "sla", value: value(), label: "SLA" }]}
      />
    ));

    const before = num(refLine(container, "sla"), "y1");
    setValue(28);
    const after = num(refLine(container, "sla"), "y1");

    expect(after).not.toBeCloseTo(before, 3);
    // And it landed where the SERIES scale puts 28 — moving is not enough, it
    // must move to the right place.
    const expected = expectedYScale([10, 30, 20], "zero-floor", HEIGHT);
    expect(after).toBeCloseTo(expected(28), 6);
  });

  it("re-scales the axis when a domain-participating reference is replaced", () => {
    const [value, setValue] = createSignal(20);
    const { container } = render(() => (
      <LineChart
        title="Reactive domain"
        desc="Reference drags the domain"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={ONE}
        references={[{ id: "sla", value: value(), label: "SLA" }]}
      />
    ));

    const seriesYBefore = pathYs(markPaths(container)[0]?.getAttribute("d") ?? "");
    setValue(200);
    const seriesYAfter = pathYs(markPaths(container)[0]?.getAttribute("d") ?? "");

    // The MARKS must have moved: the domain now reaches 200, so the data is
    // compressed toward the baseline. A chart whose marks did not move is one
    // where the reference never reached the domain computation.
    expect(seriesYAfter).not.toEqual(seriesYBefore);
    const expected = expectedYScale([10, 30, 20, 200], "zero-floor", HEIGHT);
    expect(seriesYAfter[1]).toBeCloseTo(expected(30), 6);
  });

  it("adds and removes references without leaving the old ones behind", () => {
    // Stale identity in the DOM. A keyed render that reused nodes by position
    // would leave a removed threshold on screen with a new one's label.
    const [refs, setRefs] = createSignal<readonly ReferenceValue[]>([
      { id: "a", value: 12, label: "A" },
      { id: "b", value: 18, label: "B" },
    ]);
    const { container } = render(() => (
      <LineChart
        title="Reactive set"
        desc="References added and removed"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={ONE}
        references={refs()}
      />
    ));

    expect(refLines(container)).toHaveLength(2);
    setRefs([{ id: "b", value: 18, label: "B" }]);
    expect(refLines(container)).toHaveLength(1);
    expect(container.querySelector('[data-silkplot-reference="a"]')).toBeNull();
    expect(listItems(container)).toEqual(["B: 18"]);
  });

  it("keeps references drawn when a series is hidden", () => {
    // Visibility is a SERIES concept (§6). A reference is not a series and must
    // not disappear with one — but the axis it sits on does move (§7), so its
    // pixel changes while its presence does not.
    const two: readonly Series[] = [series("a", [10, 30, 20]), series("b", [100, 300, 200])];
    const [visible, setVisible] = createSignal<readonly string[]>(["a", "b"]);
    const { container } = render(() => (
      <LineChart
        title="Hidden series"
        desc="A reference outlives a hidden series"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={two}
        visibleSeries={visible()}
        references={[{ id: "sla", value: 20, label: "SLA" }]}
      />
    ));

    const before = num(refLine(container, "sla"), "y1");
    setVisible(["a"]);
    expect(refLines(container)).toHaveLength(1);
    // Hiding the 100–300 series rescales the axis, so 20 moves DOWN the screen.
    expect(num(refLine(container, "sla"), "y1")).not.toBeCloseTo(before, 3);
  });

  it("renders a reference against a CONSTANT series without collapsing", () => {
    // A constant series has a zero-width extent, which is where a domain
    // computation divides by its own span. Folding a reference in changes the
    // extent from degenerate to real, so this is the case where a reference
    // participating in the domain is the only thing making the scale sane —
    // and where an implementation that special-cased the degenerate extent
    // BEFORE adding references would put the line somewhere arbitrary.
    const flat: readonly Series[] = [series("flat", [7, 7, 7])];
    const { container } = mount({
      series: flat,
      references: [{ id: "sla", value: 20, label: "SLA" }],
    });
    expectNoNaN(container, "[data-silkplot-reference] line", ["x1", "y1", "x2", "y2"]);
    // zero-floor over {7, 20} is [0, 20], so the reference takes the top edge
    // and the flat series sits at 7/20 of the way up from the baseline.
    const expected = expectedYScale([7, 7, 7, 20], "zero-floor", HEIGHT);
    expect(num(refLine(container, "sla"), "y1")).toBeCloseTo(expected(20), 6);
    expect(pathYs(markPaths(container)[0]?.getAttribute("d") ?? "")[0]).toBeCloseTo(
      expected(7),
      6,
    );
  });

  it("renders references on an empty chart without producing NaN geometry", () => {
    // Empty data is where a domain fallback shows up. `extentOf` returns [0,1]
    // on nothing finite; a reference folded in must not produce a NaN scale.
    const { container } = mount({
      series: [],
      references: [{ id: "sla", value: 20, label: "SLA" }],
    });
    expectNoNaN(container, "[data-silkplot-reference] line", ["x1", "y1", "x2", "y2"]);
    expect(listItems(container)).toEqual(["SLA: 20"]);
  });
});

/**
 * AreaChart carries the identical wiring, and "identical" is exactly why it
 * needs its own test rather than an argument.
 *
 * Both charts route references through the same `createMultiSeriesScope` and the
 * same `MultiSeriesBody`, so the behaviour is shared — but the WIRING is four
 * hand-written props per chart, and a chart that forgot one renders perfectly
 * with no references at all. The coverage floor caught this file testing only
 * `LineChart`, which is what a floor is for: nothing about the suite looked
 * incomplete.
 *
 * These deliberately do not re-test the overlay's behaviour. They test that
 * this chart is CONNECTED to it.
 */
describe("AreaChart is wired to the same overlay", () => {
  const mountArea = (props: Record<string, unknown> = {}) =>
    render(() => (
      <AreaChart
        title="Area chart"
        desc="A reference-overlay test fixture, filled"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={ONE}
        {...props}
      />
    ));

  it("draws its references and lists them", () => {
    const { container } = mountArea({
      references: [
        { id: "sla", value: 34, label: "SLA floor" },
        { id: "deploy", time: at(1), label: "Deploy" },
      ],
    });
    expect(refLines(container)).toHaveLength(2);
    expect(listItems(container)).toEqual([
      "SLA floor: 34",
      `Deploy: ${at(1).toISOString()}`,
    ]);
  });

  it("lets a reference expand its zero-baseline domain", () => {
    // Area is `zero-baseline`, not `zero-floor`. Asserting against Area's own
    // policy rather than reusing Line's is the point: collapsing the two is a
    // known, invisible mistake, and a reference folded into the wrong one would
    // put the line in a plausible wrong place.
    const { container } = mountArea({ references: [{ id: "sla", value: 95, label: "SLA" }] });
    const expected = expectedYScale([10, 30, 20, 95], "zero-baseline", HEIGHT);
    expect(num(refLine(container, "sla"), "y1")).toBeCloseTo(expected(95), 6);
  });

  it("words its list with its own axis formatter", () => {
    const { container } = mountArea({
      references: [{ id: "sla", value: 34, label: "SLA floor" }],
      yTickFormat: (v: number) => `${v} kW`,
    });
    expect(listItems(container)).toEqual(["SLA floor: 34 kW"]);
  });
});
