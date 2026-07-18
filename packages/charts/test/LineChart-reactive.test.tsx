/**
 * LineChart under a series REPLACEMENT on a mounted chart — the reactive-model
 * surface, split out from `LineChart.test.tsx` (whose cases each render once and
 * never move). This is the canonical version of the case; AreaChart's and
 * BarChart's equivalents point here for the rationale.
 *
 * The model used to capture `data` as an array: the caller's component body
 * evaluated `props.data` once, outside any tracking scope, so the y scale froze
 * on the first series while the path went on reading the live prop. The failure
 * was not a chart that stopped updating — it was a chart whose axis and mark
 * disagreed about which data they were drawing, and still rendered.
 *
 * Every case here watches Y. `x` was always a thunk, so it was always reactive:
 * a test that asserted the x axis rescaled would have passed against the bug and
 * proved nothing.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  expectNoNaN,
  expectedTimeXScale,
  expectedYScale,
  markD,
  pathYs,
} from "./support";

/**
 * The scales LineChart composes, rebuilt from the same inputs.
 *
 * `"zero-floor"` is named here, not imported from a shared default — `support.ts`
 * deliberately refuses to pick a policy for its callers, so each suite declares
 * the one its chart is supposed to hold. It is LineChart's own policy and the one
 * thing that separates it from Area and Bar; passing `"zero-baseline"` here would
 * make these tests agree with the wrong chart.
 */
function scalesFor(data: readonly TimePoint[], innerWidth: number, innerHeight: number) {
  return {
    x: expectedTimeXScale(
      data.map((d) => d.t),
      innerWidth,
    ),
    y: expectedYScale(
      data.map((d) => d.y),
      "zero-floor",
      innerHeight,
    ),
  };
}

describe("LineChart — data replacement", () => {
  const BEFORE: TimePoint[] = [
    { t: new Date(Date.UTC(2026, 0, 1)), y: 1 },
    { t: new Date(Date.UTC(2026, 0, 2)), y: 2 },
  ];
  // Two orders of magnitude up, and NOT proportional to BEFORE: a series that
  // merely scaled would land on the same pixels and could not tell a live scale
  // from a stale one.
  const AFTER: TimePoint[] = [
    { t: new Date(Date.UTC(2026, 0, 1)), y: 100 },
    { t: new Date(Date.UTC(2026, 0, 2)), y: 150 },
  ];

  /**
   * Assert the rendered path is the one the CURRENT series implies: every
   * plotted y matches a freshly-built scale, is finite, and lands inside the
   * drawing area. Against the captured-data path the domain stays behind, so
   * y(100) on a [0, 2] domain resolves to roughly -14700 on a 300px canvas.
   */
  function expectPathTracks(container: HTMLElement, data: readonly TimePoint[]): void {
    const { y } = scalesFor(data, WIDTH, HEIGHT);
    const ys = pathYs(markD(container));
    expect(ys).toHaveLength(data.length);
    data.forEach((d, i) => {
      const py = ys[i] as number;
      expect(Number.isFinite(py)).toBe(true);
      expect(py).toBeCloseTo(y(d.y), 3);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThanOrEqual(HEIGHT);
    });
  }

  it("rescales y when the values change, keeping the path on canvas", () => {
    const [data, setData] = createSignal<TimePoint[]>(BEFORE);
    const { container } = render(() => (
      <LineChart title="Daily readings" data={data()} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    expectPathTracks(container, BEFORE);

    setData(AFTER);

    expectPathTracks(container, AFTER);
    // Guard against a vacuous pass: if the two series shared a y-domain, every
    // assertion above would hold against a scale that never recomputed.
    expect(scalesFor(AFTER, WIDTH, HEIGHT).y.domain()).not.toEqual(
      scalesFor(BEFORE, WIDTH, HEIGHT).y.domain(),
    );
  });

  it("rescales y when the time domain changes with the values", () => {
    const shifted: TimePoint[] = [
      { t: new Date(Date.UTC(2026, 5, 1)), y: 40 },
      { t: new Date(Date.UTC(2026, 5, 8)), y: 90 },
    ];
    const [data, setData] = createSignal<TimePoint[]>(BEFORE);
    const { container } = render(() => (
      <LineChart title="Daily readings" data={data()} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));

    setData(shifted);

    expectPathTracks(container, shifted);
    expect(scalesFor(shifted, WIDTH, HEIGHT).y.domain()).not.toEqual(
      scalesFor(BEFORE, WIDTH, HEIGHT).y.domain(),
    );
  });

  it("rescales y when only the cardinality changes", () => {
    const longer: TimePoint[] = [
      { t: new Date(Date.UTC(2026, 0, 1)), y: 1 },
      { t: new Date(Date.UTC(2026, 0, 2)), y: 2 },
      { t: new Date(Date.UTC(2026, 0, 3)), y: 70 },
    ];
    const [data, setData] = createSignal<TimePoint[]>(BEFORE);
    const { container } = render(() => (
      <LineChart title="Daily readings" data={data()} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));

    setData(longer);

    // The appended datum is the new maximum, so the domain must grow with it.
    expectPathTracks(container, longer);
    expect(scalesFor(longer, WIDTH, HEIGHT).y.domain()).not.toEqual(
      scalesFor(BEFORE, WIDTH, HEIGHT).y.domain(),
    );
  });

  it("survives empty -> populated -> empty without emitting NaN", () => {
    const [data, setData] = createSignal<TimePoint[]>([]);
    const { container } = render(() => (
      <LineChart title="Daily readings" data={data()} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const noNaN = (): void => expectNoNaN(container, "path", ["d"]);
    noNaN();

    setData(AFTER);
    expectPathTracks(container, AFTER);
    noNaN();

    // Back to empty: the domain returns to the empty sentinel rather than
    // holding the populated one, and nothing renders a NaN on the way out.
    setData([]);
    noNaN();
    expect(pathYs(markD(container))).toHaveLength(0);
  });
});
