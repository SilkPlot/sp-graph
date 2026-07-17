/**
 * Shared scale kinds and tick resolution.
 *
 * `Axis` and `Gridlines` must never disagree about where a tick sits: a grid
 * line half a pixel off the label beneath it is the kind of defect the eye
 * catches immediately and a test never does. Sharing the *computation* is what
 * makes that disagreement impossible — sharing markup would not — so the
 * discriminator and the tick call live here rather than privately inside either
 * component.
 *
 * All of this is the "D3 computes" side: it delegates to `@silkplot/core` and
 * touches no DOM.
 */
import {
  computeTicks,
  computeBandTicks,
  type ContinuousScale,
  type ScaleBand,
  type Tick,
} from "@silkplot/core";

/** Any scale a tick-driven primitive can be drawn for: continuous or band. */
export type AxisScale = ContinuousScale | ScaleBand<string>;

/**
 * A band scale has no `ticks()` — that absence is the discriminator. Every band
 * category is a tick, so there is no count to negotiate.
 */
export function isBandScale(scale: AxisScale): scale is ScaleBand<string> {
  return typeof (scale as ContinuousScale).ticks !== "function";
}

/** How many ticks to ask for. Both fields are hints, and both are ignored by band scales. */
export interface TickRequest {
  /** Desired tick count. */
  count?: number;
  /** Target px spacing between ticks, used when `count` is omitted. */
  pixelsPerTick?: number;
}

/** Resolve the ticks for a scale, whichever kind it is. */
export function resolveTicks(scale: AxisScale, request: TickRequest = {}): Tick[] {
  if (isBandScale(scale)) return computeBandTicks(scale);
  return computeTicks(scale, {
    count: request.count,
    pixelsPerTick: request.pixelsPerTick,
  });
}
