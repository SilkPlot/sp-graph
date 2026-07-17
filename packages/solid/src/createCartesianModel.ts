/**
 * createCartesianModel — the resolved model a cartesian chart composes.
 *
 * This is the layer the architecture calls "composition from resolved chart
 * models": a chart asks for bounds and scales, then renders whatever marks it
 * likes. It is deliberately NOT a base chart. It owns no markup, renders
 * nothing, and decides nothing a chart should be deciding for itself — a
 * component that owned the marks would be the "framework fight" this library
 * exists to avoid.
 *
 * What it removes is the scaffolding all four charts were hand-rolling: reading
 * bounds, wiring the two pixel ranges, applying a y-domain policy, and deciding
 * whether there is anything to draw.
 */
import { createMemo, type Accessor } from "solid-js";
import { extentOf, linearScale, type ScaleLinear } from "@silkplot/core";
import { useChartBounds, type ChartBounds } from "./context";
import type { AxisScale } from "./scale-ticks";

/**
 * How a chart's y-domain treats zero. This is an input, never a default the
 * model picks: the right answer depends on what the mark means, and getting it
 * wrong is a chart that contradicts its own axis.
 */
export type YDomainPolicy =
  /**
   * The data's own extent. For a mark read by relative position — a scatter
   * cloud — forcing zero in squashes the points into a corner and wastes the
   * plotting area.
   */
  | "extent"
  /**
   * Zero becomes the floor when the data is positive, but the top stays the
   * data's own maximum. For a line, which has no baseline to honour.
   */
  | "zero-floor"
  /**
   * The domain always contains zero, at whichever end needs it. For marks drawn
   * *from* the zero baseline — an area's fill, a bar's rect — where a domain
   * excluding zero puts the mark's flat edge on a pixel the axis labels as some
   * other number.
   */
  | "zero-baseline";

/** Apply a policy to a raw data extent. Exported for the tests that pin each one. */
export function applyYDomainPolicy(
  extent: readonly [number, number],
  policy: YDomainPolicy,
): [number, number] {
  const [lo, hi] = extent;
  switch (policy) {
    case "extent":
      return [lo, hi];
    case "zero-floor":
      return [Math.min(0, lo), hi];
    case "zero-baseline":
      return [Math.min(0, lo), Math.max(0, hi)];
  }
}

export interface CartesianModelSpec<T, X extends AxisScale> {
  data: readonly T[];
  /**
   * Build the x scale for a given pixel range.
   *
   * The model supplies the range rather than taking a finished scale, because
   * the range is the part every chart got identically and the part that is easy
   * to get backwards. Which *kind* of scale, and over what domain, is exactly
   * what differs between a time series, a category axis and a point cloud — so
   * that stays here, at the call site, in plain sight.
   */
  x: (range: [number, number]) => X;
  y: {
    accessor: (d: T) => number;
    /** Defaults to "extent" — the policy that assumes nothing about the mark. */
    domain?: YDomainPolicy;
  };
}

export interface CartesianModel<X extends AxisScale> {
  bounds: Accessor<ChartBounds>;
  x: Accessor<X>;
  // `ScaleLinear` is d3's own generic; the pixel-mapping instantiation is what
  // `linearScale` returns.
  y: Accessor<ScaleLinear<number, number>>;
  /** False when the drawing area has collapsed — nothing can be drawn. */
  hasArea: Accessor<boolean>;
}

/**
 * Resolve bounds and scales for a cartesian chart. Must be called inside a
 * `<ChartRoot>`, whose context carries the measured bounds.
 */
export function createCartesianModel<T, X extends AxisScale>(
  spec: CartesianModelSpec<T, X>,
): CartesianModel<X> {
  const bounds = useChartBounds();

  // Every chart mapped x left-to-right and y bottom-to-top. y is inverted
  // because SVG's origin is top-left while a chart's is bottom-left.
  const x = createMemo(() => spec.x([0, bounds().innerWidth]));

  const y = createMemo(() =>
    linearScale({
      domain: applyYDomainPolicy(
        extentOf(spec.data, spec.y.accessor),
        spec.y.domain ?? "extent",
      ),
      range: [bounds().innerHeight, 0],
    }),
  );

  const hasArea = (): boolean =>
    bounds().innerWidth > 0 && bounds().innerHeight > 0;

  return { bounds, x, y, hasArea };
}
