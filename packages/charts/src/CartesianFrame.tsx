/**
 * CartesianFrame — the scaffolding every cartesian chart in this package drew
 * identically: an `SvgLayer`, a guard against a collapsed drawing area, and the
 * left/bottom axis pair. The marks are the caller's, passed as children.
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
 */
import { Show, type JSX } from "solid-js";
import {
  SvgLayer,
  Axis,
  Gridlines,
  type AxisScale,
  type CartesianModel,
  type ChartSemantics,
  type TickFormat,
} from "@silkplot/solid";
import type { CartesianChartProps } from "./scaffold";

export interface CartesianFrameProps<X extends AxisScale> {
  /**
   * The resolved model. Taken whole rather than as unpacked `x`/`y`/`hasArea`
   * props because all three come from the same object at every call site, and
   * three separate props are three chances to hand one chart's scale to another
   * chart's axis. The frame reads them through accessors, so it stays reactive.
   */
  model: CartesianModel<X>;
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
  children?: JSX.Element;
}

export const CartesianFrame = <X extends AxisScale>(
  props: CartesianFrameProps<X>,
): JSX.Element => {
  const sem = (): ChartSemantics => props.semantics;

  return (
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
          Gridlines are drawn first so the axes and marks paint over them —
          SVG has no z-index, so paint order IS stacking order.

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
        <Axis scale={props.model.x()} orientation="bottom" format={props.xFormat} />
        {props.children}
      </Show>
    </SvgLayer>
  );
};
