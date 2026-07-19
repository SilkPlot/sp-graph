/**
 * createSeriesModel — the reactive face of ADR-0008's normalisation.
 *
 * The computation itself lives in `@silkplot/core` and knows nothing about
 * Solid. This is the thin layer that makes it track: one memo over the caller's
 * accessors, so every derived collection — marks, legend, overlays, table,
 * summary — is recomputed from ONE normalisation per update rather than from
 * several independent ones.
 *
 * That single-memo shape is the whole design. Normalising separately per
 * consumer would let the legend and the marks disagree about which series exist
 * during the tick after a replacement, and nothing would go red: both would be
 * internally consistent and describing different datasets.
 *
 * Accessors, not values, for the reason ADR-0003 records: a value read in the
 * component body is read once, outside any tracking scope, and the model would
 * hold a frozen dataset for its whole life while the props moved on.
 */
import { createMemo, type Accessor } from "solid-js";
import {
  normalizeSeries,
  seriesSummary,
  seriesTable,
  type Series,
  type SeriesIssue,
  type SeriesModel,
  type SeriesSummary,
  type SeriesTable,
} from "@silkplot/core";

export interface SeriesModelSpec<M = unknown> {
  /** The current series — `() => props.series`, never `props.series`. */
  series: Accessor<readonly Series<M>[]>;
  /**
   * Controlled visibility (ADR-0008 §6). Return `undefined` for uncontrolled.
   *
   * An accessor returning `undefined` and an ABSENT accessor mean the same
   * thing — uncontrolled — but an accessor returning `[]` means nothing is
   * visible. That distinction is load-bearing and is carried through to `core`
   * untouched.
   */
  visibleSeries?: Accessor<readonly string[] | undefined>;
  /** Diagnostic hook. Called during normalisation, in every build. */
  onIssue?: (issue: SeriesIssue) => void;
}

export interface ReactiveSeriesModel<M = unknown> {
  /** The normalised model. Everything below derives from this one value. */
  model: Accessor<SeriesModel<M>>;
  /** Visible series, in caller order — what marks and legends iterate. */
  visible: Accessor<SeriesModel<M>["visible"]>;
  /** Time and value extents over visible series. */
  timeDomain: Accessor<readonly [number, number]>;
  valueDomain: Accessor<readonly [number, number]>;
  /** The accessible data alternative, from the same model the marks use. */
  table: Accessor<SeriesTable>;
  summary: Accessor<SeriesSummary>;
  issues: Accessor<readonly SeriesIssue[]>;
}

export function createSeriesModel<M = unknown>(
  spec: SeriesModelSpec<M>,
): ReactiveSeriesModel<M> {
  // ONE memo. Every accessor below reads it rather than re-normalising, so a
  // consumer cannot obtain a model that disagrees with another consumer's.
  const model = createMemo(() =>
    normalizeSeries(spec.series(), {
      visibleSeries: spec.visibleSeries?.(),
      onIssue: spec.onIssue,
    }),
  );

  // The derivations are their own memos so a consumer reading only the table
  // does not recompute the summary, but each is downstream of `model()` and so
  // can never be built from a different normalisation.
  const table = createMemo(() => seriesTable(model()));
  const summary = createMemo(() => seriesSummary(model()));

  return {
    model,
    visible: () => model().visible,
    timeDomain: () => model().timeDomain,
    valueDomain: () => model().valueDomain,
    table,
    summary,
    issues: () => model().issues,
  };
}
