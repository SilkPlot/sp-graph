/**
 * createRankedModel — the resolved model a ranked categorical chart composes.
 *
 * The sibling of `createCartesianModel`, and deliberately a SIBLING rather than
 * an orientation flag added to it. Three of the four charts compose
 * `createCartesianModel`, and it hardcodes two things they all rely on: y is
 * linear, and y's range is inverted. Teaching it to swap axes would have put a
 * branch under Line, Area and Scatter to serve a case none of them has. The
 * structural risk was the reason to keep them apart; the shared pieces
 * (`applyYDomainPolicy`, the bounds read) are imported rather than copied.
 *
 * ## The two vocabularies, and why both exist
 *
 * A ranked chart has a CATEGORY axis and a VALUE axis. A frame has an X axis and
 * a Y axis. Orientation is precisely the mapping between them:
 *
 *   - vertical   — category on x (bottom), value on y (left)
 *   - horizontal — value on x (bottom), category on y (left)
 *
 * So this model exposes both names for the same two scale objects. `band` and
 * `value` are what the MARKS read, because a rect always needs to know which
 * scale carries its category and which its magnitude. `x` and `y` are what the
 * FRAME reads, because an axis only needs to know which edge it is on.
 *
 * They cannot disagree: `x` and `y` return the very same objects `band` and
 * `value` do, chosen by orientation, not second copies built from the same
 * inputs. Building them twice is the failure this shape forecloses.
 *
 * Note what does NOT change with orientation: the axis EDGES. The frame draws y
 * on the left and x on the bottom in both cases, which is already correct for a
 * horizontal ranked chart — categories down the left, values along the bottom.
 */
import { createMemo, type Accessor } from "solid-js";
import {
  bandScale,
  linearScale,
  rankedDomainOf,
  type NormalizedCategory,
  type RankedOrientation,
  type ScaleBand,
  type ScaleLinear,
} from "@silkplot/core";
import { useChartBounds } from "./context";
import { applyYDomainPolicy, type AxisPairModel } from "./createCartesianModel";
import type { AxisScale } from "./scale-ticks";

// `RankedOrientation` is declared in `@silkplot/core` and re-exported here, so
// the DOM-free contract examples can name it without pulling in Solid.
export type { RankedOrientation };

export interface RankedModelSpec {
  /**
   * The normalised categories, as an accessor — never the array itself.
   *
   * Same reason `CartesianModelSpec.data` is an accessor, and the same failure
   * if it is not: read outside a tracking scope, the model holds one frozen
   * array for its whole life while the marks read the live prop, and the axis
   * and the bars end up describing different data while still rendering.
   */
  categories: Accessor<readonly NormalizedCategory[]>;
  orientation: Accessor<RankedOrientation>;
  /** Band padding as a fraction of the step. Defaults to `bandScale`'s own 0.1. */
  padding?: Accessor<number | undefined>;
}

export interface RankedModel extends AxisPairModel<AxisScale, AxisScale> {
  /** The category scale, whichever axis it landed on. */
  band: Accessor<ScaleBand<string>>;
  /** The magnitude scale, whichever axis it landed on. */
  value: Accessor<ScaleLinear<number, number>>;
  orientation: Accessor<RankedOrientation>;
}

/**
 * Resolve bounds and scales for a ranked chart. Must be called inside a
 * `<ChartRoot>`, whose context carries the measured bounds.
 */
export function createRankedModel(spec: RankedModelSpec): RankedModel {
  const bounds = useChartBounds();
  const orientation = (): RankedOrientation => spec.orientation();

  /**
   * The band range runs along whichever axis the categories are on.
   *
   * Horizontal is `[0, innerHeight]` — NOT inverted — so the first category
   * lands at the top. A ranked list is read top-down, and inverting it to match
   * the value axis' bottom-up convention would put the caller's first row at the
   * bottom of the picture.
   */
  const band = createMemo(() =>
    bandScale({
      domain: spec.categories().map((c) => c.id),
      range:
        orientation() === "vertical"
          ? [0, bounds().innerWidth]
          : [0, bounds().innerHeight],
      padding: spec.padding?.(),
    }),
  );

  /**
   * Bars are drawn FROM zero, so the value domain always contains it —
   * `zero-baseline`, the same policy the vertical bar chart already used. A
   * domain excluding zero puts the bars' flat edge on a pixel the axis labels as
   * some other number.
   *
   * `spec.categories()` is called inside the memo, so replacing the data
   * recomputes the domain. A broken value contributes `NaN` and is skipped by
   * `extentOf` rather than being floored at zero.
   */
  const value = createMemo(() => {
    const domain = applyYDomainPolicy(
      rankedDomainOf(spec.categories()),
      "zero-baseline",
    );
    return linearScale({
      domain,
      // Vertical keeps the inverted y range (SVG's origin is top-left, a
      // chart's is bottom-left). Horizontal runs left-to-right and does not.
      range:
        orientation() === "vertical"
          ? [bounds().innerHeight, 0]
          : [0, bounds().innerWidth],
    });
  });

  const hasArea = (): boolean =>
    bounds().innerWidth > 0 && bounds().innerHeight > 0;

  // The same two objects under their geometric names. Not rebuilt — returned.
  const x = (): AxisScale => (orientation() === "vertical" ? band() : value());
  const y = (): AxisScale => (orientation() === "vertical" ? value() : band());

  return { bounds, x, y, band, value, orientation, hasArea };
}
