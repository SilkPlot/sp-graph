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
import type { SeriesDatum, ViewportCause } from "@silkplot/core";
import {
  canonicalJson,
  compositionPublication,
  tableModeFromQuery,
  type TableMode,
} from "./composition-revision";
import type { DecimationError } from "./decimate";
import { invariants, type InvariantReading } from "./instrument";
import type { ActiveReading } from "./perf-types";

export type { ActiveReading } from "./perf-types";

export interface PerfApi {
	/** Per-server nonce injected by Vite so a driver cannot measure a stale server. */
	serverToken: string;
  /** Which workload this page loaded. The driver asserts it got what it asked for. */
  workload: string;
  /** Public-safe composition identity. Timing verdicts are ineligible without it. */
  compositionRevision: string;
  /** Digest of the canonical composition manifest published with this page. */
  compositionDigest: string;
  /** Machine-readable composition manifest for this revision. */
  compositionManifest: unknown;
  /** Derived table is the default surface; none is attribution-only. */
  tableMode: TableMode;
  /** Points actually rendered, summed across visible series. Recorded beside every number. */
  points: number;
  /** Rows the accessible data table put in the DOM. Part of the cost, so part of the record. */
  tableRows: number;
  /** Selector for the primary interaction surface. */
  surface: string;
  /** Selector for the range control's thumbs, where the workload has one. */
  range?: string;
	/** Observed paint count under an explicit product decimation budget. */
	paintDecimation?: {
		budget: number;
		drawnPoints(): number | null;
	};

  invariants: {
    start(): void;
    stop(): void;
    read(): InvariantReading;
  };
  /**
   * Running totals of the independently observable commit kinds, always counted.
   *
   * Separate from `invariants`, which is a short instrumented pass, because this
   * one answers a question that has to be asked of EVERY pass: did the gesture
   * do anything at all? A pass whose gesture silently failed to reach the chart
   * records a beautiful frame distribution — it is measuring an idle page — and
   * looks exactly like a fast one. The driver diffs these around each pass and
   * refuses to report a pass that committed nothing.
   */
  counts(): { viewport: number; active: number; reset: number; visibility: number };
  /** The per-event mutation. Returns its raw injected-build count on the way off. */
  pathological(on: boolean): number;
  lastActive(): ActiveReading | undefined;
  inspectionExpected?(choice: DecimationChoice, fraction: number): ActiveReading | undefined;
  inspectionTarget?(fraction: number): {
    rawDomainFraction: number;
    plotFraction: number;
    targetTime: string;
    appliedDomain: readonly [string, string];
  } | undefined;

  /* --- Settling state changes. Each resolves with the settle time in ms. --- */
  replace?(): Promise<number>;
  resize?(width: number): Promise<number>;
  reveal?(): Promise<number>;
  unmount?(): Promise<number>;
  reset?(): Promise<number>;
  /** Programmatic composition state: cycles between one series and all series. */
  isolate?(): void;
  /** Swap the rendered series for a decimation candidate's output. */
  decimate?(candidate: DecimationChoice): Promise<number>;
  /** Every candidate scored against the raw truth. Available once `decimate` has run. */
  decimationReport?(): readonly DecimationError[];
}

export type DecimationChoice = "raw" | "min-max" | "every-nth" | "m4" | "lttb";

/** What a workload supplies. The derived members are filled in by `publish`. */
export type PerfPageApi = Omit<
	PerfApi,
	| "serverToken"
	| "tableRows"
	| "invariants"
	| "lastActive"
	| "counts"
	| "compositionRevision"
	| "compositionDigest"
	| "compositionManifest"
	| "tableMode"
> & {
	tableMode?: TableMode;
};

declare global {
  interface ImportMetaEnv {
    readonly VITE_PERF_SERVER_TOKEN?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    __perf?: PerfApi;
  }
}

let active: ActiveReading | undefined;
let viewportCommits = 0;
let activeCommits = 0;
let resetCommits = 0;
let visibilityCommits = 0;

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
export const noteViewport = (cause?: ViewportCause): void => {
  viewportCommits++;
  if (cause === "reset") resetCommits++;
  invariants.noteCommit();
};

/** A committed visible-series change, distinct from incidental pointer state. */
export const noteVisibility = (): void => {
  visibilityCommits++;
  invariants.noteCommit();
};

/** Whether the controlled visible-series value actually changed. */
export const visibilityStateChanged = (
  before: readonly string[],
  after: readonly string[],
): boolean =>
  before.length !== after.length || before.some((id, index) => id !== after[index]);

export const readActive = (): ActiveReading | undefined => active;

export const readCounts = (): {
  viewport: number;
  active: number;
  reset: number;
  visibility: number;
} => ({
  viewport: viewportCommits,
  active: activeCommits,
  reset: resetCommits,
  visibility: visibilityCommits,
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
      const revision = compositionPublication();
      const tableMode = api.tableMode ?? tableModeFromQuery(location.search);
      window.__perf = {
        ...api,
        ...revision,
        tableMode,
		serverToken: import.meta.env.VITE_PERF_SERVER_TOKEN ?? "",
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
      const root = document.documentElement;
      root.setAttribute("data-perf-ready", "");
      root.setAttribute("data-perf-composition-revision", revision.compositionRevision);
      root.setAttribute("data-perf-composition-digest", revision.compositionDigest);
      let manifest = document.querySelector("[data-perf-composition-manifest]");
      if (!manifest) {
        manifest = document.createElement("script");
        manifest.setAttribute("type", "application/json");
        manifest.setAttribute("data-perf-composition-manifest", "");
        document.head.appendChild(manifest);
      }
      manifest.textContent = canonicalJson(revision.compositionManifest);
    });
  });
}
