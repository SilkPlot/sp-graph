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
 */
import { Show, type Component, type JSX } from "solid-js";
import { SvgLayer, Axis, type AxisScale } from "@silkplot/solid";

export interface CartesianFrameProps {
  /** The x scale, drawn as the bottom axis. */
  x: AxisScale;
  /** The y scale, drawn as the left axis. */
  y: AxisScale;
  /** False when the drawing area has collapsed; children are not rendered. */
  hasArea: boolean;
  /** Accessible name for the chart. */
  title?: string;
  class?: string;
  children?: JSX.Element;
}

export const CartesianFrame: Component<CartesianFrameProps> = (props) => {
  return (
    <SvgLayer role="img" title={props.title} class={props.class}>
      <Show when={props.hasArea}>
        <Axis scale={props.y} orientation="left" />
        <Axis scale={props.x} orientation="bottom" />
        {props.children}
      </Show>
    </SvgLayer>
  );
};
