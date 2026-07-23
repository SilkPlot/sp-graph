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
 * Each instrument states what it can and cannot see. The layout-read counter
 * observes a real DOM API and is direct evidence. The commit counter observes
 * callbacks the page itself owns and is direct evidence. Index reconstruction
 * inside the library is NOT observable from out here, and nothing below pretends
 * otherwise — see `setPathological`.
 */
import type { SeriesDatum } from "@silkplot/core";

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
/* Commits per frame, and layout reads inside pointer dispatch                 */
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
}

export interface Invariants {
  /** Called from every viewport or active-point callback the page owns. */
  noteCommit(): void;
  start(): void;
  stop(): void;
  read(): InvariantReading;
}

/**
 * The commit and layout-read counters.
 *
 * `getBoundingClientRect` is patched on the prototype while watching and restored
 * when it stops. That is intrusive, and it is why watching is a separate short
 * pass rather than something left on during the frame measurements: a patched
 * hot DOM method would put the instrument's own cost into the numbers it is
 * standing next to.
 *
 * "Inside a pointer event" is bracketed by a capture-phase listener on the
 * document (which runs before any handler on any element) and a bubble-phase
 * listener on the window (which runs after all of them). Anything that reads
 * layout between those two points did so synchronously inside the dispatch,
 * which is exactly the claim being tested. Work deferred to a rAF callback lands
 * outside the bracket and is correctly not counted — deferring is the fix, so
 * counting it would be counting the fix as the defect.
 */
export function createInvariants(): Invariants {
  let commits = 0;
  let maxPerFrame = 0;
  let framesWithCommits = 0;
  let thisFrame = 0;
  let layoutReads = 0;
  let pointerEvents = 0;
  let inPointer = false;
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

  const enter = (): void => {
    inPointer = true;
    pointerEvents++;
  };
  const leave = (): void => {
    inPointer = false;
  };

  return {
    noteCommit() {
      if (!watching) return;
      commits++;
      thisFrame++;
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
      Element.prototype.getBoundingClientRect = function patched(this: Element) {
        if (inPointer) layoutReads++;
        return original.call(this);
      };
      document.addEventListener("pointermove", enter, { capture: true });
      window.addEventListener("pointermove", leave, { capture: false });
      raf = requestAnimationFrame(endFrame);
    },
    stop() {
      if (!watching) return;
      watching = false;
      Element.prototype.getBoundingClientRect = original;
      document.removeEventListener("pointermove", enter, { capture: true });
      window.removeEventListener("pointermove", leave, { capture: false });
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
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* The per-event index-rebuild mutation                                        */
/* -------------------------------------------------------------------------- */

let pathologicalTarget: Element | undefined;
let pathologicalData: readonly SeriesDatum[] = [];
let rebuilds = 0;

/**
 * Rebuild a hit index. Deliberately the whole thing, deliberately every time.
 *
 * A stand-in for the regression, not a copy of the library's index — but a
 * FAITHFUL stand-in, which matters more than it sounds. `createTimeSeriesIndex`
 * builds a lookup by walking every visible point, projecting it through the
 * current scale, and sorting the result. An imitation that only read timestamps
 * and sorted them would do perhaps a third of that work, and would then report
 * "this workload cannot detect a per-event rebuild" about a rebuild half the
 * size of the real one. Under-stating the mutation biases the answer toward
 * *non-discriminating*, which reads as caution and is actually just a wrong
 * measurement — so the projection pass is here on purpose.
 *
 * What it must NOT do is grow until it breaches. Tuning a control until it
 * produces the verdict you wanted is fitting the instrument to the answer; the
 * size of this work is set by what the library does, and the verdict is whatever
 * falls out of that.
 */
function rebuildIndex(data: readonly SeriesDatum[]): number {
  const n = data.length;
  const positions: number[] = new Array(n);
  // A linear projection per point, standing in for the scale call: the same
  // per-point arithmetic and the same array write, without reaching into the
  // library to borrow its scale.
  const first = data[0]?.t.getTime() ?? 0;
  const last = data[n - 1]?.t.getTime() ?? 1;
  const span = last - first || 1;
  for (let i = 0; i < n; i++) {
    const d = data[i] as SeriesDatum;
    positions[i] = ((d.t.getTime() - first) / span) * 1000;
  }
  positions.sort((a, b) => a - b);
  rebuilds++;
  return positions.length;
}

const onPathologicalMove = (): void => {
  // A synchronous layout read AND a full index rebuild, in the handler, on every
  // event — the two things the contract forbids, done on purpose.
  pathologicalTarget?.getBoundingClientRect();
  rebuildIndex(pathologicalData);
};

/**
 * Turn the mutation on or off.
 *
 * What this proves, precisely: whether this workload is DENSE ENOUGH to
 * discriminate. If the clean pass and the mutated pass produce the same frame
 * distribution, then this workload could not have detected the regression either
 * way, and the clean pass's green result is reported as *non-discriminating*
 * rather than as a pass. That is the whole reason it exists — the hover
 * harness's 30-point fixture passed at every throttle rate for exactly this
 * reason and nobody could tell, for a year, that the number meant nothing.
 *
 * What this does NOT prove: that the library is not itself rebuilding an index
 * per event. That happens inside `createChartInspection` and is not observable
 * from a page. The evidence for the library's behaviour is indirect and stated
 * as such — a clean pass sitting far below the mutated pass is a chart that is
 * not doing this work, because if it were, it would cost what this costs.
 */
export function setPathological(on: boolean, target?: Element, data?: readonly SeriesDatum[]): void {
  if (on) {
    pathologicalTarget = target;
    pathologicalData = data ?? [];
    rebuilds = 0;
    document.addEventListener("pointermove", onPathologicalMove, { capture: true });
  } else {
    document.removeEventListener("pointermove", onPathologicalMove, { capture: true });
    pathologicalTarget = undefined;
    pathologicalData = [];
  }
}

/** How many rebuilds the mutation performed — proof it was actually applied. */
export const pathologicalRebuilds = (): number => rebuilds;
