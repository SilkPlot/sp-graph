import { describe, expect, it } from "vitest";
import { w4Seconds } from "../../../packages/charts/test/workload-fixtures";
import {
  everyNth,
  expectedInspectionAtFraction,
  minMaxBuckets,
} from "../app/decimate";

describe("deterministic density inspection truth", () => {
  it("derives the exact raw and candidate readings at the frozen cursor", () => {
    const raw = w4Seconds()[0]?.data ?? [];

    expect(expectedInspectionAtFraction("raw", raw, raw, 0.62)).toEqual({
      seriesId: "raw",
      sourceIndex: 53_567,
      time: "2026-01-01T14:52:47.000Z",
      y: 210.2,
    });
    expect(
      expectedInspectionAtFraction("raw", raw, minMaxBuckets(raw, 2_000), 0.62),
    ).toEqual({
      seriesId: "raw",
      sourceIndex: 1_240,
      time: "2026-01-01T14:53:09.000Z",
      y: 211.7,
    });
    expect(
      expectedInspectionAtFraction("raw", raw, everyNth(raw, 2_000), 0.62),
    ).toEqual({
      seriesId: "raw",
      sourceIndex: 1_217,
      time: "2026-01-01T14:52:28.000Z",
      y: 207.8,
    });
  });
});
