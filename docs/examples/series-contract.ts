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
 * The series half of Part 1 is imported from `@silkplot/core` instead of
 * declared, and **Part 2 is byte-identical** — not one example was edited to
 * make it compile. That is evidence the implementation matches the decision
 * rather than a claim that it does.
 *
 * The rule stands for the parts still declared. When the reference-overlay and
 * composition props are built, their declarations become imports too, and Part 2
 * must again compile UNCHANGED. If an example has to be edited, the
 * implementation diverged from the decision — so edit the implementation, or
 * supersede the ADR. Do not edit the example to fit the code.
 *
 * WHAT IT IS NOT. It is not a test of runtime behaviour: it type-checks shapes
 * and does not call the library. The suites do that.
 */

/* ------------------------------------------------------------------------- */
/* Part 1 — the contract.                                                     */
/*                                                                            */
/* The series half is now IMPORTED from the implementation rather than         */
/* declared. That substitution is the test: every example in Part 2 below      */
/* compiled against the declarations, and compiles UNCHANGED against the real  */
/* types. Nothing in Part 2 was edited to make this work.                      */
/*                                                                            */
/* What is still declared is what is still undecided or unbuilt — the          */
/* reference-overlay and chart-level composition props. Each is marked, and    */
/* each becomes an import when its phase lands, under the same rule.           */
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
import type { Series, SeriesDatum, SeriesStyle } from "@silkplot/core";

// ADR-0008 §2 — implemented.
export { fromRows } from "@silkplot/core";
import { fromRows } from "@silkplot/core";

/** ADR-0008 §10 — NOT YET IMPLEMENTED. `includeInDomain` defaults to true. */
export interface ReferenceValue {
  id: string;
  value: number;
  label: string;
  includeInDomain?: boolean;
  style?: Pick<SeriesStyle, "stroke" | "strokeWidth" | "dash">;
}

/** ADR-0008 §6 and §8: controlled state, with an uncontrolled default. */
export interface CompositionStateProps<M = unknown> {
  /** Absent → uncontrolled, all series visible. Empty array → nothing visible. */
  visibleSeries?: readonly string[];
  onVisibilityChange?: (visible: readonly string[]) => void;
  /** Absent → uncontrolled. Exactly one active datum per chart (ADR-0002). */
  activeDatum?: { seriesId: string; index: number } | undefined;
  onActivate?: (active: { seriesId: string; index: number; datum: SeriesDatum<M> }) => void;
}

/** ADR-0008 §9. Caller-owned wording; library defaults stay generic. */
export interface FormatterProps<M = unknown> {
  formatTick?: (value: Date) => string;
  formatValue?: (value: number) => string;
  formatTooltip?: (datum: SeriesDatum<M>, series: Series<M>) => string;
}

/** The composed time-series surface this contract describes. */
export interface MultiSeriesProps<M = unknown>
  extends CompositionStateProps<M>,
    FormatterProps<M> {
  series: readonly Series<M>[];
  references?: readonly ReferenceValue[];
}

/* ------------------------------------------------------------------------- */
/* Part 2 — the shapes the contract must support.                             */
/* ------------------------------------------------------------------------- */

const t = (iso: string): Date => new Date(iso);

/** ONE SERIES. The ordinary case, and a permanent one — §12 keeps it supported. */
export const oneSeries: MultiSeriesProps = {
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
export const fourSeries: MultiSeriesProps = {
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
export const denseOperational: MultiSeriesProps = {
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
export const nullableAndSigned: MultiSeriesProps = {
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
 * datum, the tooltip formatter, and the activation callback without a cast —
 * which is the property this example exists to prove.
 */
interface Reading {
  serial: string;
  firmware: string;
  calibratedAt: Date;
}

export const withMetadata: MultiSeriesProps<Reading> = {
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
  // `datum.meta` is `Reading | undefined` here, not `unknown` and not `any`.
  formatTooltip: (datum, series) =>
    datum.meta === undefined
      ? `${series.label}: ${datum.y ?? "no reading"}`
      : `${series.label} (${datum.meta.serial}, fw ${datum.meta.firmware}): ${datum.y ?? "no reading"}`,
  onActivate: (active) => {
    // Same type on the way out. No cast, no parallel metadata map.
    const serial: string | undefined = active.datum.meta?.serial;
    void serial;
  },
};

/** HIDDEN SERIES — controlled visibility, and the three states §6 names. */
export const someHidden: MultiSeriesProps = {
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
export const noneVisible: MultiSeriesProps = {
  series: fourSeries.series,
  visibleSeries: [],
};

/**
 * A VISIBILITY ID WITH NO SERIES. Ignored, not an error: data and visibility
 * arrive from different places and are briefly out of step during every
 * replacement. ADR-0008 §6.
 */
export const staleVisibilityId: MultiSeriesProps = {
  series: fourSeries.series,
  visibleSeries: ["total", "decommissioned-sensor"],
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

export const fromWideInput: MultiSeriesProps<WideRow> = {
  series: fromRows(wideRows, { t: "time", values: ["inlet", "outlet"] }),
};

/**
 * LONG CATEGORICAL LABELS with currency, on the ranked surface. Labels are
 * display text and stay long; the id is what identity is carried on, which is
 * why a label may be this unwieldy without consequence.
 */
export interface RankedCategory {
  id: string;
  label: string;
  value: number;
}

export interface RankedBarsProps {
  categories: readonly RankedCategory[];
  orientation?: "vertical" | "horizontal";
  formatValue?: (value: number) => string;
  onActivate?: (category: RankedCategory) => void;
}

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
  formatValue: (value) =>
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value),
  onActivate: (category) => void category.id,
};
