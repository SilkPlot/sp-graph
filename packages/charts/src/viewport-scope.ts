/**
 * The per-chart viewport, composed into a time-series scope.
 *
 * The viewport MODEL and its reactive holder (`createViewport` in
 * `@silkplot/solid`) hold the pure interval state. This is the seam that connects
 * that model to what a chart actually draws: it produces one `Viewport` from a
 * data extent, the resolved dashboard effective domain, and the chart's viewport
 * props, and hands back the epoch-ms interval the scope narrows its x scale and
 * its marks to. The gesture ADAPTERS that drive the viewport from pointer, wheel,
 * pinch, and keyboard are a later concern; this module makes the viewport visible
 * so those adapters have something to move.
 *
 * ## Standalone navigation only, for P04b
 *
 * Standalone, the outer bound is the data's full extent and navigation applies.
 * **Inside a `<Dashboard>` the effective domain drives the chart exactly as it did
 * before this phase — the per-chart viewport is NOT applied**, so `interval` is
 * `undefined` there. ADR-0014 §3 does describe a member's viewport as a further
 * narrowing within the effective domain, but that needs the viewport to RESET to
 * the new range when the dashboard range changes (a bound change the user drove
 * from the global control), which `createViewport` treats as a data-change
 * reconciliation instead — it would keep the old, narrower interval and the
 * dashboard range would stop driving its members. Getting that seam right is
 * deferred (see the P04b phase note); until then, composed charts keep their
 * proven dashboard behaviour and only standalone charts navigate.
 *
 * ## Default-identical (the additive guarantee)
 *
 * An uncontrolled viewport seeds to its whole bound, so a standalone chart passing
 * no viewport prop resolves `interval()` to exactly the data extent — the same
 * domain `timeExtentScale` produced before this phase. The narrowing is the
 * identity, and no existing baseline moves.
 */
import { createMemo, createSignal, onMount, type Accessor } from "solid-js";
import {
  createViewport,
  type DashboardTime,
  type Viewport,
  type ViewportCommands,
} from "@silkplot/solid";
import {
  extentOf,
  toTimeInterval,
  type EffectiveDomain,
  type MsInterval,
  type NormalizedSeries,
  type SectionScope,
  type TimeInterval,
  type ViewportCause,
} from "@silkplot/core";

/**
 * The viewport props a time-series chart forwards to its scope. All optional and
 * `Date` at the boundary (ADR-0017), on ADR-0008 §6's controlled/uncontrolled
 * pattern. Absent → an uncontrolled viewport at the full extent, i.e. today's
 * behaviour.
 */
export interface ChartViewportProps {
  /** Controlled visible domain (`Date`). Present → the caller drives navigation. */
  visibleDomain?: Accessor<TimeInterval | undefined>;
  /** The declared domain a reset restores; absent → reset restores the bound. */
  defaultVisibleDomain?: Accessor<TimeInterval | undefined>;
  /** The zoom-in floor in ms; absent → the model's `DEFAULT_MIN_SPAN_MS`. */
  minSpan?: Accessor<number | undefined>;
  /** Fired on every committed change, carrying the `Date` domain and its cause. */
  onVisibleDomainChange?: (domain: TimeInterval, cause: ViewportCause) => void;
  /**
   * Whether a CONTROLLING viewport prop is present — a controlled or default
   * domain. That engages the narrowing immediately, because the caller has stated
   * a window the chart must open at. It is deliberately NOT set by a mere command
   * seam (a toolbar, the keyboard, a gesture): those engage only once the user
   * actually navigates (the `dirty` flag below), so a chart offering navigation it
   * is never asked to perform still tracks its full data — including following a
   * replacement to show all of it — rather than taking on ADR-0014 §4's
   * "growth keeps the interval" behaviour before anything has been navigated.
   */
  engaged?: Accessor<boolean>;
}

export interface ScopeViewport {
  /**
   * The viewport handle — the command surface a chart exposes to an application's
   * toolbar, and the state the gesture adapters drive.
   */
  viewport: Viewport;
  /**
   * True when the viewport is applied: the chart is standalone AND the caller has
   * opted in. When false the scope keeps its exact pre-viewport behaviour — a
   * chart at its default, or any dashboard member (for P04b). A scope reads
   * `interval` only where this is true.
   */
  navigable: Accessor<boolean>;
  /** The viewport's current interval in epoch ms — meaningful only where
   *  `navigable` is true. */
  interval: Accessor<MsInterval>;
}

/** The full-data time extent as an epoch-ms interval — the viewport's outer
 *  bound when standalone. `extentOf` returns `[0, 1]` for empty/all-invalid input,
 *  which keeps the interval finite and gives an empty chart a domain to draw. */
export function dataExtentMs(times: Accessor<readonly number[]>): Accessor<MsInterval> {
  return createMemo(() => {
    const [start, end] = extentOf(times(), (t) => t);
    return { start, end };
  });
}

/**
 * Compose a `Viewport` for a scope. `effectiveDomain` is the resolved dashboard
 * scope (or `undefined` standalone); `fullExtent` is the full data extent. The
 * viewport's outer bound is the effective RANGE when one is in force, else the
 * full extent, and `interval` is present only where navigation applies.
 */
export function createScopeViewport<M = unknown>(spec: {
  fullExtent: Accessor<MsInterval>;
  effectiveDomain: Accessor<EffectiveDomain | undefined>;
  /** Visible series, for the viewport's autoscale value-domain recomputation. */
  series?: Accessor<readonly NormalizedSeries<M>[]>;
  props: ChartViewportProps;
}): ScopeViewport {
  // `dirty` flips true the first time the user actually navigates — a command
  // that commits an x change (pan, zoom, brush, a range control, the keyboard,
  // reset). A data-driven cause (replacement, resize, reveal, clamp) is the ground
  // moving under the viewport, not navigation, so it does NOT engage. This is what
  // lets a chart offer keyboard/wheel/brush navigation out of the box while an
  // un-navigated chart still tracks its full data (ADR-0014 §3, §4).
  const [dirty, setDirty] = createSignal(false);
  const NAVIGATION_CAUSES: ReadonlySet<ViewportCause> = new Set([
    "pan",
    "zoom",
    "pinch",
    "brush",
    "range-control",
    "keyboard",
    "reset",
  ]);

  // The viewport is bounded by the full data extent. The dashboard effective
  // domain is deliberately NOT wired as the bound (see the module note): composed
  // charts keep their proven behaviour and the viewport is applied only standalone.
  const viewport = createViewport<M>({
    fullExtent: spec.fullExtent,
    series: spec.series,
    visibleDomain: spec.props.visibleDomain,
    defaultVisibleDomain: spec.props.defaultVisibleDomain,
    minSpan: spec.props.minSpan,
    onVisibleDomainChange: (domain, cause) => {
      if (NAVIGATION_CAUSES.has(cause)) setDirty(true);
      spec.props.onVisibleDomainChange?.(domain, cause);
    },
  });

  // Applied only when standalone (no dashboard scope resolved) AND the viewport is
  // engaged — either a controlling prop opened it at a window, or the user has
  // navigated. Inside a `<Dashboard>` the effective domain drives the chart; at
  // its default (un-engaged) the chart tracks the full extent, so a data
  // replacement shows all of it and no baseline moves.
  const navigable = createMemo(
    () =>
      spec.effectiveDomain() === undefined && ((spec.props.engaged?.() ?? false) || dirty()),
  );
  const interval = createMemo<MsInterval>(() => viewport.visibleMsDomain());

  return { viewport, navigable, interval };
}

/**
 * The viewport a chart's gestures drive when it is a DASHBOARD MEMBER following
 * the shared dynamic selection (ADR-0020). It is CONTROLLED by the
 * member's effective domain and bounded by the global range, and every commit —
 * a brush, a keyboard pan/zoom, a reset — flows out through `setDynamic`, so a
 * drag or a keypress on one chart moves the shared selection and every unsectioned
 * member follows. The chart's DISPLAY still comes from the scope's effective-domain
 * path; this viewport exists to route input, not to draw.
 */
export function createDashboardViewport(spec: {
  /** The global range, in ms — the outer bound a selection may not widen past. */
  global: Accessor<MsInterval>;
  /** The member's current effective domain, in ms — the controlled visible domain. */
  effective: Accessor<MsInterval>;
  /** Commit a new (or cleared) dynamic selection. `Date` at the boundary. */
  setDynamic: (interval: TimeInterval | undefined) => void;
}): Viewport {
  return createViewport({
    fullExtent: spec.global,
    visibleDomain: () => toTimeInterval(spec.effective()),
    onVisibleDomainChange: (domain) => spec.setDynamic(domain),
  });
}

/**
 * Choose the viewport a time chart's gestures drive: the shared dynamic selection
 * when it is an UNSECTIONED dashboard member (dashboard-linked selection), else the chart's own
 * `fallback` viewport (a sectioned member — isolated — or a standalone chart).
 * `dashboard`/`section` are context presence, decided once for the chart's life.
 */
export function dashboardMemberViewport(
  dashboard: DashboardTime | undefined,
  section: Accessor<SectionScope> | undefined,
  domain: Accessor<EffectiveDomain | undefined>,
  fallback: Viewport,
): Viewport {
  if (dashboard === undefined || section !== undefined) return fallback;
  const dash = dashboard;
  const globalMs = (): MsInterval => {
    const g = dash.global();
    return { start: g.start, end: g.end };
  };
  return createDashboardViewport({
    global: globalMs,
    effective: () => {
      // A member with no section resolves to a range (dynamic ∩ global) or, if a
      // stale dynamic ever fell disjoint, the whole global range.
      const s = domain();
      const bounds = s?.kind === "range" ? s : dash.global();
      return { start: bounds.start, end: bounds.end };
    },
    setDynamic: dash.setDynamic,
  });
}

/** The flat viewport props a chart declares, as they arrive on the reactive
 *  props proxy. */
export interface ChartViewportInput {
  visibleDomain?: TimeInterval;
  defaultVisibleDomain?: TimeInterval;
  minSpan?: number;
  onVisibleDomainChange?: (domain: TimeInterval, cause: ViewportCause) => void;
  onViewportCommands?: (commands: ViewportCommands) => void;
}

/**
 * Adapt a chart's flat viewport props to the accessor-shaped `ChartViewportProps`
 * the scope consumes. Each getter reads through the live `props` object so a
 * controlled `visibleDomain` signal re-resolves the viewport; the callback is
 * wrapped rather than captured so a caller swapping it is honoured.
 *
 * `engaged` is true only for a CONTROLLING prop — a controlled or default domain,
 * which states a window the chart must open at. A command seam (a toolbar, and in
 * a later phase the keyboard and gestures) does not engage on its own: it engages
 * once the user navigates, so a chart that offers navigation but is never driven
 * still tracks its full data.
 */
export function forwardViewport(props: ChartViewportInput): ChartViewportProps {
  return {
    visibleDomain: () => props.visibleDomain,
    defaultVisibleDomain: () => props.defaultVisibleDomain,
    minSpan: () => props.minSpan,
    onVisibleDomainChange: (domain, cause) => props.onVisibleDomainChange?.(domain, cause),
    engaged: () =>
      props.visibleDomain !== undefined || props.defaultVisibleDomain !== undefined,
  };
}

/**
 * Hand the four explicit commands to an application's toolbar callback once on
 * mount (ADR-0014 §5). The viewport's methods are stable, so a single call is
 * enough — the caller stores the object. A no-op when no callback is supplied.
 */
export function emitViewportCommands(
  emit: ((commands: ViewportCommands) => void) | undefined,
  viewport: Viewport,
): void {
  if (emit) onMount(() => emit(viewport));
}
