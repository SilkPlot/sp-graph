/**
 * The visible time viewport — ADR-0014 §3, §4, on the representation ADR-0017
 * fixes.
 *
 * A chart can be navigated through time: zoomed into an interval, panned across
 * it, autoscaled, and reset. This module is the compute half of that — the pure
 * interval arithmetic that decides what interval a navigation produces, with no
 * Solid, no DOM, no gesture, and no pixel. The reactive holder that stores the
 * viewport, exposes its controlled and uncontrolled forms, and drives it from
 * pointer, wheel, and keyboard adapters is the Solid layer's (ADR-0014 §1's
 * computation-package / reactive-holder split, the same one `active-point.ts`
 * follows).
 *
 * ## One representation rule, two types (ADR-0017)
 *
 * The PUBLIC boundary type is `TimeInterval`, a pair of `Date`s — the D3 idiom,
 * and the currency of every other SilkPlot surface (series `t`,
 * `ActivePoint.at.time`, the dashboard range). The CANONICAL INTERNAL type is
 * `MsInterval`, a pair of epoch-ms `number`s — immutable, and the only thing
 * interval arithmetic (clamp, translate, scale, intersect) is cheap on. Every
 * function here computes on `MsInterval`; `toMsInterval` / `toTimeInterval` are
 * the only conversion, and the reactive holder does it once at its own boundary.
 * This is what lets the viewport clamp against `resolveEffectiveDomain`'s epoch-ms
 * `EffectiveDomain` with no conversion at all.
 *
 * ## The authority is a data interval, never a pixel transform (ADR-0014 §3)
 *
 * Nothing here stores a pixel offset or a zoom factor. A pixel offset is
 * meaningless after a resize; a time interval survives it. That is the whole
 * reason the same viewport reappears correctly at a new size or after a hidden
 * container is revealed — resize and reveal touch no state in this module,
 * because the state is an interval of instants and only the pixel mapping changed.
 */
import { extentOf } from "./extent";
import type { Domain, NormalizedSeries } from "./series";

/** The public boundary interval — a pair of absolute instants (ADR-0017 §2). */
export interface TimeInterval {
  start: Date;
  end: Date;
}

/** The canonical internal interval — epoch milliseconds (ADR-0017 §1). */
export interface MsInterval {
  start: number;
  end: number;
}

/**
 * Why a controlled viewport moved (ADR-0014 §3, §7). A controlled caller reads
 * the cause to label the change and, crucially, to recognise the echo of its own
 * set and not feed the same interval back in a loop.
 */
export type ViewportCause =
  | "pan"
  | "zoom"
  | "pinch"
  | "brush"
  | "range-control"
  | "keyboard"
  | "autoscale"
  | "reset"
  | "replacement"
  | "resize"
  | "reveal"
  | "clamp";

/**
 * The zoom-in floor, when a caller sets none (ADR-0014 §3: "a small non-zero
 * interval"). One millisecond is the smallest interval with non-zero width, so it
 * only guarantees an axis always has a domain to draw; a caller with a meaningful
 * floor (a minute, an hour) passes its own `minSpan`, as the ADR-0014 examples do.
 */
export const DEFAULT_MIN_SPAN_MS = 1;

/* -------------------------------------------------------------------------- */
/* Conversion — the ONLY Date↔ms crossing (ADR-0017 §1)                        */
/* -------------------------------------------------------------------------- */

/** Public `Date` interval → canonical epoch-ms interval. */
export function toMsInterval(interval: TimeInterval): MsInterval {
  return { start: interval.start.getTime(), end: interval.end.getTime() };
}

/** Canonical epoch-ms interval → public `Date` interval. */
export function toTimeInterval(interval: MsInterval): TimeInterval {
  return { start: new Date(interval.start), end: new Date(interval.end) };
}

/* -------------------------------------------------------------------------- */
/* Predicates                                                                  */
/* -------------------------------------------------------------------------- */

/** The interval's width in ms. Negative for a reversed interval. */
export function spanOf(interval: MsInterval): number {
  return interval.end - interval.start;
}

/** Both ends are finite numbers — the precondition every operation assumes. */
export function isFiniteInterval(interval: MsInterval): boolean {
  return Number.isFinite(interval.start) && Number.isFinite(interval.end);
}

/**
 * Two intervals equal to the millisecond. This is the echo test: a controlled
 * caller feeding back exactly what it was handed must not re-fire the callback,
 * which is how a controlled viewport loops (ADR-0014 §7).
 */
export function intervalsEqualMs(a: MsInterval, b: MsInterval): boolean {
  return a.start === b.start && a.end === b.end;
}

/** No instant is shared with `bound` — the "reset rather than preserve" trigger. */
export function isDisjoint(interval: MsInterval, bound: MsInterval): boolean {
  return interval.end <= bound.start || interval.start >= bound.end;
}

/**
 * Order a reversed interval's ends. A right-to-left drag is legitimate USER
 * input, and ADR-0007 §5 puts its normalisation at the gesture boundary rather
 * than in the resolution model — so the brush/gesture layer calls this before an
 * interval reaches the clamp/scale functions, which all assume `start <= end`.
 */
export function normalizeInterval(interval: MsInterval): MsInterval {
  return interval.end < interval.start
    ? { start: interval.end, end: interval.start }
    : interval;
}

/* -------------------------------------------------------------------------- */
/* Clamping — two behaviours, deliberately distinct                            */
/* -------------------------------------------------------------------------- */

/**
 * Intersect an interval INTO a bound, keeping the overlapping part.
 *
 * This is the "clamp it into the new extent" of ADR-0014 §4: on a data
 * replacement, the part of the window that still exists is kept, and a window
 * hanging off the new edge is trimmed to it. The result is empty (`start >= end`)
 * exactly when the two are disjoint — the caller checks `isDisjoint` and resets.
 *
 * It is NOT how a pan clamps: a pan preserves the zoom level and stops at the
 * edge, which is `slideIntoBound`. Trimming a pan would shrink the window every
 * time it reached an edge, which is the wrong feel and the wrong geometry.
 */
export function clampInterval(interval: MsInterval, bound: MsInterval): MsInterval {
  return {
    start: Math.max(interval.start, bound.start),
    end: Math.min(interval.end, bound.end),
  };
}

/**
 * Fit an interval inside a bound by TRANSLATING it, preserving its span.
 *
 * A pan or a zoom-out that would reach past the extent is slid back to sit flush
 * against the edge at the same width, rather than widened beyond the extent
 * (ADR-0014 §3: "nothing widens past the full extent"). When the interval is
 * already at least as wide as the bound, there is nowhere to slide it — the whole
 * bound is the answer.
 */
export function slideIntoBound(interval: MsInterval, bound: MsInterval): MsInterval {
  const span = spanOf(interval);
  const boundSpan = spanOf(bound);
  if (span >= boundSpan) return { start: bound.start, end: bound.end };
  if (interval.start < bound.start) return { start: bound.start, end: bound.start + span };
  if (interval.end > bound.end) return { start: bound.end - span, end: bound.end };
  return interval;
}

/**
 * Floor the zoom: widen an interval narrower than `minSpan` symmetrically about
 * its centre, then slide it back inside the bound (ADR-0014 §3). A zero-width or
 * reversed-to-zero request is widened up to the floor, never rejected. When the
 * bound itself is narrower than the floor, the bound is the answer — there is no
 * room for the floor, and an axis over the whole bound is the honest result.
 */
export function applyMinSpan(
  interval: MsInterval,
  minSpan: number,
  bound: MsInterval,
): MsInterval {
  const floor = Math.max(minSpan, 0);
  const span = spanOf(interval);
  if (span >= floor) return interval;
  if (spanOf(bound) <= floor) return { start: bound.start, end: bound.end };
  const centre = (interval.start + interval.end) / 2;
  const half = floor / 2;
  return slideIntoBound({ start: centre - half, end: centre + half }, bound);
}

/* -------------------------------------------------------------------------- */
/* Navigation operations                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Pan by `deltaMs`, staying inside the bound at the same zoom (ADR-0014 §5). A
 * positive delta moves the window later; reaching the edge stops there rather
 * than scrolling into nothing.
 */
export function translateInterval(
  interval: MsInterval,
  deltaMs: number,
  bound: MsInterval,
): MsInterval {
  return slideIntoBound({ start: interval.start + deltaMs, end: interval.end + deltaMs }, bound);
}

/**
 * Zoom about an anchor instant (ADR-0014 §5, §7). `factor < 1` zooms in, `> 1`
 * zooms out; the anchor is the instant under the pointer, held fixed so the point
 * beneath the cursor does not slide. The result is floored by `minSpan` and kept
 * inside the bound — a zoom-out past the extent lands on the extent.
 */
export function scaleIntervalAround(
  interval: MsInterval,
  factor: number,
  anchorMs: number,
  bound: MsInterval,
  minSpan: number = DEFAULT_MIN_SPAN_MS,
): MsInterval {
  const start = anchorMs - (anchorMs - interval.start) * factor;
  const end = anchorMs + (interval.end - anchorMs) * factor;
  const floored = applyMinSpan(normalizeInterval({ start, end }), minSpan, bound);
  return slideIntoBound(floored, bound);
}

/**
 * Reset to the declared domain (ADR-0014 §3): the caller's `defaultVisibleDomain`
 * if given, otherwise the current bound (the full extent, or a dashboard's
 * resolved effective domain). One command, not a sequence of pans that happen to
 * land home. A declared default outside the bound is clamped into it.
 */
export function resetInterval(
  defaultDomain: MsInterval | undefined,
  bound: MsInterval,
): MsInterval {
  if (defaultDomain === undefined) return { start: bound.start, end: bound.end };
  const clamped = clampInterval(defaultDomain, bound);
  if (clamped.start >= clamped.end) return { start: bound.start, end: bound.end };
  return clamped;
}

/* -------------------------------------------------------------------------- */
/* Data and layout events (ADR-0014 §4)                                        */
/* -------------------------------------------------------------------------- */

/**
 * The viewport's response to the ground moving under it — the data extent
 * changing. One rule generates the whole of ADR-0014 §4's data column:
 *
 *   - **Growth** (the new extent contains the old, more data past the edge) keeps
 *     the interval unchanged, because `clampInterval` returns it untouched when it
 *     already lies inside the wider bound. New data offscreen is NOT auto-scrolled
 *     to — following the live edge is a deliberate act, not a default.
 *   - **Replacement that shrinks the extent** trims the window into the new extent.
 *   - **A change that leaves the window disjoint** from the new extent — the
 *     plausible case of a source change to unrelated data — resets to the declared
 *     domain, because a preserved-looking window over data that no longer exists is
 *     the plausible-wrong outcome this estate refuses.
 *
 * Returns `null` when nothing moved, so the holder fires no callback for the
 * growth and no-op cases. When it moved, the cause is `"replacement"` — the data
 * changed under a stationary viewport, which is not a navigation a fetch should
 * chase (the ADR-0014 example's fetch guard ignores exactly this cause).
 *
 * Resize and hidden→revealed are deliberately NOT here: they change only the
 * pixel mapping, never the interval, so they never call this. That the interval
 * survives them is the point of storing an interval and not a transform.
 */
export function reconcileDataChange(
  prev: MsInterval,
  newBound: MsInterval,
  defaultDomain?: MsInterval,
  minSpan: number = DEFAULT_MIN_SPAN_MS,
): { interval: MsInterval; cause: ViewportCause } | null {
  const next = isDisjoint(prev, newBound)
    ? resetInterval(defaultDomain, newBound)
    : applyMinSpan(clampInterval(prev, newBound), minSpan, newBound);
  if (intervalsEqualMs(next, prev)) return null;
  return { interval: next, cause: "replacement" };
}

/* -------------------------------------------------------------------------- */
/* Autoscale — an explicit y recomputation over the visible x-interval          */
/* -------------------------------------------------------------------------- */

/**
 * The value extent over the data currently inside the visible x-interval, across
 * a set of VISIBLE series (ADR-0014 §3). This is the raw extent — a caller wraps
 * it in its own `YDomainPolicy` exactly as it does the full extent, so a line's
 * zero-floor and a scatter's bare extent stay the caller's decision, applied to a
 * smaller set of points.
 *
 * It changes NO source data and NO x-viewport: autoscale is the "fit the visible
 * values" command, distinct from panning or zooming x. Only present points inside
 * the interval count; a gap or a non-finite value is excluded, exactly as
 * `valueDomainOf` excludes it over the whole series, so the autoscaled domain and
 * the marks cannot disagree about which values exist.
 *
 * The interval test is inclusive at both ends: a datum sitting exactly on the
 * viewport edge is visible, so its value shapes the domain.
 */
export function autoscaleValueDomain<M>(
  series: readonly NormalizedSeries<M>[],
  interval: MsInterval,
): Domain {
  const { start, end } = normalizeInterval(interval);
  const inRange: number[] = [];
  for (const s of series) {
    for (const d of s.data) {
      if (d.state === "present" && d.time >= start && d.time <= end) {
        inRange.push(d.y as number);
      }
    }
  }
  // Reuse `extentOf`'s empty/all-invalid sentinel by handing it the collected
  // values — one policy for "no points to bound", shared with `valueDomainOf`.
  return extentOf(inRange, (v) => v);
}
