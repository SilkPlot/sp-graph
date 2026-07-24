/**
 * The viewport wired into the chart scope.
 *
 * The viewport model and its holder existed but nothing drew from them. These
 * tests prove the wiring: a controlled `visibleDomain`, the `defaultVisibleDomain`
 * seed, the exposed command functions, `minSpan`, and the change callback all
 * move what a STANDALONE time chart actually draws — its x scale, its marks, and
 * its hit-index point count — while the y axis stays PINNED to the full-data
 * extent (ADR-0014 §3: a zoom of x does not autoscale y; that is an explicit
 * command, wired in a later phase), and the data table stays pinned to the DATA
 * scope, never the viewport (ADR-0022: the table is the alternative
 * representation of the dataset the chart's data scope selects, not of the
 * pixels currently framed).
 *
 * Every case uses `curve="linear"`, so `pathXs`/`pathYs` read real data
 * positions rather than a curve's bezier scaffolding, and `NO_MARGINS`, so the
 * plot's pixel space is the whole canvas and the scale maths is legible.
 *
 * The y-pinning oracle is deliberately built by hand from the FULL data and,
 * separately, from the VISIBLE subset: the two disagree, and the test asserts the
 * marks follow the full one. A test that read its answer from the code could not
 * tell a pinned axis from an autoscaled one.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { timeScale, type TimeInterval, type ViewportCause } from "@silkplot/core";
import type { ViewportCommands } from "@silkplot/solid";
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  expectedTimeXScale,
  expectedYScale,
  markD,
  pathXs,
  pathYs,
} from "./support";

const T0 = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const day = (n: number): Date => new Date(T0 + n * DAY);

/**
 * Five daily readings whose EXTREMES sit outside the middle three days. So the
 * full-data y extent (`[5, 100]`) differs from the visible-subset extent
 * (`[40, 60]`), and a pinned axis and an autoscaled one land a mark on different
 * pixels — which is the whole point of the pinning tests below.
 */
const DATA: TimePoint[] = [
  { t: day(0), y: 100 },
  { t: day(1), y: 40 },
  { t: day(2), y: 60 },
  { t: day(3), y: 50 },
  { t: day(4), y: 5 },
];

/** The window over days 1..3 — the three middle points, extremes excluded. */
const MID: TimeInterval = { start: day(1), end: day(3) };

describe("the viewport drives a standalone time chart", () => {
  it("with no viewport prop, draws the full extent (identity)", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    // All five points, positioned by a scale over the data's own extent — the
    // pre-viewport behaviour exactly (the oracle nices the domain the same way the
    // chart does).
    const xs = pathXs(markD(container));
    expect(xs).toHaveLength(5);
    const x = expectedTimeXScale(DATA.map((d) => d.t), WIDTH);
    DATA.forEach((d, i) => {
      expect(xs[i]).toBeCloseTo(x(d.t), 3);
    });
  });

  it("a controlled visibleDomain narrows the x scale and the drawn marks", () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        visibleDomain={MID}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const xs = pathXs(markD(container));
    // Only days 1, 2, 3 are inside the window.
    expect(xs).toHaveLength(3);
    // The x domain IS the window: day 1 sits at the left edge and day 3 at the right.
    const x = timeScale({ domain: [MID.start, MID.end], range: [0, WIDTH] });
    expect(xs[0]).toBeCloseTo(x(MID.start), 3);
    expect(xs[2]).toBeCloseTo(x(MID.end), 3);
  });

  it("narrows the drawn marks but not the table (ADR-0022)", () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        visibleDomain={MID}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    // Marks: the same three-point window as the test above.
    expect(pathXs(markD(container))).toHaveLength(3);
    // Table: standalone, with no section or dynamic selection above it, so the
    // data scope is the full five readings — the viewport never narrows it.
    expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
  });

  it("pins y to the full-data extent while x is narrowed (no autoscale)", () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        visibleDomain={MID}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const ys = pathYs(markD(container));
    expect(ys).toHaveLength(3);

    // Pinned: the axis is computed from ALL the data ([0, 100] under zero-floor),
    // not the three visible points ([0, 60]). The first drawn point is day 1, y=40.
    const pinned = expectedYScale(DATA.map((d) => d.y), "zero-floor", HEIGHT);
    const autoscaled = expectedYScale([40, 60, 50], "zero-floor", HEIGHT);
    const y0 = ys[0] ?? Number.NaN;
    expect(y0).toBeCloseTo(pinned(40), 3);
    // And it is NOT the autoscaled position — the two oracles genuinely disagree,
    // so this fails the moment a zoom starts moving y.
    expect(Math.abs(y0 - autoscaled(40))).toBeGreaterThan(1);
  });

  it("exposes zoomIn / reset command functions that move the viewport", () => {
    let commands: ViewportCommands | undefined;
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        onViewportCommands={(c) => {
          commands = c;
        }}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    // Opted in via the command callback, but un-navigated: the full extent.
    expect(pathXs(markD(container))).toHaveLength(5);

    // Zoom in halves the 4-day span about its centre (day 2) → the 2-day window
    // [day 1, day 3], which contains three points.
    commands?.zoomIn();
    expect(pathXs(markD(container))).toHaveLength(3);

    // Reset restores the full extent.
    commands?.reset();
    expect(pathXs(markD(container))).toHaveLength(5);
  });

  it("floors the zoom at minSpan", () => {
    let commands: ViewportCommands | undefined;
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        minSpan={5 * DAY}
        onViewportCommands={(c) => {
          commands = c;
        }}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    // The floor (5 days) is wider than the whole 4-day extent, so a zoom cannot
    // narrow it at all — the chart stays at the full extent. Without the floor,
    // the same zoomIn would drop to three points (previous test).
    commands?.zoomIn();
    expect(pathXs(markD(container))).toHaveLength(5);
  });

  it("emits the change cause once and does not loop when the caller feeds it back", () => {
    const [vd, setVd] = createSignal<TimeInterval | undefined>(undefined);
    const causes: ViewportCause[] = [];
    let commands: ViewportCommands | undefined;
    render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        visibleDomain={vd()}
        onVisibleDomainChange={(domain, cause) => {
          causes.push(cause);
          setVd(domain); // the echo — a controlled parent reflecting the change back
        }}
        onViewportCommands={(c) => {
          commands = c;
        }}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));

    commands?.zoomIn();
    // One command → exactly one callback, cause "zoom". Feeding the emitted domain
    // back into `visibleDomain` fires nothing further (ADR-0014 §7's echo guard).
    expect(causes).toEqual(["zoom"]);
  });

  it("keeps the zoomed interval when data grows past the edge (ADR-0014 §4)", () => {
    const [data, setData] = createSignal<TimePoint[]>(DATA);
    let commands: ViewportCommands | undefined;
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={data()}
        onViewportCommands={(c) => {
          commands = c;
        }}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    commands?.zoomIn();
    expect(pathXs(markD(container))).toHaveLength(3);

    // A new reading past the right edge does NOT auto-scroll the viewport to it —
    // following the live edge is a deliberate act, not a default.
    setData([...DATA, { t: day(5), y: 20 }]);
    expect(pathXs(markD(container))).toHaveLength(3);
  });

  it("drives a MULTI-series chart's marks from the same viewport", () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        series={[{ id: "a", label: "A", data: DATA }]}
        visibleDomain={MID}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    expect(pathXs(markD(container))).toHaveLength(3);
  });

  it("narrows a MULTI-series chart's drawn marks but not its table (ADR-0022)", () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        series={[{ id: "a", label: "A", data: DATA }]}
        visibleDomain={MID}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    expect(pathXs(markD(container))).toHaveLength(3);
    // The multi-series scope derives its table from the effective-domain series,
    // not the viewport-narrowed drawn series — same claim as the single-series
    // case above, over the `series` prop path.
    expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
  });
});
