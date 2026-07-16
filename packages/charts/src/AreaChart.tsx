/**
 * AreaChart — STUB (SR-001 roadmap Phase 1: line/area/bar).
 *
 * TODO(Phase 1): reuse LineChart's scales and render `areaPath` from
 *   @silkplot/core (already implemented in core/shape.ts) beneath the line.
 */
import { type Component } from "solid-js";
import { ChartRoot, SvgLayer } from "@silkplot/solid";
import { type TimePoint } from "./types.ts";
import { Placeholder } from "./Placeholder.tsx";

export interface AreaChartProps {
  data: readonly TimePoint[];
  width?: number;
  height?: number;
  class?: string;
}

export const AreaChart: Component<AreaChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height}>
      <SvgLayer role="img" title="AreaChart (not yet implemented)" class={props.class}>
        <Placeholder label="AreaChart — coming in Phase 1" />
      </SvgLayer>
    </ChartRoot>
  );
};
