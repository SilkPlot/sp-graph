/**
 * Typed examples for ADR-0014 — the interaction and viewport contract.
 *
 * WHAT THIS FILE IS. Typed examples of every shape ADR-0014 introduces, checked
 * by the compiler rather than only read.
 *
 * It is written BEFORE the implementation, because the decision is deliberately
 * settled ahead of the components that consume it — the same posture ADR-0008's
 * examples began in. At the time of writing there is nothing to import for the
 * interaction surface: Part 1 DECLARES the contract's types, and Part 2 exercises
 * them. That proves the contract is expressible, that the metadata generic flows
 * through the active-point record and the callbacks without a cast, and that
 * every state named in the ADR is representable.
 *
 * THE OBLIGATION. When the implementation ships, each declaration in Part 1
 * becomes an import from the package that builds it, and every example in Part 2
 * must compile UNCHANGED. If an example has to be edited, the implementation
 * diverged from the decision — so edit the implementation, or supersede the ADR.
 * Do not edit the example to fit the code. This is the same rule the series
 * contract file states and has since discharged for its own halves.
 *
 * WHAT IT IS NOT. It is not a test of runtime behaviour: it type-checks shapes
 * and does not call the library. The suites do that.
 */

/* ------------------------------------------------------------------------- */
/* Part 1 — the contract.                                                     */
/*                                                                            */
/* The series datum and series shapes are IMPORTED — they are ADR-0008's, and  */
/* they are built. Everything ADR-0014 introduces is DECLARED, and each         */
/* declaration becomes an import when its phase lands, under the rule above.    */
/* ------------------------------------------------------------------------- */

// ADR-0008 §1, §3 — the shipped series types this contract carries and returns.
import type { Series, SeriesDatum } from "@silkplot/core";
export type { Series, SeriesDatum } from "@silkplot/core";

/**
 * ADR-0014 §1 — the one active-datum record, written by pointer, touch, and
 * keyboard alike and read by the cursor, tooltip, emphasis, and announcement.
 *
 * `M` is the caller's metadata type from ADR-0008 §3. It threads through `datum`
 * and `atTime` so a caller who supplied a serial number gets it back with its
 * own type, not `unknown` and not `any`.
 */
export interface ActivePoint<M = unknown> {
  seriesId: string;
  /** Into the caller's array, not a filtered or sorted copy (ADR-0008 §5). */
  sourceIndex: number;
  datum: SeriesDatum<M>;
  /** Inner coordinates — the space the cursor and tooltip draw in (ADR-0002). */
  position: { x: number; y: number };
  /** The active position along the domain axis. */
  at:
    | { kind: "time"; time: Date }
    | { kind: "category"; category: string };
  /** Every VISIBLE series' value at `at`, for a shared time cursor. Absent for
   *  a scatter or a bar, where there is no shared instant to read across. */
  atTime?: readonly { seriesId: string; datum: SeriesDatum<M> }[];
}

/** ADR-0014 §3 — an absolute-instant interval. Not zoned civil time. */
export interface TimeInterval {
  start: Date;
  end: Date;
}

/**
 * ADR-0014 §3, §7 — why a controlled viewport moved. A controlled caller reads
 * the cause to label the change and to avoid feeding the same interval back in a
 * loop.
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

/** ADR-0014 §3 — controlled/uncontrolled viewport, on ADR-0008 §6's pattern. */
export interface ViewportStateProps {
  /** Absent → uncontrolled, defaulting to the full extent. Present → controlled. */
  visibleDomain?: TimeInterval;
  defaultVisibleDomain?: TimeInterval;
  onVisibleDomainChange?: (domain: TimeInterval, cause: ViewportCause) => void;
  /** ADR-0014 §3 — the zoom-in floor. Defaults to a small non-zero interval. */
  minSpan?: number;
}

/**
 * ADR-0014 §5, §6 — the capture opt-in. Every field defaults to the safe value:
 * nothing captures the page's scroll or focus unless the caller asks.
 */
export interface ViewportCaptureProps {
  /** Enable Ctrl/Cmd+wheel (and trackpad pinch) zoom. Default: off. */
  wheelZoom?: boolean;
  /** Enable two-finger pinch zoom on touch. Default: off. */
  pinchZoom?: boolean;
  /** Enable the drag-to-brush gesture. Default: off. */
  brushSelect?: boolean;
  /** The escape hatch of ADR-0014 §6: let PLAIN wheel zoom, for a single
   *  full-bleed chart. Never the default — it trades page scroll for zoom. */
  capturePlainWheel?: boolean;
}

/**
 * ADR-0014 §5 — the viewport commands, exposed so an application renders its own
 * toolbar without reaching into private state.
 */
export interface ViewportCommands {
  zoomIn: () => void;
  zoomOut: () => void;
  autoscale: () => void;
  reset: () => void;
}

/** ADR-0014 §1 — activation surface, carrying the record and the caller's `M`. */
export interface ActivationProps<M = unknown> {
  /** Absent → uncontrolled. Exactly one active point per chart (ADR-0008 §8). */
  activePoint?: ActivePoint<M> | undefined;
  onActivate?: (active: ActivePoint<M> | undefined) => void;
}

/** The interactive time-series surface this contract describes. */
export interface InteractiveTimeSeriesProps<M = unknown>
  extends ViewportStateProps,
    ViewportCaptureProps,
    ActivationProps<M> {
  series: readonly Series<M>[];
}

/* ------------------------------------------------------------------------- */
/* Part 2 — the shapes the contract must support.                             */
/* ------------------------------------------------------------------------- */

const t = (iso: string): Date => new Date(iso);

/**
 * THE RECORD, with the metadata generic flowing through. `active.datum.meta` and
 * every entry of `active.atTime` carry `Reading`, not `unknown` — the property
 * this example exists to prove.
 */
interface Reading {
  serial: string;
  firmware: string;
}

export const withMetadata: InteractiveTimeSeriesProps<Reading> = {
  series: [
    {
      id: "probe-a",
      label: "Probe A",
      data: [
        { t: t("2026-03-01T00:00:00Z"), y: 18.2, meta: { serial: "PA-99120", firmware: "2.4.1" } },
      ],
    },
  ],
  onActivate: (active) => {
    if (active === undefined) return; // Clearing is `undefined`, not a sentinel.
    // Same type on the way out. No cast, no parallel metadata map.
    const serial: string | undefined = active.datum.meta?.serial;
    // And across every visible series at the active instant.
    const others: readonly (string | undefined)[] =
      active.atTime?.map((s) => s.datum.meta?.serial) ?? [];
    void serial;
    void others;
  },
};

/**
 * A SHARED TIME CURSOR reads `atTime`; a scatter or bar record does not carry it.
 * This shows a consumer handling both without a cast.
 */
export const readActive = (active: ActivePoint<Reading> | undefined): string => {
  if (active === undefined) return "";
  if (active.at.kind === "category") return active.at.category;
  const count = active.atTime?.length ?? 0;
  return `${active.at.time.toISOString()} — ${count} series`;
};

/** UNCONTROLLED VIEWPORT. Absent props → the chart owns navigation, full extent. */
export const uncontrolledViewport: InteractiveTimeSeriesProps = {
  series: [
    { id: "n", label: "North", data: [{ t: t("2026-03-01T00:00:00Z"), y: 12 }] },
  ],
  // Opt in to navigation. Plain wheel still scrolls the page (ADR-0014 §6).
  wheelZoom: true,
  brushSelect: true,
};

/**
 * CONTROLLED VIEWPORT with a default, a minimum span, and a cause-reading change
 * handler. Handing `undefined` back to `visibleDomain` would revert to
 * uncontrolled — it is not "show everything".
 */
export const controlledViewport: InteractiveTimeSeriesProps = {
  series: uncontrolledViewport.series,
  visibleDomain: { start: t("2026-03-01T06:00:00Z"), end: t("2026-03-01T12:00:00Z") },
  defaultVisibleDomain: { start: t("2026-03-01T00:00:00Z"), end: t("2026-03-02T00:00:00Z") },
  minSpan: 60_000, // never zoom below one minute
  onVisibleDomainChange: (domain, cause) => {
    // The cause lets a controlled caller ignore the echo of its own set and not
    // loop. A `reset` lands on `defaultVisibleDomain`; a `resize` keeps the
    // interval and only remaps pixels.
    void `${cause}: ${domain.start.toISOString()}–${domain.end.toISOString()}`;
  },
};

/**
 * AN APPLICATION DRIVING A QUERY RANGE from the viewport — ADR-0014 §8. The
 * library crosses the boundary with exactly one callback; the fetch, the
 * aggregation, and the loading state are the application's, and the library
 * promises nothing about them.
 */
declare function fetchRange(start: Date, end: Date): Promise<readonly Series[]>;
declare function setLoadedSeries(series: readonly Series[]): void;

export const applicationOwnedFetch: InteractiveTimeSeriesProps = {
  series: uncontrolledViewport.series,
  wheelZoom: true,
  onVisibleDomainChange: (domain, cause) => {
    // Fetch only on a settled navigation, not on a resize or a clamp echo.
    if (cause === "resize" || cause === "clamp" || cause === "replacement") return;
    void fetchRange(domain.start, domain.end).then(setLoadedSeries);
  },
};

/**
 * THE COMMAND SURFACE. An application renders its own toolbar over these rather
 * than reaching into private state (ADR-0014 §5). A hook or ref would hand back a
 * `ViewportCommands`; here we type a consumer of one.
 */
export const toolbar = (commands: ViewportCommands): readonly (() => void)[] => [
  commands.zoomIn,
  commands.zoomOut,
  commands.autoscale,
  commands.reset,
];

/**
 * THE FULL-BLEED ESCAPE HATCH. A single chart that owns the whole viewport can
 * ask for plain-wheel zoom explicitly — the one place ADR-0014 §6 trades page
 * scroll for zoom, and only on request.
 */
export const fullBleed: InteractiveTimeSeriesProps = {
  series: uncontrolledViewport.series,
  wheelZoom: true,
  capturePlainWheel: true,
};
