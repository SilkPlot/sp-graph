/**
 * The legend and the marks describe the SAME series.
 *
 * This is the assertion the legend exists to earn and the one most likely to
 * rot. A legend that computed its own swatch would keep working — it would
 * render, toggle, and announce correctly — while showing series B's colour
 * beside series A's label. Nothing in either package's own suite would notice,
 * because each is internally consistent.
 *
 * So this file deliberately sits at the seam: it mounts a real `<Legend>` from
 * `@silkplot/solid` and a real chart from this package over ONE series array,
 * and compares the rendered swatch to the rendered mark, per series, on both
 * channels — colour AND dash.
 *
 * It lives in `charts` rather than `solid` because `solid` cannot import from
 * `charts`; this is the only package that can see both halves at once.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "vitest/browser";
import type { Series } from "@silkplot/core";
import { Legend } from "@silkplot/solid";
import { LineChart } from "../src/index";
import { HEIGHT, NO_MARGINS, WIDTH, markPaths } from "./support";

const at = (hour: number): Date => new Date(Date.UTC(2026, 2, 1, hour));

const series = (id: string): Series => ({
  id,
  label: id.toUpperCase(),
  data: [
    { t: at(0), y: 1 },
    { t: at(1), y: 5 },
    { t: at(2), y: 3 },
  ],
});

const FOUR: readonly Series[] = [series("a"), series("b"), series("c"), series("d")];

/** Swatch canvases, in legend order. */
const swatches = (container: HTMLElement): HTMLCanvasElement[] =>
  Array.from(
    container.querySelectorAll<HTMLCanvasElement>(
      "button[data-sp-legend-item] [data-silkplot-legend-swatch]",
    ),
  );

const swatchStroke = (el: HTMLCanvasElement): string | null =>
  el.getAttribute("data-silkplot-swatch-stroke");

const swatchDash = (el: HTMLCanvasElement): string | null =>
  el.getAttribute("data-silkplot-swatch-dash");

function mountBoth(props: Record<string, unknown> = {}) {
  return render(() => (
    <>
      <Legend series={FOUR} {...props} />
      <LineChart
        title="Identity fixture"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={FOUR}
        legend={false}
        {...props}
      />
    </>
  ));
}

describe("legend swatches match their own marks", () => {
  it("uses the same stroke colour for each series", () => {
    const { container } = mountBoth();

    const legendStrokes = swatches(container).map(swatchStroke);
    const markStrokes = markPaths(container).map((p) => p.getAttribute("stroke"));

    expect(legendStrokes).toHaveLength(4);
    expect(markStrokes).toHaveLength(4);
    // Pairwise and in order — comparing SETS would pass against a legend whose
    // entries carry the right four colours in the wrong four places, which is
    // precisely the mismatch this file is about.
    expect(legendStrokes).toEqual(markStrokes);
  });

  it("uses the same dash pattern for each series", () => {
    const { container } = mountBoth();

    const legendDashes = swatches(container).map(swatchDash);
    const markDashes = markPaths(container).map((p) => p.getAttribute("stroke-dasharray"));

    expect(legendDashes).toEqual(markDashes);
    // And the channel is real rather than four copies of one value: a legend
    // and a chart that agreed on "no dash everywhere" would satisfy the
    // equality above while encoding by colour alone.
    expect(new Set(legendDashes).size).toBeGreaterThan(1);
  });

  it("keeps the pairing after a reorder", () => {
    const [list, setList] = createSignal<readonly Series[]>(FOUR);
    const { container } = render(() => (
      <>
        <Legend series={list()} />
        <LineChart
          title="Identity fixture"
          desc="d"
          width={WIDTH}
          height={HEIGHT}
          margins={NO_MARGINS}
          curve="linear"
          series={list()}
          legend={false}
        />
      </>
    ));

    setList([FOUR[3] as Series, FOUR[2] as Series, FOUR[1] as Series, FOUR[0] as Series]);

    // Colour follows array POSITION by ADR-0009, so both sides recolour — the
    // point is that they recolour together. A legend keyed differently from the
    // marks would drift apart exactly here.
    expect(swatches(container).map(swatchStroke)).toEqual(
      markPaths(container).map((p) => p.getAttribute("stroke")),
    );
  });

  it("keeps the pairing when a series is hidden", () => {
    const { container } = mountBoth({ visibleSeries: ["a", "c", "d"] });

    // The legend still lists every series; the chart draws only the visible
    // ones. So the surviving marks must match the swatches of the series that
    // are still shown — not the first three swatches.
    const shown = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]"),
    )
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => swatchStroke(b.querySelector("[data-silkplot-legend-swatch]") as HTMLCanvasElement));

    expect(markPaths(container)).toHaveLength(3);
    expect(shown).toEqual(markPaths(container).map((p) => p.getAttribute("stroke")));
  });
});

describe("one visibility state drives both", () => {
  it("hides the mark when the legend entry is toggled off", async () => {
    const [visible, setVisible] = createSignal<readonly string[]>(["a", "b", "c", "d"]);
    const { container } = render(() => (
      <>
        <Legend series={FOUR} visibleSeries={visible()} onVisibilityChange={setVisible} />
        <LineChart
          title="Identity fixture"
          desc="d"
          width={WIDTH}
          height={HEIGHT}
          margins={NO_MARGINS}
          curve="linear"
          series={FOUR}
          visibleSeries={visible()}
          legend={false}
        />
      </>
    ));

    expect(markPaths(container)).toHaveLength(4);

    const second = container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]")[1];
    await userEvent.click(second as HTMLButtonElement);

    // The mark count follows the legend, through the caller's state — which is
    // what makes one legend able to drive several charts.
    expect(markPaths(container)).toHaveLength(3);
    expect(second?.getAttribute("aria-pressed")).toBe("false");
  });

  it("empties the chart when the last entry is toggled off", async () => {
    const [visible, setVisible] = createSignal<readonly string[]>(["a"]);
    const { container } = render(() => (
      <>
        <Legend series={[series("a")]} visibleSeries={visible()} onVisibilityChange={setVisible} />
        <LineChart
          title="Identity fixture"
          desc="d"
          width={WIDTH}
          height={HEIGHT}
          margins={NO_MARGINS}
          curve="linear"
          series={[series("a")]}
          visibleSeries={visible()}
          legend={false}
        />
      </>
    ));

    await userEvent.click(
      container.querySelector("button[data-sp-legend-item]") as HTMLButtonElement,
    );

    // The empty set is a real state (ADR-0008 §6). If this ever renders four
    // marks again, the "no filter" bug is back.
    expect(markPaths(container)).toHaveLength(0);
  });

  it("keeps the axis describing only what is visible", () => {
    // ADR-0008 §7 — hidden series do not shape the axis. Asserted here rather
    // than only in the charts suite because it is the visible CONSEQUENCE of a
    // legend toggle, and the reason operators reach for one.
    const tall: readonly Series[] = [
      { id: "small", label: "Small", data: [{ t: at(0), y: 1 }, { t: at(1), y: 2 }] },
      { id: "spike", label: "Spike", data: [{ t: at(0), y: 1000 }, { t: at(1), y: 900 }] },
    ];

    const [visible, setVisible] = createSignal<readonly string[]>(["small", "spike"]);
    const { container } = render(() => (
      <>
        <Legend series={tall} visibleSeries={visible()} onVisibilityChange={setVisible} />
        <LineChart
          title="Identity fixture"
          desc="d"
          width={WIDTH}
          height={HEIGHT}
          margins={NO_MARGINS}
          curve="linear"
          series={tall}
          visibleSeries={visible()}
          legend={false}
        />
      </>
    ));

    const before = markPaths(container)[0]?.getAttribute("d");
    setVisible(["small"]);
    const after = markPaths(container)[0]?.getAttribute("d");

    // Same data, different pixels: hiding the spike rescaled the axis, which is
    // the whole gesture. Equal geometry would mean a pinned domain.
    expect(after).not.toBe(before);
  });
});

describe("the composed multi-series chart shows the shipped legend", () => {
  it("renders the controlled legend between the plot and the data table", () => {
    const { container } = render(() => (
      <LineChart
        title="Identity fixture"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={FOUR}
        visibleSeries={["a", "b", "c", "d"]}
      />
    ));

    const legend = container.querySelector("[data-silkplot-chart-legend]");
    const table = container.querySelector("[data-silkplot-table-toggle]");
    expect(legend).not.toBeNull();
    expect(legend!.querySelectorAll("button[data-sp-legend-item]")).toHaveLength(4);
    expect(table).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING = 4: table comes after the legend in the tree.
    expect(legend!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides a mark when the composed legend entry is toggled off", async () => {
    const [visible, setVisible] = createSignal<readonly string[]>(["a", "b", "c", "d"]);
    const { container } = render(() => (
      <LineChart
        title="Identity fixture"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={FOUR}
        visibleSeries={visible()}
        onVisibilityChange={setVisible}
      />
    ));

    expect(markPaths(container)).toHaveLength(4);
    const second = container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]")[1];
    await userEvent.click(second as HTMLButtonElement);
    expect(markPaths(container)).toHaveLength(3);
    expect(second?.getAttribute("aria-pressed")).toBe("false");
    expect(visible()).toEqual(["a", "c", "d"]);
  });

  it("opts out when legend={false}, so an application-placed legend is not doubled", () => {
    const { container } = mountBoth({ visibleSeries: ["a", "b", "c", "d"] });
    expect(container.querySelector("[data-silkplot-chart-legend]")).toBeNull();
    expect(container.querySelectorAll("button[data-sp-legend-item]")).toHaveLength(4);
  });

  it("does not insert a legend on an uncontrolled series chart", () => {
    const { container } = render(() => (
      <LineChart
        title="Identity fixture"
        desc="d"
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
        series={FOUR}
      />
    ));
    expect(container.querySelector("[data-silkplot-chart-legend]")).toBeNull();
    expect(container.querySelectorAll("button[data-sp-legend-item]")).toHaveLength(0);
  });
});
