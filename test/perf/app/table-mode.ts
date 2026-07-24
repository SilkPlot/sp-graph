/**
 * How much of a frame is the chart, and how much is its accessible data table?
 *
 * The question mattered at these scales because the derived table is a real
 * DOM row per instant and it USED to narrow with the visible domain — so a
 * viewport commit rebuilt it, which the profiling phase measured as the
 * library's single largest interaction cost. ADR-0022 deleted that coupling:
 * the table follows the DATA scope and a viewport commit must not touch it.
 * The two configurations stay, because they are now the PROOF of the deletion
 * — the density-disposition phase's acceptance criterion is that the
 * table-vs-none gap is GONE from the re-run, not reduced, and one
 * configuration alone cannot show a gap of any size.
 *
 * So each workload renders twice, chosen by query string:
 *
 *     /?workload=w-a               the default a consumer gets — derived rows
 *     /?workload=w-a&table=none    the same chart, caller-supplied empty rows
 *
 * `table.rows` is a public, supported prop ("supply them to control
 * formatting"), and supplying an empty array holds the row count at zero without
 * touching anything else. Both runs are informative, both keep every
 * interaction, both draw identical marks — the ONLY difference is how many rows
 * the alternative builds, so the delta between them is the table's contribution
 * and nothing else.
 *
 * ---------------------------------------------------------------------------
 * Why not `decorative`, which was tried first and abandoned
 * ---------------------------------------------------------------------------
 * A decorative chart is supplied no default table, which looked like the tidier
 * instrument. It is not: decorative also switches off the keyboard composite and
 * the pointer path, by contract — a focusable surface that announces nothing is
 * a dead tab stop. So the decorative variant has no interaction surface, and the
 * harness sat waiting 120 seconds for a `[data-silkplot-keyboard-surface]` that
 * the contract had correctly declined to render. A decorative chart is not "the
 * same chart without a table"; it is a different chart, and comparing its frames
 * to an informative chart's would have attributed the cost of the entire
 * interaction surface to the table.
 *
 * Neither figure is "the" number. The default is what consumers ship; the
 * suppressed one is an instrument reading. Quote them together or not at all.
 */
import type { ChartDataTable } from "@silkplot/solid";

export const isTableSuppressed = (): boolean =>
  new URLSearchParams(location.search).get("table") === "none";

/**
 * The `table` prop for this page load.
 *
 * `undefined` lets the chart supply its own derived rows — the default path.
 * `{ rows: [] }` is a caller-supplied table with nothing in it.
 */
export const tableProp = (): ChartDataTable | undefined =>
  isTableSuppressed() ? { rows: [] } : undefined;
