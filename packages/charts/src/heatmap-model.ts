/**
 * Dual-band model for a heatmap: categories on both axes, first row at the top.
 *
 * Sibling of `createRankedModel` rather than a flag on `createCartesianModel`,
 * which hardcodes a linear y. The bands come from core `heatmapBands` so the
 * axes and the cells cannot be built from different constructors.
 */
import { createMemo, type Accessor } from "solid-js";
import { heatmapBands, type ScaleBand } from "@silkplot/core";
import { useChartBounds, type AxisPairModel } from "@silkplot/solid";

export interface HeatmapModelSpec {
  columns: Accessor<readonly string[]>;
  rows: Accessor<readonly string[]>;
  padding?: Accessor<number | undefined>;
}

export interface HeatmapModel extends AxisPairModel<ScaleBand<string>, ScaleBand<string>> {
  columns: Accessor<ScaleBand<string>>;
  rows: Accessor<ScaleBand<string>>;
}

export function createHeatmapModel(spec: HeatmapModelSpec): HeatmapModel {
  const bounds = useChartBounds();
  const bands = createMemo(() =>
    heatmapBands({
      columns: spec.columns(),
      rows: spec.rows(),
      width: bounds().innerWidth,
      height: bounds().innerHeight,
      padding: spec.padding?.(),
    }),
  );
  const columns = (): ScaleBand<string> => bands().columns;
  const rows = (): ScaleBand<string> => bands().rows;
  const hasArea = (): boolean => bounds().innerWidth > 0 && bounds().innerHeight > 0;
  return { bounds, x: columns, y: rows, columns, rows, hasArea };
}
