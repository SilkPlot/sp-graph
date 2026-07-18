/**
 * createChartKeyboard — the single-entry keyboard composite.
 *
 * ADR-0005 §3 overturned the model this library previously assumed. A roving
 * `tabindex` does NOT create one tab stop per mark: roving tabindex and
 * grid-style composites keep a *single* tab stop and move focus internally with
 * the arrow keys, which is how shipping chart libraries avoid a ten-thousand-stop
 * tab order. Fully tabbable marks are rejected.
 *
 * So the model is: **Tab enters the chart once. Arrows, Home/End and Page keys
 * move inside it. Tab and Shift+Tab always exit. Escape clears the selection.**
 *
 * Two consequences are load-bearing and easy to get wrong:
 *
 *   - **`role="application"` is not the default and is not used here.** It
 *     competes with the screen reader's own browse-mode arrow keys, is not a
 *     reliable win (a documented JAWS issue leaves the virtual cursor active
 *     under it), and a proper widget role already performs the mode switch. The
 *     default here is `listbox`, whose ARIA contract is exactly what this
 *     composite implements: one tab stop, a single active option, arrow keys to
 *     move it.
 *   - **Every key this composite does not claim passes straight through.** Tab
 *     is never intercepted, so the chart can never trap navigation; Escape is
 *     only consumed when there is a selection to clear, so it still reaches a
 *     surrounding dialog from a chart with nothing to cancel.
 *
 * This is headless. It owns key semantics and ARIA relationships and renders
 * nothing — `ChartKeyboardSurface` renders it, and a chart with its own surface
 * can use this directly.
 */
import { createUniqueId, type Accessor } from "solid-js";
import type { ActiveDatum } from "./createActiveDatum";

/**
 * The widget role that defines the internal arrow-key contract.
 *
 * `listbox` — a flat, single-select collection. The default, and the honest fit
 * for the single-active-point model over one series.
 * `grid` — rows and columns; the shape a multi-series or matrix chart takes.
 * `tree` — the hierarchical overview→axes→points model ADR-0005 §3 names as the
 * runner-up for structurally rich charts.
 *
 * The role is a prop rather than a decision baked in here because ADR-0005
 * settles that a widget role defines the contract, not which one every chart
 * has forever.
 */
export type ChartKeyboardRole = "listbox" | "grid" | "tree";

export interface ChartKeyboardSpec {
  /** The one active-datum state, shared with the pointer path. */
  active: ActiveDatum;
  /** Widget role. Default: `listbox`. */
  role?: ChartKeyboardRole;
}

export interface ChartKeyboard {
  role: Accessor<ChartKeyboardRole>;
  /** The shared state, re-exposed so a surface needs only this object. */
  active: ActiveDatum;
  /**
   * The id of the element describing the active point, for
   * `aria-activedescendant`. Undefined when nothing is active, because
   * `aria-activedescendant` pointing at an element that is not rendered is worse
   * than absent — the reader follows the reference into nothing.
   */
  activeDescendant: Accessor<string | undefined>;
  /** Stable id for the rendered active-option element. */
  optionId: string;
  /**
   * The key handler for the composite's single focusable element.
   *
   * Returns true when the event was claimed, so a caller composing further
   * behaviour can tell whether the composite already consumed the key.
   */
  onKeyDown(event: KeyboardEvent): boolean;
}

export function createChartKeyboard(spec: ChartKeyboardSpec): ChartKeyboard {
  const optionId = createUniqueId();
  const active = spec.active;

  const onKeyDown = (event: KeyboardEvent): boolean => {
    // A modified arrow is a browser or assistive-technology command — word-wise
    // movement, a reader's own quick-nav. Claiming it would take a key the user
    // did not aim at the chart.
    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        active.step(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        active.step(-1);
        break;
      case "Home":
        active.toFirst();
        break;
      case "End":
        active.toLast();
        break;
      case "PageDown":
        active.step(active.pageSize());
        break;
      case "PageUp":
        active.step(-active.pageSize());
        break;
      case "Escape": {
        // Only consumed when there is something to cancel. A chart with no
        // selection must not swallow the Escape that closes the dialog it sits
        // in — "Escape cancels a submode or clears selection rather than being
        // the only way out" (ADR-0005 §3) cuts both ways.
        if (active.index() === undefined) return false;
        active.clear();
        break;
      }
      // Everything else — Tab and Shift+Tab above all — is deliberately absent.
      // Exit is not a feature the composite grants; it is a key it never takes.
      default:
        return false;
    }

    // Claimed keys are prevented so the page does not ALSO scroll: Arrow, Home,
    // End, and Page keys are all scroll commands by default, and a chart that
    // steps a point while the page jumps is unusable with a keyboard.
    event.preventDefault();
    return true;
  };

  return {
    role: () => spec.role ?? "listbox",
    active,
    activeDescendant: () => (active.index() === undefined ? undefined : optionId),
    optionId,
    onKeyDown,
  };
}
