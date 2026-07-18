/**
 * BarChart — categorical bars over a band x scale.
 *
 * Scaffolding comes from `createCartesianModel` and `CartesianFrame`. What
 * makes this chart a bar chart:
 *
 *   - a band x scale, so the model carries a `bandwidth()` the marks need;
 *   - a "zero-baseline" y-domain, the same policy AreaChart uses and for the
 *     same reason — the mark is drawn FROM zero;
 *   - one `<rect>` per datum, sized against that baseline.
 *
 * D3 does all the math inside memos; Solid renders every bar with `<For>`. No
 * d3-selection, d3-transition, or d3-axis anywhere.
 *
 * TODO(grouped/stacked extension): grouped and stacked variants over
 * `d3-shape` stack after consumer evidence justifies them.
 */
import { For, Show, type Component } from "solid-js";
import { bandScale } from "@silkplot/core";
import {
  ChartRoot,
  ChartDataAlternative,
  createCartesianModel,
  createChartSemantics,
  type ChartSemantics,
  type ChartSemanticsProps,
  type ChartTableRow,
  type Margins,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import type { CategoryPoint } from "./types";

export interface BarChartBaseProps {
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
  /** Draw tick-aligned gridlines behind the marks. Default: true. */
  gridlines?: boolean;
  class?: string;
}

/**
 * A bar chart is informative by default and must be named — see
 * `ChartSemanticsProps`. `decorative` is the explicit opt-out.
 */
export type BarChartProps = BarChartBaseProps & ChartSemanticsProps;

type BarChartBodyProps = BarChartBaseProps & { semantics: ChartSemantics };

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All scales
 * are memos that recompute only when data or size change.
 */
const BarChartBody: Component<BarChartBodyProps> = (props) => {
  const model = createCartesianModel({
    data: () => props.data,
    x: (range) =>
      bandScale({
        domain: props.data.map((d) => d.label),
        range,
        padding: props.padding,
      }),
    // Bars are drawn FROM the zero baseline, so the domain must contain zero —
    // the same reasoning as AreaChart, and the same policy.
    y: { accessor: (d) => d.y, domain: "zero-baseline" },
  });

  return (
    <CartesianFrame
      x={model.x()}
      y={model.y()}
      hasArea={model.hasArea()}
      gridlines={props.gridlines}
      semantics={props.semantics}
      class={props.class}
    >
      <For each={props.data}>
        {(d) => {
          // `bandScale(label)` returns `number | undefined` — undefined only
          // if the label were somehow absent from the domain, which cannot
          // happen here since the domain is built from this same data. Guard
          // it honestly rather than assuming with `!` or a cast.
          const barX = () => model.x()(d.label);
          // A bar spans from the y-scale's zero baseline to the datum's
          // value. A negative value hangs below the baseline, so `y` must be
          // the SMALLER pixel coordinate and `height` the absolute distance
          // — SVG rejects a negative `height`.
          const y0 = () => model.y()(0);
          const yVal = () => model.y()(d.y);
          return (
            <Show when={barX() !== undefined}>
              <rect
                x={barX()}
                y={Math.min(y0(), yVal())}
                width={model.x().bandwidth()}
                height={Math.abs(yVal() - y0())}
                fill={props.fill ?? "currentColor"}
              />
            </Show>
          );
        }}
      </For>
    </CartesianFrame>
  );
};

export const BarChart: Component<BarChartProps> = (props) => {
  const semantics = createChartSemantics(props);

  return (
    <>
      <ChartRoot width={props.width} height={props.height} margins={props.margins}>
        <BarChartBody {...props} semantics={semantics} />
      </ChartRoot>
      {/* The band labels are already text, so the derived table needs no formatting decision. */}
      <ChartDataAlternative
        semantics={semantics}
        defaultRows={(): readonly ChartTableRow[] =>
          props.data.map((d) => [d.label, d.y] as const)
        }
      />
    </>
  );
};
