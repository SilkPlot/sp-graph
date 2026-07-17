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

/**
 * A tick-label formatter for whichever scale kind an `AxisScale` turns out to be.
 *
 * `Axis` accepts any `AxisScale`, so at that surface the scale kind is not known
 * statically and the formatter has to cover all three value kinds. A consumer
 * supplies the one matching their scale — `(number) => string` for linear,
 * `(Date) => string` for time, `(string) => string` for band — and
 * `resolveTicks` routes it to the right computation. (When the scale kind IS
 * known at the call site, `computeTicks`'s own overloads bind the value kind
 * more tightly than this union can.)
 */
export type TickFormat =
  | ((value: number) => string)
  | ((value: Date) => string)
  | ((value: string) => string);

/**
 * How many ticks to ask for and how to label them. `count`/`pixelsPerTick` are
 * hints ignored by band scales; `format` applies to every scale kind (a band
 * axis formats its category string).
 */
export interface TickRequest {
  /** Desired tick count. */
  count?: number;
  /** Target px spacing between ticks, used when `count` is omitted. */
  pixelsPerTick?: number;
  /** Explicit tick-label formatter; defaults to the scale-kind default when omitted. */
  format?: TickFormat;
}

/** Resolve the ticks for a scale, whichever kind it is. */
export function resolveTicks(scale: AxisScale, request: TickRequest = {}): Tick[] {
  if (isBandScale(scale)) {
    return computeBandTicks(scale, {
      format: request.format as ((value: string) => string) | undefined,
    });
  }
  return computeTicks(scale, {
    count: request.count,
    pixelsPerTick: request.pixelsPerTick,
    format: request.format as ((value: number | Date) => string) | undefined,
  });
}
