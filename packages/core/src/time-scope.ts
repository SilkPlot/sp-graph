/**
 * The layered time selection model — ADR-0007.
 *
 * A dashboard composes charts that must agree about time, and three different
 * things can each want to narrow what a chart shows: the range selected for the
 * whole dashboard, a transient selection dragged on one chart and shared with
 * the rest, and a single section's own scope. This module resolves those three
 * into the one value a component is allowed to read.
 *
 * It is pure interval arithmetic. No Solid, no DOM, and — see `resolveEffective
 * Domain` — no clock. That is what lets the precedence table be walked
 * exhaustively by a node test instead of sampled through a rendered tree, which
 * matters because the interesting rows are the ones where two scopes disagree,
 * and those are precisely the ones nobody builds a fixture for by accident.
 *
 * Instants are epoch milliseconds throughout. This model does NOT do zoned civil
 * time: DST gaps and folds, week and day boundaries, and display zones are a
 * separate problem with its own research, and anything here that looks like an
 * answer to one is answering an instant question that resembles it.
 */
import { isDevelopmentBuild } from "./build-env";

/**
 * The dashboard's outer bound — an interval of absolute instants.
 *
 * ADR-0007 §1: this is always present. A dashboard that has not been given one
 * derives it from the union of its members' data extents before calling here,
 * which is what makes the precedence table total rather than merely long.
 */
export interface GlobalRange {
  readonly scope: "global";
  readonly start: number;
  readonly end: number;
}

/**
 * A transient interval produced by interacting with one member and shared with
 * the rest. Always a narrowing within the global range; never state this model
 * persists.
 */
export interface DynamicSelection {
  readonly scope: "dynamic";
  readonly start: number;
  readonly end: number;
}

/** A section's own narrowing window. */
export interface SectionWindow {
  readonly scope: "section-window";
  readonly start: number;
  readonly end: number;
}

/**
 * A section showing only its most recent reading. It carries no interval of its
 * own — the bound it resolves against comes from the global range.
 */
export interface SectionLatest {
  readonly scope: "section-latest";
}

/** A section's scope: an explicit window, or latest-value mode. */
export type SectionScope = SectionWindow | SectionLatest;

/**
 * The three scopes, as one input.
 *
 * Each carries a distinct `scope` discriminant, so a function taking a global
 * range cannot be handed a section window by accident. Without it these would be
 * three structurally identical `{start, end}` shapes, mutually assignable, and
 * TypeScript would have nothing to say about the swap — which is the one mistake
 * here whose symptom is a chart quietly showing the wrong interval.
 */
export interface TimeScopes {
  readonly global: GlobalRange;
  /** Absent when no shared selection is active. */
  readonly dynamic?: DynamicSelection;
  /** Absent when the section follows the dashboard rather than scoping itself. */
  readonly section?: SectionScope;
}

/** A resolved interval a chart draws over. */
export interface EffectiveRange {
  readonly kind: "range";
  readonly start: number;
  readonly end: number;
}

/**
 * A resolved request for the most recent datum WITHIN `bounds`.
 *
 * It is deliberately not a range with equal ends. A consumer that treated
 * latest-value as a zero-width window would draw an axis across a domain of no
 * width, and it would compile everywhere — so the distinction is carried in the
 * type and the consumer is made to handle it (ADR-0007 §4).
 *
 * The bound is what answers "what if the newest datum is outside the global
 * range?": it is excluded by construction, because `bounds` never exceeds the
 * global range. Nothing on a dashboard shows data outside the selected range.
 */
export interface EffectiveLatest {
  readonly kind: "latest";
  readonly bounds: { readonly start: number; readonly end: number };
}

/** Why a resolution produced nothing to draw. */
export type EmptyReason =
  /** The scopes are individually valid and share no instant. */
  | "disjoint"
  /** A range arrived with its end before its start — a caller bug (§5). */
  | "inverted";

/** A resolution with nothing to draw. Rendered as an empty state, never widened. */
export interface EffectiveEmpty {
  readonly kind: "empty";
  readonly reason: EmptyReason;
}

/**
 * What a chart draws over. The ONLY value a component may read — a component
 * reaching past this for one of the three inputs is reimplementing the
 * precedence table.
 */
export type EffectiveDomain = EffectiveRange | EffectiveLatest | EffectiveEmpty;

/** A contract violation found while resolving. */
export interface TimeScopeIssue {
  code: "inverted-range";
  message: string;
}

export interface ResolveOptions {
  /**
   * Throw on a contract violation. Defaults to `isDevelopmentBuild()`.
   * Production resolves `empty` and reports through `onIssue` instead.
   */
  strict?: boolean;
  /** Diagnostic hook, called in development and production alike. */
  onIssue?: (issue: TimeScopeIssue) => void;
}

/** Intersect two intervals. Returns undefined when they share no instant. */
function intersect(
  a: { start: number; end: number },
  b: { start: number; end: number },
): { start: number; end: number } | undefined {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  // `>` not `>=`: a zero-width result is a legitimate intersection (§5), so two
  // intervals touching at exactly one instant intersect AT that instant rather
  // than resolving empty. Using `>=` here would make a range that starts where
  // another ends silently disappear.
  return start > end ? undefined : { start, end };
}

/**
 * An inverted interval is a caller bug, not input to normalise.
 *
 * A right-to-left drag is legitimate USER input, and normalising it is the
 * gesture layer's job, done before the interval reaches this model. Swapping the
 * ends here would show data nobody asked for and look correct doing it — and it
 * would leave this model unable to tell a user gesture from a caller's mistake.
 */
function checkInverted(
  interval: { scope: string; start: number; end: number },
  options: ResolveOptions,
): TimeScopeIssue | undefined {
  if (interval.end >= interval.start) return undefined;
  const message =
    `SilkPlot: the ${interval.scope} range ends before it starts ` +
    `(start ${interval.start}, end ${interval.end}). This model does not normalise an ` +
    `inverted interval — a silently swapped range shows data that was never requested. ` +
    `A right-to-left drag is normalised by the gesture layer before it reaches here.`;
  if (options.strict ?? isDevelopmentBuild()) throw new Error(message);
  return { code: "inverted-range", message };
}

/**
 * Resolve the three scopes to the one domain a chart draws over.
 *
 * ## Precedence (ADR-0007 §3)
 *
 * | Global  | Dynamic | Section | Result                                  |
 * |---------|---------|---------|-----------------------------------------|
 * | present | none    | none    | the global range                        |
 * | present | none    | window  | global ∩ window                         |
 * | present | none    | latest  | latest within the global range          |
 * | present | active  | none    | global ∩ dynamic                        |
 * | present | active  | window  | global ∩ window — dynamic ignored       |
 * | present | active  | latest  | latest within global — dynamic ignored  |
 *
 * Two rules generate the whole table:
 *
 * - **Nothing widens.** Every scope narrows within the global range, so a
 *   dynamic selection or section window reaching past it is clamped by the
 *   intersection rather than honoured beyond it.
 * - **A section with its own scope is isolated from the dynamic selection.**
 *   That is what "isolated section" means: a section that declared a window did
 *   so in order NOT to follow the shared cursor, so a drag on another chart must
 *   not disturb it. A section that declared nothing follows the dynamic
 *   selection, which is what makes a shared drag useful at all.
 *
 * An empty intersection resolves to `empty` and NEVER falls back to a wider
 * scope. Widening would show a reader data they had excluded, in a chart that
 * looks like it is working — strictly worse than an empty chart, which at least
 * prompts the question.
 *
 * ## This function never reads the clock
 *
 * There is no `now` parameter because no rule here needs one: latest-value
 * resolves to a BOUNDED REQUEST rather than to a datum, so picking the most
 * recent point belongs to the consumer that holds the data. The same inputs
 * therefore always produce the same output, and every case is a table row rather
 * than something reproducible only by waiting.
 */
export function resolveEffectiveDomain(
  scopes: TimeScopes,
  options: ResolveOptions = {},
): EffectiveDomain {
  const report = (issue: TimeScopeIssue): EffectiveEmpty => {
    options.onIssue?.(issue);
    return { kind: "empty", reason: "inverted" };
  };

  const globalIssue = checkInverted(scopes.global, options);
  if (globalIssue) return report(globalIssue);

  const section = scopes.section;

  // Latest-value ignores the dynamic selection and carries the global range as
  // its bound. Resolved before any intersection because it is not one.
  if (section?.scope === "section-latest") {
    return {
      kind: "latest",
      bounds: { start: scopes.global.start, end: scopes.global.end },
    };
  }

  // A section that declared its own window is isolated from the dynamic
  // selection; one that declared nothing follows it. This single choice is the
  // whole of the three-way disagreement row.
  const narrowing = section ?? scopes.dynamic;
  if (narrowing === undefined) {
    return { kind: "range", start: scopes.global.start, end: scopes.global.end };
  }

  const narrowingIssue = checkInverted(narrowing, options);
  if (narrowingIssue) return report(narrowingIssue);

  const result = intersect(scopes.global, narrowing);
  if (result === undefined) return { kind: "empty", reason: "disjoint" };
  return { kind: "range", start: result.start, end: result.end };
}
