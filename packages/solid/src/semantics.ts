/**
 * Chart semantics — the informative/decorative contract from ADR-0005.
 *
 * The rule this file exists to make unbreakable: an informative chart cannot
 * silently reach the accessibility tree unnamed. `role="img"` with no accessible
 * name is announced as a generic "graphic", "object", or effectively nothing, so
 * a screen-reader user cannot tell a chart is present at all. Optional
 * accessibility ships, repeatedly, as absent accessibility.
 *
 * Three parts, exactly as ADR-0005 §1 states them:
 *
 *   1. Development builds fail LOUD — a missing name throws; a missing
 *      description channel warns.
 *   2. Production may render an honest fallback name ONLY alongside a
 *      diagnostic. It never downgrades an informative chart to decorative
 *      semantics, because that erases information instead of reporting a
 *      failure.
 *   3. Decorative is reachable only through an explicit `decorative` opt-out.
 *
 * The type system carries the first line of defence: `ChartSemanticsProps` is a
 * discriminated union in which "informative and unnamed" is not representable.
 * `resolveChartSemantics` is the runtime backstop for callers without types
 * (plain JS, `any`, a value that arrived from the network).
 */
import { createEffect, createMemo, createUniqueId, type Accessor } from "solid-js";
import { isDevelopmentBuild } from "@silkplot/core";

/**
 * Re-exported so this module stays the one place a caller reaches for the
 * semantics contract, and so removing the local copy did not change the public
 * surface. The implementation moved DOWN to `@silkplot/core` when the time-scope
 * contract needed the same answer — one copy, in the layer both can reach,
 * rather than two that can silently disagree about which build this is.
 */
export { isDevelopmentBuild };

/**
 * The semantic data alternative — a real HTML table, per ADR-0005 §2.
 *
 * The library owns the renderer; the application owns the wording.
 *
 * `columns` was REQUIRED until 2026-07-19, on the reasoning that column headers
 * carry units and domain language the library cannot know honestly ("Bookings",
 * not "y"). That reasoning was half right and produced the wrong outcome: a
 * table nobody configured did not render at all, and a missing table is a worse
 * result for a non-visual reader than a generically-headed one. A composed chart
 * now supplies headings from its own known shape, so a table renders with no
 * configuration.
 *
 * The original concern still binds the library: a generic heading must never be
 * presented as though it were domain language. Domain wording stays the
 * application's, through this field, the caption, and the accessible name.
 */
export interface ChartDataTable {
  /**
   * Column headers, in order. The application's wording and units.
   *
   * Omit and a composed chart supplies generic headings from its own shape
   * ("Time", "Value"). Supply them whenever the data has real units — the
   * default is honest, not good.
   */
  columns?: readonly string[];
  /**
   * Table rows. Omit and the chart derives them from the same data its marks
   * draw, so the two cannot disagree. Supply them to control formatting.
   */
  rows?: readonly (readonly (string | number)[])[];
  /** Table caption. Defaults to the chart's accessible name. */
  caption?: string;
}

/** A contract violation found at render time. */
export interface ChartSemanticsIssue {
  code: "missing-name" | "missing-description";
  message: string;
}

/** The honest fallback name a production build renders instead of nothing. */
export const FALLBACK_CHART_NAME = "Unnamed chart";

/** Fields shared by every informative arm. */
interface InformativeCommon {
  /** Informative is the default. Pass `decorative` to opt out; see `DecorativeSemantics`. */
  decorative?: false;
  /**
   * The chart-level description: what the axes, labels, and shape give a sighted
   * reader at a glance — domain and range, units, series, span, dominant trend,
   * extrema, caveats. Rendered as the SVG `<desc>`.
   *
   * Because the visual axes are `aria-hidden`, their information has to survive
   * here or in `table`. That is the ONLY thing that makes hiding them defensible
   * (ADR-0005 §1).
   */
  desc?: string;
  /**
   * A concise narrative overview — period shown, overall direction, largest and
   * smallest values, meaningful change points, caveats. Rendered as real HTML
   * next to the data table, because screen-reader users want overview AND
   * detail, not a choice between them.
   */
  summary?: string;
  /** ID of existing page content that already describes this chart. */
  describedBy?: string;
  /** The semantic data alternative. See `ChartDataTable`. */
  table?: ChartDataTable;
  /**
   * Hide the rendered table from sighted users, exposing it only to assistive
   * technology.
   *
   * This is a LAST-RESORT progressive enhancement, not the ideal (ADR-0005 §2).
   * Sighted users often prefer rows and columns too. Prefer leaving the table
   * visible, or render your own adjacent "Data table" control and point
   * `describedBy` at it.
   */
  tableHidden?: boolean;
  /**
   * Diagnostic hook. Called for every contract violation, in development and in
   * production alike — this is what makes a production fallback name honest
   * rather than a silent downgrade.
   */
  onSemanticsIssue?: (issue: ChartSemanticsIssue) => void;
}

/**
 * A decorative chart: the same information is fully available elsewhere on the
 * page, so this graphic is removed from the accessibility tree entirely.
 *
 * The `never` fields are deliberate. Passing a name to a decorative chart is
 * always a mistake — either the chart is informative, or the name is dead
 * weight that will never be announced.
 */
export interface DecorativeSemantics {
  decorative: true;
  title?: never;
  labelledBy?: never;
  desc?: never;
  summary?: never;
  describedBy?: never;
  table?: never;
  tableHidden?: never;
  onSemanticsIssue?: (issue: ChartSemanticsIssue) => void;
}

/**
 * An informative chart. Named directly with `title`, or by reference to
 * existing page content with `labelledBy` — the API accepts both rather than
 * pretending it can infer whether a nearby heading already names the chart
 * (ADR-0005 §6).
 *
 * The two arms are what make an unnamed informative chart unrepresentable.
 */
export type InformativeSemantics =
  | (InformativeCommon & {
      /** Short, identifying accessible name: "Weekly bookings by clinic". Not a recitation of the data. */
      title: string;
      labelledBy?: string;
    })
  | (InformativeCommon & {
      title?: string;
      /** ID of existing page content that already names this chart. */
      labelledBy: string;
    });

/**
 * The accessibility surface every composed chart accepts.
 *
 * Informative is the default; decorative is an explicit opt-out. Omitting both
 * a `title` and a `labelledBy` fails to match any arm — the unnamed informative
 * chart is a compile error, not a runtime surprise.
 */
export type ChartSemanticsProps = InformativeSemantics | DecorativeSemantics;

/**
 * The same fields with the union erased and everything optional.
 *
 * Components take this internally: a union-typed props object cannot be spread
 * or narrowed usefully through Solid's props proxy, and the union has already
 * done its work at the caller's JSX. Every `ChartSemanticsProps` is assignable
 * to this.
 */
export interface ChartSemanticsInput {
  decorative?: boolean;
  title?: string;
  labelledBy?: string;
  desc?: string;
  describedBy?: string;
  summary?: string;
  table?: ChartDataTable;
  /**
   * A table the LIBRARY supplies because the caller supplied none — a composed
   * chart's own derived rows under generic headings.
   *
   * It renders exactly like `table`, and it deliberately does NOT count as a
   * description channel. The distinction is the whole point: a defaulted table
   * carries the VALUES a hidden axis would have shown, but not its units or its
   * domain language, so a chart with nothing but a defaulted table still has a
   * missing description and must still say so. Letting it satisfy the check
   * would silence the diagnostic for every chart at once, which is how a
   * contract stops being one.
   */
  defaultTable?: ChartDataTable;
  tableHidden?: boolean;
  onSemanticsIssue?: (issue: ChartSemanticsIssue) => void;
}

/** The outcome of applying the contract to one set of inputs. */
export interface ResolvedChartSemantics {
  decorative: boolean;
  /**
   * The name to render. Empty when decorative, or when the name comes from
   * `labelledBy` (the referenced element supplies the text).
   */
  name: string;
  /** Set when the caller named the chart by reference instead of by value. */
  labelledBy?: string;
  /** True when `name` is the fallback rather than something the caller supplied. */
  usedFallbackName: boolean;
  issues: readonly ChartSemanticsIssue[];
}

/**
 * Apply the ADR-0005 contract to one set of semantic inputs.
 *
 * Pure and synchronous apart from the `strict` throw, which is the contract's
 * point rather than an accident: keeping the decision in a plain function is
 * what lets both the development and production branches be tested directly,
 * instead of one of them being reachable only by rebuilding the test runner.
 *
 * @param strict Throw on a missing name (development). Defaults to
 *   `isDevelopmentBuild()`. Production returns a fallback name plus an issue,
 *   and never returns decorative semantics for an informative chart.
 */
export function resolveChartSemantics(
  input: ChartSemanticsInput,
  options: { strict?: boolean } = {},
): ResolvedChartSemantics {
  if (input.decorative === true) {
    return { decorative: true, name: "", usedFallbackName: false, issues: [] };
  }

  const strict = options.strict ?? isDevelopmentBuild();
  const issues: ChartSemanticsIssue[] = [];
  const title = input.title?.trim() ?? "";
  const labelledBy = input.labelledBy?.trim() ?? "";
  const named = title.length > 0 || labelledBy.length > 0;

  if (!named) {
    const message =
      "SilkPlot: an informative chart needs an accessible name. Pass `title` " +
      "with a short identifying label (\"Weekly bookings by clinic\"), or " +
      "`labelledBy` with the id of a heading that already names it. If this " +
      "chart genuinely carries no information a non-visual user needs, opt out " +
      "explicitly with `decorative` — it will never happen implicitly.";
    // Development fails loud. This is the whole point of the contract: a
    // library that only warns here is how the ecosystem ends up with unnamed
    // graphics in production.
    if (strict) throw new Error(message);
    issues.push({ code: "missing-name", message });
  }

  // Note what is NOT here: a production build with no name still returns
  // `decorative: false`. Downgrading it to decorative would hide the chart from
  // assistive technology entirely — erasing the information instead of
  // reporting the failure.
  const described =
    (input.desc?.trim().length ?? 0) > 0 ||
    (input.summary?.trim().length ?? 0) > 0 ||
    (input.describedBy?.trim().length ?? 0) > 0 ||
    input.table !== undefined;

  if (!described) {
    issues.push({
      code: "missing-description",
      message:
        "SilkPlot: this informative chart has no description channel. The " +
        "visual axes are hidden from assistive technology, so their domain, " +
        "range, and units survive only in `desc`, `summary`, `table`, or " +
        "`describedBy`. Without one of those, the axis information reaches a " +
        "non-visual user nowhere at all.",
    });
  }

  return {
    decorative: false,
    name: named ? title : FALLBACK_CHART_NAME,
    labelledBy: labelledBy.length > 0 ? labelledBy : undefined,
    usedFallbackName: !named,
    issues,
  };
}

/** Reactive semantics for one chart instance: resolved state plus stable ids. */
export interface ChartSemantics {
  decorative: Accessor<boolean>;
  /** Accessible name to render in `<title>`; empty when named by reference or decorative. */
  name: Accessor<string>;
  /** Value for the svg's `aria-labelledby`, or undefined when there is nothing to point at. */
  labelledBy: Accessor<string | undefined>;
  /** Value for the svg's `aria-describedby` — description, summary, and any caller reference. */
  describedBy: Accessor<string | undefined>;
  /** Value for the svg's `aria-details`, pointing at the rendered data table. */
  details: Accessor<string | undefined>;
  desc: Accessor<string | undefined>;
  summary: Accessor<string | undefined>;
  table: Accessor<ChartDataTable | undefined>;
  tableHidden: Accessor<boolean>;
  /** Stable, collision-free element ids for this instance. */
  ids: { title: string; desc: string; summary: string; table: string };
}

/**
 * Bind the semantics contract to a component instance.
 *
 * Ids come from Solid's `createUniqueId`, so two charts on one page never
 * collide and the same chart keeps its ids across re-renders — both of which
 * matter, because every `aria-*` relationship here is an id reference and a
 * duplicate id silently points at the wrong chart.
 *
 * Everything is an accessor. Semantic content has to update from the same data
 * replacement that moves the marks, or the table and the picture start
 * describing different datasets while both look fine.
 */
export function createChartSemantics(props: ChartSemanticsInput): ChartSemantics {
  const ids = {
    title: createUniqueId(),
    desc: createUniqueId(),
    summary: createUniqueId(),
    table: createUniqueId(),
  };

  const resolved = createMemo(() =>
    resolveChartSemantics({
      decorative: props.decorative,
      title: props.title,
      labelledBy: props.labelledBy,
      desc: props.desc,
      describedBy: props.describedBy,
      summary: props.summary,
      table: props.table,
    }),
  );

  // Read once eagerly so a development-build contract violation throws while
  // the caller's own component is on the stack, rather than later from
  // whichever child happens to read the name first.
  resolved();

  createEffect(() => {
    for (const issue of resolved().issues) {
      props.onSemanticsIssue?.(issue);
      if (isDevelopmentBuild()) console.warn(issue.message);
    }
  });

  const decorative = (): boolean => resolved().decorative;
  const hasSummary = (): boolean => !decorative() && (props.summary?.trim().length ?? 0) > 0;
  const hasDesc = (): boolean => !decorative() && (props.desc?.trim().length ?? 0) > 0;
  const table = (): ChartDataTable | undefined =>
    decorative() ? undefined : (props.table ?? props.defaultTable);

  return {
    decorative,
    name: () => resolved().name,
    // `<title>` alone is not a dependable accessible name across screen
    // readers; an explicit `aria-labelledby` pointing AT that `<title>` is.
    // Both ship, and the caller's own reference wins when they supplied one.
    labelledBy: () => {
      if (decorative()) return undefined;
      const byRef = resolved().labelledBy;
      if (byRef !== undefined) return byRef;
      return ids.title;
    },
    describedBy: () => {
      if (decorative()) return undefined;
      const parts = [
        hasDesc() ? ids.desc : undefined,
        hasSummary() ? ids.summary : undefined,
        props.describedBy?.trim() || undefined,
      ].filter((part): part is string => part !== undefined);
      return parts.length > 0 ? parts.join(" ") : undefined;
    },
    // A table has structure and navigation beyond what a description should
    // carry, so it is related with `aria-details` rather than crammed into
    // `aria-describedby` as flattened prose.
    details: () => (table() !== undefined ? ids.table : undefined),
    desc: () => (hasDesc() ? props.desc : undefined),
    summary: () => (hasSummary() ? props.summary : undefined),
    table,
    tableHidden: () => props.tableHidden === true,
    ids,
  };
}
