/**
 * The instruments the workload page exposes to the driver.
 *
 * Three things are measured here that a frame distribution cannot answer on its
 * own, because they are the protocol's SECOND acceptance criterion — "at most one
 * active-state or viewport commit per animation frame, and no pointer event
 * performing a synchronous layout read or index reconstruction". A chart can hold
 * its frame budget on a fast machine while breaking both, and then miss it by a
 * mile on a slow one. Frames are the symptom; these are the cause.
 *
 * Each instrument reads the real operation it names. The layout-read counter
 * observes a DOM API, the commit counter observes callbacks the page owns, and
 * the index-build counter observes the actual production builder through an
 * opt-in internal seam. That seam is not exported by the package and is inactive
 * outside these bracketed passes.
 */
import {
  createTimeSeriesIndex,
  normalizeSeries,
  type NormalizedDatum,
  type Series,
} from "@silkplot/core";
import { observeTimeSeriesIndexBuilds } from "../../../packages/core/src/time-series-index-observer";

/* -------------------------------------------------------------------------- */
/* Settle time                                                                 */
/* -------------------------------------------------------------------------- */

/** Quiet period that ends a settle. Not counted in the reported time. */
const QUIET_MS = 100;

/** Give up on a settle that never changes anything. */
const SETTLE_TIMEOUT_MS = 8000;

/** Returned when the trigger produced no DOM change at all. Not a fast settle — no settle. */
export const NO_CHANGE = -1;

/**
 * How long the page took to stop changing after `trigger`.
 *
 * Settle is defined as the last DOM mutation, not the first — a replacement that
 * repaints the marks quickly and then recomputes an axis two frames later has
 * settled when the axis lands, and a reader watching it agrees. Waiting for a
 * quiet window and then reporting the LAST mutation timestamp, rather than the
 * moment the window expired, keeps the quiet period itself out of the number.
 *
 * A MutationObserver rather than a fixed wait, because a fixed wait measures the
 * wait. It cannot see a change that leaves the DOM identical (a canvas repaint,
 * a style recalculation) — this library renders SVG through Solid, so every
 * visual change here is a DOM change, and if a Canvas substrate is ever adopted
 * this instrument needs replacing rather than adjusting.
 *
 * ---------------------------------------------------------------------------
 * At least one mutation is REQUIRED before the quiet window may end
 * ---------------------------------------------------------------------------
 * Without that condition the quiet window can expire before the response even
 * begins, and the settle resolves at ~0ms. It is not hypothetical: the
 * forty-eight-chart resize reported **0.1ms p50** on the first run of this
 * harness and passed the protocol's 1-second gate on it. The resize path is
 * asynchronous — a style write, then `ResizeObserver`, then a Solid update —
 * so the first mutation lands well after the 100ms window would otherwise have
 * closed on an untouched DOM.
 *
 * That is the estate's recurring failure in miniature: a measurement that
 * measured nothing does not look like a failure, it looks like an excellent
 * result. So a trigger that never mutates anything returns `NO_CHANGE` and the
 * driver refuses to score it, rather than being recorded as instantaneous.
 */
export function settle(root: Element, trigger: () => void): Promise<number> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let lastMutation = 0;
    let mutations = 0;
    const observer = new MutationObserver(() => {
      mutations++;
      lastMutation = performance.now();
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    trigger();

    const finish = (value: number): void => {
      observer.disconnect();
      resolve(value);
    };

    const check = (): void => {
      const now = performance.now();
      if (mutations > 0 && now - lastMutation >= QUIET_MS) {
        finish(+(lastMutation - t0).toFixed(1));
        return;
      }
      if (now - t0 >= SETTLE_TIMEOUT_MS) {
        finish(mutations === 0 ? NO_CHANGE : +(lastMutation - t0).toFixed(1));
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

/* -------------------------------------------------------------------------- */
/* Commits per frame, layout reads, and production builds in pointer dispatch */
/* -------------------------------------------------------------------------- */

export interface InvariantReading {
  /** Total commits seen while watching. */
  commits: number;
  /** The worst frame. The contract says this must never exceed 1. */
  maxCommitsPerFrame: number;
  /** Frames in which at least one commit landed. */
  framesWithCommits: number;
  /** `getBoundingClientRect` calls made synchronously inside a pointer event. */
  layoutReadsInPointer: number;
  /** Pointer events dispatched while watching — the denominator for the above. */
  pointerEvents: number;
  /** Actual production time-series index-builder calls made inside pointer dispatch. */
  productionIndexBuildsInPointer: number;
  /** Deliberately injected rebuilds made inside pointer dispatch. */
  injectedRebuildsInPointer: number;
  /** Pointer events carrying exactly one injected rebuild. */
  pointerEventsWithOneInjectedRebuild: number;
  /** Pointer events carrying exactly one synchronous layout read. */
  pointerEventsWithOneLayoutRead: number;
  /** Pointer events carrying exactly one actual production-builder call. */
  pointerEventsWithOneProductionIndexBuild: number;
}

export interface Invariants {
  /** Called from every viewport or active-point callback the page owns. */
  noteCommit(): void;
  /** Called by the deliberate mutation after its one injected rebuild completes. */
  noteInjectedRebuild(): void;
  start(): void;
  stop(): void;
  read(): InvariantReading;
}

/**
 * The commit, layout-read, and actual production index-builder counters.
 *
 * `getBoundingClientRect` is patched on the prototype while watching and restored
 * when it stops. That is intrusive, and it is why watching is a separate short
 * pass rather than something left on during the frame measurements: a patched
 * hot DOM method would put the instrument's own cost into the numbers it is
 * standing next to.
 *
 * "Inside a pointer event" begins in a capture-phase listener on `window`, before
 * document or element handlers, and ends when that event's dispatch ends. Work
 * deferred by a handler lands outside the bracket and is correctly not counted —
 * deferring is the fix, so counting it would count the fix as a defect.
 *
 * ---------------------------------------------------------------------------
 * The bracket is READ from the event, never timed
 * ---------------------------------------------------------------------------
 * This closed on `queueMicrotask` until 2026-08-15, and that was wrong in the
 * one direction no test could see. A microtask checkpoint runs between listener
 * callbacks of a BROWSER-dispatched event, so the window shut before any
 * document-phase listener ran and all three scope-gated counters read zero
 * unconditionally — including the two that back the clean-pass invariants, which
 * therefore could not fail. A synthetic `dispatchEvent` keeps the JS stack
 * non-empty, interleaves no checkpoint, and counted 10/10 throughout: the defect
 * was invisible to exactly the driver a test was most likely to use.
 *
 * The repair does not move the window to a later tick. `setTimeout(…, 0)` and
 * `requestAnimationFrame` both restore the count and both then attribute work
 * that ran later in the same task or frame but not in the handler — measured, a
 * `requestAnimationFrame`-deferred layout read scores 10/10 against a
 * `setTimeout` close. Widening trades an unfalsifiable pass for a false failure.
 *
 * Instead the scope is a property of the event: the browser resets `eventPhase`
 * to `NONE` when dispatch ends, whatever any handler did to propagation, so
 * "are we inside this pointer event" is a question the event itself answers. No
 * timer, no phase-ordering assumption, and nothing to re-tune if listener
 * registration order changes. A window bubble-phase close was measured as the
 * alternative and rejected: it is correct until a handler calls
 * `stopPropagation`, after which its macrotask backstop holds the scope open
 * into the next frame and counts deferred work 10/10.
 */
export function createInvariants(): Invariants {
  interface PointerEventCounts {
    injectedRebuilds: number;
    layoutReads: number;
    productionIndexBuilds: number;
  }

  let commits = 0;
  let maxPerFrame = 0;
  let framesWithCommits = 0;
  let thisFrame = 0;
  let layoutReads = 0;
  let pointerEvents = 0;
  let productionIndexBuilds = 0;
  let injectedRebuilds = 0;
  let pointerReadings: PointerEventCounts[] = [];
  let currentPointer: PointerEventCounts | undefined;
  let currentEvent: Event | undefined;
  let stopObservingIndexBuilds: (() => void) | undefined;
  let raf = 0;
  let watching = false;

  const original = Element.prototype.getBoundingClientRect;

  const endFrame = (): void => {
    if (thisFrame > 0) {
      framesWithCommits++;
      if (thisFrame > maxPerFrame) maxPerFrame = thisFrame;
      thisFrame = 0;
    }
    raf = requestAnimationFrame(endFrame);
  };

  const enter = (event: Event): void => {
    pointerEvents++;
    const reading: PointerEventCounts = {
      injectedRebuilds: 0,
      layoutReads: 0,
      productionIndexBuilds: 0,
    };
    currentPointer = reading;
    currentEvent = event;
    pointerReadings.push(reading);
  };

  /**
   * The open reading, or `undefined` if the pointer event has finished dispatching.
   *
   * Closing is lazy on purpose. Nothing observes the scope except the three
   * counters below, so the only moment the answer matters is the moment one of
   * them asks — and asking the event is exact, where any scheduled close is a
   * guess about when dispatch ended.
   */
  const openReading = (): PointerEventCounts | undefined => {
    if (currentPointer === undefined) return undefined;
    if (currentEvent !== undefined && currentEvent.eventPhase === Event.NONE) {
      currentPointer = undefined;
      currentEvent = undefined;
      return undefined;
    }
    return currentPointer;
  };

  return {
    noteCommit() {
      if (!watching) return;
      commits++;
      thisFrame++;
    },
    noteInjectedRebuild() {
      if (!watching) return;
      const reading = openReading();
      if (reading === undefined) return;
      injectedRebuilds++;
      reading.injectedRebuilds++;
    },
    start() {
      if (watching) return;
      watching = true;
      commits = 0;
      maxPerFrame = 0;
      framesWithCommits = 0;
      thisFrame = 0;
      layoutReads = 0;
      pointerEvents = 0;
      productionIndexBuilds = 0;
      injectedRebuilds = 0;
      pointerReadings = [];
      currentPointer = undefined;
      currentEvent = undefined;
      stopObservingIndexBuilds = observeTimeSeriesIndexBuilds(() => {
        const reading = openReading();
        if (reading === undefined) return;
        productionIndexBuilds++;
        reading.productionIndexBuilds++;
      });
      Element.prototype.getBoundingClientRect = function patched(this: Element) {
        const reading = openReading();
        if (reading !== undefined) {
          layoutReads++;
          reading.layoutReads++;
        }
        return original.call(this);
      };
      window.addEventListener("pointermove", enter, { capture: true });
      raf = requestAnimationFrame(endFrame);
    },
    stop() {
      if (!watching) return;
      watching = false;
      Element.prototype.getBoundingClientRect = original;
      window.removeEventListener("pointermove", enter, { capture: true });
      stopObservingIndexBuilds?.();
      stopObservingIndexBuilds = undefined;
      currentPointer = undefined;
      currentEvent = undefined;
      cancelAnimationFrame(raf);
      // The frame in flight when watching stopped still counts.
      if (thisFrame > 0) {
        framesWithCommits++;
        if (thisFrame > maxPerFrame) maxPerFrame = thisFrame;
        thisFrame = 0;
      }
    },
    read: () => ({
      commits,
      maxCommitsPerFrame: maxPerFrame,
      framesWithCommits,
      layoutReadsInPointer: layoutReads,
      pointerEvents,
      productionIndexBuildsInPointer: productionIndexBuilds,
      injectedRebuildsInPointer: injectedRebuilds,
      pointerEventsWithOneInjectedRebuild: pointerReadings.filter(
        (reading) => reading.injectedRebuilds === 1,
      ).length,
      pointerEventsWithOneLayoutRead: pointerReadings.filter(
        (reading) => reading.layoutReads === 1,
      ).length,
      pointerEventsWithOneProductionIndexBuild: pointerReadings.filter(
        (reading) => reading.productionIndexBuilds === 1,
      ).length,
    }),
  };
}

/** The page's one truthful pointer-scope observer, shared by clean and mutation passes. */
export const invariants = createInvariants();

/* -------------------------------------------------------------------------- */
/* The per-event index-rebuild mutation                                        */
/* -------------------------------------------------------------------------- */

let pathologicalTarget: Element | undefined;
let pathologicalSeries: readonly {
  seriesId: string;
  points: readonly NormalizedDatum[];
}[] = [];
let rebuilds = 0;

/**
 * Rebuild a hit index. Deliberately the whole thing, deliberately every time.
 *
 * This calls the production builder itself. The former stand-in projected and
 * sorted one flat numeric array; after the scale-free index correction that was
 * no longer the operation a regression would repeat. The real builder now
 * constructs per-series maps, an instant union, sorted ordinals, and shared-time
 * columns. A stale imitation under-states or misclassifies that work and can
 * report "non-discriminating" about a defect it did not actually inject.
 *
 * What it must NOT do is grow until it breaches. Tuning a control until it
 * produces the verdict you wanted is fitting the instrument to the answer; the
 * size of this work is set by what the library does, and the verdict is whatever
 * falls out of that.
 */
function rebuildIndex(
  series: readonly { seriesId: string; points: readonly NormalizedDatum[] }[],
): number {
  const first = series[0]?.points[0]?.time ?? 0;
  const lastSeries = series[series.length - 1];
  const last = lastSeries?.points[lastSeries.points.length - 1]?.time ?? 1;
  const span = last - first || 1;
  const index = createTimeSeriesIndex(series, {
    time: (datum) => datum.time,
    px: (datum) => ((datum.time - first) / span) * 1000,
    py: (datum) => datum.y ?? 0,
    sourceIndex: (datum) => datum.sourceIndex,
  });
  rebuilds++;
  return index.length;
}

const onPathologicalMove = (): void => {
  // A synchronous layout read AND a full index rebuild, in the handler, on every
  // event — the two things the contract forbids, done on purpose.
  pathologicalTarget?.getBoundingClientRect();
  rebuildIndex(pathologicalSeries);
  invariants.noteInjectedRebuild();
};

/**
 * Turn the mutation on or off.
 *
 * Exact application is structural on every workload: each pointer event must
 * carry one injected rebuild, one injected layout read, and one observed call to
 * the production builder. W-D additionally requires that faithful mutation to
 * breach a strict timing limit; W-A, W-B and W-C use the exact structure itself
 * as their discrimination proof, even when mutation timing remains fast — W-A
 * joined them on 2026-08-15, when the first scored run that could measure it put
 * its faithful mutation at p95 16.8ms against a 17.7ms gate.
 *
 * The clean and mutated passes use the same pointer-scope observer. The clean
 * pass therefore proves zero actual production-builder calls directly. During
 * mutation, exactly one observed call must correspond to the one injected call
 * on every event; any real product rebuild is an extra observed call and makes
 * the structural proof red.
 */
export function setPathological(
  on: boolean,
  target?: Element,
  data?: readonly Series[],
): void {
  if (on) {
    pathologicalTarget = target;
    pathologicalSeries = normalizeSeries(data ?? []).visible.map((series) => ({
      seriesId: series.id,
      points: series.data.filter((datum) => datum.state === "present"),
    }));
    rebuilds = 0;
    document.addEventListener("pointermove", onPathologicalMove, { capture: true });
  } else {
    document.removeEventListener("pointermove", onPathologicalMove, { capture: true });
    pathologicalTarget = undefined;
    pathologicalSeries = [];
  }
}

/** Raw injected count; exact proof also requires the pointer-scope observer readings. */
export const pathologicalRebuilds = (): number => rebuilds;
