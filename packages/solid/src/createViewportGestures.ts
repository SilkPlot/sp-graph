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
 * It is deliberately headless. It owns key and (in later increments) pointer
 * semantics and renders nothing; the chart composes its handlers onto the one
 * interaction surface the inspection layer already owns, so a gesture and a hover
 * share a cached rect and one active-datum state and cannot describe different
 * points.
 *
 * ## The keyboard bindings (ADR-0018 §1)
 *
 * The datum-stepping composite owns the arrow keys, `Home`/`End`, the Page keys,
 * `Enter`/`Space`, and `Escape`. The viewport keys dodge all of them:
 *
 *   - `+` / `=` zoom in, `-` zoom out (the map-zoom idiom);
 *   - `Shift`+`ArrowLeft` / `Shift`+`ArrowRight` pan (a plain arrow steps a datum,
 *     and `Alt`+arrow is the browser's back/forward);
 *   - `a` autoscales y, `0` resets the viewport (the browser's own "reset to 100%").
 *
 * `Escape` is left alone — it clears the active point (ADR-0002), and a reader
 * dismissing a cursor must not also lose their zoom.
 *
 * `onKeyDown` is composed BEFORE the datum handler, and this is load-bearing: the
 * datum composite does not guard `shiftKey` on its arrow cases, so if it saw
 * `Shift`+`ArrowLeft` first it would step a datum. Running the viewport handler
 * ahead of it, claiming `Shift`+arrow, keeps the two from colliding without
 * touching the datum composite's contract.
 */
import type { Viewport } from "./createViewport";

/**
 * How far one `Shift`+arrow press pans, as a fraction of the visible span.
 *
 * ENGINEERING POLICY, not a researched constant — the same honesty the
 * datum-stepping page size carries. A quarter of the window is a step large
 * enough to make progress and small enough to keep the reader oriented; it is a
 * default, not a claim about what is optimal.
 */
export const PAN_FRACTION = 0.25;

export interface ViewportGesturesSpec {
  /** The viewport this drives — the scope's handle, shared with the chart's own
   *  command surface. */
  viewport: Viewport;
}

export interface ViewportGestures {
  /**
   * The viewport keyboard handler. Composed BEFORE the datum keyboard; returns
   * true when it claimed the key (so the datum handler is skipped), false when the
   * key is none of its business (so the datum handler, and then the page, still
   * see it).
   */
  onKeyDown(event: KeyboardEvent): boolean;
}

export function createViewportGestures(spec: ViewportGesturesSpec): ViewportGestures {
  const vp = spec.viewport;

  const panStep = (): number => {
    const { start, end } = vp.visibleMsDomain();
    return (end - start) * PAN_FRACTION;
  };

  const onKeyDown = (event: KeyboardEvent): boolean => {
    // `Ctrl`/`Cmd`/`Alt` + a key is a browser or assistive-technology command;
    // claiming it would take a key the user did not aim at the chart. `Shift` is
    // NOT excluded — it is the pan modifier below.
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
        // `=` is `+`'s unshifted twin on most layouts, so both zoom in.
        case "+":
        case "=":
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

    // A claimed key is prevented so the page does not also act on it — `Shift`+
    // arrow selects text, and a bare `-`/`0` can be a browser shortcut.
    event.preventDefault();
    return true;
  };

  return { onKeyDown };
}
