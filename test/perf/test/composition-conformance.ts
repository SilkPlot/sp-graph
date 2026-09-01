/**
 * Shared composition-gate assertions.
 *
 * Happy-path suites call these so a mutation of the live page fails with the
 * same retained message the mutation proofs expect. Timing is not involved.
 */
import {
  CURRENT_COMPOSITION_IDENTITY,
  COMPOSITION_DIGEST,
  COMPOSITION_MANIFEST,
  DEFAULT_SURFACE_FAILURE,
  REVISION_FAILURE,
  canonicalJson,
  evaluateDefaultSurfaceAcceptance,
  evaluatePageRevision,
  tableModeFromQuery,
  type TableMode,
} from "../app/composition-revision";

export const CONFORMANCE_FAILURE = Object.freeze({
  tooltipMetadata: "tooltip metadata is absent",
  tooltipAllSeries: "tooltip is missing a visible series value",
  legendWiring: "legend is not wired to the chart visible-series state",
  explicitFormatter: "table is not using the caller-supplied source formatter",
  tableReveal: "table reveal control is absent",
  sourceValueCell: "source-value cell does not match the source",
  workloadRevision: REVISION_FAILURE.absent,
  defaultSurface: DEFAULT_SURFACE_FAILURE,
});

export const visibleText = (element: Element): string =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim();

export function publishedTableMode(search = location.search): TableMode {
  return window.__perf?.tableMode ?? tableModeFromQuery(search);
}

/** Clear the page-level composition contract between browser tests. */
export function resetPublishedComposition(): void {
  window.__perf = undefined;
  const root = document.documentElement;
  root.removeAttribute("data-perf-ready");
  root.removeAttribute("data-perf-composition-revision");
  root.removeAttribute("data-perf-composition-digest");
  document.querySelector("[data-perf-composition-manifest]")?.remove();
  history.replaceState({}, "", location.pathname);
}

export function assertTooltipMetadata(
  tooltip: Element | null,
  metadata: readonly string[],
): void {
  if (tooltip === null) {
    throw new Error(CONFORMANCE_FAILURE.tooltipMetadata);
  }
  const content = visibleText(tooltip);
  if (metadata.some((entry) => !content.includes(entry))) {
    throw new Error(CONFORMANCE_FAILURE.tooltipMetadata);
  }
}

export function assertTooltipAllSeries(
  tooltip: Element | null,
  readings: readonly { id: string; label: string; formatted: string }[],
): void {
  if (tooltip === null) {
    throw new Error(CONFORMANCE_FAILURE.tooltipAllSeries);
  }
  for (const reading of readings) {
    const row = tooltip.querySelector<HTMLElement>(
      `[data-perf-tooltip-series="${reading.id}"]`,
    );
    const haystack = row ? visibleText(row) : visibleText(tooltip);
    if (!haystack.includes(reading.label) || !haystack.includes(reading.formatted)) {
      throw new Error(CONFORMANCE_FAILURE.tooltipAllSeries);
    }
  }
}

export function assertLegendWiring(
  container: Element,
  expectedIds: readonly string[],
): void {
  const buttons = [
    ...container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]"),
  ];
  if (
    buttons.length !== expectedIds.length ||
    expectedIds.some((id, index) => buttons[index]?.dataset.spLegendItem !== id)
  ) {
    throw new Error(CONFORMANCE_FAILURE.legendWiring);
  }
}

export function assertExplicitFormatter(row: Element | null): void {
  if (row === null) {
    throw new Error(CONFORMANCE_FAILURE.explicitFormatter);
  }
  const cells = [...row.children].map((cell) => visibleText(cell));
  const time = cells[0] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(time)) {
    throw new Error(CONFORMANCE_FAILURE.explicitFormatter);
  }
  if (cells.slice(1).some((cell) => /°|kW|units/.test(cell))) {
    throw new Error(CONFORMANCE_FAILURE.explicitFormatter);
  }
}

export function assertTableRevealControl(container: Element): void {
  if (container.querySelector("[data-silkplot-table-toggle]") === null) {
    throw new Error(CONFORMANCE_FAILURE.tableReveal);
  }
}

export function assertSourceValueCell(
  row: Element | null,
  expected: readonly string[],
): void {
  if (row === null) {
    throw new Error(CONFORMANCE_FAILURE.sourceValueCell);
  }
  const cells = [...row.children].map((cell) => visibleText(cell));
  if (
    cells.length !== expected.length ||
    expected.some((value, index) => cells[index] !== value)
  ) {
    throw new Error(CONFORMANCE_FAILURE.sourceValueCell);
  }
}

export function assertWorkloadRevision(
  perf: {
    compositionRevision?: string;
    compositionDigest?: string;
    compositionManifest?: unknown;
  } | null
  | undefined,
  root: Element = document.documentElement,
): void {
  const observed = {
    identity:
      perf?.compositionRevision ??
      root.getAttribute("data-perf-composition-revision"),
    digest:
      perf?.compositionDigest ?? root.getAttribute("data-perf-composition-digest"),
    manifest: perf?.compositionManifest ?? COMPOSITION_MANIFEST,
  };
  const verdict = evaluatePageRevision(observed);
  if (!verdict.ok) {
    throw new Error(verdict.message ?? CONFORMANCE_FAILURE.workloadRevision);
  }
  if (
    root.getAttribute("data-perf-composition-revision") !== CURRENT_COMPOSITION_IDENTITY ||
    root.getAttribute("data-perf-composition-digest") !== COMPOSITION_DIGEST
  ) {
    throw new Error(REVISION_FAILURE.mismatched);
  }
  const script = document.querySelector("[data-perf-composition-manifest]");
  if (script == null || script.textContent == null || script.textContent === "") {
    throw new Error(REVISION_FAILURE.absent);
  }
  if (script.textContent !== canonicalJson(COMPOSITION_MANIFEST)) {
    throw new Error(REVISION_FAILURE.mismatched);
  }
}

export function assertDefaultSurfaceAcceptance(
  container: Element,
  search = location.search,
): void {
  const mode = publishedTableMode(search);
  const surface = evaluateDefaultSurfaceAcceptance(mode);
  if (!surface.ok) {
    throw new Error(surface.message ?? CONFORMANCE_FAILURE.defaultSurface);
  }
  const rows = container.querySelectorAll("[data-silkplot-alternative] tbody tr");
  if (rows.length === 0) {
    throw new Error(CONFORMANCE_FAILURE.defaultSurface);
  }
}
