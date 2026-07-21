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
 * is cached on mount and invalidated on resize and ancestor scroll. The wheel
 * listener is `{ passive: false }` because a captured zoom must `preventDefault`;
 * it is the only non-passive listener. Everything is attached in `onMount` and
 * removed in `onCleanup`, so a server render reaches none of it.
 */
import { type Accessor, onCleanup, onMount } from "solid-js";
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

export interface ViewportGesturesSpec {
  /** The viewport this drives — the scope's handle, shared with the chart's own
   *  command surface. */
  viewport: Viewport;
  /** The current x scale, for converting a pointer's px to an anchor instant.
   *  Absent → wheel/pointer gestures fall back to the visible centre. */
  xScale?: Accessor<ScaleTime<number, number>>;
  /** Enable `Ctrl`/`Cmd`+wheel (and trackpad pinch) zoom. Default off. */
  wheelZoom?: Accessor<boolean | undefined>;
  /** Let PLAIN wheel zoom, for a single full-bleed chart. Default off. */
  capturePlainWheel?: Accessor<boolean | undefined>;
}

export interface ViewportGestures {
  /**
   * The viewport keyboard handler. Composed BEFORE the datum keyboard; returns
   * true when it claimed the key (so the datum handler is skipped), false
   * otherwise (so the datum handler, and then the page, still see it).
   */
  onKeyDown(event: KeyboardEvent): boolean;
  /** Ref setter for the interaction surface — the element the wheel (and, later,
   *  pointer) listeners attach to. The same element the inspection layer caches. */
  setSurface(element: HTMLElement): void;
}

export function createViewportGestures(spec: ViewportGesturesSpec): ViewportGestures {
  const vp = spec.viewport;
  const bounds = useChartBounds();

  /* ---- keyboard (always available; no opt-in — ADR-0014 §5) ---------------- */

  const panStep = (): number => {
    const { start, end } = vp.visibleMsDomain();
    return (end - start) * PAN_FRACTION;
  };

  const onKeyDown = (event: KeyboardEvent): boolean => {
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

  // Plain locals, not signals: written on every raw event, read once per frame.
  // Making them reactive would schedule the work the coalescing exists to avoid.
  let surface: HTMLElement | undefined;
  let rect: DOMRect | undefined;
  let frame = 0;
  let pendingFactor = 1;
  let pendingAnchor = 0;

  const refreshRect = (): void => {
    rect = surface?.getBoundingClientRect();
  };

  /** The instant under the pointer, in epoch ms — the zoom anchor. Falls back to
   *  the visible centre when there is no scale or no cached rect yet. */
  const anchorAt = (clientX: number): number => {
    const scale = spec.xScale?.();
    const current = vp.visibleMsDomain();
    if (scale === undefined || rect === undefined) {
      return (current.start + current.end) / 2;
    }
    const innerX = clientX - rect.left - bounds().margins.left;
    return scale.invert(innerX).getTime();
  };

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

  const setSurface = (element: HTMLElement): void => {
    surface = element;
  };

  onMount(() => {
    refreshRect();
    // The wheel listener is non-passive so a captured zoom can preventDefault. The
    // rect is invalidated on resize and ANY ancestor scroll, so a wheel event
    // never reads layout to stay correct.
    surface?.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", refreshRect, { passive: true });
    window.addEventListener("scroll", refreshRect, { passive: true, capture: true });
  });

  onCleanup(() => {
    surface?.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", refreshRect);
    window.removeEventListener("scroll", refreshRect, { capture: true });
    if (frame !== 0) cancelAnimationFrame(frame);
  });

  return { onKeyDown, setSurface };
}
