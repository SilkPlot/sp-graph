import assert from "node:assert/strict";
import test from "node:test";
import { heldChartExportFindings } from "./release-policy.mjs";

test("held source-only chart families cannot enter the package root", () => {
  assert.deepEqual(
    heldChartExportFindings('export { PieChart } from "./PieChart";'),
    ["./PieChart"],
  );
  assert.deepEqual(
    heldChartExportFindings('export type { HistogramChartProps } from "./HistogramChart";'),
    ["./HistogramChart"],
  );
  assert.deepEqual(
    heldChartExportFindings('export { LineChart } from "./LineChart";'),
    [],
  );
});
