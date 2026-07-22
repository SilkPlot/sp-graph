/**
 * createViewportGestures — the adapters that drive a chart's viewport from raw
 * input (ADR-0014 §5–§7; ADR-0018).
 *
 * The viewport MODEL (`@silkplot/core`'s `viewport.ts`) and its reactive holder
 * (`createViewport`) decide what interval a navigation produces and store it; the
 * scope wiring makes that interval drive the picture. This is the last layer: it
 * turns a keypress, a wheel notch, a drag, and a pinch into the holder's command
 * calls, and nothing more — no interval arithmetic, no pixel authority of its own.
 *
 * It composes onto the ONE interaction surface the inspection layer already owns
 * (`setSurface` takes the same element), so a gesture and a hover share a cached
 * rect and one active-datum state and cannot describe different points.
 *
 * ## The keyboard bindings (ADR-0018 §1)
 *
 * The datum-stepping composite owns the arrow keys, `Home`/`End`, the Page keys,
 * `Enter`/`Space`, and `Escape`. The viewport keys dodge all of them: `+`/`=` zoom
 * in, `-` zoom out, `Shift`+arrow pans, `a` autoscales y, `0` resets. `Escape` is
 * left alone (it clears the active point). `onKeyDown` is composed BEFORE the
 * datum handler, because the datum composite does not guard `shiftKey` on its
 * arrow cases and would otherwise step a datum on `Shift`+arrow.
 *
 * ## Wheel and trackpad zoom (ADR-0018 §2; ADR-0014 §6)
 *
 * Nothing captures the wheel unless the caller opts in. With `wheelZoom`, only a
 * `Ctrl`/`Cmd`+wheel zooms — plain vertical scrolling still moves the page, which
 * is what keeps a tall dashboard of many charts scrollable. A browser reports a
 * trackpad pinch as a wheel event carrying `ctrlKey`, so trackpad pinch-to-zoom
 * resolves through the same path for free. `capturePlainWheel` is the one escape
 * hatch — a single full-bleed chart that owns the whole viewport can ask for plain
 * wheel to zoom. The zoom is anchored on the instant under the pointer, so the
 * point beneath the cursor does not slide.
 *
 * ## The budget (ADR-0014 §7)
 *
 * A wheel handler converts the pointer against a CACHED rect, coalesces every
 * notch in a frame into ONE `zoomAround`, and reads no layout per event. The rect
 * is measured once per interaction — on `pointerenter`, and on a `pointerdown`
 * that a touch may reach without an enter — NOT on a `window` resize/scroll
 * listener, so many mounted charts add no global listeners (responsive containers). The wheel
 * listener is `{ passive: false }` because a captured zoom must `preventDefault`;
 * it is the only non-passive listener. Everything is attached in `onMount` and
 * removed in `onCleanup`, so a server render reaches none of it.
 */
import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";
import type { ScaleTime } from "@silkplot/core";
import { useChartBounds } from "./context";
import type { Viewport } from "./createViewport";

/**
 * How far one `Shift`+arrow press pans, as a fraction of the visible span, and how
 * far one wheel notch zooms. ENGINEERING POLICY, not researched constants — the
 * same honesty the datum-stepping page size carries. A quarter-span pan makes
 * progress while keeping the reader oriented; a 0.85 zoom factor is a notch small
 * enough to feel continuous.
 */
export const PAN_FRACTION = 0.25;
export const WHEEL_ZOOM_IN_FACTOR = 0.85;

/**
 * The minimum pointer travel, in px, before a drag counts as a brush rather than a
 * click. Below it the gesture commits nothing — a click on the plot is not a
 * request to zoom to a zero-width interval (which the min-span floor would inflate
 * into a jarring jump). ENGINEERING POLICY, not a researched threshold.
 */
export const MIN_BRUSH_PX = 3;

/** A live brush extent, in inner (plot) pixels — what the chart renders while a
 *  drag is in flight. `x0` is where the drag began, `x1` where the pointer is now;
 *  either order is possible (a right-to-left drag is legitimate). */
export interface BrushExtent {
  x0: number;
  x1: number;
}

export interface ViewportGesturesSpec {
  /** The viewport this drives — the scope's handle, shared with the chart's own
   *  command surface. */
  viewport: Viewport;
  /** The current x scale, for converting a pointer's px to an anchor instant. A
   *  time chart always has one, so it is required. */
  xScale: Accessor<ScaleTime<number, number>>;
  /** Enable `Ctrl`/`Cmd`+wheel (and trackpad pinch) zoom. Default off. */
  wheelZoom?: Accessor<boolean | undefined>;
  /** Let PLAIN wheel zoom, for a single full-bleed chart. Default off. */
  capturePlainWheel?: Accessor<boolean | undefined>;
  /** Enable the drag-to-brush gesture (zoom to the dragged interval). Default off. */
  brushSelect?: Accessor<boolean | undefined>;
  /** Enable two-pointer pinch zoom on a touch screen. Default off. */
  pinchZoom?: Accessor<boolean | undefined>;
}

export interface ViewportGestures {
  /**
   * The viewport keyboard handler. Composed BEFORE the datum keyboard; returns
   * true when it claimed the key (so the datum handler is skipped), false
   * otherwise (so the datum handler, and then the page, still see it).
   */
  onKeyDown(event: KeyboardEvent): boolean;
  /** Ref setter for the interaction surface — the element the wheel and pointer
   *  listeners attach to. The same element the inspection layer caches. */
  setSurface(element: HTMLElement): void;
  /** The live brush extent in inner (plot) px while a drag is in flight, else
   *  `undefined`. A chart renders it as a rectangle inside its plot area. */
  brush: Accessor<BrushExtent | undefined>;
}

export function createViewportGestures(spec: ViewportGesturesSpec): ViewportGestures {
  const vp = spec.viewport;
  const bounds = useChartBounds();

  /* ---- the shared surface + its cached rect (ADR-0014 §7) ------------------ */

  // Plain locals, not signals: written on every raw event, read once per frame.
  // Making them reactive would schedule the work the coalescing exists to avoid.
  let surface: HTMLElement | undefined;
  let rect: DOMRect | undefined;

  const refreshRect = (): void => {
    rect = surface?.getBoundingClientRect();
  };

  /** A client x mapped into inner (plot) px, clamped to the plot — the space the
   *  marks, the brush rect, and the x scale all live in. */
  const innerX = (clientX: number): number => {
    if (rect === undefined) return 0;
    const x = clientX - rect.left - bounds().margins.left;
    return Math.max(0, Math.min(x, bounds().innerWidth));
  };

  /* ---- drag-to-brush (opt-in — ADR-0014 §5; ADR-0018 §3) ------------------- */

  const [brush, setBrush] = createSignal<BrushExtent | undefined>();
  let brushing = false;
  let brushMoved = false; // passed the min-travel threshold, so it is a brush not a click
  let brushStartX = 0; // inner px
  let brushLastX = 0; // inner px
  let brushPointerId = -1;
  let brushFrame = 0;

  /** End the drag — release capture, stop the paint loop, clear the rectangle.
   *  Used by a commit (`pointerup`), a cancel (`pointercancel`, `Escape`), and
   *  unmount. It does NOT itself commit an interval; the caller decides that. */
  const endBrush = (): void => {
    if (!brushing) return;
    brushing = false;
    if (brushFrame !== 0) {
      cancelAnimationFrame(brushFrame);
      brushFrame = 0;
    }
    setBrush(undefined);
    if (brushPointerId !== -1) {
      // A capture already released (or never held) throws; a lost pointer is an
      // ordinary end, not an error.
      try {
        surface?.releasePointerCapture(brushPointerId);
      } catch {
        /* already released */
      }
      brushPointerId = -1;
    }
  };

  /* ---- keyboard (always available; no opt-in — ADR-0014 §5) ---------------- */

  const panStep = (): number => {
    const { start, end } = vp.visibleMsDomain();
    return (end - start) * PAN_FRACTION;
  };

  const onKeyDown = (event: KeyboardEvent): boolean => {
    // `Escape` cancels a brush in flight (ADR-0018 §3), and only then — with no
    // brush it belongs to the datum composite, which clears the active point.
    if (event.key === "Escape") {
      if (!brushing) return false;
      endBrush();
      event.preventDefault();
      return true;
    }

    // `Ctrl`/`Cmd`/`Alt` + a key is a browser or AT command; `Shift` is the pan
    // modifier and is NOT excluded.
    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    if (event.shiftKey) {
      switch (event.key) {
        case "ArrowLeft":
          vp.pan(-panStep());
          break;
        case "ArrowRight":
          vp.pan(panStep());
          break;
        default:
          return false;
      }
    } else {
      switch (event.key) {
        case "+":
        case "=": // `+`'s unshifted twin on most layouts
          vp.zoomIn();
          break;
        case "-":
          vp.zoomOut();
          break;
        case "a":
          vp.autoscale();
          break;
        case "0":
          vp.reset();
          break;
        default:
          return false;
      }
    }
    event.preventDefault();
    return true;
  };

  /* ---- wheel / trackpad zoom (opt-in — ADR-0014 §6) ------------------------ */

  let frame = 0;
  let pendingFactor = 1;
  let pendingAnchor = 0;

  /** The instant under the pointer, in epoch ms — the zoom anchor. `innerX`
   *  returns 0 before the rect is cached, which only happens off the interaction
   *  path, so no event ever reads a stale anchor. */
  const anchorAt = (clientX: number): number =>
    spec.xScale().invert(innerX(clientX)).getTime();

  const commitZoom = (): void => {
    frame = 0;
    vp.zoomAround(pendingFactor, pendingAnchor);
    pendingFactor = 1;
  };

  const onWheel = (event: WheelEvent): void => {
    const wheelOn = spec.wheelZoom?.() ?? false;
    const plain = spec.capturePlainWheel?.() ?? false;
    const modified = event.ctrlKey || event.metaKey;
    // Zoom on a modified wheel when wheelZoom is on, or on any wheel when the
    // full-bleed escape hatch is set. Otherwise the wheel belongs to the page.
    const zoom = plain || (wheelOn && modified);
    if (!zoom) return;

    // Only now do we take the event from the page — a captured zoom preventing
    // the default scroll is the whole reason this listener is non-passive.
    event.preventDefault();

    // Scroll up / away zooms IN (the map idiom). Coalesce the frame's notches into
    // one multiplicative factor, anchored on the last pointer position.
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_IN_FACTOR : 1 / WHEEL_ZOOM_IN_FACTOR;
    pendingFactor *= factor;
    pendingAnchor = anchorAt(event.clientX);
    if (frame === 0) frame = requestAnimationFrame(commitZoom);
  };

  /* ---- brush + pinch pointer handlers -------------------------------------- */

  // Every pointer currently down on the surface, by id → its client x. Two of
  // them, with `pinchZoom` on, is a pinch; one is a (possible) brush.
  const activePointers = new Map<number, number>();
  let pinching = false;
  let pinchLastGap = 0;

  /** The horizontal gap between the two active pointers, in px. */
  const pinchGap = (): number => {
    const xs = [...activePointers.values()];
    return xs.length === 2 ? Math.abs((xs[0] as number) - (xs[1] as number)) : 0;
  };
  /** The midpoint client x of the two active pointers — the zoom anchor. */
  const pinchMidX = (): number => {
    const xs = [...activePointers.values()];
    return xs.length === 2 ? ((xs[0] as number) + (xs[1] as number)) / 2 : 0;
  };

  const paintBrush = (): void => {
    brushFrame = 0;
    if (brushing) setBrush({ x0: brushStartX, x1: brushLastX });
  };

  const onPointerDown = (event: PointerEvent): void => {
    activePointers.set(event.pointerId, event.clientX);

    // A second pointer, with pinch enabled, becomes a pinch — and supersedes any
    // brush the first pointer had started.
    if ((spec.pinchZoom?.() ?? false) && activePointers.size === 2) {
      if (brushing) endBrush();
      refreshRect(); // a touch may skip pointerenter, so measure at the gesture start
      pinching = true;
      pinchLastGap = pinchGap();
      event.preventDefault();
      return;
    }

    if (pinching) return; // a third pointer during a pinch is ignored
    if (!(spec.brushSelect?.() ?? false)) return;
    // A primary-button press only — a right-click or a secondary touch is not a
    // brush, and a second press mid-brush must not restart it.
    if (event.button !== 0 || !event.isPrimary || brushing) return;
    refreshRect(); // a touch may skip pointerenter, so measure at the gesture start
    brushing = true;
    brushMoved = false;
    brushStartX = innerX(event.clientX);
    brushLastX = brushStartX;
    brushPointerId = event.pointerId;
    // Capture so the drag keeps delivering move/up even when the pointer leaves
    // the plot — a brush that stops tracking at the edge is unusable. A pointer
    // that cannot be captured (already gone) is not a reason to abort the brush.
    try {
      surface?.setPointerCapture(event.pointerId);
    } catch {
      /* uncapturable pointer — the surface's own listeners still see the drag */
    }
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, event.clientX);

    if (pinching) {
      const gap = pinchGap();
      // Fingers moving APART widen the gap and zoom IN (span shrinks → factor < 1),
      // anchored on the midpoint. Coalesced through the same per-frame commit as
      // the wheel. A degenerate gap is skipped rather than dividing by zero.
      if (gap > 0 && pinchLastGap > 0) {
        pendingFactor *= pinchLastGap / gap;
        pendingAnchor = anchorAt(pinchMidX());
        if (frame === 0) frame = requestAnimationFrame(commitZoom);
      }
      pinchLastGap = gap;
      event.preventDefault();
      return;
    }

    if (!brushing || event.pointerId !== brushPointerId) return;
    brushLastX = innerX(event.clientX);
    if (Math.abs(brushLastX - brushStartX) >= MIN_BRUSH_PX) brushMoved = true;
    // Coalesce: one rectangle repaint per frame, whatever the pointer rate.
    if (brushFrame === 0) brushFrame = requestAnimationFrame(paintBrush);
  };

  const endPointer = (pointerId: number): void => {
    activePointers.delete(pointerId);
    // A pinch needs two pointers; losing one ends it (the survivor does NOT fall
    // back into a brush — that would zoom on a stray finger lift).
    if (pinching && activePointers.size < 2) {
      pinching = false;
      pinchLastGap = 0;
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    const wasBrushing = brushing && event.pointerId === brushPointerId;
    const moved = brushMoved;
    const scale = spec.xScale();
    const x0 = brushStartX;
    const x1 = brushLastX;
    endPointer(event.pointerId);
    if (!wasBrushing) return;
    endBrush();
    // A click below the min-travel threshold commits nothing.
    if (!moved) return;
    // The model normalises a right-to-left drag, so either order is a valid
    // request for the same interval.
    vp.brush({ start: scale.invert(x0).getTime(), end: scale.invert(x1).getTime() });
  };

  const onPointerCancel = (event: PointerEvent): void => {
    endPointer(event.pointerId);
    if (event.pointerId === brushPointerId) endBrush();
  };

  const setSurface = (element: HTMLElement): void => {
    surface = element;
  };

  onMount(() => {
    refreshRect();
    // The rect is refreshed when the pointer ENTERS the surface — the moment a
    // wheel-zoom, brush, or pinch can begin — rather than on a `window`
    // resize/scroll listener, so 48 mounted charts add NO global `window`
    // listeners (responsive containers). Every zoom/brush anchor is against a rect measured at
    // most once per interaction, never per event.
    surface?.addEventListener("pointerenter", refreshRect, { passive: true });
    // The wheel listener is non-passive so a captured zoom can preventDefault. The
    // brush uses pointer capture, so its move/up listeners sit on the surface and
    // keep firing past the plot edge.
    surface?.addEventListener("wheel", onWheel, { passive: false });
    surface?.addEventListener("pointerdown", onPointerDown);
    surface?.addEventListener("pointermove", onPointerMove);
    surface?.addEventListener("pointerup", onPointerUp);
    surface?.addEventListener("pointercancel", onPointerCancel);
  });

  onCleanup(() => {
    surface?.removeEventListener("pointerenter", refreshRect);
    surface?.removeEventListener("wheel", onWheel);
    surface?.removeEventListener("pointerdown", onPointerDown);
    surface?.removeEventListener("pointermove", onPointerMove);
    surface?.removeEventListener("pointerup", onPointerUp);
    surface?.removeEventListener("pointercancel", onPointerCancel);
    if (frame !== 0) cancelAnimationFrame(frame);
    endBrush();
  });

  return { onKeyDown, setSurface, brush };
}
