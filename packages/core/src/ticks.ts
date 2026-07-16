/**
 * Ticks — the module that REPLACES `d3-axis`.
 *
 * `d3-axis` is banned in SilkPlot because it selects a DOM node and mutates it
 * (a second renderer fighting Solid). Instead we compute tick values from the
 * scale, format their labels with `d3-format` / `d3-time-format`, and hand back
 * plain data. A Solid `<Axis>` renders that data with `<For>` — Solid owns the
 * DOM, we own the math.
 */
import { format as d3Format } from "d3-format";
import { timeFormat as d3TimeFormat } from "d3-time-format";
import type { ContinuousScale, ScaleBand, ScaleLinear, ScaleTime } from "./scales";

/** One computed tick: its data value, pixel position, and rendered label. */
export interface Tick {
  /** The underlying domain value (number for linear, Date for time, string for band). */
  value: number | Date | string;
  /** Pixel position along the axis, from `scale(value)`. */
  position: number;
  /** Formatted label text. */
  label: string;
}

export interface TickOptions {
  /**
   * Desired tick count. D3 treats this as a hint, not a guarantee. When
   * omitted, a count is derived from `pixelsPerTick` and the range extent.
   */
  count?: number;
  /** Target spacing between ticks in pixels when `count` is omitted. Default: 80. */
  pixelsPerTick?: number;
  /**
   * Explicit label formatter. If omitted, a sensible default is chosen from the
   * scale kind (d3-format specifier for linear, d3-time-format for time).
   */
  format?: (value: never) => string;
}

function desiredCount(scale: ContinuousScale, options: TickOptions): number {
  if (options.count !== undefined) return Math.max(2, options.count);
  const [r0, r1] = scale.range();
  const extent = Math.abs((r1 ?? 0) - (r0 ?? 0));
  const pxPerTick = options.pixelsPerTick ?? 80;
  return Math.max(2, Math.floor(extent / pxPerTick));
}

function isTimeScale(scale: ContinuousScale): scale is ScaleTime<number, number> {
  // Time scales tick with Date domain values; probe the first tick.
  const sample = (scale as ScaleTime<number, number>).ticks(1)[0];
  return sample instanceof Date;
}

/**
 * Compute ticks + formatted labels for a continuous (linear or time) scale.
 * This is the canonical d3-axis replacement.
 */
export function computeTicks(scale: ContinuousScale, options: TickOptions = {}): Tick[] {
  const count = desiredCount(scale, options);

  if (isTimeScale(scale)) {
    const timeScale = scale as ScaleTime<number, number>;
    const values = timeScale.ticks(count);
    const fmt =
      (options.format as ((v: Date) => string) | undefined) ??
      (timeScale.tickFormat(count) as (v: Date) => string) ??
      d3TimeFormat("%-d %b");
    return values.map((value) => ({
      value,
      position: timeScale(value),
      label: fmt(value),
    }));
  }

  const linear = scale as ScaleLinear<number, number>;
  const values = linear.ticks(count);
  const fmt =
    (options.format as ((v: number) => string) | undefined) ??
    (linear.tickFormat(count) as (v: number) => string) ??
    d3Format("~s");
  return values.map((value) => ({
    value,
    position: linear(value),
    label: fmt(value),
  }));
}

/**
 * Compute ticks for a discrete band scale — one tick per domain entry, centred
 * on its band. A band scale has no `ticks()`: every category IS a tick, so
 * there is no count to negotiate and no formatter to choose.
 */
export function computeBandTicks(scale: ScaleBand<string>): Tick[] {
  const half = scale.bandwidth() / 2;
  const ticks: Tick[] = [];
  for (const value of scale.domain()) {
    const start = scale(value);
    if (start === undefined) continue;
    ticks.push({ value, position: start + half, label: value });
  }
  return ticks;
}

/** Numeric label formatter — thin re-export of `d3-format` for label building. */
export function numberFormat(specifier: string): (value: number) => string {
  return d3Format(specifier);
}

/** Date label formatter — thin re-export of `d3-time-format` for label building. */
export function timeLabelFormat(specifier: string): (value: Date) => string {
  return d3TimeFormat(specifier);
}
