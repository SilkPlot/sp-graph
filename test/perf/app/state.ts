/**
 * The contract between the workload page and the driver script.
 *
 * The split is deliberate and it is the thing to preserve if this file is ever
 * rewritten: **gestures are real input, state changes are calls**.
 *
 * A hover, a pan, a wheel zoom, a brush, a range-control drag, and a legend
 * click are driven by Playwright as actual pointer and keyboard events, because
 * the cost of those paths includes event dispatch, coalescing, and hit
 * resolution — a page-level function that skipped straight to the resulting
 * state would measure the render and quietly omit everything the interaction
 * contract is about.
 *
 * A data replacement, a container resize, a reveal, an unmount, and a decimation
 * swap are calls on `window.__perf`, because there is no user gesture for them.
 * Synthesising a click on a harness button to trigger them would put a button's
 * event handling into a number that is supposed to be about a chart.
 */
import type { SeriesDatum } from "@silkplot/core";
import type { DecimationError } from "./decimate";
import { createInvariants, type InvariantReading } from "./instrument";

/** What the chart last reported as active — the protocol's "inspected-value read". */
export interface ActiveReading {
  seriesId: string;
  sourceIndex: number;
  /** ISO instant, so the driver compares a string rather than a re-parsed Date. */
  time: string;
  y: number | null;
}

export interface PerfApi {
  /** Which workload this page loaded. The driver asserts it got what it asked for. */
  workload: string;
  /** Points actually rendered, summed across visible series. Recorded beside every number. */
  points: number;
  /** Rows the accessible data table put in the DOM. Part of the cost, so part of the record. */
  tableRows: number;
  /** Selector for the primary interaction surface. */
  surface: string;
  /** Selector for the range control's thumbs, where the workload has one. */
  range?: string;

  invariants: {
    start(): void;
    stop(): void;
    read(): InvariantReading;
  };
  /**
   * Running totals of the two commit kinds, always counted.
   *
   * Separate from `invariants`, which is a short instrumented pass, because this
   * one answers a question that has to be asked of EVERY pass: did the gesture
   * do anything at all? A pass whose gesture silently failed to reach the chart
   * records a beautiful frame distribution — it is measuring an idle page — and
   * looks exactly like a fast one. The driver diffs these around each pass and
   * refuses to report a pass that committed nothing.
   */
  counts(): { viewport: number; active: number };
  /** The per-event index-rebuild mutation. Returns the rebuild count on the way off. */
  pathological(on: boolean): number;
  lastActive(): ActiveReading | undefined;

  /* --- Settling state changes. Each resolves with the settle time in ms. --- */
  replace?(): Promise<number>;
  resize?(width: number): Promise<number>;
  reveal?(): Promise<number>;
  unmount?(): Promise<number>;
  reset?(): Promise<number>;
  /** Cycles the next series' visibility. Called repeatedly during a recorded pass. */
  legendToggle?(): void;
  /** Cycles between "one series only" and "all series". */
  isolate?(): void;
  /** Swap the rendered series for a decimation candidate's output. */
  decimate?(candidate: DecimationChoice): Promise<number>;
  /** Every candidate scored against the raw truth. Available once `decimate` has run. */
  decimationReport?(): readonly DecimationError[];
}

export type DecimationChoice = "raw" | "min-max" | "every-nth" | "m4" | "lttb";

/** What a workload supplies. The derived members are filled in by `publish`. */
export type PerfPageApi = Omit<PerfApi, "tableRows" | "invariants" | "lastActive" | "counts">;

declare global {
  interface Window {
    __perf?: PerfApi;
  }
}

/** One instance for the page — the driver reads one set of counters. */
export const invariants = createInvariants();

let active: ActiveReading | undefined;
let viewportCommits = 0;
let activeCommits = 0;

/**
 * Record an active-datum change AND count it as a commit.
 *
 * Both, from one call site, because they are the same event seen two ways: it is
 * the value a reader would inspect, and it is one of the two things the contract
 * caps at one per frame. Separating them into two calls would eventually see one
 * of them forgotten at a new call site, and the counter would under-report in a
 * way that reads as a pass.
 */
export function noteActive(point: { seriesId: string; sourceIndex: number; datum: SeriesDatum } | undefined): void {
  active = point
    ? {
        seriesId: point.seriesId,
        sourceIndex: point.sourceIndex,
        time: point.datum.t.toISOString(),
        y: point.datum.y,
      }
    : undefined;
  activeCommits++;
  invariants.noteCommit();
}

/** A committed viewport change — the other thing capped at one per frame. */
export const noteViewport = (): void => {
  viewportCommits++;
  invariants.noteCommit();
};

export const readActive = (): ActiveReading | undefined => active;

export const readCounts = (): { viewport: number; active: number } => ({
  viewport: viewportCommits,
  active: activeCommits,
});

/** Count the rows the alternative table put in the DOM, whatever produced them. */
export const countTableRows = (): number =>
  document.querySelectorAll("[data-silkplot-alternative] tbody tr").length;

/**
 * Publish the page's half of the contract and signal readiness.
 *
 * Readiness is set two frames after publication for the same reason the visual
 * fixture waits two: `ChartRoot` measures itself with a `ResizeObserver`, so the
 * first painted frame is a chart with no bounds and the second is the real one.
 * A harness that started its warm-up on the first frame would spend part of it
 * measuring a zero-size chart, and a zero-size chart is fast.
 */
export function publish(api: PerfPageApi): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__perf = {
        ...api,
        // Counted at publication rather than declared by the workload: the rows
        // are the library's output, and a hand-written count would be a claim
        // about it rather than a reading of it.
        tableRows: countTableRows(),
        invariants: {
          start: () => invariants.start(),
          stop: () => invariants.stop(),
          read: () => invariants.read(),
        },
        lastActive: readActive,
        counts: readCounts,
      };
      document.documentElement.setAttribute("data-perf-ready", "");
    });
  });
}
