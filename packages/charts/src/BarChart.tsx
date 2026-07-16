/**
 * BarChart — a real, end-to-end SilkPlot chart.
 *
 * Composition mirrors LineChart:
 *   @silkplot/core   → bandScale (x, compute), linearScale (y, compute)
 *   @silkplot/solid  → ChartRoot (measure), SvgLayer (render), Axis (render)
 *
 * D3 does all the math inside memos; Solid renders every bar with `<For>`. No
 * d3-selection, d3-transition, or d3-axis anywhere.
 *
 * TODO(Phase 2): grouped and stacked variants over `d3-shape` stack.
 */
import { createMemo, For, Show, type Component } from "solid-js";
import { bandScale, linearScale } from "@silkplot/core";
import { ChartRoot, SvgLayer, Axis, useChartBounds, type Margins } from "@silkplot/solid";
import { extentOf, type CategoryPoint } from "./types";

export interface BarChartProps {
  /** The series to plot, as `{ label: string, y: number }[]`. */
  data: readonly CategoryPoint[];
  /** Fixed width in px. Omit to fill and measure the parent. */
  width?: number;
  /** Fixed height in px. Omit to fill and measure the parent. */
  height?: number;
  margins?: Partial<Margins>;
  /** Band padding as a fraction of the step [0, 1]. Default: bandScale's default (0.1). */
  padding?: number;
  /** Bar fill color. Default: "currentColor". */
  fill?: string;
  /** Accessible name for the chart. */
  title?: string;
  class?: string;
}

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All scales
 * are memos that recompute only when data or size change.
 */
const BarChartBody: Component<BarChartProps> = (props) => {
  const bounds = useChartBounds();

  const x = createMemo(() =>
    bandScale({
      domain: props.data.map((d) => d.label),
      range: [0, bounds().innerWidth],
      padding: props.padding,
    }),
  );

  const y = createMemo(() => {
    const [lo, hi] = extentOf(props.data, (d) => d.y);
    return linearScale({
      domain: [Math.min(0, lo), Math.max(0, hi)],
      range: [bounds().innerHeight, 0],
    });
  });

  const hasArea = () => bounds().innerWidth > 0 && bounds().innerHeight > 0;

  return (
    <SvgLayer role="img" title={props.title} class={props.class}>
      <Show when={hasArea()}>
        <Axis scale={y()} orientation="left" />
        <Axis scale={x()} orientation="bottom" />
        <For each={props.data}>
          {(d) => {
            // `bandScale(label)` returns `number | undefined` — undefined only
            // if the label were somehow absent from the domain, which cannot
            // happen here since the domain is built from this same data. Guard
            // it honestly rather than assuming with `!` or a cast.
            const barX = () => x()(d.label);
            // A bar spans from the y-scale's zero baseline to the datum's
            // value. A negative value hangs below the baseline, so `y` must be
            // the SMALLER pixel coordinate and `height` the absolute distance
            // — SVG rejects a negative `height`.
            const y0 = () => y()(0);
            const yVal = () => y()(d.y);
            return (
              <Show when={barX() !== undefined}>
                <rect
                  x={barX()}
                  y={Math.min(y0(), yVal())}
                  width={x().bandwidth()}
                  height={Math.abs(yVal() - y0())}
                  fill={props.fill ?? "currentColor"}
                />
              </Show>
            );
          }}
        </For>
      </Show>
    </SvgLayer>
  );
};

export const BarChart: Component<BarChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height} margins={props.margins}>
      <BarChartBody {...props} />
    </ChartRoot>
  );
};
