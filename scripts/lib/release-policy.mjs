const HELD_CHART_MODULES = new Set([
  "./PieChart",
  "./HierarchyChart",
  "./BubbleChart",
  "./HistogramChart",
]);

/** Find source-only chart families exposed through the publishable package root. */
export function heldChartExportFindings(entrySource) {
  const findings = [];
  const moduleSpecifier = /\bfrom\s+["']([^"']+)["']/g;
  for (const match of entrySource.matchAll(moduleSpecifier)) {
    if (HELD_CHART_MODULES.has(match[1])) findings.push(match[1]);
  }
  return [...new Set(findings)].sort();
}
