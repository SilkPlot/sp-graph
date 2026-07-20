/**
 * createRankedModel maps a category axis and a value axis onto x and y, and
 * orientation IS that mapping. So the cases below are mostly about which scale
 * came out where, and about the two properties that are easy to break by
 * "simplifying":
 *
 *   - `x`/`y` must return the SAME objects as `band`/`value`, not second scales
 *     built from the same inputs. Two builds would drift the moment one gained a
 *     padding or a nice() the other did not.
 *   - the band range for horizontal is NOT inverted, so the caller's first
 *     category lands at the top. Inverting it to match the value axis' bottom-up
 *     convention reads as consistency and puts a ranked list upside down.
 *
 * Expectations are pinned by hand or recomputed from `@silkplot/core` rather
 * than from the model under test, so a change to the model cannot move both the
 * result and the expectation together.
 */
import { describe, expect, it } from "vitest";
import { createSignal, type Accessor, type JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import { normalizeCategories, type NormalizedCategory } from "@silkplot/core";
import {
  createRankedModel,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
  isBandScale,
  type ChartBounds,
  type RankedModel,
  type RankedOrientation,
} from "../src/index";

const BOUNDS = resolveBounds(400, 300, DEFAULT_MARGINS);

/** `strict: false` — the dev duplicate-id throw is `core`'s contract, tested there. */
const cats = (
  input: readonly { id: string; label: string; value: number }[],
): readonly NormalizedCategory[] =>
  normalizeCategories(input, { strict: false }).categories;

const THREE = cats([
  { id: "a", label: "Alpha", value: 10 },
  { id: "b", label: "Bravo", value: 40 },
  { id: "c", label: "Charlie", value: 25 },
]);

/**
 * d3's `domain()` is a `number[]`, so under `noUncheckedIndexedAccess` every
 * indexed read is `number | undefined`. The scale always has two ends; this
 * says so once rather than at each assertion.
 */
const valueDomain = (model: RankedModel): [number, number] => {
  const [lo, hi] = model.value().domain();
  return [lo as number, hi as number];
};

/**
 * Build the model inside a provider and hand it back. `createRankedModel` reads
 * context, so it can only be called during a component's render.
 */
function buildModel(
  categories: Accessor<readonly NormalizedCategory[]>,
  orientation: Accessor<RankedOrientation>,
  padding?: Accessor<number | undefined>,
  boundsAccessor: Accessor<ChartBounds> = () => BOUNDS,
): RankedModel {
  let model!: RankedModel;
  const Probe = (): JSX.Element => {
    model = createRankedModel({ categories, orientation, padding });
    return null;
  };
  render(() => (
    <ChartBoundsContext.Provider value={boundsAccessor}>
      <Probe />
    </ChartBoundsContext.Provider>
  ));
  return model;
}

describe("orientation maps category and value onto x and y", () => {
  it("puts the band on x and the value on y when vertical", () => {
    const model = buildModel(
      () => THREE,
      () => "vertical",
    );

    expect(isBandScale(model.x())).toBe(true);
    expect(isBandScale(model.y())).toBe(false);
  });

  it("puts the value on x and the band on y when horizontal", () => {
    const model = buildModel(
      () => THREE,
      () => "horizontal",
    );

    // The swap is the whole feature. A model that returned the vertical pair
    // here would render a horizontal chart with its bars along the wrong axis.
    expect(isBandScale(model.x())).toBe(false);
    expect(isBandScale(model.y())).toBe(true);
  });

  it("returns the SAME objects under both vocabularies, not second copies", () => {
    const vertical = buildModel(
      () => THREE,
      () => "vertical",
    );
    const horizontal = buildModel(
      () => THREE,
      () => "horizontal",
    );

    // Identity, not equality. Two scales built from the same inputs would pass
    // a value comparison and drift the moment one gained a padding the other
    // did not.
    expect(vertical.x()).toBe(vertical.band());
    expect(vertical.y()).toBe(vertical.value());
    expect(horizontal.x()).toBe(horizontal.value());
    expect(horizontal.y()).toBe(horizontal.band());
  });

  it("reports its own orientation", () => {
    const model = buildModel(
      () => THREE,
      () => "horizontal",
    );

    expect(model.orientation()).toBe("horizontal");
  });
});

describe("ranges", () => {
  it("runs the vertical band across the inner width", () => {
    const model = buildModel(
      () => THREE,
      () => "vertical",
    );

    expect(model.band().range()).toEqual([0, BOUNDS.innerWidth]);
  });

  it("runs the horizontal band down the inner height, NOT inverted", () => {
    const model = buildModel(
      () => THREE,
      () => "horizontal",
    );

    // [0, innerHeight] and not [innerHeight, 0]: a ranked list is read top-down,
    // so the caller's FIRST category must land at the top.
    expect(model.band().range()).toEqual([0, BOUNDS.innerHeight]);

    const first = model.band()("a") as number;
    const last = model.band()("c") as number;
    expect(first).toBeLessThan(last);
  });

  it("inverts the vertical value range, because SVG's origin is top-left", () => {
    const model = buildModel(
      () => THREE,
      () => "vertical",
    );

    expect(model.value().range()).toEqual([BOUNDS.innerHeight, 0]);
  });

  it("does not invert the horizontal value range", () => {
    const model = buildModel(
      () => THREE,
      () => "horizontal",
    );

    expect(model.value().range()).toEqual([0, BOUNDS.innerWidth]);

    // A larger value must sit further right.
    expect(model.value()(40)).toBeGreaterThan(model.value()(10));
  });
});

describe("value domain", () => {
  it("always contains zero, because bars are drawn from it", () => {
    const model = buildModel(
      () => cats([{ id: "a", label: "A", value: 40 }]),
      () => "vertical",
    );

    // zero-baseline, the policy the vertical bar chart already used. A domain
    // excluding zero puts the bars' flat edge on a pixel the axis labels
    // otherwise.
    expect(valueDomain(model)[0]).toBeLessThanOrEqual(0);
  });

  it("reaches below zero for a signed ranking", () => {
    const model = buildModel(
      () =>
        cats([
          { id: "gain", label: "Gain", value: 1200 },
          { id: "loss", label: "Loss", value: -300 },
        ]),
      () => "horizontal",
    );

    const [lo, hi] = valueDomain(model);
    expect(lo).toBeLessThanOrEqual(-300);
    expect(hi).toBeGreaterThanOrEqual(1200);
  });

  it("stays finite when every value is broken", () => {
    const model = buildModel(
      () =>
        cats([
          { id: "a", label: "A", value: Number.NaN },
          { id: "b", label: "B", value: Number.POSITIVE_INFINITY },
        ]),
      () => "vertical",
    );

    expect(model.value().domain().every(Number.isFinite)).toBe(true);
  });

  it("stays finite and band-empty on empty input", () => {
    const model = buildModel(
      () => [],
      () => "vertical",
    );

    expect(model.band().domain()).toEqual([]);
    expect(model.value().domain().every(Number.isFinite)).toBe(true);
  });

  it("excludes a broken value rather than flooring the domain at zero", () => {
    const model = buildModel(
      () =>
        cats([
          { id: "a", label: "A", value: 40 },
          { id: "b", label: "B", value: Number.NaN },
          { id: "c", label: "C", value: 60 },
        ]),
      () => "vertical",
    );

    // A stray NaN read as 0 would be invisible here except as a domain that
    // reaches further down than the data does.
    expect(valueDomain(model)[1]).toBeGreaterThanOrEqual(60);
  });
});

describe("band domain", () => {
  it("is built from ids, so duplicate labels get separate slots", () => {
    const model = buildModel(
      () =>
        cats([
          { id: "north", label: "Regional total", value: 5 },
          { id: "south", label: "Regional total", value: 8 },
        ]),
      () => "vertical",
    );

    expect(model.band().domain()).toEqual(["north", "south"]);
    // Two identical labels would have given the band scale ONE slot and stacked
    // the bars on top of each other.
    expect(model.band()("north")).not.toBe(model.band()("south"));
  });

  it("honours a caller padding", () => {
    const tight = buildModel(
      () => THREE,
      () => "vertical",
      () => 0,
    );
    const loose = buildModel(
      () => THREE,
      () => "vertical",
      () => 0.5,
    );

    expect(tight.band().bandwidth()).toBeGreaterThan(loose.band().bandwidth());
  });
});

describe("reactivity", () => {
  it("recomputes the domains when the categories are replaced", () => {
    const [data, setData] = createSignal(
      cats([
        { id: "a", label: "A", value: 10 },
        { id: "b", label: "B", value: 20 },
        { id: "c", label: "C", value: 30 },
      ]),
    );
    const model = buildModel(data, () => "vertical");

    const before = valueDomain(model)[1];

    // Three-plus points and a non-uniform change: a two-point series occupies
    // the same two pixels whatever its values, and a uniform rescale maps to
    // identical pixels, so either would pass against a frozen scale.
    setData(
      cats([
        { id: "a", label: "A", value: 10 },
        { id: "b", label: "B", value: 900 },
        { id: "c", label: "C", value: 45 },
      ]),
    );

    expect(valueDomain(model)[1]).toBeGreaterThan(before);
    expect(valueDomain(model)[1]).toBeGreaterThanOrEqual(900);
  });

  it("recomputes the band domain when the category set changes", () => {
    const [data, setData] = createSignal(THREE);
    const model = buildModel(data, () => "vertical");

    expect(model.band().domain()).toEqual(["a", "b", "c"]);

    setData(cats([{ id: "z", label: "Zulu", value: 5 }]));

    // A removed category surviving here is the stale-identity failure the pure
    // normalisation forecloses upstream; this pins that the model follows it.
    expect(model.band().domain()).toEqual(["z"]);
  });

  it("swaps the axes when orientation changes on a mounted model", () => {
    const [orientation, setOrientation] = createSignal<RankedOrientation>("vertical");
    const model = buildModel(() => THREE, orientation);

    expect(isBandScale(model.x())).toBe(true);

    setOrientation("horizontal");

    expect(isBandScale(model.x())).toBe(false);
    expect(isBandScale(model.y())).toBe(true);
  });
});

describe("collapsed drawing area", () => {
  it("reports hasArea false when there is nothing to draw", () => {
    const model = buildModel(
      () => THREE,
      () => "vertical",
      undefined,
      () => resolveBounds(0, 0, DEFAULT_MARGINS),
    );

    expect(model.hasArea()).toBe(false);
  });

  it("reports hasArea true for a real area", () => {
    const model = buildModel(
      () => THREE,
      () => "vertical",
    );

    expect(model.hasArea()).toBe(true);
  });
});
