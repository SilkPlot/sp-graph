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
  normalizeReferences,
  normalizeSeries,
  referenceDomainOf,
  seriesTable,
  timeDomainOf,
  timeScale,
  type EffectiveDomain,
  type NormalizedReference,
  type NormalizedSeries,
  type ReferenceValue,
  type ScaleTime,
  type Series,
  type SeriesIssue,
  type SeriesTable,
  type SeriesTableOptions,
} from "@silkplot/core";
import { useDashboardSection, useDashboardTime, type Viewport } from "@silkplot/solid";
import {
  createScopeViewport,
  dashboardMemberViewport,
  dataExtentMs,
  type ChartViewportProps,
} from "./viewport-scope";

export interface MultiSeriesScope<M = unknown> {
  /**
   * The y-basis: visible series narrowed to the effective domain ONLY — before
   * the viewport narrows x. The y axis is computed from this, so a zoom of x
   * leaves y pinned (ADR-0014 §3).
   */
  visible: Accessor<readonly NormalizedSeries<M>[]>;
  /**
   * The drawn series: `visible` further narrowed to the viewport interval when
   * the viewport is applied (standalone AND opted in), else `visible` unchanged.
   * Feeds the marks, the hit index, and the data table.
   */
  drawn: Accessor<readonly NormalizedSeries<M>[]>;
  /** Every series, narrowed to the effective domain — hidden ones included, for a
   *  legend to render. */
  all: Accessor<readonly NormalizedSeries<M>[]>;
  /** Build the x scale for a pixel range, over the viewport interval (or the
   *  scoped time domain where navigation does not apply). */
  xScale: (range: [number, number]) => ScaleTime<number, number>;
  /** True when a scope is in force and nothing falls inside it. */
  isEmpty: Accessor<boolean>;
  /** True when the chart is showing a single most-recent reading. */
  isLatest: Accessor<boolean>;
  /** The accessible data alternative, from the DRAWN model — it describes the
   *  interval on screen. */
  table: Accessor<SeriesTable>;
  /** Normalised reference overlays (ADR-0008 §10), in the caller's order. */
  references: Accessor<readonly NormalizedReference[]>;
  /** The viewport handle — command surface for a toolbar and the gesture adapters. */
  viewport: Viewport;
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
  /**
   * Caller formatting for the derived table (ADR-0008 §9). An accessor, so a
   * formatter that closes over a signal — a locale or unit the application lets
   * the user change — re-renders the table instead of freezing the wording it
   * had at mount.
   */
  tableOptions?: Accessor<SeriesTableOptions>;
  /** Reference overlays (ADR-0008 §10). An accessor — a threshold is dynamic. */
  references?: Accessor<readonly ReferenceValue[] | undefined>;
  /** The chart's viewport props, already adapted by `forwardViewport`.
   *  Absent → an uncontrolled viewport at the full extent, i.e. today's behaviour. */
  viewport?: ChartViewportProps;
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

  // The y-basis: visible series narrowed to the effective domain only.
  const visible = createMemo(() => all().filter((s) => s.visible));

  // The viewport, over the full extent of the visible series' instants. It reads
  // `visible` (effective-domain narrowed, NOT viewport narrowed), so the outer
  // bound is stable as the user zooms within it (ADR-0014 §3).
  const sv = createScopeViewport<M>({
    fullExtent: dataExtentMs(() => {
      const times: number[] = [];
      for (const s of visible()) for (const d of s.data) times.push(d.time);
      return times;
    }),
    effectiveDomain: domain,
    series: visible,
    props: spec.viewport ?? {},
  });

  // The drawn series: the y-basis narrowed to the viewport interval when the
  // viewport is applied, else unchanged. Feeds the marks, the hit index, and the
  // table, so all three describe the interval on screen.
  const drawn = createMemo(() => {
    if (!sv.navigable()) return visible();
    const iv = sv.interval();
    return visible().map((s) => ({
      ...s,
      data: s.data.filter((d) => d.time >= iv.start && d.time <= iv.end),
    }));
  });

  // ONE normalisation for references too, and deliberately NOT routed through
  // `normalizeSeries`: a reference is not a series. Through that path it would
  // acquire a legend entry, rows in the derived table, and a vote in the
  // visible-series y domain — three places asserting a measurement nobody took.
  const references = createMemo(
    () => normalizeReferences(spec.references?.(), { onIssue: spec.onIssue }).references,
  );

  // An unsectioned dashboard member's gestures drive the shared dynamic selection
  // (dashboard-linked selection); a sectioned or standalone chart drives its own viewport.
  const viewport = dashboardMemberViewport(dashboard, section, domain, sv.viewport);

  return {
    all,
    visible,
    drawn,
    viewport,
    references,
    xScale: (range) => {
      // Navigable: the x domain IS the viewport interval (standalone, opted in).
      if (sv.navigable()) {
        const iv = sv.interval();
        return timeScale({ domain: [new Date(iv.start), new Date(iv.end)], range });
      }
      const scope = domain();
      // Standalone, or an empty scope with no interval of its own to show: fall
      // back to the data's own extent, which is the pre-dashboard behaviour and
      // the only domain available when the scope resolved to nothing.
      if (scope === undefined || scope.kind === "empty") {
        const [lo, hi] = timeDomainOf(visible());
        // Domain-participating TIME references widen the standalone domain, and
        // ONLY the standalone one. Below, a resolved dashboard scope is returned
        // untouched: ADR-0007 §3's precedence over the visible interval is total,
        // and a reference is not a scope. A tile silently showing a wider
        // interval than the dashboard's own range control would be the single
        // element on the page telling a different story, with nothing marking it
        // as such — which is the reasoning `narrow()` above already applies to
        // data. The out-of-scope reference is clipped by the overlay instead.
        const times = referenceDomainOf(references(), "time");
        return timeScale({
          domain: [
            new Date(Math.min(lo, ...times)),
            new Date(Math.max(hi, ...times)),
          ],
          range,
        });
      }
      const bounds = scope.kind === "range" ? scope : scope.bounds;
      return timeScale({ domain: [new Date(bounds.start), new Date(bounds.end)], range });
    },
    isEmpty: () =>
      domain() !== undefined && visible().every((s) => s.data.length === 0),
    isLatest: () => domain()?.kind === "latest",
    // Built from the DRAWN model, so the table describes the interval on screen
    // (the viewport, and the dashboard scope before it) rather than the dataset
    // behind it.
    table: () =>
      seriesTable({ ...model(), visible: drawn(), series: all() }, spec.tableOptions?.()),
  };
}

