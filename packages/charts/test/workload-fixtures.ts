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
 *
 * This file is ALSO the frozen data seed for the representative-performance
 * protocol, which drives the same generators at their dense settings
 * (`w2History(4, 5000)`, `w1DenseSeries()` + `w1References()`,
 * `w1DashboardDeck(48)`, `w4Seconds()`) from `test/perf/`. One seed rather than
 * two: a benchmark measured on a private copy of the data measures a shape
 * nothing else in this repository has ever rendered, and that copy is free to
 * drift from the fixture whose correctness is actually proven. The point COUNT
 * is the caller's argument here, so sharing costs the composition suite nothing
 * — it keeps passing its own modest numbers.
 *
 * Everything here therefore has two audiences, and a change made for one binds
 * the other: adding a spike to a series changes what a decimation candidate is
 * scored against, and changing a point count changes what a frame number means.
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
 * A DIFFERENT `seriesCount` x `points` set, for the complete-replacement case.
 *
 * The performance protocol's W-A replacement swaps 20,000 values at once
 * (4 x 5,000) and measures how long the chart takes to settle. Replacing a
 * series with ITSELF would settle instantly and measure nothing, so this shifts
 * both the phase and the amplitude: every point moves, and the y domain moves
 * with it, so the axis has to recompute rather than only the paths.
 *
 * The same shape as `w1ReplacementSeries` — same ids, different values — because
 * a replacement that also changed identity would measure a remount instead.
 */
export const w2Replacement = (seriesCount: number, points: number): Series[] =>
  Array.from({ length: seriesCount }, (_, s) => {
    const nullAt = Math.floor(points / 3);
    return {
      id: `probe-${s}`,
      label: `Probe ${s + 1}`,
      nullPolicy: s % 2 === 0 ? "break" : "connect",
      data: days(points, (i) => 62 + Math.cos(i / 4.5 + s / 2) * 17 + s * 3).map((d, i) =>
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

/* -------------------------------------------------------------------------- */
/* W4 — the declared density policy, at one-second resolution                   */
/* -------------------------------------------------------------------------- */

/**
 * One full day at one-second resolution — the 86,400-timestamp case the
 * capability boundary declares a POLICY about rather than support for.
 *
 * This generator exists for the representative-performance protocol, not for the
 * composition suite: at this length the correctness questions are already
 * answered by the shorter fixtures above, and what is left is entirely a
 * question of frames and truthfulness under decimation.
 *
 * The shape matters as much as the count, because it is what a decimation
 * candidate can be wrong about:
 *
 *   - a slow diurnal swell, which ANY sampling reproduces, so it cannot
 *     distinguish a good candidate from a careless one;
 *   - a fast oscillation near the sampling interval, where naive
 *     every-Nth-point sampling ALIASES — the reconstruction is smooth, plausible,
 *     and wrong, which is the failure this workload exists to expose;
 *   - eight isolated one-second SPIKES at fixed indices, far outside the local
 *     band. A spike is one sample wide, so a candidate that drops it loses a real
 *     excursion while its own error metric still reads small. Their positions are
 *     fixed rather than derived, so "did the candidate keep the extremes" is a
 *     question with one right answer that does not move between runs.
 *
 * Closed-form in the index like every fixture here, so 86,400 points are
 * reproducible without storing them.
 */
export const W4_SECOND_COUNT = 86_400;

/** Indices of the deliberate one-second excursions, in a day of seconds. */
export const W4_SPIKE_INDICES: readonly number[] = [
  1_800, 9_000, 21_600, 33_333, 43_200, 57_600, 71_111, 84_000,
];

const SECOND = 1000;
const W4_SPIKES = new Set(W4_SPIKE_INDICES);

/** The undecimated value at second `i`, as a closed form — the truth a candidate is scored against. */
export const w4ValueAt = (i: number): number => {
  const swell = 240 + Math.sin((i / W4_SECOND_COUNT) * Math.PI * 2) * 60;
  const fast = Math.sin(i / 3.1) * 8 + Math.cos(i / 1.7) * 5;
  const spike = W4_SPIKES.has(i) ? 180 : 0;
  return Math.round((swell + fast + spike) * 10) / 10;
};

/**
 * `count` seconds from the shared epoch as ONE series — the raw density case.
 *
 * One series rather than several: the question here is what a single chart does
 * with 86,400 points, and multiplying that by a series count would conflate the
 * density limit with the multi-series limit W-B already measures.
 */
export const w4Seconds = (count: number = W4_SECOND_COUNT): Series[] => [
  {
    id: "raw",
    label: "One day at one-second resolution",
    nullPolicy: "connect",
    data: Array.from({ length: count }, (_, i) => ({
      t: new Date(EPOCH + i * SECOND),
      y: w4ValueAt(i),
    })),
  } satisfies Series,
];
