/**
 * Typed examples for ADR-0008 — the multi-series and composition state contract.
 *
 * WHAT THIS FILE IS. Typed examples of every shape ADR-0008 must support,
 * checked by the compiler rather than only read.
 *
 * It was written BEFORE the implementation, because the decision was
 * deliberately settled ahead of the components that consume it. Part 1 declared
 * the contract's types; Part 2 exercised them. That proved the contract was
 * expressible, that its metadata generic flowed, and that every state it claims
 * is representable actually is.
 *
 * THE SUBSTITUTION HAS NOW HAPPENED, and it is the point of the whole exercise.
 * Model shapes import `@silkplot/core`; the metadata surface imports the real
 * `LineChartProps<M>`. Examples changed only where later ADRs explicitly
 * superseded a shape, so this file checks current implementation rather than a
 * frozen look-alike of the original draft.
 *
 * The reference-overlay and ranked-bar halves have since been substituted too.
 * ADR-0016 superseded the parked `formatTooltip` proposal with the built JSX
 * `tooltip` render-prop. The metadata example below therefore checks the real
 * `LineChartProps<M>` type; it does not declare a look-alike chart contract.
 *
 * Three examples HAVE been edited under explicit supersessions:
 * `withFormatting` when ADR-0010 replaced §9's formatter names,
 * `rankedWithLongLabels` when ADR-0013 replaced the ranked formatter shape, and
 * `withMetadata` when ADR-0016 replaced `formatTooltip` with typed JSX content.
 * A supersession is a decision changing; silently bending an example to drifted
 * code is the thing this rule forbids.
 *
 * WHAT IT IS NOT. It is not a test of runtime behaviour: it type-checks shapes
 * and does not call the library. The suites do that.
 */

/* ------------------------------------------------------------------------- */
/* Part 1 — the contract.                                                     */
/*                                                                            */
/* The series half is IMPORTED from the implementation rather than declared.   */
/* The metadata example likewise imports the real composed-chart prop type.    */
/* A green typecheck therefore covers shipped types, not parallel declarations.*/
/*                                                                            */
/* The small `MultiSeriesConfiguration` below is only a compiler fixture for   */
/* model inputs shared by the remaining examples. It is not a chart API.       */
/* ------------------------------------------------------------------------- */

// ADR-0008 §1, §3, §4 — implemented. `SeriesDatum`, `Series`, `SeriesStyle`
// and `NullPolicy` are the shipped types, re-exported so the examples below
// read the same as they did when these were local declarations.
export type {
  Series,
  SeriesDatum,
  SeriesStyle,
  NullPolicy,
} from "@silkplot/core";
import type { Series } from "@silkplot/core";

// ADR-0008 §2 — implemented.
export { fromRows } from "@silkplot/core";
import { fromRows } from "@silkplot/core";

// ADR-0008 §9's axis and table formatters — implemented, under ADR-0010's
// surface-named shape. ADR-0016 superseded `formatTooltip` with the chart's
// JSX `tooltip` render-prop, exercised against the real type below.
//
// From `core` rather than `charts` although `charts` is the package whose
// components take it: this file's `lib` is deliberately DOM-free, and the
// `charts` barrel would pull the Solid and DOM chain in behind four pure
// function types. `charts` re-exports it for consumers.
export type { MultiSeriesFormatProps } from "@silkplot/core";
import type { MultiSeriesFormatProps } from "@silkplot/core";
import type { LineChartProps } from "@silkplot/charts";

// ADR-0008 §10 — implemented. THE SUBSTITUTION FOR THIS HALF HAS HAPPENED: what
// was declared here as a five-field interface is now the shipped type, imported.
//
// The shipped type is WIDER than the declaration was, and that widening is a
// decision rather than a drift. The declaration described a horizontal, numeric
// reference only; `ReferenceValue` is now a union over the AXIS the reference
// sits on — `{ value: number }` on the y axis, `{ time: Date }` on the x — so a
// deployment marker is expressible alongside an SLA floor. Every example below
// names `value` and therefore matches the numeric member unchanged.
//
// Widening a declared shape is the one substitution that CANNOT be checked by
// byte-identity alone: identity proves nothing had to change, and a superset
// would satisfy that even if the new half were unusable. `referencesOnBothAxes`
// at the end of Part 2 is the other half of that evidence.
export type { ReferenceValue } from "@silkplot/core";
import type { ReferenceValue } from "@silkplot/core";

/**
 * Model-only fixture for examples that do not instantiate a chart. It contains
 * no activation or tooltip fields: those public surfaces are checked against
 * `LineChartProps<M>` rather than re-declared here.
 */
export interface MultiSeriesConfiguration<M = unknown> extends MultiSeriesFormatProps {
  series: readonly Series<M>[];
  /** Absent → uncontrolled, all series visible. Empty array → nothing visible. */
  visibleSeries?: readonly string[];
  onVisibilityChange?: (visible: readonly string[]) => void;
  references?: readonly ReferenceValue[];
}

/* ------------------------------------------------------------------------- */
/* Part 2 — the shapes the contract must support.                             */
/* ------------------------------------------------------------------------- */

const t = (iso: string): Date => new Date(iso);

/** ONE SERIES. The ordinary case, and a permanent one — §12 keeps it supported. */
export const oneSeries: MultiSeriesConfiguration = {
  series: [
    {
      id: "inlet",
      label: "Inlet temperature",
      data: [
        { t: t("2026-03-01T00:00:00Z"), y: 21.4 },
        { t: t("2026-03-01T00:30:00Z"), y: 21.9 },
        { t: t("2026-03-01T01:00:00Z"), y: 22.3 },
      ],
    },
  ],
};

/** FOUR SERIES, same unit, one with an area fill and its own null policy. */
export const fourSeries: MultiSeriesConfiguration = {
  series: [
    { id: "n", label: "North", data: [{ t: t("2026-03-01T00:00:00Z"), y: 12 }] },
    { id: "s", label: "South", data: [{ t: t("2026-03-01T00:00:00Z"), y: 14 }] },
    { id: "e", label: "East", data: [{ t: t("2026-03-01T00:00:00Z"), y: 9 }] },
    {
      id: "total",
      label: "Total",
      // A cumulative total connects across a missed poll; the instantaneous
      // series above break. ADR-0008 §4 — this is why the policy is per series.
      nullPolicy: "connect",
      style: { fill: "var(--sp-color-series-4)" },
      data: [{ t: t("2026-03-01T00:00:00Z"), y: 35 }],
    },
  ],
};

/**
 * TWENTY-TWO SERIES plus three references — the dense operational case.
 *
 * Generated rather than written out, which is the point: the contract imposes
 * no hard-coded series limit and identity is stable because each id is derived
 * from the source, not from a position in this array.
 */
export const denseOperational: MultiSeriesConfiguration = {
  series: Array.from({ length: 22 }, (_, i) => ({
    id: `sensor-${i + 1}`,
    label: `Sensor ${i + 1}`,
    data: [
      { t: t("2026-03-01T00:00:00Z"), y: i * 1.5 },
      { t: t("2026-03-01T00:05:00Z"), y: i * 1.5 + 0.4 },
    ],
  })),
  references: [
    { id: "sla", value: 95, label: "SLA floor" },
    { id: "warn", value: 80, label: "Warning" },
    // Opting out: a commissioning target far above the data would otherwise
    // compress every series into a band. ADR-0008 §10.
    { id: "design", value: 4000, label: "Design maximum", includeInDomain: false },
  ],
};

/** NULLABLE VALUES, both policies, and a signed domain crossing zero. */
export const nullableAndSigned: MultiSeriesConfiguration = {
  series: [
    {
      id: "rate",
      label: "Net flow rate",
      nullPolicy: "break",
      data: [
        { t: t("2026-03-01T00:00:00Z"), y: -4.2 },
        // The sensor was offline. Not zero — a real reading of zero is a
        // different statement, and on a signed series it is a different sign.
        { t: t("2026-03-01T00:30:00Z"), y: null },
        { t: t("2026-03-01T01:00:00Z"), y: 3.8 },
      ],
    },
    {
      id: "cumulative",
      label: "Cumulative volume",
      nullPolicy: "connect",
      data: [
        { t: t("2026-03-01T00:00:00Z"), y: 100 },
        { t: t("2026-03-01T00:30:00Z"), y: null },
        { t: t("2026-03-01T01:00:00Z"), y: 140 },
      ],
    },
  ],
};

/**
 * RAW TOOLTIP METADATA. `M` is the caller's own type and flows through the
 * datum, the tooltip render-prop, and the activation callback without a cast —
 * which is the property this example exists to prove.
 */
interface Reading {
  serial: string;
  firmware: string;
  calibratedAt: Date;
}

export const withMetadata: LineChartProps<Reading> = {
  title: "Probe readings",
  width: 640,
  height: 320,
  series: [
    {
      id: "probe-a",
      label: "Probe A",
      data: [
        {
          t: t("2026-03-01T00:00:00Z"),
          y: 18.2,
          meta: {
            serial: "PA-99120",
            firmware: "2.4.1",
            calibratedAt: t("2026-01-14T09:00:00Z"),
          },
        },
      ],
    },
  ],
  // `active.datum.meta` is `Reading | undefined`, not `unknown` or `any`.
  tooltip: (active) =>
    active.datum.meta === undefined
      ? `${active.seriesId}: ${active.datum.y ?? "no reading"}`
      : `${active.seriesId} (${active.datum.meta.serial}, fw ${active.datum.meta.firmware}): ${active.datum.y ?? "no reading"}`,
  onActivate: (active) => {
    // Same type on the way out. No cast, no parallel metadata map.
    const serial: string | undefined = active.datum.meta?.serial;
    void serial;
  },
};

/** HIDDEN SERIES — controlled visibility, and the three states §6 names. */
export const someHidden: MultiSeriesConfiguration = {
  series: fourSeries.series,
  // Isolate: exactly one id. Show-all would be every id — never `undefined`,
  // which reverts the chart to uncontrolled mid-session.
  visibleSeries: ["total"],
  onVisibilityChange: (visible) => void visible,
};

/**
 * THE EMPTY VISIBLE SET. A real state that renders an empty chart. It does NOT
 * mean "no filter, show everything" — that reading is the filter bug in which
 * deselecting the last series makes every series reappear.
 */
export const noneVisible: MultiSeriesConfiguration = {
  series: fourSeries.series,
  visibleSeries: [],
};

/**
 * A VISIBILITY ID WITH NO SERIES. Ignored, not an error: data and visibility
 * arrive from different places and are briefly out of step during every
 * replacement. ADR-0008 §6.
 */
export const staleVisibilityId: MultiSeriesConfiguration = {
  series: fourSeries.series,
  visibleSeries: ["total", "decommissioned-sensor"],
};

/**
 * CALLER FORMATTING under §9's principle and ADR-0010's shape.
 *
 * ADDED after the formatter substitution, not carried through it. The
 * byte-identity check at substitution proved no EXISTING example had to change;
 * it could not prove these props are usable, because no existing example
 * exercised them. This is that evidence, and it is the weaker-but-necessary
 * second half.
 *
 * It exercises the split the ADR turns on: `xTickFormat` and `tableTimeFormat`
 * both receive a `Date` and deliberately produce different text, which is the
 * thing §9's single `formatTick` could not express.
 */
export const withFormatting: MultiSeriesConfiguration = {
  series: fourSeries.series,
  // A cramped axis label — day and month, no year.
  xTickFormat: (value) =>
    new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short" }).format(value),
  yTickFormat: (value) => `${value} kW`,
  // The same instant, read aloud one row at a time, so it carries the year.
  tableTimeFormat: (t) =>
    new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(t),
  // Rounds for display and stays NUMERIC, so the CSV export is not committed to
  // text. Returning a string here would be the caller's explicit choice.
  tableValueFormat: (y) => Math.round(y * 10) / 10,
};

/**
 * The same contract with a UNIT PER SERIES, which is why the value formatter
 * receives the series' label rather than only the number.
 */
export const withPerSeriesUnits: MultiSeriesConfiguration = {
  series: [
    { id: "load", label: "Load", data: [{ t: t("2026-03-01T00:00:00Z"), y: 812.5 }] },
    { id: "utilisation", label: "Utilisation", data: [{ t: t("2026-03-01T00:00:00Z"), y: 61.2 }] },
  ],
  tableValueFormat: (y, label) => (label === "Utilisation" ? `${y}%` : `${y} kW`),
};

/** ROW-ORIENTED INPUT crossing the adapter seam of §2. */
interface WideRow extends Record<string, unknown> {
  time: Date;
  inlet: number;
  outlet: number;
}

const wideRows: readonly WideRow[] = [
  { time: t("2026-03-01T00:00:00Z"), inlet: 21.4, outlet: 24.9 },
  { time: t("2026-03-01T00:30:00Z"), inlet: 21.9, outlet: 25.2 },
];

export const fromWideInput: MultiSeriesConfiguration<WideRow> = {
  series: fromRows(wideRows, { t: "time", values: ["inlet", "outlet"] }),
};

/**
 * LONG CATEGORICAL LABELS with currency, on the ranked surface. Labels are
 * display text and stay long; the id is what identity is carried on, which is
 * why a label may be this unwieldy without consequence.
 *
 * IMPLEMENTED. `RankedCategory` and the formatter props are now
 * imported rather than declared, from `core` for the same DOM-free-`lib` reason
 * `MultiSeriesFormatProps` is.
 *
 * **`formatValue` IS SUPERSEDED, and this example was edited under that
 * supersession rather than to fit the code.** The distinction is the whole point
 * of the obligation: an example may change when a DECISION changes, and may
 * never be quietly bent to match an implementation that drifted. ADR-0013
 * records the decision; ADR-0010 records the reasoning it extends.
 *
 * The short version. ADR-0010 rejected a single `formatValue` on the
 * time-series surface because one value reaches the axis (which wants `R1.28m`)
 * and the read-aloud surfaces (which want `R1,284,500.00`), and one formatter
 * serving both either forces the axis' brevity onto speech or forces the axis to
 * carry text it has no room for. That argument is about the SURFACE, not the
 * chart, and it transfers to ranked bars intact — this very example, ZAR at 1.28
 * million, is the case where it bites hardest.
 *
 * The replacement is named for the CATEGORY and VALUE axes rather than for x
 * and y, which is a refinement ADR-0010 could not have made: on an orientable
 * chart, `xTickFormat` would mean the categories in one orientation and the
 * values in the other, so flipping `orientation` would silently swap which
 * formatter applied.
 */
export type { RankedCategory, RankedFormatProps, RankedOrientation } from "@silkplot/core";
import type {
  RankedCategory,
  RankedFormatProps,
  RankedOrientation,
} from "@silkplot/core";

export interface RankedBarsProps extends RankedFormatProps {
  categories: readonly RankedCategory[];
  orientation?: RankedOrientation;
  onActivate?: (category: RankedCategory) => void;
}

/**
 * REFERENCES ON BOTH AXES — ADR-0008 §10 under the widened shape.
 *
 * ADDED after the reference substitution, not carried through it, and it exists
 * because byte-identity could not have proved this. `denseOperational` above
 * compiled unchanged, which establishes that no existing example HAD to be
 * edited — a real result, and a narrow one: every reference it names is
 * numeric, so a `{ time: Date }` member could have been unusable and the
 * identity check would still have passed. This is the weaker-but-necessary
 * second half, exactly as `withFormatting` is for ADR-0010.
 *
 * It exercises the split the union turns on: a threshold read against the y
 * axis and an event read against the x axis, in ONE array, with per-record
 * domain participation and a non-colour style override on each.
 */
export const referencesOnBothAxes: MultiSeriesConfiguration = {
  series: fourSeries.series,
  references: [
    // Horizontal: a limit the values are read against.
    { id: "sla", value: 95, label: "SLA floor" },
    // Vertical: an instant the series are read across. Same array, same
    // ordering rules, same collision solver.
    { id: "deploy", time: t("2026-03-01T00:20:00Z"), label: "Deploy 4.2.0" },
    // Out of the data's range AND opting out of the domain, which is the one
    // combination that must not silently widen the x axis: inside a
    // <Dashboard> the resolved scope wins regardless, and the line is clipped.
    {
      id: "window-close",
      time: t("2026-03-04T00:00:00Z"),
      label: "Change window closes",
      includeInDomain: false,
      // Dash is a number array, as on a series style — the redundant
      // non-colour channel, not a second colour.
      style: { dash: [2, 2], strokeWidth: 2 },
    },
  ],
};

export const rankedWithLongLabels: RankedBarsProps = {
  orientation: "horizontal",
  categories: [
    {
      id: "cc-refurb",
      label: "Regional distribution centre — cold chain refurbishment programme",
      value: 1_284_500,
    },
    {
      id: "fleet",
      label: "Fleet telematics retrofit (phase two, excluding trailers)",
      value: 612_300,
    },
    // Signed: a ranked view legitimately contains a loss, and it must keep its
    // sign rather than being ranked on magnitude.
    { id: "disposal", label: "Asset disposal — written-down handling equipment", value: -84_750 },
  ],
  // Two formatters where the declaration had one, and the difference is the
  // evidence for the supersession rather than an inconvenience of it: the axis
  // carries an abbreviated figure because a tick has no room for the full one,
  // and the table carries the exact amount because a reader auditing a ranking
  // needs the cents. A single `formatValue` had to pick one of these and impose
  // it on the other surface.
  valueTickFormat: (value) =>
    new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value),
  tableValueFormat: (value) =>
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value),
  onActivate: (category) => void category.id,
};
