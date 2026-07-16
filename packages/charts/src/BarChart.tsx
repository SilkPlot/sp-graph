/**
 * BarChart — STUB (SR-001 roadmap Phase 1: line/area/bar).
 *
 * TODO(Phase 1): compose `bandScale` (x) + `linearScale` (y) from @silkplot/core
 *   and render `<rect>` bars with Solid `<For>`, plus a bottom band Axis variant.
 * TODO(Phase 2): grouped and stacked variants over `d3-shape` stack.
 */
import { type Component } from "solid-js";
import { ChartRoot, SvgLayer } from "@silkplot/solid";
import { type CategoryPoint } from "./types";
import { Placeholder } from "./Placeholder";

export interface BarChartProps {
  data: readonly CategoryPoint[];
  width?: number;
  height?: number;
  class?: string;
}

export const BarChart: Component<BarChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height}>
      <SvgLayer role="img" title="BarChart (not yet implemented)" class={props.class}>
        <Placeholder label="BarChart — coming in Phase 1" />
      </SvgLayer>
    </ChartRoot>
  );
};
