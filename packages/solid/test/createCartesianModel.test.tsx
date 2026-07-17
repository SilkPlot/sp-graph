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
import { linearScale, timeScale, bandScale } from "@silkplot/core";
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
    buildModel<Point, ReturnType<typeof linearScale>>({
      data,
      x: (range) => {
        given = range;
        return linearScale({ domain: [0, 10], range });
      },
      y: { accessor: (d) => d.y },
    });
    expect(given).toEqual([0, BOUNDS.innerWidth]);
  });

  it("maps y bottom-to-top, inverting SVG's top-left origin", () => {
    const model = buildModel<Point, ReturnType<typeof linearScale>>({
      data,
      x: (range) => linearScale({ domain: [0, 10], range }),
      y: { accessor: (d) => d.y, domain: "zero-baseline" },
    });
    // Domain [0, 10] under zero-baseline; the bottom of the domain sits at the
    // bottom of the drawing area.
    expect(model.y()(0)).toBeCloseTo(BOUNDS.innerHeight);
    expect(model.y()(10)).toBeCloseTo(0);
  });

  it("applies the requested policy to the data's extent", () => {
    const model = buildModel<Point, ReturnType<typeof linearScale>>({
      data,
      x: (range) => linearScale({ domain: [0, 10], range }),
      y: { accessor: (d) => d.y, domain: "zero-floor" },
    });
    // extent is [2, 10]; zero-floor takes it to [0, 10].
    expect(model.y().domain()).toEqual([0, 10]);
  });

  it("defaults to extent — the policy that assumes nothing about the mark", () => {
    const model = buildModel<Point, ReturnType<typeof linearScale>>({
      data,
      x: (range) => linearScale({ domain: [0, 10], range }),
      y: { accessor: (d) => d.y },
    });
    expect(model.y().domain()).toEqual([2, 10]);
  });

  it("survives empty data without emitting NaN positions", () => {
    const model = buildModel<Point, ReturnType<typeof linearScale>>({
      data: [],
      x: (range) => linearScale({ domain: [0, 1], range }),
      y: { accessor: (d) => d.y },
    });
    expect(Number.isNaN(model.y()(0))).toBe(false);
    expect(model.y().domain()).toEqual([0, 1]);
  });

  it("carries any scale kind on x — time", () => {
    const model = buildModel<Point, ReturnType<typeof timeScale>>({
      data,
      x: (range) =>
        timeScale({
          domain: [new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 2))],
          range,
          nice: false,
        }),
      y: { accessor: (d) => d.y },
    });
    expect(model.x()(new Date(Date.UTC(2026, 0, 1)))).toBeCloseTo(0);
  });

  it("carries any scale kind on x — band, bandwidth intact", () => {
    const model = buildModel<Point, ReturnType<typeof bandScale>>({
      data,
      x: (range) => bandScale({ domain: ["a", "b"], range }),
      y: { accessor: (d) => d.y },
    });
    // The band scale arrives whole, not narrowed to a lowest common denominator.
    expect(model.x().bandwidth()).toBeGreaterThan(0);
    expect(model.x()("a")).toBeDefined();
  });

  it("reports no drawing area when the container has collapsed", () => {
    const collapsed = resolveBounds(0, 0, DEFAULT_MARGINS);
    const model = buildModel<Point, ReturnType<typeof linearScale>>(
      {
        data,
        x: (range) => linearScale({ domain: [0, 10], range }),
        y: { accessor: (d) => d.y },
      },
      () => collapsed,
    );
    expect(model.hasArea()).toBe(false);
  });

  it("reports a drawing area once the container has one", () => {
    const model = buildModel<Point, ReturnType<typeof linearScale>>({
      data,
      x: (range) => linearScale({ domain: [0, 10], range }),
      y: { accessor: (d) => d.y },
    });
    expect(model.hasArea()).toBe(true);
  });

  it("recomputes both scales when the bounds change", () => {
    const [bounds, setBounds] = createSignal(BOUNDS);
    const model = buildModel<Point, ReturnType<typeof linearScale>>(
      {
        data,
        x: (range) => linearScale({ domain: [0, 10], range }),
        y: { accessor: (d) => d.y },
      },
      bounds,
    );
    const widthBefore = model.x().range()[1];

    setBounds(resolveBounds(800, 600, DEFAULT_MARGINS));

    const after = resolveBounds(800, 600, DEFAULT_MARGINS);
    expect(model.x().range()[1]).toBe(after.innerWidth);
    expect(model.x().range()[1]).not.toBe(widthBefore);
    expect(model.y().range()[0]).toBe(after.innerHeight);
  });
});
