/**
 * CartesianFrame — the scaffolding every cartesian chart in this package drew
 * identically: an `SvgLayer`, a guard against a collapsed drawing area, and the
 * left/bottom axis pair. Cartesian MARKS paint on Canvas (`paint`). Overlay
 * children — references, brush, the active point, the empty mark — stay SVG so
 * they sit above the bitmap, clipped to the inner plot.
 *
 * Internal to `@silkplot/charts` on purpose. It is composition, not a base
 * chart — it owns no marks and no scales, and a chart that wants a different
 * frame simply does not use it. But it is also not a *primitive*: whether a
 * chart has exactly two axes on exactly those edges is an opinion held by this
 * package's composed charts, not a contract worth freezing in the public
 * primitive layer before a second consumer asks for it.
 *
 * It also forwards the whole accessibility relationship set. It used to forward
 * only `title`, which meant `SvgLayer` supported a `<desc>` that no composed
 * chart could ever reach — the chain was broken here and nowhere else.
 *
 * Plot-area clip for the marks is Canvas (`ctx.clip` in `CanvasPlot`). Overlay
 * SVG still uses a `clipPath` so a reference cannot paint over an axis. The
 * two substrates share the same inner-plot rect; the inclusion rule that feeds
 * the marks is unchanged (`docs/internal/plot-area-clip.md`).
 */
import { Show, createUniqueId, type JSX } from "solid-js";
import type { ScaleLinear } from "@silkplot/core";
import {
  SvgLayer,
  Axis,
  Gridlines,
  type AxisPairModel,
  type AxisScale,
  type ChartSemantics,
  type TickFormat,
} from "@silkplot/solid";
import type { CartesianChartProps } from "./scaffold";
import { CanvasPlot, type PlotPaint } from "./canvas-plot";

export type { PlotPaint };

export interface CartesianFrameProps<
  XS extends AxisScale,
  YS extends AxisScale = ScaleLinear<number, number>,
> {
  /**
   * The resolved model. Taken whole rather than as unpacked `x`/`y`/`hasArea`
   * props because all three come from the same object at every call site, and
   * three separate props are three chances to hand one chart's scale to another
   * chart's axis. The frame reads them through accessors, so it stays reactive.
   *
   * Typed on the axis PAIR rather than on `CartesianModel`, so a model whose y
   * is a band scale — horizontal ranked bars — is expressible. `YS` defaults to
   * linear, which is what `CartesianModel<X>` instantiates, so every existing
   * call site infers exactly as it did before.
   */
  model: AxisPairModel<XS, YS>;
  /**
   * The chart's own props, read through for `gridlines` and `class`. The live
   * props object, not copied values, so each read stays tracked.
   */
  layout: CartesianChartProps;
  /** Resolved chart semantics — name, description, and the id relationships. */
  semantics: ChartSemantics;
  /**
   * Tick-label formatters, per axis (ADR-0008 §9).
   *
   * These are safe to offer one-sidedly in a way the tick COUNT hints above are
   * not, and the distinction is the reason this frame accepts them while still
   * passing no tick hints. A formatter changes only a tick's LABEL; a count hint
   * changes its POSITION, so giving one to an axis and not to its gridlines
   * lands the lines off the labels. Formatting cannot desynchronise anything,
   * because the gridlines carry no text.
   */
  xFormat?: TickFormat;
  yFormat?: TickFormat;
  /**
   * Degrees to rotate the bottom-axis labels. Forwarded to `Axis`; the
   * decide-to-rotate path stays with the chart that opted in.
   */
  xLabelRotation?: number;
  /** Paint cartesian marks onto the Canvas plot. */
  paint: PlotPaint;
  children?: JSX.Element;
}

/**
 * Overlay SVG: references, brush, active point, empty mark. Sits above the
 * Canvas so a threshold stays legible, and carries the plot-area `clipPath`
 * those SVG children still need. `aria-hidden` because the named graphic is
 * the `SvgLayer` beside it; this layer is paint, not a second image.
 */
const PlotOverlay = (props: {
  clipId: string;
  width: number;
  height: number;
  left: number;
  top: number;
  innerWidth: number;
  innerHeight: number;
  children?: JSX.Element;
}): JSX.Element => (
  <svg
    data-silkplot-plot-overlay=""
    aria-hidden="true"
    width={props.width}
    height={props.height}
    viewBox={`0 0 ${props.width} ${props.height}`}
    style={{
      position: "absolute",
      inset: "0",
      overflow: "visible",
      "pointer-events": "none",
      display: "block",
    }}
  >
    <defs>
      <clipPath id={props.clipId}>
        <rect x={0} y={0} width={props.innerWidth} height={props.innerHeight} />
      </clipPath>
    </defs>
    <g
      transform={`translate(${props.left},${props.top})`}
      data-silkplot-plot-area=""
      clip-path={`url(#${props.clipId})`}
    >
      {props.children}
    </g>
  </svg>
);

export const CartesianFrame = <
  XS extends AxisScale,
  YS extends AxisScale = ScaleLinear<number, number>,
>(
  props: CartesianFrameProps<XS, YS>,
): JSX.Element => {
  const sem = (): ChartSemantics => props.semantics;
  // One clip path per frame INSTANCE. `createUniqueId` for the same reason the
  // semantics ids use it: two charts on one page must not share an SVG id, and
  // a clip keyed on the dimensions would be shared by two charts of the same
  // size and would also churn on every resize. Sequential, so the markup stays
  // deterministic for the visual baselines. This clip is the OVERLAY's; marks
  // clip via Canvas.
  const clipId = `sp-plot-clip-${createUniqueId()}`;

  return (
    <>
      <SvgLayer
        role="img"
        decorative={sem().decorative()}
        title={sem().name() || undefined}
        titleId={sem().ids.title}
        desc={sem().desc()}
        descId={sem().ids.desc}
        ariaLabelledBy={sem().labelledBy()}
        ariaDescribedBy={sem().describedBy()}
        ariaDetails={sem().details()}
        class={props.layout.class}
      >
        <Show when={props.model.hasArea()}>
          {/*
            Gridlines are drawn first so the axes paint over them — SVG has
            no z-index, so paint order IS stacking order. The Canvas plot sits
            HTML-above this svg in the plot rect, so marks cover gridlines
            there; transparent canvas pixels let the grid show through.

            They take the same scale objects as the axes below and no tick hints,
            exactly as the axes take none. Both resolve through the same function,
            so the lines land on the labels. Passing a tick hint to one and not
            the other is the one way to break that, which is why this frame passes
            neither rather than offering a knob that only reaches half of them.
          */}
          <Show when={props.layout.gridlines ?? true}>
            <Gridlines scale={props.model.y()} axis="y" />
            <Gridlines scale={props.model.x()} axis="x" />
          </Show>
          <Axis scale={props.model.y()} orientation="left" format={props.yFormat} />
          <Axis
            scale={props.model.x()}
            orientation="bottom"
            format={props.xFormat}
            labelRotation={props.xLabelRotation}
          />
        </Show>
      </SvgLayer>
      <Show when={props.model.hasArea()}>
        <CanvasPlot paint={props.paint} />
        <PlotOverlay
          clipId={clipId}
          width={props.model.bounds().width}
          height={props.model.bounds().height}
          left={props.model.bounds().margins.left}
          top={props.model.bounds().margins.top}
          innerWidth={props.model.bounds().innerWidth}
          innerHeight={props.model.bounds().innerHeight}
        >
          {props.children}
        </PlotOverlay>
      </Show>
    </>
  );
};
