import { normalizeSeries, seriesGeometry, type Series } from "@silkplot/core";

/**
 * Derive the line geometry count from the caller's series and declared gap
 * policies. The proof deliberately does not read the Canvas annotation it is
 * checking: `break` retains a gap in the geometry while `connect` removes it.
 */
export const expectedVisibleLineGeometryPoints = (
  series: readonly Series[],
  visibleSeries: readonly string[],
): number =>
  normalizeSeries(series, { visibleSeries }).visible.reduce(
    (total, candidate) => total + seriesGeometry(candidate).points.length,
    0,
  );
