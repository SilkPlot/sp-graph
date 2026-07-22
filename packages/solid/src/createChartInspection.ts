/**
 * createChartInspection — the one inspection seam every chart composes.
 *
 * ADR-0016: pointer, touch, and keyboard write ONE active-datum state per chart,
 * and the wiring that does it — the active-datum holder, the keyboard composite,
 * and the rAF-coalesced pointer loop with its cached container rect — lives here
 * ONCE rather than in each chart. A chart supplies the family-appropriate lookup
 * (`createTimeSeriesIndex`, `createScatterIndex`, `createBandIndex` from `core`)
 * in a memo and renders the marks; it does not re-derive resolution, coordinate
 * maths, or the pointer loop. Sharing the computation is what makes the crosshair,
 * the tooltip, the emphasis, and the announcement unable to disagree about which
 * datum is active (ADR-0002 §1, §4).
 *
 * The per-event and per-frame budget is ADR-0002 §5: on a pointer event, convert
 * the coordinate against a CACHED rect, query the index, and write the signal if
 * it changed; coalesce to at most one write per frame; never rebuild the index or
 * read layout. Only one chart is under the pointer at a time, so a dashboard of
 * many charts pays for one hover loop.
 *
 * SSR-safe: `window`, `getBoundingClientRect`, and `requestAnimationFrame` are
 * touched only inside `onMount`/`onCleanup` and the pointer handlers, which run in
 * a rendered component in a browser. Nothing here runs at module load.
 */
import { type Accessor, createMemo, createEffect, on, onCleanup, onMount } from "solid-js";
import type { ActivePoint, ActivePointIndex } from "@silkplot/core";
import { useChartBounds } from "./context";
import { createActiveDatum, type ActiveDatum } from "./createActiveDatum";
import {
  createChartKeyboard,
  type ChartKeyboard,
  type ChartKeyboardRole,
} from "./createChartKeyboard";

export interface ChartInspectionSpec<D> {
  /** The lookup over current visible data + geometry, in a memo so it rebuilds
   *  only when its tracked inputs change — never in a pointer handler. */
  index: Accessor<ActivePointIndex<D>>;
  /** Page-step size for the keyboard composite. */
  pageSize?: number;
  /** The widget role for the keyboard composite. Default `"listbox"`. */
  role?: ChartKeyboardRole;
  /** Whether the pointer path is wired. Default `true` — an informative chart
   *  inspects on hover (ADR-0016 §2). The keyboard is available regardless. */
  pointer?: Accessor<boolean>;
  /** Fires on every active-point CHANGE — a hover snap, a keyboard step, a clear
   *  (`undefined`). Named for the `*Change` convention (ADR-0016 §4). */
  onActivePointChange?: (active: ActivePoint<D> | undefined) => void;
  /** ADR-0013's drill-down COMMIT — Enter or Space on the active datum. Distinct
   *  from the change notification: the user acting, not the cursor moving. */
  onActivate?: (active: ActivePoint<D>) => void;
}

export interface ChartInspection<D> {
  /** The ordinal holder pointer and keyboard both write. */
  active: ActiveDatum;
  /** The keyboard composite (single tab stop, arrows within). */
  keyboard: ChartKeyboard;
  /** The resolved active record, or `undefined` when nothing is active. */
  point: Accessor<ActivePoint<D> | undefined>;
  /** Pointer-enter handler — refreshes the cached surface rect as a hover begins,
   *  so no `window` listener is needed to keep it fresh. */
  onPointerEnter: () => void;
  /** Pointer-move handler for the interaction surface — rAF-coalesced. */
  onPointerMove: (event: PointerEvent) => void;
  /** Pointer-leave handler — clears the active point. */
  onPointerLeave: () => void;
  /** Ref setter for the surface whose rect is cached for coordinate maths. */
  setSurface: (element: HTMLElement) => void;
}

export function createChartInspection<D>(spec: ChartInspectionSpec<D>): ChartInspection<D> {
  const bounds = useChartBounds();

  const active = createActiveDatum({
    count: () => spec.index().length,
    pageSize: spec.pageSize,
  });

  // The resolved record. `at` is a pure read over the current index, so this
  // recomputes when the active ordinal or the index changes and never otherwise.
  const point = createMemo<ActivePoint<D> | undefined>(() => {
    const i = active.index();
    return i === undefined ? undefined : spec.index().at(i);
  });

  const keyboard = createChartKeyboard({
    active,
    role: spec.role,
    onActivate: spec.onActivate
      ? (index): void => {
          const resolved = spec.index().at(index);
          if (resolved !== undefined) spec.onActivate?.(resolved);
        }
      : undefined,
  });

  // The change notification. `defer: true` so mounting a chart does not fire a
  // spurious "cleared" before the reader has done anything.
  if (spec.onActivePointChange) {
    createEffect(
      on(point, (current) => spec.onActivePointChange?.(current), { defer: true }),
    );
  }

  // The pointer loop. These are plain locals, not signals: they are written on
  // every raw event and read once per frame, and making them reactive would
  // schedule work the coalescing exists to avoid.
  let surface: HTMLElement | undefined;
  let rect: DOMRect | undefined;
  let frame = 0;
  let clientX = 0;
  let clientY = 0;

  const refreshRect = (): void => {
    rect = surface?.getBoundingClientRect();
  };

  const resolve = (): void => {
    frame = 0;
    if (rect === undefined) return;
    const b = bounds();
    // Container space → inner (plot) space: subtract the element's own offset and
    // the plot margins. Exactly one owner of this conversion, so the cursor and
    // the tooltip land on the same pixel (ADR-0002 §3).
    const px = clientX - rect.left - b.margins.left;
    const py = clientY - rect.top - b.margins.top;
    const ordinal = spec.index().locate(px, py);
    active.set(ordinal < 0 ? undefined : ordinal);
  };

  // The rect is refreshed when the pointer ENTERS the surface — the one moment a
  // hover begins — rather than on a `window` resize/scroll listener. A chart that
  // resized or scrolled while the pointer was elsewhere gets a fresh rect the next
  // time it is hovered, and 48 mounted charts add NO global `window` listeners
  // (responsive containers). The read stays out of the per-move path: it is one measurement per
  // hover, not one per event.
  const onPointerEnter = (): void => {
    refreshRect();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (spec.pointer !== undefined && !spec.pointer()) return;
    clientX = event.clientX;
    clientY = event.clientY;
    // Coalesce: one scheduled resolve per frame, whatever the event rate.
    if (frame === 0) frame = requestAnimationFrame(resolve);
  };

  const onPointerLeave = (): void => {
    // Leaving the plot clears rather than clamps — a phantom active point pinned
    // at the edge is worse than none (ADR-0014 §2).
    active.clear();
  };

  const setSurface = (element: HTMLElement): void => {
    surface = element;
  };

  // Seed a measurement at mount so a first hover before any enter still resolves.
  onMount(refreshRect);
  onCleanup(() => {
    if (frame !== 0) cancelAnimationFrame(frame);
  });

  return { active, keyboard, point, onPointerEnter, onPointerMove, onPointerLeave, setSurface };
}
