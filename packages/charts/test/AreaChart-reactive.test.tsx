/**
 * AreaChart under a series REPLACEMENT on a mounted chart — the reactive-model
 * surface, split out from `AreaChart.test.tsx` (which renders each case once and
 * never moves). See `LineChart-reactive.test.tsx` for why this case is
 * unreachable from a fixed-data render and why every assertion here watches Y.
 *
 * AreaChart carries one hazard LineChart does not: `baselineY` is derived from
 * `model.y()`, so a stale scale gave a stale baseline — the fill closed on a
 * pixel the axis labelled as some other number. Only a sign change moves the
 * baseline, so that is the case which can see it: for an all-positive series
 * zero sits at the bottom, for an all-negative series it sits at the top, and a
 * positive -> positive replacement leaves it at the bottom either way.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { AreaChart } from "../src/index";
import type { TimePoint } from "../src/index";
import {
  HEIGHT,
  NO_MARGINS,
  WIDTH,
  expectNoNaN,
  expectedYScale,
  markPaths as getPaths,
  pathYs,
} from "./support";

/**
 * The y-scale AreaChart composes, rebuilt from the same inputs.
 *
 * `"zero-baseline"` is named here rather than imported from a shared default —
 * `support.ts` deliberately refuses to pick a policy for its callers, so each
 * suite declares the one its chart is supposed to hold. It is what separates
 * AreaChart from LineChart, whose `"zero-floor"` leaves the top bound at the
 * data's own maximum; the two agree on every all-positive series and part
 * company on an all-negative one.
 */
function yScaleFor(data: readonly TimePoint[], innerHeight: number) {
  return expectedYScale(
    data.map((d) => d.y),
    "zero-baseline",
    innerHeight,
  );
}

describe("AreaChart — data replacement", () => {
  const BEFORE: TimePoint[] = [
    { t: new Date(Date.UTC(2026, 0, 1)), y: 1 },
    { t: new Date(Date.UTC(2026, 0, 2)), y: 2 },
  ];
  // Not proportional to BEFORE: a scaled series lands on the same pixels and
  // could not tell a live scale from a frozen one.
  const AFTER: TimePoint[] = [
    { t: new Date(Date.UTC(2026, 0, 1)), y: 100 },
    { t: new Date(Date.UTC(2026, 0, 2)), y: 150 },
  ];

  /**
   * Assert both marks track the CURRENT series. `areaPath` emits the value edge
   * forward and the baseline edge back, so the first `n` plotted ys are the
   * data's own positions and the remainder are all the zero baseline.
   */
  function expectAreaTracks(container: HTMLElement, data: readonly TimePoint[]): void {
    const y = yScaleFor(data, HEIGHT);
    const [areaEl, lineEl] = getPaths(container) as [SVGPathElement, SVGPathElement];
    const areaYs = pathYs(areaEl.getAttribute("d") ?? "");
    const lineYs = pathYs(lineEl.getAttribute("d") ?? "");

    expect(lineYs).toHaveLength(data.length);
    expect(areaYs).toHaveLength(data.length * 2);

    data.forEach((d, i) => {
      for (const py of [lineYs[i] as number, areaYs[i] as number]) {
        expect(Number.isFinite(py)).toBe(true);
        expect(py).toBeCloseTo(y(d.y), 3);
        expect(py).toBeGreaterThanOrEqual(0);
        expect(py).toBeLessThanOrEqual(HEIGHT);
      }
    });

    // The closing edge is the baseline, and `baselineY` derives from the same
    // scale — so this is where a stale `model.y()` shows up directly.
    for (const py of areaYs.slice(data.length)) {
      expect(py).toBeCloseTo(y(0), 3);
    }
  }

  it("rescales y and the fill when the values change", () => {
    const [data, setData] = createSignal<TimePoint[]>(BEFORE);
    const { container } = render(() => (
      <AreaChart title="Coverage over time" data={data()} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    expectAreaTracks(container, BEFORE);

    setData(AFTER);

    expectAreaTracks(container, AFTER);
    // Guard against a vacuous pass: a shared y-domain would satisfy every
    // assertion above without the scale ever recomputing.
    expect(yScaleFor(AFTER, HEIGHT).domain()).not.toEqual(yScaleFor(BEFORE, HEIGHT).domain());
  });

  it("moves the zero baseline when a negative series is replaced by a positive one", () => {
    const negative: TimePoint[] = [
      { t: new Date(Date.UTC(2026, 0, 1)), y: -10 },
      { t: new Date(Date.UTC(2026, 0, 2)), y: -2 },
    ];
    const positive: TimePoint[] = [
      { t: new Date(Date.UTC(2026, 0, 1)), y: 3 },
      { t: new Date(Date.UTC(2026, 0, 2)), y: 9 },
    ];
    const [data, setData] = createSignal<TimePoint[]>(negative);
    const { container } = render(() => (
      <AreaChart title="Coverage over time" data={data()} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    // All-negative: zero is the TOP of the domain.
    expect(yScaleFor(negative, HEIGHT)(0)).toBeCloseTo(0, 3);
    expectAreaTracks(container, negative);

    setData(positive);

    // All-positive: zero is now the BOTTOM. A stale baseline would still be
    // drawn at the top, with the fill hanging off the wrong edge.
    expect(yScaleFor(positive, HEIGHT)(0)).toBeCloseTo(HEIGHT, 3);
    expectAreaTracks(container, positive);
    // Guard: the whole point of this case is that the baseline pixel MOVED.
    expect(yScaleFor(positive, HEIGHT)(0)).not.toBeCloseTo(yScaleFor(negative, HEIGHT)(0), 3);
  });

  it("rescales y when only the cardinality changes", () => {
    const longer: TimePoint[] = [
      { t: new Date(Date.UTC(2026, 0, 1)), y: 1 },
      { t: new Date(Date.UTC(2026, 0, 2)), y: 2 },
      { t: new Date(Date.UTC(2026, 0, 3)), y: 70 },
    ];
    const [data, setData] = createSignal<TimePoint[]>(BEFORE);
    const { container } = render(() => (
      <AreaChart title="Coverage over time" data={data()} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));

    setData(longer);

    expectAreaTracks(container, longer);
    expect(yScaleFor(longer, HEIGHT).domain()).not.toEqual(yScaleFor(BEFORE, HEIGHT).domain());
  });

  it("survives empty -> populated -> empty without emitting NaN", () => {
    const [data, setData] = createSignal<TimePoint[]>([]);
    const { container } = render(() => (
      <AreaChart title="Coverage over time" data={data()} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const noNaN = (): void => expectNoNaN(container, "path", ["d"]);
    noNaN();

    setData(AFTER);
    expectAreaTracks(container, AFTER);
    noNaN();

    setData([]);
    noNaN();
  });
});
