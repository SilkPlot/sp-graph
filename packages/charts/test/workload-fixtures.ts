/**
 * Deterministic workload fixtures for the composition gate.
 *
 * These are generated from the ANONYMISED W1/W2/W3 shapes in the MVP capability
 * contract — product behaviour and scale only. Nothing here copies external
 * code, data, styles, assets, or library configuration; every series is a
 * closed-form function of its index, so the fixture is reproducible and a failure
 * is legible rather than a wall of random numbers.
 *
 * The scale numbers are the contract's: W1 is up to 48 mounted charts and one
 * chart of 22 series plus 3 references; W2 is one to four same-unit series with
 * break/connect gap policies; W3 is ranked categorical analysis with long
 * labels and currency/count/percentage formatting. Point COUNTS are kept modest
 * — this suite proves correctness of the composition, not the frame budget, which
 * representative-performance profiling owns with the 5,000-point case — so a
 * dense-but-small series exercises every code path without turning a correctness
 * run into a benchmark.
 */
import type { RankedCategory, ReferenceValue, Series } from "@silkplot/core";

const DAY = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2026, 0, 1);

/** A time series of `count` days from the shared epoch, value a closed form of the index. */
const days = (count: number, value: (i: number) => number) =>
  Array.from({ length: count }, (_, i) => ({
    t: new Date(EPOCH + i * DAY),
    y: Math.round(value(i) * 10) / 10,
  }));

/* -------------------------------------------------------------------------- */
/* W1 — dense operational telemetry                                            */
/* -------------------------------------------------------------------------- */

/** The contract's numbers, named so a test asserts against the shape, not a literal. */
export const W1_SERIES_COUNT = 22;
export const W1_REFERENCE_COUNT = 3;
export const W1_DASHBOARD_CHARTS = 48;

/**
 * Twenty-two same-domain series that CROSS ZERO and carry non-plotted metadata.
 *
 * - Every series swings through positive and negative values (`sin` about a
 *   small offset), so the union domain is signed and a `zero-floor`/`zero-baseline`
 *   confusion would be visible.
 * - Half break at a null, half connect across one, at staggered indices — the
 *   two policies in one chart, which is the shape that separates "a gap" from
 *   "a spike to zero".
 *
 * Non-plotted metadata (ADR-0008 §3) is carried per-datum by `SeriesDatum.meta`;
 * its round-trip is proven end-to-end by the RANKED activation path in
 * `workload.test.tsx` (`onActivate` hands the caller's own object back, meta
 * included). A line chart has no non-interactive surface that surfaces datum
 * meta before a later interaction phase's tooltip, so the fixture does not carry decorative meta
 * a test could not read.
 */
export const w1DenseSeries = (): Series[] =>
  Array.from({ length: W1_SERIES_COUNT }, (_, s) => {
    const nullAt = 4 + (s % 9);
    return {
      id: `sensor-${s}`,
      label: `Sensor ${s + 1}`,
      nullPolicy: s % 2 === 0 ? "break" : "connect",
      data: days(28, (i) => Math.sin(i / 3 + s / 2) * 12 + (s - 11) * 0.8).map((d, i) =>
        i === nullAt ? { ...d, y: null } : d,
      ),
    } satisfies Series;
  });

/** A DIFFERENT 22-series set, for the replacement case — fewer points, shifted phase. */
export const w1ReplacementSeries = (): Series[] =>
  Array.from({ length: W1_SERIES_COUNT }, (_, s) => ({
    id: `sensor-${s}`,
    label: `Sensor ${s + 1}`,
    nullPolicy: s % 2 === 0 ? "break" : "connect",
    data: days(14, (i) => Math.cos(i / 4 + s / 3) * 18 + (s - 11) * 1.2),
  }));

/**
 * Three references: two a hair apart on the VALUE axis (the collision case) plus
 * one TEMPORAL, so both axes carry a reference at once (ADR-0012).
 */
export const w1References = (): ReferenceValue[] => [
  { id: "limit", value: 18, label: "Upper limit" },
  { id: "warn", value: 16.5, label: "Warning" },
  { id: "maint", time: new Date(EPOCH + 18 * DAY), label: "Maintenance" },
];

/**
 * A varied deck of `count` charts for the mounted-dashboard case, each with its
 * OWN identity and data so a test can prove independence and id-uniqueness. The
 * family rotates so the deck is not 48 copies of one chart.
 */
export const w1DashboardDeck = (count: number) =>
  Array.from({ length: count }, (_, c) => ({
    id: `panel-${c}`,
    title: `Panel ${c + 1}`,
    family: (["line", "area", "bar"] as const)[c % 3],
    time: days(12 + (c % 5), (i) => Math.sin(i / 2 + c) * 8 + c),
    categories: Array.from({ length: 5 }, (_, k) => ({
      id: `cat-${k}`,
      label: `Cat ${k + 1}`,
      value: Math.round((40 - k * 6 + ((c % 3) - 1) * 4) * 10) / 10,
    })) satisfies RankedCategory[],
  }));

/* -------------------------------------------------------------------------- */
/* W2 — progressively loaded environmental history                             */
/* -------------------------------------------------------------------------- */

/**
 * One to four same-unit series, `points` long, so a test can GROW them from the
 * same generator and prove progressive replacement rescales without a remount.
 * `break`/`connect` alternate, and a null sits mid-series so the policy is
 * exercised at every length.
 */
export const w2History = (seriesCount: number, points: number): Series[] =>
  Array.from({ length: seriesCount }, (_, s) => {
    const nullAt = Math.floor(points / 2);
    return {
      id: `probe-${s}`,
      label: `Probe ${s + 1}`,
      nullPolicy: s % 2 === 0 ? "break" : "connect",
      data: days(points, (i) => 40 + Math.sin(i / 6 + s) * 10 + s * 5).map((d, i) =>
        points > 4 && i === nullAt ? { ...d, y: null } : d,
      ),
    } satisfies Series;
  });

/**
 * A caller-supplied locale/time-zone tick formatter (the contract requires the
 * caller to own this). Fixed to a non-UTC zone and a non-en-US locale so a test
 * proves the CALLER's choice reaches the axis rather than a library default.
 */
export const w2TickFormat = (t: Date): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
  }).format(t);

/* -------------------------------------------------------------------------- */
/* W3 — analytical trends and rankings                                         */
/* -------------------------------------------------------------------------- */

/** Long human labels, several past the 20-char axis-truncation floor. */
const W3_LABELS = [
  "Gauteng Provincial Health",
  "Western Cape Metro South",
  "KwaZulu-Natal Coastal Region",
  "Eastern Cape Rural Districts",
  "Free State Central Cluster",
  "Limpopo Northern Corridor",
] as const;

/** Ranked categories, caller-sorted descending, for currency / count / percentage cases. */
export const w3Ranked = (): RankedCategory[] =>
  W3_LABELS.map((label, i) => ({
    id: `region-${i}`,
    label,
    value: Math.round((1_284_500 - i * 190_000 - i * i * 8_000) * 100) / 100,
    meta: { region: label, rank: i + 1 },
  }));

/** A signed ranked set — surpluses and deficits — so the ranked value axis crosses zero. */
export const w3Signed = (): RankedCategory[] =>
  W3_LABELS.map((label, i) => ({
    id: `region-${i}`,
    label,
    value: Math.round((60 - i * 22) * 10) / 10,
  }));

/** Currency, count, and percentage formatters the ranked axes/tables thread through. */
export const w3Currency = (v: number): string =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(v);
export const w3Count = (v: number): string =>
  new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(v);
export const w3Percent = (v: number): string => `${v.toFixed(1)}%`;
