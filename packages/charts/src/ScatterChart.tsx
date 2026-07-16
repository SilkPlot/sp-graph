/**
 * ScatterChart — STUB (SR-001 roadmap Phase 2: scatter + hit-testing).
 *
 * TODO(Phase 2): two `linearScale`s, render `<circle>` marks with Solid `<For>`,
 *   and wire `createHitIndex` (d3-delaunay, already in core/hit-test.ts) for
 *   nearest-point cursor/tooltip interaction.
 */
import { type Component } from "solid-js";
import { ChartRoot, SvgLayer } from "@silkplot/solid";
import { type XYPoint } from "./types.ts";
import { Placeholder } from "./Placeholder.tsx";

export interface ScatterChartProps {
  data: readonly XYPoint[];
  width?: number;
  height?: number;
  class?: string;
}

export const ScatterChart: Component<ScatterChartProps> = (props) => {
  return (
    <ChartRoot width={props.width} height={props.height}>
      <SvgLayer role="img" title="ScatterChart (not yet implemented)" class={props.class}>
        <Placeholder label="ScatterChart — coming in Phase 2" />
      </SvgLayer>
    </ChartRoot>
  );
};
