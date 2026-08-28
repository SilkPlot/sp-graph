/**
 * CartesianFrame — scaffolding every cartesian chart in this package shares:
 * a named (empty) SVG for title/desc, and one Canvas that paints grid, axes,
 * marks, and plot chrome. There is no overlay SVG and no SVG clipPath.
 *
 * Internal to `@silkplot/charts` on purpose. It is composition, not a base
 * chart — it owns no marks and no scales, and a chart that wants a different
 * frame simply does not use it. But it is also not a *primitive*: whether a
 * chart has exactly two axes on exactly those edges is an opinion held by this
 * package's composed charts, not a contract worth freezing in the public
 * primitive layer before a second consumer asks for it.
 *
 * It also forwards the whole accessibility relationship set. The `SvgLayer`
 * carries `role="img"`, title, and desc, and paints nothing. Clip for marks
 * and chrome is Canvas (`ctx.clip`). The inclusion rule that feeds the marks
 * is unchanged (`docs/internal/plot-area-clip.md`).
 */
import { Show } from "solid-js";
import type { ScaleLinear } from "@silkplot/core";
import {
  SvgLayer,
  type AxisPairModel,
  type AxisScale,
  type ChartSemantics,
  type TickFormat,
} from "@silkplot/solid";
import type { CartesianChartProps } from "./scaffold";
import { CanvasPlot, type PlotPaint } from "./canvas-plot";
import { paintCartesianSurface, type PlotChrome } from "./canvas-surface";

export type { PlotPaint, PlotChrome };

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
   * Degrees to rotate the bottom-axis labels. Forwarded to the Canvas axis;
   * the decide-to-rotate path stays with the chart that opted in.
   */
  xLabelRotation?: number;
  /** Paint cartesian marks onto the Canvas plot (already clipped). */
  paint: PlotPaint;
  /**
   * References, brush, active point, empty wording. Read inside the paint
   * pass so each field stays tracked. Absent chrome paints nothing extra.
   */
  chrome?: () => PlotChrome;
}

export const CartesianFrame = <
  XS extends AxisScale,
  YS extends AxisScale = ScaleLinear<number, number>,
>(
  props: CartesianFrameProps<XS, YS>,
) => {
  const sem = (): ChartSemantics => props.semantics;

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
      />
      <Show when={props.model.hasArea()}>
        <CanvasPlot
          paint={(ctx, plot, resolve) =>
            paintCartesianSurface(ctx, plot, resolve, {
              grid: props.layout.gridlines ?? true,
              xScale: props.model.x(),
              yScale: props.model.y(),
              xFormat: props.xFormat,
              yFormat: props.yFormat,
              xLabelRotation: props.xLabelRotation,
              paintMarks: props.paint,
              chrome: props.chrome?.(),
            })
          }
        />
      </Show>
    </>
  );
};
