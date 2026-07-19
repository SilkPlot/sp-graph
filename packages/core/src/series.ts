/**
 * The shared series model — ADR-0008, as computation.
 *
 * Everything that draws, labels, lists, or tabulates a multi-series chart reads
 * this one normalisation: the marks, the legend, the reference overlays, the
 * data alternative, and later the pointer index. That is the point rather than
 * a tidiness preference. Two components deriving "which series are visible" or
 * "is this datum a gap" separately do not merely disagree eventually — they
 * disagree silently, and the reader has no way to tell which is authoritative.
 *
 * It is a PURE function of its input. There is no cache, no retained record,
 * and no mutation of caller data. That is what makes stale identity structurally
 * impossible rather than merely tested for: a series removed from the input
 * cannot survive in a derived collection, because the derived collections are
 * built from the input and nothing else.
 *
 * Reactivity is deliberately NOT here. This package has no Solid and no DOM;
 * the reactive wrapper calls this inside a memo, so recomputation is the
 * caller's concern and the model stays walkable by a node test.
 */
import { extentOf } from "./extent";
import { isDevelopmentBuild } from "./build-env";

/* -------------------------------------------------------------------------- */
/* Public input types (ADR-0008 §1, §3)                                        */
/* -------------------------------------------------------------------------- */

/** ADR-0008 §4. Per series, never per chart. */
export type NullPolicy = "break" | "connect";

export interface SeriesStyle {
  stroke?: string;
  strokeWidth?: number;
  /** Area fill under the line. Absent means no fill. */
  fill?: string;
  /** A non-colour channel, so series stay distinguishable in monochrome. */
  dash?: readonly number[];
}

/**
 * One point. `y` is `number | null`, and `null` is a DECLARED ABSENCE — the
 * sensor was offline, the month had no reading. It is never coerced to zero.
 *
 * `meta` is generic, never plotted, never interpreted, and returned verbatim.
 * It exists so an application does not have to keep a parallel timestamp-to-
 * metadata map and re-join it on every hover, when this model already holds the
 * datum.
 */
export interface SeriesDatum<M = unknown> {
  t: Date;
  y: number | null;
  meta?: M;
}

/** ADR-0008 §1. Identity is `id`, and nothing else. */
export interface Series<M = unknown> {
  id: string;
  label: string;
  data: readonly SeriesDatum<M>[];
  nullPolicy?: NullPolicy;
  style?: SeriesStyle;
}

/* -------------------------------------------------------------------------- */
/* Normalised output types                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Why a datum has no plottable value.
 *
 * `missing` and `invalid` are kept APART rather than collapsed into "no value",
 * because they arrive from different causes and ADR-0008 §4 gives them different
 * powers: `nullPolicy: "connect"` may draw across a `missing` point, and may
 * never draw across an `invalid` one. Collapsing them would let a corrupt
 * upstream value be rendered with the same confidence as a known gap.
 */
export type DatumState = "present" | "missing" | "invalid";

export interface NormalizedDatum<M = unknown> {
  t: Date;
  /** `t.getTime()`, computed once. Every consumer needs it; none should re-derive it. */
  time: number;
  /** The plottable value, or `null` for a gap of either kind. Never zero-filled. */
  y: number | null;
  meta?: M;
  /** Index in the CALLER's array, preserved across filtering (ADR-0008 §5). */
  sourceIndex: number;
  state: DatumState;
}

export interface NormalizedSeries<M = unknown> {
  id: string;
  label: string;
  /** Resolved, never undefined. Default `"break"`. */
  nullPolicy: NullPolicy;
  /** Resolved to an empty object, so consumers never optional-chain a style. */
  style: SeriesStyle;
  data: readonly NormalizedDatum<M>[];
  visible: boolean;
  /** Index in the caller's series array — legend order and paint order. */
  sourceIndex: number;
}

export type SeriesIssueCode = "duplicate-id" | "invalid-value" | "invalid-time";

export interface SeriesIssue {
  code: SeriesIssueCode;
  message: string;
  /** The series the issue belongs to, where one is identifiable. */
  seriesId?: string;
}

/** A finite `[min, max]` pair. See `domainOf` for the empty and all-invalid case. */
export type Domain = [number, number];

export interface SeriesModel<M = unknown> {
  /** Every series, in the caller's order. Hidden ones included, flagged `visible: false`. */
  series: readonly NormalizedSeries<M>[];
  /** The visible subset, same order. The collection marks and domains read. */
  visible: readonly NormalizedSeries<M>[];
  /** Identity lookup. Built from `id`, so a reorder cannot disturb it. */
  byId: ReadonlyMap<string, NormalizedSeries<M>>;
  /** Time and value extents over VISIBLE series — what the axes describe (§7). */
  timeDomain: Domain;
  valueDomain: Domain;
  /** The same extents over EVERY series, for a consumer that needs a stable frame. */
  allTimeDomain: Domain;
  allValueDomain: Domain;
  issues: readonly SeriesIssue[];
}

export interface NormalizeOptions {
  /**
   * Controlled visibility (ADR-0008 §6). `undefined` means uncontrolled — every
   * series visible. An EMPTY ARRAY means nothing is visible, and is a real
   * state: it must not be read as "no filter, show everything", which is the bug
   * where deselecting the last series makes every series reappear.
   */
  visibleSeries?: readonly string[];
  /**
   * Throw on a structural contract violation. Defaults to `isDevelopmentBuild()`.
   * Only a duplicate id is structural — see `checkDuplicateIds`.
   */
  strict?: boolean;
  /** Diagnostic hook, called in development and production alike. */
  onIssue?: (issue: SeriesIssue) => void;
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A duplicate id is a STRUCTURAL violation, and the only one here that throws.
 *
 * The distinction against an invalid value is deliberate and worth stating,
 * because the two look like inconsistent postures otherwise:
 *
 *   - A duplicate id is a CALLER BUG in the shape of the input. The model
 *     becomes ambiguous — two different things answer to "sensor-1", so every
 *     lookup, legend toggle, and colour assignment has two possible answers and
 *     no way to choose. It is authored, reproducible, and fixed once.
 *   - An invalid value is DATA. It arrives at runtime from a sensor, a network,
 *     or an upstream calculation, and it will happen in production on a dashboard
 *     nobody is watching. Throwing takes the whole page down over one bad row.
 *
 * So: the first fails loud in development, because a developer can fix it. The
 * second degrades to a visible gap and reports, because `extentOf` already
 * established that drawing a gap is the honest failure — visible, local, and
 * recoverable — and every comparable library degrades the same way.
 *
 * In production a duplicate keeps the FIRST occurrence and drops the rest.
 * Merging them would render fewer lines than the caller passed with no
 * indication of which was lost.
 */
function checkDuplicateIds<M>(
  input: readonly Series<M>[],
  options: NormalizeOptions,
  report: (issue: SeriesIssue) => void,
): ReadonlySet<number> {
  const seen = new Map<string, number>();
  const dropped = new Set<number>();

  for (const [index, series] of input.entries()) {
    const first = seen.get(series.id);
    if (first === undefined) {
      seen.set(series.id, index);
      continue;
    }
    dropped.add(index);
    const message =
      `SilkPlot: two series share the id ${JSON.stringify(series.id)} ` +
      `(positions ${first} and ${index}). A series is identified by its id and nothing ` +
      `else, so a duplicate makes every lookup, legend toggle, and colour assignment ` +
      `ambiguous. Merging them would draw fewer lines than were passed, with no ` +
      `indication of which was lost. The first occurrence is kept.`;
    if (options.strict ?? isDevelopmentBuild()) throw new Error(message);
    report({ code: "duplicate-id", message, seriesId: series.id });
  }
  return dropped;
}

/**
 * Classify one value.
 *
 * The three-way split is the whole of ADR-0008 §4 in one place. Note what is
 * NOT here: no branch produces `0`. A missing reading rendered as zero is
 * indistinguishable from a real measurement of zero, and on a signed series it
 * inverts the meaning of the picture.
 */
function classify(y: number | null | undefined): DatumState {
  if (y === null || y === undefined) return "missing";
  // `Number.isFinite`, not the global — the global coerces, and would re-admit
  // `null` as `0`, which is the exact defect this classification prevents.
  return Number.isFinite(y) ? "present" : "invalid";
}

/**
 * Normalise the caller's input into the one model every consumer reads.
 *
 * Order is the caller's throughout: series order is legend and paint order,
 * datum order is the array's. Nothing is sorted — sorting is the only
 * super-linear operation available here, and it would make the picture disagree
 * with the table, the export, and the array that was passed in (§5).
 *
 * Duplicate timestamps are kept, both of them, in array order. They are a
 * legitimate input (two readings at one instant) and the deterministic answer is
 * the one that preserves what was given.
 */
export function normalizeSeries<M = unknown>(
  input: readonly Series<M>[],
  options: NormalizeOptions = {},
): SeriesModel<M> {
  const issues: SeriesIssue[] = [];
  const report = (issue: SeriesIssue): void => {
    issues.push(issue);
    options.onIssue?.(issue);
  };

  const dropped = checkDuplicateIds(input, options, report);

  // `undefined` is uncontrolled (all visible); an empty array is a real, empty
  // selection. The Set is built only in the controlled case so the two are
  // never conflated by an empty Set standing in for "no filter".
  const controlled = options.visibleSeries !== undefined;
  const allowed = controlled ? new Set(options.visibleSeries) : undefined;

  const series: NormalizedSeries<M>[] = [];

  for (const [sourceIndex, raw] of input.entries()) {
    if (dropped.has(sourceIndex)) continue;

    const data: NormalizedDatum<M>[] = raw.data.map((d, i) => {
      const time = d.t instanceof Date ? d.t.getTime() : Number.NaN;
      let state = classify(d.y);

      // A datum with no valid instant has no position on the x axis, whatever
      // its value. It is `invalid` rather than `missing`: an unparseable date is
      // a broken record, and `connect` must not draw through it.
      if (!Number.isFinite(time) && state !== "invalid") state = "invalid";

      return {
        t: d.t,
        time,
        y: state === "present" ? (d.y as number) : null,
        meta: d.meta,
        sourceIndex: i,
        state,
      };
    });

    reportBadValues(raw, data, report);

    series.push({
      id: raw.id,
      label: raw.label,
      nullPolicy: raw.nullPolicy ?? "break",
      style: raw.style ?? {},
      data,
      // An id in `visibleSeries` that no series has is ignored, not an error —
      // data and visibility arrive from different places and are briefly out of
      // step during every replacement (§6). This membership test is what makes
      // that a non-event: an unknown id simply matches nothing.
      visible: allowed === undefined || allowed.has(raw.id),
      sourceIndex,
    });
  }

  const visible = series.filter((s) => s.visible);
  const byId = new Map(series.map((s) => [s.id, s]));

  return {
    series,
    visible,
    byId,
    timeDomain: timeDomainOf(visible),
    valueDomain: valueDomainOf(visible),
    allTimeDomain: timeDomainOf(series),
    allValueDomain: valueDomainOf(series),
    issues,
  };
}

/**
 * Report bad values once per series rather than once per datum.
 *
 * A series with 5,000 corrupt points would otherwise emit 5,000 identical
 * diagnostics and bury everything else in the console — which is how a
 * diagnostic channel gets turned off, taking the useful messages with it.
 */
function reportBadValues<M>(
  raw: Series<M>,
  data: readonly NormalizedDatum<M>[],
  report: (issue: SeriesIssue) => void,
): void {
  const invalid = data.filter((d) => d.state === "invalid");
  if (invalid.length === 0) return;

  const badTime = invalid.filter((d) => !Number.isFinite(d.time)).length;
  const first = invalid[0] as NormalizedDatum<M>;

  if (badTime > 0) {
    report({
      code: "invalid-time",
      seriesId: raw.id,
      message:
        `SilkPlot: series ${JSON.stringify(raw.id)} has ${badTime} datum(s) with no valid ` +
        `instant (first at index ${first.sourceIndex}). They have no position on the time ` +
        `axis and are drawn as gaps. A gap policy of "connect" does not draw through them: ` +
        `an unparseable date is a broken record, not a known absence.`,
    });
  }

  const badValue = invalid.length - badTime;
  if (badValue > 0) {
    report({
      code: "invalid-value",
      seriesId: raw.id,
      message:
        `SilkPlot: series ${JSON.stringify(raw.id)} has ${badValue} non-finite value(s) ` +
        `(NaN or ±Infinity). They are drawn as gaps and excluded from the domain, and are ` +
        `never coerced to zero — a broken value rendered as zero is indistinguishable from ` +
        `a real measurement of zero. "connect" does not draw through them either.`,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Domains                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Value extent across a set of series, over PRESENT values only.
 *
 * `extentOf` already skips every non-finite value, so `missing` and `invalid`
 * are excluded by passing `NaN` for them rather than by a second filter. That is
 * deliberate reuse of one policy: a separate filter here could drift from
 * `extentOf`'s, and then the domain and the marks would disagree about which
 * values exist.
 *
 * The empty and all-invalid result is `extentOf`'s `[0, 1]` sentinel, unchanged
 * and on purpose — a series still has to produce a scale, and a degenerate
 * domain makes d3 emit `NaN` positions that render as nothing and are painful to
 * trace back. Empty visible set, all-hidden, and all-invalid are one path.
 */
export function valueDomainOf<M>(series: readonly NormalizedSeries<M>[]): Domain {
  const points: NormalizedDatum<M>[] = [];
  for (const s of series) points.push(...s.data);
  return extentOf(points, (d) => (d.state === "present" ? (d.y as number) : Number.NaN));
}

/** Time extent across a set of series, over datums with a valid instant. */
export function timeDomainOf<M>(series: readonly NormalizedSeries<M>[]): Domain {
  const points: NormalizedDatum<M>[] = [];
  for (const s of series) points.push(...s.data);
  return extentOf(points, (d) => (d.state === "invalid" ? Number.NaN : d.time));
}

/* -------------------------------------------------------------------------- */
/* Geometry input (ADR-0008 §4)                                                */
/* -------------------------------------------------------------------------- */

export interface SeriesGeometry<M = unknown> {
  /** The points a path generator receives, in order. */
  points: readonly NormalizedDatum<M>[];
  /** Whether a point is drawn. `false` breaks the path at that point. */
  defined: (d: NormalizedDatum<M>, index: number) => boolean;
}

/**
 * Turn a series' gap policy into the two inputs a path generator needs.
 *
 * The two policies produce STRUCTURALLY different inputs, not one input with a
 * flag, and that is what makes them distinguishable rather than nearly the same:
 *
 *   - `"break"` passes every point and marks the gaps undrawn, so the generator
 *     lifts the pen and the absence is visible as an absence.
 *   - `"connect"` REMOVES the gaps from the array, so the generator joins the
 *     surviving neighbours and never learns a point was missing.
 *
 * Doing `connect` by returning `defined: () => true` over the full array would
 * be wrong in a way that compiles: the gap points have `y: null`, so the
 * generator would be asked to scale `null` and would place the path at whatever
 * `null` coerces to — zero — which is the exact defect this contract forbids.
 *
 * Neither policy draws through an `invalid` point. `connect` means "I know
 * nothing was measured"; it does not mean "draw confidently through a value that
 * arrived corrupt".
 */
export function seriesGeometry<M>(series: NormalizedSeries<M>): SeriesGeometry<M> {
  if (series.nullPolicy === "connect") {
    return {
      points: series.data.filter((d) => d.state === "present"),
      defined: () => true,
    };
  }
  return {
    points: series.data,
    defined: (d) => d.state === "present",
  };
}

/* -------------------------------------------------------------------------- */
/* Semantic rows (ADR-0005's data alternative, from this same model)           */
/* -------------------------------------------------------------------------- */

/** One row of the accessible data alternative: the instant, then a cell per series. */
export type SeriesTableRow = readonly (string | number)[];

export interface SeriesTable {
  columns: readonly string[];
  rows: readonly SeriesTableRow[];
}

/**
 * Caller formatting for the derived table (ADR-0008 §9).
 *
 * These override the generic defaults BELOW, at the seam that already owns
 * them. That is the reason they live here rather than in a component: the
 * ISO 8601 instant and the unadorned number are produced in this function, so
 * overriding them anywhere else would mean formatting a value that had already
 * been stringified — re-parsing the library's own output to undo it.
 *
 * Both are optional and independent. Supplying neither is the documented
 * generic default, not a degraded mode.
 */
export interface SeriesTableOptions {
  /**
   * The instant cell. Default: ISO 8601 (`toISOString`).
   *
   * Receives a `Date` rather than the formatted string precisely so a caller
   * never has to parse to reformat. Zoned civil time is NOT addressed here —
   * per ADR-0008 §9 the value is an absolute instant, and a caller wanting a
   * display zone applies it in this function.
   */
  time?: (t: Date) => string;
  /**
   * A value cell. Default: the raw number, unadorned.
   *
   * Called ONLY for a present reading. A gap stays an empty cell and never
   * reaches this function — formatting "no value" is how a unit suffix ends up
   * printed against a measurement that was never taken.
   *
   * `label` is the series' own label, so one formatter can serve a chart whose
   * series carry different units.
   */
  value?: (y: number, label: string) => string | number;
}

/**
 * The caller's formatting contract for the multi-series surface — ADR-0008 §9's
 * principle under [ADR-0010]'s shape.
 *
 * ## Why this lives in `core` and not in `charts`
 *
 * It is a chart's prop surface, so `charts` is the obvious home, and that is
 * where it started. It moved here for one concrete reason: ADR-0008's typed
 * examples typecheck under a DELIBERATELY DOM-free `lib`, on the stated ground
 * that a contract example reaching for `document` would be describing the
 * contract in terms the contract does not have. Importing this from `charts`
 * pulls that package's barrel, and with it the whole Solid and DOM chain, which
 * would have forced `dom` into that tsconfig to satisfy an import of four pure
 * function types.
 *
 * The precedent is already here rather than being set by this: `SeriesStyle`
 * carries `stroke` and `dash`, and `SeriesTableOptions` directly above is half
 * of this interface. `core` owns the caller-facing contracts over the series
 * model's own outputs; what it does not own is the components that read them.
 *
 * Every member is a pure `(value) => text` mapping over values this package
 * already computes — tick values and table cells — so nothing DOM-shaped
 * crosses the boundary. `charts` re-exports it, so a consumer still imports it
 * from the package whose components take it.
 */
export interface MultiSeriesFormatProps {
  /**
   * Bottom-axis tick labels. Default: the time scale's own tick format.
   *
   * Changes the LABEL only, never a tick's position, so it cannot move the
   * ticks away from the gridlines drawn behind them.
   */
  xTickFormat?: (value: Date) => string;
  /**
   * Left-axis tick labels. Default: the linear scale's own tick format.
   *
   * This is where a unit belongs on the AXIS — "R 1.2k", "42°" — rather than in
   * the series label, which is the legend's and the table heading's wording.
   */
  yTickFormat?: (value: number) => string;
  /**
   * The data table's instant column. Default: ISO 8601.
   *
   * Separate from `xTickFormat` although both receive a `Date`, and that is the
   * whole point of naming these by surface: an axis tick has a few characters
   * and wants "04 Mar", while a table cell is read aloud one row at a time and
   * wants the year. A caller who genuinely wants one wording passes the same
   * function twice.
   *
   * Reaches the CSV export too, because the export is the table serialised
   * rather than a second derivation of the data — see `tableValueFormat`.
   */
  tableTimeFormat?: (t: Date) => string;
  /**
   * A data-table value cell. Default: the raw number, unadorned. Called only
   * for a present reading; a gap stays an empty cell and never reaches here.
   *
   * `label` is the series' own label, so one formatter serves a chart whose
   * series carry different units — the cumulative total and the instantaneous
   * rate that §5's per-series null policy exists for.
   *
   * **This reaches the CSV export.** The export is defined as the table
   * serialised — same rows, same headings — so a formatter that returns
   * `"R 1 234,56"` puts that string in the downloaded file, where a spreadsheet
   * will treat it as text rather than a number. That is the correct consequence
   * of one stated rule rather than a bug: the alternative is a table and an
   * export that disagree about what a cell says, which is worse and silent.
   *
   * Return a NUMBER to change nothing about the export — the return type is
   * `string | number` precisely so a caller can format for display without
   * committing the export to text.
   */
  tableValueFormat?: (y: number, label: string) => string | number;
}

/**
 * The data alternative, derived from the SAME model the marks are drawn from.
 *
 * This is the whole reason it lives here rather than in a component: a table
 * built from a second traversal of the caller's input can describe a different
 * dataset from the picture, and nothing goes red when it does. Reading the
 * normalised model means the table cannot show a hidden series, cannot show a
 * value the marks excluded, and cannot miss a replacement the marks received.
 *
 * Only VISIBLE series appear, for the same reason the domains use them: a
 * reader of the table is reading a description of the chart in front of them.
 *
 * A gap is an EMPTY CELL, not a zero and not the word "null". A spreadsheet
 * reader and a screen-reader user both interpret an empty cell as "no value",
 * which is what it is.
 */
export function seriesTable<M>(
  model: SeriesModel<M>,
  options: SeriesTableOptions = {},
): SeriesTable {
  const series = model.visible;
  const columns = ["Time", ...series.map((s) => s.label)];

  // Union of every instant present in any visible series, ascending. The table
  // is a grid and the series need not share timestamps, so the row axis is the
  // union rather than any one series' array. This is the one place order is
  // imposed rather than inherited, because a table's rows are a presentation of
  // the union and there is no caller array to be faithful to.
  const instants = new Set<number>();
  for (const s of series) {
    for (const d of s.data) if (d.state !== "invalid") instants.add(d.time);
  }
  const ordered = [...instants].sort((a, b) => a - b);

  // The label travels WITH its map rather than being looked up by index later.
  // Re-indexing `series` inside the row loop would be a second way to reach the
  // same series, and the two could disagree — which is how a value formatter
  // ends up applying one series' unit to another's reading.
  const byTime = series.map((s) => {
    const map = new Map<number, NormalizedDatum<M>>();
    // Later duplicates at one instant overwrite earlier ones, so a grid cell
    // holds the last reading at that instant — the only single-valued answer
    // available. The marks still draw both; the table is a lossy view and this
    // is where it loses, deliberately and in one stated place.
    for (const d of s.data) if (d.state !== "invalid") map.set(d.time, d);
    return { map, label: s.label };
  });

  const formatTime = options.time ?? ((t: Date): string => t.toISOString());
  const formatValue = options.value;

  const rows = ordered.map((time): SeriesTableRow => [
    formatTime(new Date(time)),
    ...byTime.map(({ map, label }) => {
      const d = map.get(time);
      // The gap short-circuit comes FIRST, so a caller's value formatter is
      // never handed a missing reading to put a unit on.
      if (d === undefined || d.y === null) return "";
      return formatValue === undefined ? d.y : formatValue(d.y, label);
    }),
  ]);

  return { columns, rows };
}

/** Counts a summary or announcement can state without inventing domain wording. */
export interface SeriesSummary {
  seriesCount: number;
  visibleCount: number;
  pointCount: number;
  missingCount: number;
  invalidCount: number;
}

/** Summary over VISIBLE series — a description of the chart on screen. */
export function seriesSummary<M>(model: SeriesModel<M>): SeriesSummary {
  let pointCount = 0;
  let missingCount = 0;
  let invalidCount = 0;
  for (const s of model.visible) {
    for (const d of s.data) {
      if (d.state === "present") pointCount += 1;
      else if (d.state === "missing") missingCount += 1;
      else invalidCount += 1;
    }
  }
  return {
    seriesCount: model.series.length,
    visibleCount: model.visible.length,
    pointCount,
    missingCount,
    invalidCount,
  };
}

/* -------------------------------------------------------------------------- */
/* Row-oriented adapter (ADR-0008 §2)                                          */
/* -------------------------------------------------------------------------- */

export interface FromRowsSpec<R> {
  /** The key holding the instant. */
  t: keyof R & string;
  /** One series per key, in this order. */
  values: readonly (keyof R & string)[];
  /** Display label per key. Defaults to the key itself. */
  labels?: Partial<Record<keyof R & string, string>>;
  /** Gap policy per key. Defaults to `"break"`. */
  nullPolicy?: Partial<Record<keyof R & string, NullPolicy>>;
}

/**
 * Pivot wide rows into series — the explicit seam ADR-0008 §2 requires.
 *
 * It is a function the caller invokes rather than a shape the prop accepts,
 * which is the point: the pivot is O(rows × series) and putting it behind a prop
 * would hide that cost inside the render path, where it would run again on every
 * update. Here it runs where the caller put it, and a caller who needs it
 * memoised can memoise it.
 *
 * The whole row becomes each datum's `meta`, so a tooltip can reach the columns
 * that were not plotted. That is usually what wide data is for.
 */
export function fromRows<R extends Record<string, unknown>>(
  rows: readonly R[],
  spec: FromRowsSpec<R>,
): readonly Series<R>[] {
  return spec.values.map((key) => ({
    id: key,
    label: spec.labels?.[key] ?? key,
    nullPolicy: spec.nullPolicy?.[key] ?? "break",
    data: rows.map((row) => {
      const raw = row[spec.t];
      const value = row[key];
      return {
        t: raw instanceof Date ? raw : new Date(raw as string | number),
        // Anything that is not a number becomes `null` — a declared absence —
        // rather than being coerced. A wide row legitimately carries empty
        // cells, and `Number("")` is 0, which is the zero-fill this contract
        // exists to prevent.
        y: typeof value === "number" ? value : null,
        meta: row,
      };
    }),
  }));
}
