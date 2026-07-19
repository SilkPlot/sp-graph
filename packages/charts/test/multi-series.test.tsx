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
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import type { Series } from "@silkplot/core";
import { AreaChart, LineChart } from "../src/index";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  expectNoNaN,
  markPaths,
  moveCount,
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
