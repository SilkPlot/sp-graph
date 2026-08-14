/**
 * Internal observation seam for the production time-series index builder.
 *
 * This module is deliberately absent from the package barrel and export map.
 * The performance harness imports it by repository-relative path so it can
 * prove what the real builder did without adding a consumer-facing API.
 */

type TimeSeriesIndexBuildObserver = () => void;

let observers: Set<TimeSeriesIndexBuildObserver> | undefined;

/** Observe every production time-series index build until the returned cleanup runs. */
export function observeTimeSeriesIndexBuilds(observer: TimeSeriesIndexBuildObserver): () => void {
  observers ??= new Set();
  observers.add(observer);
  return () => {
    observers?.delete(observer);
    if (observers?.size === 0) observers = undefined;
  };
}

/** Called only by the production builder, once at the start of every invocation. */
export function noteTimeSeriesIndexBuild(): void {
  if (observers === undefined) return;
  for (const observer of observers) observer();
}
