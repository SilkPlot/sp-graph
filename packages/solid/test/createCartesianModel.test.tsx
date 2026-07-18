/**
 * createCartesianModel is the layer all four charts compose, so a mistake here
 * is a mistake in every chart at once.
 *
 * The y-domain policies are pinned by hand rather than derived: they exist
 * precisely BECAUSE the charts must differ, and an expectation computed from
 * the same policy function would agree with any change to it. The whole value
 * of these cases is that they fail if "zero-floor" and "zero-baseline" ever
 * collapse into each other.
 */
import { describe, expect, it } from "vitest";
import { createSignal, type Accessor, type JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import { linearScale, timeScale, bandScale, extentOf } from "@silkplot/core";
import {
  createCartesianModel,
  applyYDomainPolicy,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
  type CartesianModel,
  type CartesianModelSpec,
  type AxisScale,
  type ChartBounds,
  type YDomainPolicy,
} from "../src/index";

const BOUNDS = resolveBounds(400, 300, DEFAULT_MARGINS);

interface Point {
  x: number;
  y: number;
}

/**
 * Build the model inside a provider and hand it back. `createCartesianModel`
 * reads context, so it can only be called during a component's render.
 */
function buildModel<T, X extends AxisScale>(
  spec: CartesianModelSpec<T, X>,
  boundsAccessor: Accessor<ChartBounds> = () => BOUNDS,
): CartesianModel<X> {
  let model!: CartesianModel<X>;
  const Probe = (): JSX.Element => {
    model = createCartesianModel(spec);
    return null;
  };
  render(() => (
    <ChartBoundsContext.Provider value={boundsAccessor}>
      <Probe />
    </ChartBoundsContext.Provider>
  ));
  return model;
}

type LinearScale = ReturnType<typeof linearScale>;

/**
 * The x factory nearly every case below shares. Which *kind* of x scale a chart
 * uses is the subject of exactly three tests further down, and those still build
 * their own; everywhere else it is scaffolding, and repeating it obscured which
 * part of each case was actually under test.
 */
const unitX = (range: [number, number]): LinearScale =>
  linearScale({ domain: [0, 10], range });

/** `d.y` under a named policy — the y spec every Point-shaped case wants. */
const yOf = (domain?: YDomainPolicy): CartesianModelSpec<Point, LinearScale>["y"] =>
  domain === undefined ? { accessor: (d) => d.y } : { accessor: (d) => d.y, domain };

/**
 * Build a model over the shared linear x. Only `data`, the y spec and the bounds
 * vary here, so only those are arguments: each test still states its own inputs
 * and asserts its own outcome on its own numbers.
 */
function buildLinear<T>(
  data: CartesianModelSpec<T, LinearScale>["data"],
  y: CartesianModelSpec<T, LinearScale>["y"],
  boundsAccessor?: Accessor<ChartBounds>,
): CartesianModel<LinearScale> {
  return buildModel<T, LinearScale>({ data, x: unitX, y }, boundsAccessor);
}

describe("applyYDomainPolicy", () => {
  // Each row states what the policy is FOR, so a future edit has to argue with
  // the reason and not just the number.
  it("extent — leaves the data alone, so a point cloud is not squashed", () => {
    expect(applyYDomainPolicy([2, 10], "extent")).toEqual([2, 10]);
    expect(applyYDomainPolicy([-5, -1], "extent")).toEqual([-5, -1]);
  });

  it("zero-floor — floors at zero, but never pulls the top down to it", () => {
    expect(applyYDomainPolicy([2, 10], "zero-floor")).toEqual([0, 10]);
    // All-negative: the top stays the data's own max. A line has no baseline to
    // honour, so there is nothing to force zero in for.
    expect(applyYDomainPolicy([-5, -1], "zero-floor")).toEqual([-5, -1]);
  });

  it("zero-baseline — always contains zero, at whichever end needs it", () => {
    expect(applyYDomainPolicy([2, 10], "zero-baseline")).toEqual([0, 10]);
    // This is the case that separates it from zero-floor: an area or bar drawn
    // from a baseline outside its own domain lands on a pixel the axis labels
    // as some other number.
    expect(applyYDomainPolicy([-5, -1], "zero-baseline")).toEqual([-5, 0]);
  });

  it("keeps zero-floor and zero-baseline distinguishable", () => {
    // The one input where collapsing the two would be caught.
    expect(applyYDomainPolicy([-5, -1], "zero-floor")).not.toEqual(
      applyYDomainPolicy([-5, -1], "zero-baseline"),
    );
  });
});

describe("createCartesianModel", () => {
  const data: Point[] = [
    { x: 0, y: 2 },
    { x: 10, y: 10 },
  ];

  it("hands the x factory the full inner width, left to right", () => {
    let given: [number, number] | undefined;
    buildModel<Point, LinearScale>({
      data: () => data,
      x: (range) => {
        given = range;
        return unitX(range);
      },
      y: yOf(),
    });
    expect(given).toEqual([0, BOUNDS.innerWidth]);
  });

  it("maps y bottom-to-top, inverting SVG's top-left origin", () => {
    const model = buildLinear(() => data, yOf("zero-baseline"));
    // Domain [0, 10] under zero-baseline; the bottom of the domain sits at the
    // bottom of the drawing area.
    expect(model.y()(0)).toBeCloseTo(BOUNDS.innerHeight);
    expect(model.y()(10)).toBeCloseTo(0);
  });

  it("applies the requested policy to the data's extent", () => {
    const model = buildLinear(() => data, yOf("zero-floor"));
    // extent is [2, 10]; zero-floor takes it to [0, 10].
    expect(model.y().domain()).toEqual([0, 10]);
  });

  it("defaults to extent — the policy that assumes nothing about the mark", () => {
    const model = buildLinear(() => data, yOf());
    expect(model.y().domain()).toEqual([2, 10]);
  });

  it("survives empty data without emitting NaN positions", () => {
    const model = buildModel<Point, LinearScale>({
      data: () => [],
      x: (range) => linearScale({ domain: [0, 1], range }),
      y: yOf(),
    });
    expect(Number.isNaN(model.y()(0))).toBe(false);
    expect(model.y().domain()).toEqual([0, 1]);
  });

  it("carries any scale kind on x — time", () => {
    const model = buildModel<Point, ReturnType<typeof timeScale>>({
      data: () => data,
      x: (range) =>
        timeScale({
          domain: [new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 2))],
          range,
          nice: false,
        }),
      y: yOf(),
    });
    expect(model.x()(new Date(Date.UTC(2026, 0, 1)))).toBeCloseTo(0);
  });

  it("carries any scale kind on x — band, bandwidth intact", () => {
    const model = buildModel<Point, ReturnType<typeof bandScale>>({
      data: () => data,
      x: (range) => bandScale({ domain: ["a", "b"], range }),
      y: yOf(),
    });
    // The band scale arrives whole, not narrowed to a lowest common denominator.
    expect(model.x().bandwidth()).toBeGreaterThan(0);
    expect(model.x()("a")).toBeDefined();
  });

  it("reports no drawing area when the container has collapsed", () => {
    const collapsed = resolveBounds(0, 0, DEFAULT_MARGINS);
    const model = buildLinear(() => data, yOf(), () => collapsed);
    expect(model.hasArea()).toBe(false);
  });

  it("reports a drawing area once the container has one", () => {
    const model = buildLinear(() => data, yOf());
    expect(model.hasArea()).toBe(true);
  });

  it("recomputes both scales when the bounds change", () => {
    const [bounds, setBounds] = createSignal(BOUNDS);
    const model = buildLinear(() => data, yOf(), bounds);
    const widthBefore = model.x().range()[1];

    setBounds(resolveBounds(800, 600, DEFAULT_MARGINS));

    const after = resolveBounds(800, 600, DEFAULT_MARGINS);
    expect(model.x().range()[1]).toBe(after.innerWidth);
    expect(model.x().range()[1]).not.toBe(widthBefore);
    expect(model.y().range()[0]).toBe(after.innerHeight);
  });
});

/**
 * Replacing the series is the case the resize tests above cannot reach.
 *
 * The model used to take `data` as an array, which the caller's component body
 * evaluated once — so the y memo held a frozen series for its whole life while
 * the chart's marks read the live prop. The two then disagreed about which data
 * they were drawing, and the chart still rendered, which is what made it worth
 * a regression rather than a comment. `data` is an accessor now, and these pin
 * that it is read, not captured.
 *
 * Note the asymmetry these have to respect: `x` was always a thunk and so was
 * always reactive. A test that watched the x domain would have passed against
 * the bug. Every case here watches y.
 */
describe("createCartesianModel — data replacement", () => {
  /** The series these cases start from, and the non-uniform rescale they move to. */
  const startSeries = () =>
    createSignal<Point[]>([
      { x: 0, y: 1 },
      { x: 10, y: 2 },
    ]);
  const RESCALED: Point[] = [
    { x: 0, y: 100 },
    { x: 10, y: 200 },
  ];

  it("recomputes the y domain when the series is replaced", () => {
    const [data, setData] = startSeries();
    const model = buildLinear(data, yOf("zero-floor"));
    expect(model.y().domain()).toEqual([0, 2]);

    setData(RESCALED);

    // The original defect exactly: the domain stayed [0, 2] while the marks
    // moved on, sending the path thousands of pixels off-canvas.
    expect(model.y().domain()).toEqual([0, 200]);
  });

  it("keeps the replaced series inside the plotting area", () => {
    const [data, setData] = startSeries();
    const model = buildLinear(data, yOf("zero-floor"));

    setData(RESCALED);

    // Against the captured-data path this read about -26532 for a 268px area.
    for (const d of data()) {
      const py = model.y()(d.y);
      expect(Number.isFinite(py)).toBe(true);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThanOrEqual(BOUNDS.innerHeight);
    }
  });

  it("recomputes the x domain when the series is replaced", () => {
    const [data, setData] = startSeries();
    const model = buildModel<Point, LinearScale>({
      data,
      // Derives from the series, so this tracks only if `data` is read live.
      x: (range) =>
        linearScale({ domain: extentOf(data(), (d) => d.x), range, nice: false }),
      y: yOf(),
    });
    expect(model.x().domain()).toEqual([0, 10]);

    setData([
      { x: 100, y: 1 },
      { x: 200, y: 2 },
    ]);

    expect(model.x().domain()).toEqual([100, 200]);
  });

  it("tracks a changed y accessor, not just changed data", () => {
    const rows = [
      { x: 0, y: 1, alt: 50 },
      { x: 10, y: 2, alt: 90 },
    ];
    const [useAlt, setUseAlt] = createSignal(false);
    const model = buildLinear<(typeof rows)[number]>(() => rows, {
      accessor: (d) => (useAlt() ? d.alt : d.y),
      domain: "zero-floor",
    });
    expect(model.y().domain()).toEqual([0, 2]);

    setUseAlt(true);

    // The accessor is invoked inside the memo, so a signal read within it is
    // tracked like any other. Pins that the fix is not data-only.
    expect(model.y().domain()).toEqual([0, 90]);
  });

  it("survives empty -> populated -> empty without emitting NaN", () => {
    const [data, setData] = createSignal<Point[]>([]);
    const model = buildLinear(data, yOf("zero-floor"));
    // The documented empty sentinel.
    expect(model.y().domain()).toEqual([0, 1]);

    // 20, not 25: linearScale nices by default, and nice() takes [0, 25] to
    // [0, 26]. Pinning 26 would assert a d3 artifact rather than the behaviour
    // under test, which the house rule warns against.
    setData([
      { x: 0, y: 5 },
      { x: 10, y: 20 },
    ]);
    expect(model.y().domain()).toEqual([0, 20]);
    expect(Number.isNaN(model.y()(5))).toBe(false);

    setData([]);
    expect(model.y().domain()).toEqual([0, 1]);
    expect(Number.isNaN(model.y()(0))).toBe(false);
  });

  it("recomputes when only the cardinality changes", () => {
    const [data, setData] = startSeries();
    const model = buildLinear(data, yOf("zero-floor"));
    expect(model.y().domain()).toEqual([0, 2]);

    setData([
      { x: 0, y: 1 },
      { x: 5, y: 2 },
      { x: 10, y: 7 },
    ]);

    expect(model.y().domain()).toEqual([0, 7]);
  });

  it("holds the deliberate policy difference across a replacement", () => {
    // An all-negative series is the only input where zero-floor and
    // zero-baseline visibly differ, so it is the input that proves a
    // replacement re-applies the policy rather than collapsing it.
    const negative: Point[] = [
      { x: 0, y: -5 },
      { x: 10, y: -1 },
    ];
    const [floorData, setFloorData] = createSignal<Point[]>([{ x: 0, y: 4 }]);
    const [baseData, setBaseData] = createSignal<Point[]>([{ x: 0, y: 4 }]);

    const floor = buildLinear(floorData, yOf("zero-floor"));
    const baseline = buildLinear(baseData, yOf("zero-baseline"));

    setFloorData(negative);
    setBaseData(negative);

    expect(floor.y().domain()).toEqual([-5, -1]);
    expect(baseline.y().domain()).toEqual([-5, 0]);
    // Guard against a vacuous pass: if the policies ever collapse, the two
    // domains agree and every assertion above still reads plausibly.
    expect(floor.y().domain()).not.toEqual(baseline.y().domain());
  });
});
