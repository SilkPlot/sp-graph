/**
 * createViewport — the reactive holder for the visible time viewport (ADR-0014
 * §3, §4; ADR-0017's representation).
 *
 * The pure interval arithmetic lives in `@silkplot/core`'s `viewport.ts`; this is
 * the Solid half that stores the viewport, exposes it in controlled and
 * uncontrolled forms, reconciles it when the data extent moves, and offers the
 * navigation commands an application or a P05 gesture adapter drives. It is the
 * exact counterpart of `createDashboardTime` (ADR-0008 §6's controlled pattern)
 * and `createActiveDatum` (a reactive holder over a pure lookup).
 *
 * ## The boundary is here, and only here (ADR-0017 §4)
 *
 * The public surface is `Date` (`TimeInterval`); the arithmetic is epoch-ms
 * (`MsInterval`). This holder converts in at the controlled prop and out at the
 * `onVisibleDomainChange` callback, and drives the epoch-ms model in between, so a
 * caller only ever sees `Date`s and the model only ever sees numbers.
 *
 * ## Why it never loops (ADR-0014 §7)
 *
 * `onVisibleDomainChange` fires ONLY from an explicit command (`pan`, `zoomIn`,
 * `brush`, `reset`, a `setVisibleDomain`) or from a data-change reconciliation —
 * never from tracking the controlled `visibleDomain` prop. So a controlled caller
 * feeding the emitted domain back into `visibleDomain` triggers no further
 * callback; and a command that resolves to the domain already shown fires nothing,
 * because the result is compared to the current domain first. The two together are
 * what let a controlled parent drive the viewport without a feedback loop.
 *
 * ## The authority is an interval, so resize and reveal are free (ADR-0014 §3)
 *
 * Nothing here stores a pixel. The bound (the data extent, or a dashboard's
 * resolved effective domain) and the visible interval are both epoch-ms intervals.
 * A resize or a hidden→revealed container changes the pixel mapping the CHART
 * builds from this interval, and touches no state in this holder — which is the
 * whole reason the selected window survives both.
 */
import { createEffect, createMemo, createSignal, on, type Accessor } from "solid-js";
import {
  DEFAULT_MIN_SPAN_MS,
  applyMinSpan,
  autoscaleValueDomain,
  clampInterval,
  intervalsEqualMs,
  normalizeInterval,
  reconcileDataChange,
  resetInterval,
  scaleIntervalAround,
  toMsInterval,
  toTimeInterval,
  translateInterval,
  type Domain,
  type MsInterval,
  type NormalizedSeries,
  type TimeInterval,
  type ViewportCause,
} from "@silkplot/core";

export interface ViewportSpec<M = unknown> {
  /**
   * The data's full time extent, in epoch ms — the outer bound when the chart is
   * standalone. An accessor, read inside memos, so a data replacement moves it.
   */
  fullExtent: Accessor<MsInterval>;
  /**
   * A dashboard's resolved effective domain (ADR-0007), in epoch ms, when the
   * chart is composed. When present it is the outer bound INSTEAD of the raw data
   * extent, so a member's viewport is a narrowing within what the dashboard
   * already resolved and a reset lands on that scope, never on excluded data
   * (ADR-0014 §3). Absent → standalone, bounded by `fullExtent`.
   */
  effectiveBound?: Accessor<MsInterval | undefined>;
  /** Controlled visible domain (`Date`). Present → the caller owns navigation. */
  visibleDomain?: Accessor<TimeInterval | undefined>;
  /** The declared domain a reset restores; absent → reset restores the bound. */
  defaultVisibleDomain?: Accessor<TimeInterval | undefined>;
  /** The zoom-in floor in ms; absent → `DEFAULT_MIN_SPAN_MS`. */
  minSpan?: Accessor<number | undefined>;
  /** The visible series, for the autoscale value-domain recomputation. */
  series?: Accessor<readonly NormalizedSeries<M>[]>;
  /** Fired on every committed change, carrying the `Date` domain and its cause. */
  onVisibleDomainChange?: (domain: TimeInterval, cause: ViewportCause) => void;
}

/**
 * The four explicit viewport commands (ADR-0014 §5), exposed so an application
 * renders its own toolbar without reaching into private state. Split out from the
 * full `Viewport` so a chart can hand exactly these to a caller without also
 * handing out the pan/zoomAround/brush operations that belong to the gesture
 * adapters and the reactive reads that belong to the chart internals.
 */
export interface ViewportCommands {
  /** Zoom in one step about the visible centre; cause `"zoom"`. */
  zoomIn: () => void;
  /** Zoom out one step about the visible centre; cause `"zoom"`. */
  zoomOut: () => void;
  /** Snapshot the value extent over the visible interval (ADR-0014 §3). */
  autoscale: () => void;
  /** Restore the declared domain — `defaultVisibleDomain`, else the bound. */
  reset: () => void;
}

/** The viewport command surface (ADR-0014 §5), plus the operations a gesture drives. */
export interface Viewport extends ViewportCommands {
  /** The current visible domain, as `Date`s — the public read. */
  visibleDomain: Accessor<TimeInterval>;
  /** The current visible domain in epoch ms — what scales, lookups, and marks use. */
  visibleMsDomain: Accessor<MsInterval>;
  /** The current outer bound in epoch ms (effective domain, or full extent). */
  bound: Accessor<MsInterval>;
  /**
   * The raw value extent over the data inside the visible interval — the LIVE
   * autoscale recomputation (ADR-0014 §3). A chart in autoscale mode wraps this in
   * its own `YDomainPolicy`, exactly as it wraps the full-data extent.
   */
  visibleValueDomain: Accessor<Domain>;
  /** The value domain captured by the last `autoscale()` command; `undefined` until then. */
  autoscaledValueDomain: Accessor<Domain | undefined>;
  /** Pan by a signed ms delta, clamped at the edge (cause `"pan"`). */
  pan: (deltaMs: number) => void;
  /** Zoom about an anchor instant (`factor < 1` in, `> 1` out); cause `"zoom"`. */
  zoomAround: (factor: number, anchorMs: number) => void;
  /** Commit a brushed interval, normalising a right-to-left drag; cause `"brush"`. */
  brush: (interval: MsInterval) => void;
  /** Commit an interval directly with a stated cause (a range control, the keyboard). */
  setVisibleDomain: (interval: MsInterval, cause: ViewportCause) => void;
  // `zoomIn` / `zoomOut` / `autoscale` / `reset` are inherited from
  // `ViewportCommands` — the subset a chart hands to an application toolbar.
}

/** How far a single zoom-in/out step scales the visible span. */
const ZOOM_STEP = 0.5;

export function createViewport<M = unknown>(spec: ViewportSpec<M>): Viewport {
  const bound = createMemo<MsInterval>(() => spec.effectiveBound?.() ?? spec.fullExtent());
  const minSpan = (): number => spec.minSpan?.() ?? DEFAULT_MIN_SPAN_MS;
  const defaultMs = (): MsInterval | undefined => {
    const d = spec.defaultVisibleDomain?.();
    return d ? toMsInterval(d) : undefined;
  };

  // Fit a REQUESTED interval to the current bound: order it, keep the part inside
  // the bound (honouring both requested edges rather than sliding the window off
  // one of them), and floor its span. A request disjoint from the bound falls back
  // to the whole bound. The navigation helpers (`translateInterval`,
  // `scaleIntervalAround`) already return an interval inside the bound with its
  // span preserved, so this pass is idempotent on them — it is the display clamp
  // for a controlled or range-control value that may overhang. One place, so every
  // writer agrees.
  const fit = (interval: MsInterval, b: MsInterval): MsInterval => {
    const clamped = clampInterval(normalizeInterval(interval), b);
    if (clamped.start >= clamped.end) return { start: b.start, end: b.end };
    return applyMinSpan(clamped, minSpan(), b);
  };

  // The uncontrolled store, seeded from the declared default (or the bound). It is
  // written even when controlled (as `createDashboardTime` writes its own), so a
  // caller that stops controlling resumes from the last committed value rather
  // than snapping back.
  const seed = fit(defaultMs() ?? bound(), bound());
  const [uncontrolled, setUncontrolled] = createSignal<MsInterval>(seed);

  // The current domain: the controlled prop when present, else the store. The
  // controlled value is clamped for DISPLAY so "nothing widens past the extent"
  // holds even for a caller-supplied out-of-bounds domain (their persistence is
  // theirs; the display cannot lie).
  const visibleMsDomain = createMemo<MsInterval>(() => {
    const controlled = spec.visibleDomain?.();
    return controlled ? fit(toMsInterval(controlled), bound()) : uncontrolled();
  });

  const visibleDomain = createMemo<TimeInterval>(() => toTimeInterval(visibleMsDomain()));

  const visibleValueDomain = createMemo<Domain>(() =>
    autoscaleValueDomain(spec.series?.() ?? [], visibleMsDomain()),
  );

  const [autoscaledValueDomain, setAutoscaled] = createSignal<Domain | undefined>();

  // Reconcile the uncontrolled store when the data extent moves (ADR-0014 §4).
  // `defer: true` skips the initial run — the seed is already valid. The
  // controlled path is not reconciled here: its caller owns the interval, and the
  // display memo above still clamps it. Growth returns null and keeps the window.
  createEffect(
    on(bound, (b) => {
      if (spec.visibleDomain?.() !== undefined) return;
      const r = reconcileDataChange(uncontrolled(), b, defaultMs(), minSpan());
      if (r === null) return;
      setUncontrolled(r.interval);
      spec.onVisibleDomainChange?.(toTimeInterval(r.interval), r.cause);
    }, { defer: true }),
  );

  const setVisibleDomain = (interval: MsInterval, cause: ViewportCause): void => {
    const next = fit(interval, bound());
    // The echo guard (ADR-0014 §7): a command resolving to the domain already
    // shown commits nothing and fires nothing, so a controlled caller feeding its
    // own emitted domain back cannot loop.
    if (intervalsEqualMs(next, visibleMsDomain())) return;
    setUncontrolled(next);
    spec.onVisibleDomainChange?.(toTimeInterval(next), cause);
  };

  const zoomStep = (factor: number): void => {
    const current = visibleMsDomain();
    const anchor = (current.start + current.end) / 2;
    setVisibleDomain(scaleIntervalAround(current, factor, anchor, bound(), minSpan()), "zoom");
  };

  return {
    visibleDomain,
    visibleMsDomain,
    bound,
    visibleValueDomain,
    autoscaledValueDomain,
    pan: (deltaMs) =>
      setVisibleDomain(translateInterval(visibleMsDomain(), deltaMs, bound()), "pan"),
    zoomAround: (factor, anchorMs) =>
      setVisibleDomain(scaleIntervalAround(visibleMsDomain(), factor, anchorMs, bound(), minSpan()), "zoom"),
    brush: (interval) => setVisibleDomain(interval, "brush"),
    setVisibleDomain,
    zoomIn: () => zoomStep(ZOOM_STEP),
    zoomOut: () => zoomStep(1 / ZOOM_STEP),
    // Autoscale snapshots the current visible value extent (ADR-0014 §3). It is a
    // y recomputation and does not move the x-viewport, so it fires no
    // `onVisibleDomainChange`; a chart reads the snapshot (or the live
    // `visibleValueDomain`) and wraps it in its own policy.
    autoscale: () => setAutoscaled(autoscaleValueDomain(spec.series?.() ?? [], visibleMsDomain())),
    reset: () => {
      // Reset restores the declared domain AND clears any autoscale snapshot, so y
      // returns to its pinned full-data extent (ADR-0018 §4: the snapshot holds
      // "until the next autoscale or reset").
      setAutoscaled(undefined);
      setVisibleDomain(resetInterval(defaultMs(), bound()), "reset");
    },
  };
}
