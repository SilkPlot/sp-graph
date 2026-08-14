/**
 * Deterministic seams between the frozen workload fixtures and the pathological
 * index-rebuild mutation.
 *
 * The mutation is useful only when it rebuilds the production index input for
 * the chart the driver actually reaches. These helpers keep that input beside
 * the fixture accounting so the Node harness can prove both without running a
 * timing workload.
 */
import type { Series } from "@silkplot/core";

/** The subset production indexes, kept in the caller's series/paint order. */
export function selectVisiblePathologicalSeries(
  series: readonly Series[],
  visibleIds: readonly string[],
): readonly Series[] {
  const visible = new Set(visibleIds);
  return series.filter((candidate) => visible.has(candidate.id));
}

interface DashboardPanel {
  id: string;
  title: string;
  family: "line" | "area" | "bar" | undefined;
  time: Series["data"];
  categories: readonly unknown[];
}

export interface DashboardFixtureSummary {
  /** Marks actually rendered: time points for line/area, categories for bars. */
  renderedPoints: number;
  /** The first driven chart's one production time-series index input. */
  pathologicalSeries: readonly Series[];
}

/** Account for the mixed-family deck and isolate the one chart the driver reaches. */
export function summarizeDashboardFixture(
  panels: readonly DashboardPanel[],
): DashboardFixtureSummary {
  const driven = panels[0];
  if (driven === undefined) {
    throw new Error("W-C requires a first driven chart");
  }
  if (driven.family === "bar") {
    throw new Error("W-C's driven chart must use a time-series index, not bar data");
  }

  return {
    renderedPoints: panels.reduce(
      (total, panel) =>
        total + (panel.family === "bar" ? panel.categories.length : panel.time.length),
      0,
    ),
    pathologicalSeries: [{ id: driven.id, label: driven.title, data: driven.time }],
  };
}
