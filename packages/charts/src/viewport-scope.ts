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
import { createMemo, onMount, type Accessor } from "solid-js";
import { createViewport, type Viewport, type ViewportCommands } from "@silkplot/solid";
import {
  extentOf,
  type EffectiveDomain,
  type MsInterval,
  type NormalizedSeries,
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
   * Whether the caller has OPTED IN to the viewport (any viewport prop present).
   * Absent/false → the chart is at its default and the narrowing is not applied:
   * it tracks the full data extent exactly as before this phase, including
   * following a data replacement to show all of it. Only an opted-in chart takes
   * on ADR-0014 §4's "growth keeps the interval, offscreen until navigated to"
   * behaviour — which is correct for a chart being navigated and wrong for one
   * that never is.
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
  // The viewport is bounded by the full data extent. The dashboard effective
  // domain is deliberately NOT wired as the bound for P04b (see the module note):
  // composed charts keep their proven behaviour and the viewport is applied only
  // when standalone.
  const viewport = createViewport<M>({
    fullExtent: spec.fullExtent,
    series: spec.series,
    visibleDomain: spec.props.visibleDomain,
    defaultVisibleDomain: spec.props.defaultVisibleDomain,
    minSpan: spec.props.minSpan,
    onVisibleDomainChange: spec.props.onVisibleDomainChange,
  });

  // Applied only when standalone (no dashboard scope resolved) AND the caller has
  // opted into the viewport. Inside a `<Dashboard>` the effective domain drives
  // the chart; at its default (not opted in) the chart tracks the full extent, so
  // a data replacement shows all of it and no baseline moves.
  const navigable = createMemo(
    () => spec.effectiveDomain() === undefined && (spec.props.engaged?.() ?? false),
  );
  const interval = createMemo<MsInterval>(() => viewport.visibleMsDomain());

  return { viewport, navigable, interval };
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
 * `engaged` is true when ANY viewport surface is present — a controlled or
 * default domain, a min span, a change callback, or a command toolbar. That is
 * what opts a chart into viewport behaviour; a chart passing none of these stays
 * pure-identity (tracks the full extent, no §4 growth semantics).
 */
export function forwardViewport(props: ChartViewportInput): ChartViewportProps {
  return {
    visibleDomain: () => props.visibleDomain,
    defaultVisibleDomain: () => props.defaultVisibleDomain,
    minSpan: () => props.minSpan,
    onVisibleDomainChange: (domain, cause) => props.onVisibleDomainChange?.(domain, cause),
    engaged: () =>
      props.visibleDomain !== undefined ||
      props.defaultVisibleDomain !== undefined ||
      props.minSpan !== undefined ||
      props.onVisibleDomainChange !== undefined ||
      props.onViewportCommands !== undefined,
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
