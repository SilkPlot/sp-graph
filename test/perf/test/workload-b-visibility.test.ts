import { describe, expect, it } from "vitest";
import { w1DenseSeries } from "../../../packages/charts/test/workload-fixtures";
import { expectedVisibleLineGeometryPoints } from "../app/visibility-proof";

describe("W-B painted-visibility proof", () => {
  it("tracks the actual mixed break/connect fixture through legend and isolate transitions", () => {
    const series = w1DenseSeries();
    const all = series.map((candidate) => candidate.id);

    expect(expectedVisibleLineGeometryPoints(series, all)).toBe(605);
    expect(expectedVisibleLineGeometryPoints(series, all.slice(1))).toBe(577);
    expect(expectedVisibleLineGeometryPoints(series, [all[0] as string])).toBe(28);
    expect(expectedVisibleLineGeometryPoints(series, all)).toBe(605);
  });
});
