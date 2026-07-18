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
import { Show, type Component, type JSX } from "solid-js";
import { SvgLayer, Axis, Gridlines, type AxisScale, type ChartSemantics } from "@silkplot/solid";

export interface CartesianFrameProps {
  /** The x scale, drawn as the bottom axis. */
  x: AxisScale;
  /** The y scale, drawn as the left axis. */
  y: AxisScale;
  /** False when the drawing area has collapsed; children are not rendered. */
  hasArea: boolean;
  /** Draw tick-aligned gridlines behind the marks. Default: true. */
  gridlines?: boolean;
  /** Resolved chart semantics — name, description, and the id relationships. */
  semantics: ChartSemantics;
  class?: string;
  children?: JSX.Element;
}

export const CartesianFrame: Component<CartesianFrameProps> = (props) => {
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
      class={props.class}
    >
      <Show when={props.hasArea}>
        {/*
          Gridlines are drawn first so the axes and marks paint over them —
          SVG has no z-index, so paint order IS stacking order.

          They take the same scale objects as the axes below and no tick hints,
          exactly as the axes take none. Both resolve through the same function,
          so the lines land on the labels. Passing a tick hint to one and not
          the other is the one way to break that, which is why this frame passes
          neither rather than offering a knob that only reaches half of them.
        */}
        <Show when={props.gridlines ?? true}>
          <Gridlines scale={props.y} axis="y" />
          <Gridlines scale={props.x} axis="x" />
        </Show>
        <Axis scale={props.y} orientation="left" />
        <Axis scale={props.x} orientation="bottom" />
        {props.children}
      </Show>
    </SvgLayer>
  );
};
