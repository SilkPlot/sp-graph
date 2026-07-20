/**
 * ranked — the categorical analogue of `series.ts`.
 *
 * A ranked chart answers a different question from a time series ("which
 * categories are largest", not "what happened when"), but the CONTRACT
 * questions are the same ones ADR-0008 already settled, and they are settled the
 * same way here rather than a second time in a second style:
 *
 *   - identity is a caller-supplied `id`, never an index and never the label
 *     (§1). On a ranked surface this is not a nicety: reordering is the entire
 *     point, so index identity is wrong by construction, and two categories may
 *     legitimately carry the same display text.
 *   - a broken value is never zero-filled (§4). `0` on a ranked bar is a visible
 *     claim that the category measured nothing.
 *   - order is the caller's. Nothing here sorts — see `normalizeCategories`.
 *
 * The diagnostic channel is deliberately SHARED with `series.ts` rather than
 * duplicated: `SeriesIssue` already carries the reference codes for the same
 * stated reason, that a caller wiring `onIssue` to their logger must not have to
 * wire a second hook to hear that a category was dropped. Two channels is how
 * one of them ends up unwired.
 */
import { extentOf } from "./extent";
import { isDevelopmentBuild } from "./build-env";
import type { DatumState, Domain, SeriesIssue } from "./series";

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One ranked category, as the caller supplies it.
 *
 * `value` is typed `number` rather than `number | null` because that is the
 * shape the contract was declared with, and a required `number` still admits
 * `NaN` at runtime — which is the case that actually arrives from a network or
 * an upstream calculation. The classification below therefore covers null and
 * undefined too, for untyped callers, without widening the published type.
 *
 * `meta` is deliberately `unknown` rather than a generic parameter. A generic
 * function component is not assignable to Solid's `Component<P>`, and only a
 * packed consumer outside the workspace can tell you — the trap `MultiSeriesInput`
 * already records. Metadata is carried verbatim and never plotted (ADR-0008 §3);
 * a caller who needs it typed narrows at their own call site.
 */
export interface RankedCategory {
  id: string;
  label: string;
  value: number;
  meta?: unknown;
}

/**
 * Which way the bars run.
 *
 * `"vertical"` describes the BARS, not the category axis — vertical bars grow
 * upward from a bottom category axis. That matches how every charting
 * vocabulary in the wild names it; naming it for the axis inverts the meaning of
 * both words relative to what a caller expects.
 *
 * In `core` rather than beside the model in `solid` for the reason ADR-0010 put
 * `MultiSeriesFormatProps` here: the typed contract examples compile under a
 * deliberately DOM-free `lib`, and importing from `solid` or `charts` would pull
 * the Solid and DOM chain in behind a bare string union.
 */
export type RankedOrientation = "vertical" | "horizontal";

/**
 * Caller formatters for the ranked surface, named by SURFACE (ADR-0010).
 *
 * Named for the CATEGORY and VALUE axes rather than for x and y, which is
 * ADR-0010's principle applied to a surface it did not have. On an orientable
 * chart the axis letters are not a surface: `xTickFormat` would mean the
 * categories in one orientation and the values in the other, so a caller
 * flipping `orientation` would silently swap which formatter applied. Category
 * and value are stable under orientation; x and y are not.
 *
 * This is also why a single `formatValue` is not offered here, exactly as
 * ADR-0010 rejected it for the time-series surface: a ranked value reaches the
 * value axis (which wants `R1.28m`), the data table (which wants
 * `R1,284,500.00`), and later the tooltip and announcement, and one formatter
 * serving all of them either forces the axis' brevity onto the read-aloud
 * surfaces or forces the axis to carry text it has no room for.
 */
export interface RankedFormatProps {
  /**
   * Category-axis tick text. Receives the LABEL, never the id — the id is
   * identity and is never displayed.
   */
  categoryTickFormat?: (label: string) => string;
  /** Value-axis tick text. */
  valueTickFormat?: (value: number) => string;
  /** Value text in the derived data table and the CSV export. */
  tableValueFormat?: (value: number) => string;
}

/* -------------------------------------------------------------------------- */
/* Normalised output                                                           */
/* -------------------------------------------------------------------------- */

export interface NormalizedCategory {
  id: string;
  label: string;
  /** The plottable value, or `null` for a gap of either kind. Never zero-filled. */
  value: number | null;
  meta?: unknown;
  /** Index in the CALLER's array. Preserved across dropping, so it is not a position. */
  sourceIndex: number;
  state: DatumState;
}

export interface RankedModel {
  /** Every category, in the caller's order. */
  categories: readonly NormalizedCategory[];
  /** Identity lookup, built from `id`, so a reorder cannot disturb it. */
  byId: ReadonlyMap<string, NormalizedCategory>;
  /** Band-scale domain: the ids, in caller order. Ids, NOT labels — see below. */
  bandDomain: readonly string[];
  /** Value extent over PRESENT values only. `[0, 1]` when there is nothing. */
  valueDomain: Domain;
  issues: readonly SeriesIssue[];
}

export interface NormalizeCategoriesOptions {
  /**
   * Throw on a structural contract violation. Defaults to `isDevelopmentBuild()`.
   * Only a duplicate id is structural — the asymmetry is explained on
   * `checkDuplicateCategoryIds`.
   */
  strict?: boolean;
  /** Diagnostic hook, called in development and production alike. */
  onIssue?: (issue: SeriesIssue) => void;
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A duplicate id throws; a broken value does not. Same asymmetry as
 * `checkDuplicateIds`, and for the same reasons — restated in one line rather
 * than re-argued, because inventing a second posture here is how the two
 * surfaces drift.
 *
 * A duplicate id is an authored bug that makes identity ambiguous and is fixed
 * once. A broken value is data, and it arrives in production on a dashboard
 * nobody is watching.
 *
 * In production a duplicate keeps the FIRST occurrence and drops the rest.
 */
function checkDuplicateCategoryIds(
  input: readonly RankedCategory[],
  options: NormalizeCategoriesOptions,
  report: (issue: SeriesIssue) => void,
): ReadonlySet<number> {
  const seen = new Map<string, number>();
  const dropped = new Set<number>();

  for (const [index, category] of input.entries()) {
    const first = seen.get(category.id);
    if (first === undefined) {
      seen.set(category.id, index);
      continue;
    }
    dropped.add(index);
    const message =
      `SilkPlot: two categories share the id ${JSON.stringify(category.id)} ` +
      `(positions ${first} and ${index}). A category is identified by its id and nothing ` +
      `else — two categories may legitimately carry the same LABEL, which is why the id ` +
      `is what identity is held on. A duplicate makes every lookup, activation, and bar ` +
      `position ambiguous. The first occurrence is kept.`;
    if (options.strict ?? isDevelopmentBuild()) throw new Error(message);
    report({ code: "duplicate-id", message, categoryId: category.id });
  }
  return dropped;
}

/**
 * Classify one value. No branch produces `0` — see the module note.
 *
 * Shares `DatumState`'s three-way vocabulary with `series.ts` rather than
 * defining a categorical one. `missing` is reachable only from an untyped
 * caller, since the published type requires a `number`; it is classified anyway
 * because the alternative is `null` silently becoming `invalid` and reading as
 * a corrupt upstream value rather than an absent one.
 */
function classifyValue(value: number | null | undefined): DatumState {
  if (value === null || value === undefined) return "missing";
  // `Number.isFinite`, not the global — the global coerces, and would re-admit
  // `null` as `0`, which is the exact defect this classification prevents.
  return Number.isFinite(value) ? "present" : "invalid";
}

/**
 * Report bad values once per CHART rather than once per category.
 *
 * `series.ts` reports once per series for the same reason: a diagnostic that
 * fires per datum buries everything else in the console, which is how the
 * channel gets switched off and takes the useful messages with it. A ranked
 * chart has no series to group by, so the chart itself is the grouping.
 */
function reportBadCategories(
  categories: readonly NormalizedCategory[],
  report: (issue: SeriesIssue) => void,
): void {
  const bad = categories.filter((c) => c.state === "invalid");
  if (bad.length === 0) return;

  const first = bad[0] as NormalizedCategory;
  report({
    code: "invalid-value",
    categoryId: first.id,
    message:
      `SilkPlot: ${bad.length} categor(y/ies) have a non-finite value (NaN or ±Infinity), ` +
      `first ${JSON.stringify(first.id)} at index ${first.sourceIndex}. They are drawn as ` +
      `no bar and excluded from the domain, and are never coerced to zero — a broken value ` +
      `rendered as zero is a visible claim that the category measured nothing.`,
  });
}

/**
 * Normalise ranked input into the one model every consumer reads.
 *
 * **Nothing is sorted, and that is the contract, not an omission.** A ranked
 * chart is the surface where sorting is most tempting and most wrong to do
 * here: the caller ranked the data to produce the ordering they want, and a
 * library re-sort would make the picture disagree with the table, the export,
 * and the array that was passed in. `toCsv` records the same position for the
 * same reason. A caller wanting a different order sorts their own array.
 *
 * It is a PURE function of its input. There is no cache and no retained record,
 * so a removed category cannot survive in a derived collection — stale identity
 * is structurally impossible rather than merely tested for.
 */
export function normalizeCategories(
  input: readonly RankedCategory[],
  options: NormalizeCategoriesOptions = {},
): RankedModel {
  const issues: SeriesIssue[] = [];
  const report = (issue: SeriesIssue): void => {
    issues.push(issue);
    options.onIssue?.(issue);
  };

  const dropped = checkDuplicateCategoryIds(input, options, report);

  const categories: NormalizedCategory[] = [];
  for (const [sourceIndex, raw] of input.entries()) {
    if (dropped.has(sourceIndex)) continue;
    const state = classifyValue(raw.value);
    categories.push({
      id: raw.id,
      label: raw.label,
      value: state === "present" ? raw.value : null,
      meta: raw.meta,
      sourceIndex,
      state,
    });
  }

  reportBadCategories(categories, report);

  return {
    categories,
    byId: new Map(categories.map((c) => [c.id, c])),
    bandDomain: categories.map((c) => c.id),
    valueDomain: rankedDomainOf(categories),
    issues,
  };
}

/* -------------------------------------------------------------------------- */
/* Domain                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Value extent across categories, over PRESENT values only.
 *
 * Delegates the skipping to `extentOf` by passing `NaN` for a gap, rather than
 * filtering first — the same deliberate reuse `valueDomainOf` makes. A separate
 * filter here could drift from `extentOf`'s, and then the domain and the bars
 * would disagree about which values exist.
 *
 * The empty and all-invalid result is `extentOf`'s `[0, 1]` sentinel. A chart
 * still has to produce a scale, and a degenerate domain makes d3 emit `NaN`
 * positions that render as nothing and are painful to trace back.
 */
export function rankedDomainOf(categories: readonly NormalizedCategory[]): Domain {
  return extentOf(categories, (c) =>
    c.state === "present" ? (c.value as number) : Number.NaN,
  );
}
