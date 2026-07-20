/**
 * Reference overlays — ADR-0008 §10 as computation.
 *
 * A reference is a labelled line drawn at a fixed position on one axis: an SLA
 * floor at 95, a deployment at 14:20. It is not a series. It has no data, no gap
 * policy, and no visibility state, and it deliberately does not travel through
 * `normalizeSeries` — a threshold that appeared in the legend, the derived table
 * rows, or the y-domain-of-visible-series computation would be a measurement the
 * caller never took.
 *
 * What it DOES share with §1 and §4 is the posture, and that sharing is
 * deliberate rather than incidental:
 *
 *   - **A duplicate id is structural.** Development throws, production keeps the
 *     first and diagnoses. Same reasoning as a duplicate series id: identity is
 *     what a collision solver, a style lookup, and an accessible list all key on,
 *     so two answers to one id is an ambiguity with no correct resolution.
 *   - **A broken position is data, and degrades.** `NaN`, `±Infinity`, and an
 *     `Invalid Date` are dropped with a diagnostic and NEVER coerced. A threshold
 *     computed as `mean + 3 * stddev` over an empty window arrives as `NaN`, and
 *     a `NaN` rendered at zero is a line the operator will read as a real limit.
 *
 * The two are opposite postures for the reason `series.ts` already states: the
 * first is an authored bug a developer fixes once, the second arrives at runtime
 * on a dashboard nobody is watching.
 */
import { isDevelopmentBuild } from "./build-env";
import type { SeriesIssue, SeriesStyle } from "./series";

/**
 * The presentation channels a reference may override.
 *
 * A subset of `SeriesStyle` rather than the whole of it: a reference is a line,
 * so `fill` and `fillOpacity` have nothing to act on, and offering them would
 * invite a caller to fill a shape that is never drawn.
 */
export type ReferenceStyle = Pick<SeriesStyle, "stroke" | "strokeWidth" | "dash">;

/** The fields every reference carries, whichever axis it sits on. */
export interface ReferenceBase {
  /** Stable across replacement. The caller's, not the library's — ADR-0008 §1. */
  id: string;
  /** Display text, drawn beside the line AND exposed in the accessible list. */
  label: string;
  /**
   * Whether the axis expands to contain this reference. Defaults to **`true`**
   * (ADR-0008 §10): a line outside the domain has nowhere to be drawn, and a
   * line silently absent looks exactly like a working chart.
   *
   * On the TIME axis this governs the standalone domain only. Inside a
   * `<Dashboard>` the resolved scope wins — see `referenceDomainOf`.
   */
  includeInDomain?: boolean;
  style?: ReferenceStyle;
}

/**
 * A labelled reference line — ADR-0008 §10.
 *
 * The union is on the AXIS the reference sits on, not on a `kind` discriminator,
 * because the field name already carries it unambiguously: `value` is a number
 * on the y axis and draws horizontally, `time` is an instant on the x axis and
 * draws vertically. A separate `kind: "horizontal"` alongside them would be a
 * second place to state the same fact, and therefore a second place for it to be
 * wrong.
 *
 * One array rather than two props, because the label collision solver, the paint
 * order, and the accessible list all have to consider both axes together — two
 * arrays would give each of those three concerns two inputs and an undefined
 * ordering between them.
 */
export type ReferenceValue = ReferenceBase &
  ({ value: number; time?: never } | { time: Date; value?: never });

/** Which axis a reference is positioned on. */
export type ReferenceAxis = "value" | "time";

/**
 * A reference resolved to one comparable number, whatever axis it came from.
 *
 * `at` is the value itself for the y axis and epoch milliseconds for the x axis.
 * Collapsing both to a number here means the domain contribution, the collision
 * solver, and the pixel mapping are each written once rather than once per axis —
 * and `Date` is already epoch milliseconds under `valueOf`, so nothing is lost.
 */
export interface NormalizedReference {
  id: string;
  label: string;
  axis: ReferenceAxis;
  /** Position on `axis`: the number itself, or epoch ms for a time reference. */
  at: number;
  /** Resolved from the optional prop, so consumers never re-apply the default. */
  includeInDomain: boolean;
  /** Resolved to an empty object, so consumers never optional-chain a style. */
  style: ReferenceStyle;
  /** Index in the caller's array — paint order, and the label stacking order. */
  sourceIndex: number;
}

export interface NormalizeReferencesOptions {
  /** Throw on a duplicate id. Defaults to `isDevelopmentBuild()`. */
  strict?: boolean;
  /** Diagnostic hook, called in development and production alike. */
  onIssue?: (issue: SeriesIssue) => void;
}

export interface ReferenceModel {
  /** Every surviving reference, in the caller's order. */
  references: readonly NormalizedReference[];
  issues: readonly SeriesIssue[];
}

/**
 * Read a reference's position, or `undefined` when it has no usable one.
 *
 * `Number.isFinite` for the same reason `extentOf` uses it rather than the
 * global: the global coerces, so `null` would arrive as `0` and become a
 * threshold line at the baseline. An `Invalid Date` has a `NaN` valueOf, so both
 * axes are caught by the same check.
 */
function positionOf(reference: ReferenceValue): { axis: ReferenceAxis; at: number } | undefined {
  if (reference.time !== undefined) {
    const at = reference.time.valueOf();
    return Number.isFinite(at) ? { axis: "time", at } : undefined;
  }
  const at = reference.value;
  return typeof at === "number" && Number.isFinite(at) ? { axis: "value", at } : undefined;
}

/**
 * Normalise the caller's references into the one model every consumer reads.
 *
 * Order is the caller's. Nothing is sorted here — the collision solver sorts its
 * own working copy by position, and doing it here as well would make the paint
 * order disagree with the array that was passed in, which is §5's rule applied
 * to a second collection.
 */
export function normalizeReferences(
  input: readonly ReferenceValue[] | undefined,
  options: NormalizeReferencesOptions = {},
): ReferenceModel {
  const issues: SeriesIssue[] = [];
  const report = (issue: SeriesIssue): void => {
    issues.push(issue);
    options.onIssue?.(issue);
  };

  if (input === undefined || input.length === 0) return { references: [], issues };

  const seen = new Map<string, number>();
  const references: NormalizedReference[] = [];

  for (const [index, reference] of input.entries()) {
    const first = seen.get(reference.id);
    if (first !== undefined) {
      const message =
        `SilkPlot: two references share the id ${JSON.stringify(reference.id)} ` +
        `(positions ${first} and ${index}). A reference is identified by its id and ` +
        `nothing else, so a duplicate makes its style lookup, its label placement, and ` +
        `its entry in the accessible reference list ambiguous. The first is kept.`;
      if (options.strict ?? isDevelopmentBuild()) throw new Error(message);
      report({ code: "duplicate-reference-id", message, referenceId: reference.id });
      continue;
    }
    seen.set(reference.id, index);

    const position = positionOf(reference);
    if (position === undefined) {
      // Dropped, never drawn at zero. A threshold computed over an empty window
      // arrives as `NaN`; rendered at the baseline it becomes a line the operator
      // reads as a real limit, which is worse than the line being absent and
      // reported. This is §4's rule for data, applied to a threshold.
      report({
        code: "invalid-reference",
        message:
          `SilkPlot: reference ${JSON.stringify(reference.id)} has no finite position ` +
          `(${JSON.stringify(reference.time ?? reference.value)}). It is not drawn. A ` +
          `non-finite threshold is never coerced to zero — a line at the baseline would ` +
          `read as a real limit.`,
        referenceId: reference.id,
      });
      continue;
    }

    references.push({
      id: reference.id,
      label: reference.label,
      axis: position.axis,
      at: position.at,
      includeInDomain: reference.includeInDomain ?? true,
      style: reference.style ?? {},
      sourceIndex: index,
    });
  }

  return { references, issues };
}

/**
 * The positions on one axis that must fall inside the domain.
 *
 * Returns only the domain-PARTICIPATING references on that axis, as bare
 * numbers, for a caller to fold into an extent it is already computing. It
 * deliberately does not compute the extent itself: the y domain is subject to a
 * `YDomainPolicy` and the x domain to ADR-0007's scope resolution, so a
 * reference extent produced here would have to be re-policed by both callers
 * and would invite one of them to skip it.
 *
 * **The time axis carries a stated exception, and it is the one thing here most
 * likely to be "fixed" back into a bug.** Under a `<Dashboard>`, the visible
 * interval is resolved by ADR-0007 §3's precedence order, which is total. A
 * temporal reference does not widen it: the caller filters this list out on the
 * scoped path, and the reference is clipped like any out-of-scope datum. A tile
 * that quietly showed a wider interval than the dashboard's own range control
 * would be the one element on the page telling a different story, with nothing
 * marking it as such — the same reasoning `narrow()` already applies to data.
 */
export function referenceDomainOf(
  references: readonly NormalizedReference[],
  axis: ReferenceAxis,
): readonly number[] {
  const out: number[] = [];
  for (const reference of references) {
    if (reference.axis !== axis) continue;
    if (!reference.includeInDomain) continue;
    out.push(reference.at);
  }
  return out;
}
