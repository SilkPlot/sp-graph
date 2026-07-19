/**
 * The multi-series scope — the shared model, narrowed to what a chart draws.
 *
 * `createTimeSeriesScope` beside this file does the same job for the
 * single-series charts and stays as it is: this composes the normalised model
 * from `@silkplot/core` instead of a bare `TimePoint[]`, and the two are kept
 * apart rather than unified because their INPUTS differ in kind. Collapsing them
 * behind one signature would mean a conversion at every call site, which is the
 * cost the single-series path exists to avoid.
 *
 * What is deliberately NOT re-derived here is any part of ADR-0008: identity,
 * gap classification, visibility, and domains all come from `normalizeSeries`.
 * This narrows the result to a dashboard's effective domain and nothing else.
 */
import { createMemo, type Accessor } from "solid-js";
import {
  normalizeSeries,
  seriesTable,
  timeDomainOf,
  timeScale,
  type EffectiveDomain,
  type NormalizedSeries,
  type ScaleTime,
  type Series,
  type SeriesIssue,
  type SeriesTable,
} from "@silkplot/core";
import { useDashboardSection, useDashboardTime } from "@silkplot/solid";

export interface MultiSeriesScope<M = unknown> {
  /** Visible series, already narrowed to the effective domain. */
  visible: Accessor<readonly NormalizedSeries<M>[]>;
  /** Every series, narrowed — hidden ones included, for a legend to render. */
  all: Accessor<readonly NormalizedSeries<M>[]>;
  /** Build the x scale for a pixel range, over the scoped time domain. */
  xScale: (range: [number, number]) => ScaleTime<number, number>;
  /** True when a scope is in force and nothing falls inside it. */
  isEmpty: Accessor<boolean>;
  /** True when the chart is showing a single most-recent reading. */
  isLatest: Accessor<boolean>;
  /** The accessible data alternative, from this same narrowed model. */
  table: Accessor<SeriesTable>;
}

/**
 * Narrow one series' data to an effective domain.
 *
 * Kept as a free function rather than inlined because the latest-value branch is
 * subtle: it picks at most ONE datum, and it picks it from the datums that are
 * IN SCOPE, not from the series as a whole. A newest reading outside the
 * dashboard's range is out of scope and is not shown — a tile quietly ignoring
 * the global control would be the one element on the page telling a different
 * story, with nothing to mark it as such (ADR-0007 §4).
 */
function narrow<M>(
  series: NormalizedSeries<M>,
  scope: EffectiveDomain | undefined,
): NormalizedSeries<M> {
  if (scope === undefined) return series;
  if (scope.kind === "empty") return { ...series, data: [] };

  const bounds = scope.kind === "range" ? scope : scope.bounds;
  const within = series.data.filter((d) => d.time >= bounds.start && d.time <= bounds.end);

  if (scope.kind !== "latest") return { ...series, data: within };

  // `at most one`, never `the last element`: an empty in-range set stays empty
  // rather than becoming an undefined datum. A gap is not a reading, so only a
  // present datum can be the latest one — otherwise a chart in latest mode would
  // announce "no value" as though it were the current measurement.
  let newest: (typeof within)[number] | undefined;
  for (const d of within) {
    if (d.state !== "present") continue;
    if (newest === undefined || d.time > newest.time) newest = d;
  }
  return { ...series, data: newest === undefined ? [] : [newest] };
}

export interface MultiSeriesScopeSpec<M = unknown> {
  series: Accessor<readonly Series<M>[]>;
  visibleSeries?: Accessor<readonly string[] | undefined>;
  onIssue?: (issue: SeriesIssue) => void;
}

export function createMultiSeriesScope<M = unknown>(
  spec: MultiSeriesScopeSpec<M>,
): MultiSeriesScope<M> {
  const dashboard = useDashboardTime();
  const section = useDashboardSection();

  // `undefined` when standalone. Read inside a memo so a range change — or a
  // section whose own window moves — re-resolves. The section is passed THROUGH
  // the resolver rather than applied here, so the precedence rule (ADR-0007 §3)
  // keeps exactly one definition.
  const domain = createMemo<EffectiveDomain | undefined>(() => dashboard?.resolve(section?.()));

  // ONE normalisation, as ADR-0008 requires. Everything below reads this.
  const model = createMemo(() =>
    normalizeSeries(spec.series(), {
      visibleSeries: spec.visibleSeries?.(),
      onIssue: spec.onIssue,
    }),
  );

  const all = createMemo(() => {
    const scope = domain();
    return model().series.map((s) => narrow(s, scope));
  });

  const visible = createMemo(() => all().filter((s) => s.visible));

  return {
    all,
    visible,
    xScale: (range) => {
      const scope = domain();
      // Standalone, or an empty scope with no interval of its own to show: fall
      // back to the data's own extent, which is the pre-dashboard behaviour and
      // the only domain available when the scope resolved to nothing.
      if (scope === undefined || scope.kind === "empty") {
        const [lo, hi] = timeDomainOf(visible());
        return timeScale({ domain: [new Date(lo), new Date(hi)], range });
      }
      const bounds = scope.kind === "range" ? scope : scope.bounds;
      return timeScale({ domain: [new Date(bounds.start), new Date(bounds.end)], range });
    },
    isEmpty: () =>
      domain() !== undefined && visible().every((s) => s.data.length === 0),
    isLatest: () => domain()?.kind === "latest",
    // Built from the NARROWED model, so the table describes the range on screen
    // rather than the dataset behind it.
    table: () => seriesTable({ ...model(), visible: visible(), series: all() }),
  };
}

