/**
 * The composition workload gate.
 *
 * The multi-series, legend, reference-overlay, and ranked-bar phases each
 * verified one piece in isolation, and each passed. This suite proves the pieces
 * hold TOGETHER under the MVP's binding workload shapes (W1/W2/W3 in the
 * capability contract): 22 series plus three references in one chart, 48 charts
 * mounted at once, one-to-four progressive history, and ranked analysis across
 * both orientations. The failures it exists to catch are the ones between pieces
 * — a replacement that updates the marks but not the table, an id that collides
 * only at the 48th chart, a gap policy that survives alone but not beside a
 * reference overlay.
 *
 * Scope is NON-INTERACTIVE composition correctness. Pointer, zoom, pan, tooltip,
 * and the frame budget belong to the later interaction and performance work; this
 * suite makes no interaction or MVP-release claim. `onActivate` is exercised only
 * for the datum-IDENTITY it commits to (ADR-0013), which is a property of the
 * composed data, not an interaction model.
 */
import { describe, expect, it, vi } from "vitest";
import { createSignal, For, Match, Show, Switch, type ComponentProps } from "solid-js";
import { render, fireEvent } from "@solidjs/testing-library";
import { Legend } from "@silkplot/solid";
import type { Series } from "@silkplot/core";
import { AreaChart, BarChart, LineChart } from "../src/index";
import {
  WIDTH,
  HEIGHT,
  NO_MARGINS,
  markPaths,
  markD,
  bars,
  moveCount,
  pathXs,
  axisLabels,
  expectNoNaN,
} from "./support";
import {
  W1_SERIES_COUNT,
  W1_DASHBOARD_CHARTS,
  w1DenseSeries,
  w1ReplacementSeries,
  w1References,
  w1DashboardDeck,
  w2History,
  w2TickFormat,
  w3Ranked,
  w3Signed,
  w3Currency,
  w3Percent,
} from "./workload-fixtures";

/* -------------------------------------------------------------------------- */
/* W1 — the dense operational chart                                            */
/* -------------------------------------------------------------------------- */

describe("W1 — one chart composes 22 series with three references", () => {
  const mountDense = (props: Record<string, unknown> = {}) =>
    render(() => (
      <LineChart
        title="Bay telemetry"
        desc="Twenty-two crossing-zero sensor series with three references."
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={w1DenseSeries()}
        references={w1References()}
        {...props}
      />
    ));

  it("draws all 22 series with no hard limit and no non-finite geometry", () => {
    const { container } = mountDense();
    expect(markPaths(container)).toHaveLength(W1_SERIES_COUNT);
    for (const p of markPaths(container)) expect(p.getAttribute("d")).not.toContain("NaN");
  });

  it("honours break and connect gap policies in the SAME chart", () => {
    const { container } = mountDense();
    const paths = markPaths(container);
    // sensor-0 breaks (a second subpath at its null → moveCount 2); sensor-1
    // connects across its null (one subpath). Both policies, one composition.
    expect(moveCount(paths[0]?.getAttribute("d") ?? "")).toBeGreaterThan(1);
    expect(moveCount(paths[1]?.getAttribute("d") ?? "")).toBe(1);
  });

  it("keeps the union domain signed across zero", () => {
    const { container } = mountDense();
    const labels = (axisLabels(container, "left").filter(Boolean) as string[]).map((l) => l.trim());
    // Tick labels may use a Unicode minus (U+2212), so match the sign in the text
    // rather than parsing — a negative tick proves the domain spans below zero,
    // a positive one proves it spans above.
    expect(labels.some((l) => /^[-−]\d/.test(l))).toBe(true);
    expect(labels.some((l) => /^\d/.test(l))).toBe(true);
  });

  it("renders all three references — two on the value axis, one temporal — and lists them accessibly", () => {
    const { container } = mountDense();
    expect(container.querySelectorAll("[data-silkplot-reference] line")).toHaveLength(3);
    expect(container.querySelectorAll("[data-silkplot-reference-item]")).toHaveLength(3);
  });

  it("exposes an inspectable table related to the chart by aria-details", () => {
    const { container } = mountDense();
    const svg = container.querySelector("svg");
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(svg?.getAttribute("aria-details")).toBe(table?.id);
  });

  it("replaces all 22 series in place — same node, moved geometry, no stale NaN", () => {
    const [data, setData] = createSignal<Series[]>(w1DenseSeries());
    const { container } = render(() => (
      <LineChart
        title="Bay telemetry"
        desc="Replaceable dense series."
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={data()}
        references={w1References()}
      />
    ));
    const node = container.querySelector("svg");
    const before = markPaths(container).map((p) => p.getAttribute("d"));

    setData(w1ReplacementSeries());

    expect(container.querySelector("svg")).toBe(node);
    expect(markPaths(container)).toHaveLength(W1_SERIES_COUNT);
    expect(markPaths(container).map((p) => p.getAttribute("d"))).not.toEqual(before);
    for (const p of markPaths(container)) expect(p.getAttribute("d")).not.toContain("NaN");
  });

  it("drives a 22-entry legend as ONE tab stop, however far it overflows", () => {
    const { container } = render(() => <Legend series={w1DenseSeries()} />);
    expect(container.querySelectorAll("[data-sp-legend-item]")).toHaveLength(W1_SERIES_COUNT);
    // A roving-tabindex toolbar: exactly one tab stop whatever the entry count.
    expect(container.querySelectorAll("[data-sp-legend-item][tabindex='0']")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* W1 — the 48-chart mounted dashboard                                         */
/* -------------------------------------------------------------------------- */

type DeckItem = ReturnType<typeof w1DashboardDeck>[number];

/** One panel of the mounted dashboard, its family chosen by the deck. */
const Panel = (p: { spec: DeckItem; width?: number; height?: number }) => (
  <Switch>
    <Match when={p.spec.family === "line"}>
      <LineChart title={p.spec.title} data={p.spec.time} width={p.width} height={p.height} />
    </Match>
    <Match when={p.spec.family === "area"}>
      <AreaChart title={p.spec.title} data={p.spec.time} width={p.width} height={p.height} />
    </Match>
    <Match when={p.spec.family === "bar"}>
      <BarChart title={p.spec.title} categories={p.spec.categories} width={p.width} height={p.height} />
    </Match>
  </Switch>
);

describe("W1 — 48 charts mount in one dashboard", () => {
  it("gives every one of 48 charts a distinct name and zero duplicate DOM ids", () => {
    const deck = w1DashboardDeck(W1_DASHBOARD_CHARTS);
    const { container } = render(() => (
      <For each={deck}>{(spec) => <Panel spec={spec} width={200} height={120} />}</For>
    ));

    expect(container.querySelectorAll("svg")).toHaveLength(W1_DASHBOARD_CHARTS);

    const names = [...container.querySelectorAll("svg title")].map((t) => t.textContent);
    expect(new Set(names).size).toBe(W1_DASHBOARD_CHARTS);

    // Id collision is the composed failure that renders perfectly: an
    // `aria-details` or `id` reused across panels wires one chart to another's
    // table. Assert every id in the whole tree is unique, at scale.
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reveals initially-hidden panels, which then measure their own containers", async () => {
    const [shown, setShown] = createSignal(false);
    const deck = w1DashboardDeck(6);
    const { container } = render(() => (
      <>
        <For each={deck.slice(0, 3)}>{(spec) => <Panel spec={spec} width={200} height={120} />}</For>
        <Show when={shown()}>
          <For each={deck.slice(3)}>
            {(spec) => (
              // No fixed width/height: these must MEASURE their revealed box, the
              // W1 "hidden container becomes measurable" behaviour, at scale.
              <div style={{ width: "200px", height: "120px", "box-sizing": "content-box" }}>
                <Panel spec={spec} />
              </div>
            )}
          </For>
        </Show>
      </>
    ));

    expect(container.querySelectorAll("svg")).toHaveLength(3);

    setShown(true);
    await vi.waitFor(() => expect(container.querySelectorAll("svg")).toHaveLength(6));

    // Each revealed panel drew geometry rather than staying at zero width.
    await vi.waitFor(() => {
      const revealed = [...container.querySelectorAll("svg")].slice(3);
      for (const svg of revealed) {
        expect(svg.querySelector("path, rect, circle")).not.toBeNull();
      }
    });
  });

  it("tracks the final size across repeated resize, without remounting", async () => {
    const spec = w1DashboardDeck(1)[0]!;
    const { container } = render(() => (
      <div style={{ width: "300px", height: "160px", "box-sizing": "content-box" }}>
        <LineChart title="Resizer" data={spec.time} curve="linear" />
      </div>
    ));
    const box = container.firstElementChild as HTMLElement;
    const first = container.querySelector("svg");

    await vi.waitFor(() => expect(markD(container)).not.toBe(""));

    // Three successive resizes; the last is the widest. Geometry must reflect the
    // FINAL width, not an intermediate one the observer coalesced past.
    box.style.width = "420px";
    box.style.width = "260px";
    box.style.width = "520px";

    await vi.waitFor(() => {
      const xs = pathXs(markD(container));
      // inner width at 520 is ~468 (minus default margins); at the 260 intermediate
      // it would be ~208. A max x past 300 can only come from the final size.
      expect(Math.max(...xs)).toBeGreaterThan(300);
    });

    // Never torn down and rebuilt — a remount would drop any held state.
    expect(container.querySelector("svg")).toBe(first);
  });
});

/* -------------------------------------------------------------------------- */
/* W2 — progressively loaded history                                           */
/* -------------------------------------------------------------------------- */

describe("W2 — history grows in place across one to four series", () => {
  it("grows from 1 series/20 points to 4 series/60 points without remounting", () => {
    const [state, setState] = createSignal({ n: 1, pts: 20 });
    const { container } = render(() => (
      <LineChart
        title="Environmental history"
        desc="Progressive same-unit history."
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={w2History(state().n, state().pts)}
      />
    ));
    const node = container.querySelector("svg");
    expect(markPaths(container)).toHaveLength(1);

    setState({ n: 4, pts: 60 });

    expect(container.querySelector("svg")).toBe(node);
    expect(markPaths(container)).toHaveLength(4);
    for (const p of markPaths(container)) expect(p.getAttribute("d")).not.toContain("NaN");
  });

  it("draws break and connect policies without interpolating a null to zero", () => {
    const { container } = render(() => (
      <LineChart
        title="Env"
        desc="Gap policies."
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={w2History(2, 30)}
      />
    ));
    const paths = markPaths(container);
    expect(moveCount(paths[0]?.getAttribute("d") ?? "")).toBe(2); // break → two subpaths
    expect(moveCount(paths[1]?.getAttribute("d") ?? "")).toBe(1); // connect → one
  });

  it("routes the caller's locale/time-zone formatter to the time axis", () => {
    const { container } = render(() => (
      <LineChart
        title="Env"
        desc="Caller-formatted axis."
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        series={w2History(1, 40)}
        xTickFormat={w2TickFormat}
      />
    ));
    const labels = (axisLabels(container, "bottom").filter(Boolean) as string[]);
    // The caller's "en-GB / Africa/Johannesburg / dd Mon" format, e.g. "01 Jan".
    expect(labels.some((l) => /^\d{2} [A-Z][a-z]{2}$/.test(l))).toBe(true);
  });

  it("fills the area under a same-unit series", () => {
    const { container } = render(() => (
      <AreaChart
        title="Env filled"
        desc="Area fill."
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={w2History(2, 30)}
      />
    ));
    const filled = markPaths(container).filter((p) => {
      const fill = p.getAttribute("fill");
      return fill !== null && fill !== "none";
    });
    expect(filled.length).toBeGreaterThan(0);
  });

  it("survives empty → populated → empty with no non-finite geometry", () => {
    const [s, setS] = createSignal<Series[]>([]);
    const { container } = render(() => (
      <LineChart
        title="Env"
        desc="Empty transitions."
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={s()}
      />
    ));
    expect(markPaths(container)).toHaveLength(0);

    setS(w2History(2, 30));
    expect(markPaths(container)).toHaveLength(2);
    for (const p of markPaths(container)) expect(p.getAttribute("d")).not.toContain("NaN");

    setS([]);
    expect(markPaths(container)).toHaveLength(0);
    expectNoNaN(container, "path", ["d"]);
  });
});

/* -------------------------------------------------------------------------- */
/* W3 — analytical trends and rankings                                         */
/* -------------------------------------------------------------------------- */

describe("W3 — ranked analysis keeps meaning across orientation, format, and activation", () => {
  const mountRanked = (props: Record<string, unknown>) =>
    render(() => {
      const merged = {
        title: "Regional totals",
        desc: "Ranked analytical view.",
        width: WIDTH,
        height: HEIGHT,
        ...props,
      } as ComponentProps<typeof BarChart>;
      return <BarChart {...merged} />;
    });

  it("renders the same six ranked bars in both orientations", () => {
    const vertical = mountRanked({ categories: w3Ranked(), orientation: "vertical" });
    const horizontal = mountRanked({ categories: w3Ranked(), orientation: "horizontal" });
    expect(bars(vertical.container)).toHaveLength(6);
    expect(bars(horizontal.container)).toHaveLength(6);
  });

  it("truncates a long axis label but keeps the full text in the table", () => {
    const { container } = mountRanked({ categories: w3Ranked(), orientation: "horizontal" });
    const ticks = [...container.querySelectorAll("text")].map((t) => t.textContent ?? "");
    expect(ticks.some((t) => t.includes("…"))).toBe(true);
    // The category is a row header (`<th scope="row">`), not a `<td>`, so read the
    // whole table: the FULL label must survive there, untruncated — the ellipsis
    // is an axis-only fallback (ADR-0013 §5).
    const table = container.querySelector("table");
    expect(table?.textContent).toContain("KwaZulu-Natal Coastal Region");
    expect(table?.textContent).not.toContain("…");
  });

  it("threads currency and percentage formatters through the value axis", () => {
    const currency = mountRanked({ categories: w3Ranked(), valueTickFormat: w3Currency });
    const cTicks = [...currency.container.querySelectorAll("text")].map((t) => t.textContent ?? "");
    expect(cTicks.some((t) => t.includes("R"))).toBe(true);

    const percent = mountRanked({ categories: w3Signed(), valueTickFormat: w3Percent });
    const pTicks = [...percent.container.querySelectorAll("text")].map((t) => t.textContent ?? "");
    expect(pTicks.some((t) => t.includes("%"))).toBe(true);
  });

  it("crosses zero on a signed ranked set without non-finite geometry", () => {
    const { container } = mountRanked({ categories: w3Signed() });
    expectNoNaN(container, "rect", ["x", "y", "width", "height"]);
    expect(bars(container)).toHaveLength(6);
  });

  it("hands the caller's own datum, metadata included, back on activation", () => {
    const onActivate = vi.fn();
    const { container } = mountRanked({ categories: w3Ranked(), onActivate });
    const surface = container.querySelector("[tabindex]") as HTMLElement;
    surface.focus();
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    fireEvent.keyDown(surface, { key: "Enter" });

    expect(onActivate).toHaveBeenCalledTimes(1);
    const arg = onActivate.mock.calls[0]?.[0];
    // The caller's OWN object — id, label, and the non-plotted meta verbatim.
    expect(arg).toMatchObject({ id: "region-0", label: "Gauteng Provincial Health" });
    expect(arg.meta).toMatchObject({ rank: 1 });
  });
});
