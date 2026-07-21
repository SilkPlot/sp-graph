/**
 * ChartKeyboardSurface — the chart's single tab stop, and its parallel semantic
 * DOM layer for the active point.
 *
 * One absolutely-positioned element covering the chart, carrying the widget role
 * from `createChartKeyboard`. Tab reaches it once; the arrow keys move inside it;
 * Tab leaves. It is also where a pointer path attaches its listeners, so pointer
 * and keyboard write the same active-datum state through the same element rather
 * than through two surfaces that can drift apart.
 *
 * **The active point is a real DOM element, not just a live-region string.**
 * ADR-0005 §6: Canvas exposes no per-mark semantics, so an accessible result has
 * to come from a parallel DOM layer. That layer is here, and it is exactly ONE
 * element: the option describing the currently active point, carrying
 * `aria-setsize` and `aria-posinset` so a reader can say "3 of 30" without the
 * other twenty-nine existing. That is the ARIA-sanctioned way to expose a large
 * collection, and it is what lets the single-entry composite scale past the
 * point where rendering one node per mark would not.
 *
 * The wording of that option is the application's — see `optionLabel`. The
 * library owns the mechanics; it cannot know honestly whether a value is
 * appointments, rands, or degrees.
 */
import { Show, type Component, type JSX } from "solid-js";
import type { ChartKeyboard } from "./createChartKeyboard";

/**
 * The theme's focus-treatment class, written as a literal.
 *
 * `@silkplot/solid` never imports `@silkplot/theme` — primitives read the theme
 * through `var(--sp-…)` names they hold as literals. A class name that the
 * theme's stylesheet targets is the same kind of contract string, and is
 * duplicated here for the same reason: the dependency edge does not exist, and
 * inventing it to share one constant would invert the layering.
 *
 * A caller that supplies `class` replaces this entirely, which is the escape
 * hatch for an application with its own focus treatment.
 */
export const SP_FOCUSABLE_CLASS = "sp-focusable";

/** Clip out of view while leaving the element in the accessibility tree. */
const VISUALLY_HIDDEN: JSX.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  "white-space": "nowrap",
  "border-width": "0",
};

export interface ChartKeyboardSurfaceProps {
  /** The composite, from `createChartKeyboard`. */
  keyboard: ChartKeyboard;
  /**
   * The accessible text for the point at `index` — the application's wording.
   *
   * ADR-0005 §4 asks for at least series, x, y and units: "Bookings, Tuesday 4
   * March, 42 appointments", not a bare "42". That sentence is guidance rather
   * than law (the evidence on wording is thin), and it is domain language the
   * library cannot invent, so it arrives from here.
   */
  optionLabel: (index: number) => string;
  /** Accessible name for the composite itself. Use this or `labelledBy`. */
  label?: string;
  /** Id of existing content naming the composite. */
  labelledBy?: string;
  /** Id of content describing how to drive it, or the chart's description. */
  describedBy?: string;
  /**
   * Class on the focusable element. Defaults to the theme's focus class so the
   * surface is visibly focusable without the caller remembering to ask.
   */
  class?: string;
  /**
   * Point `aria-activedescendant` at the active option. Default: true.
   *
   * Pass false when a live region is carrying the step instead. Doing both
   * announces every step twice — the reader follows the moved active descendant
   * AND reads the live-region mutation — which is the speech-flooding failure
   * ADR-0005 §4 exists to prevent. The option element itself stays rendered
   * either way: it is the parallel semantic DOM layer, not merely an
   * announcement mechanism.
   */
  activeDescendant?: boolean;
  /**
   * Forwarded to the focusable element. A pointer path needs it to cache the
   * container rect once rather than reading layout on every event.
   */
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
  onPointerMove?: JSX.EventHandlerUnion<HTMLDivElement, PointerEvent>;
  onPointerLeave?: JSX.EventHandlerUnion<HTMLDivElement, PointerEvent>;
  onPointerDown?: JSX.EventHandlerUnion<HTMLDivElement, PointerEvent>;
  /**
   * A handler given first refusal on every keydown, BEFORE the datum composite —
   * the viewport gestures (ADR-0018 §1). Returns true when it claimed the key, in
   * which case the datum composite does not see it. This is the ordering that
   * keeps `Shift`+arrow (pan) from stepping a datum, since the datum composite
   * treats `Shift`+arrow as a plain arrow.
   */
  beforeKeyDown?: (event: KeyboardEvent) => boolean;
}

export const ChartKeyboardSurface: Component<ChartKeyboardSurfaceProps> = (props) => {
  const kb = (): ChartKeyboard => props.keyboard;
  const index = (): number | undefined => kb().active.index();

  return (
    // The four suppressions below are all the same false positive: Biome
    // resolves `role` statically, and this element's role arrives from
    // `kb().role()`. It reads the element as a static `<div>` and so reports it
    // as an uninteractive element carrying handlers, an unsupported
    // `aria-label`, and an `aria-activedescendant` without a tab stop. The
    // element is a `listbox`/`grid`/`tree` with `tabindex="0"`; every one of
    // those conditions is met. Making the role a literal to satisfy the
    // analyser would delete the choice ADR-0005 §3 deliberately leaves open.
    // biome-ignore lint/a11y/noStaticElementInteractions: role is dynamic; this is a widget, not a static div
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is dynamic; listbox/grid/tree all support aria-label
    // biome-ignore lint/a11y/useAriaActivedescendantWithTabindex: tabindex="0" is present below; Biome only matches the React-cased `tabIndex`
    <div
      ref={props.ref}
      data-silkplot-keyboard-surface=""
      class={props.class ?? SP_FOCUSABLE_CLASS}
      role={kb().role()}
      // ONE tab stop. Not one per mark — that model is rejected (ADR-0005 §3).
      tabindex="0"
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      aria-describedby={props.describedBy}
      aria-activedescendant={
        (props.activeDescendant ?? true) ? kb().activeDescendant() : undefined
      }
      onKeyDown={(event) => {
        // The viewport gestures get first refusal; a claimed key never reaches the
        // datum composite (ADR-0018 §1).
        if (props.beforeKeyDown?.(event)) return;
        kb().onKeyDown(event);
      }}
      onPointerMove={props.onPointerMove}
      onPointerLeave={props.onPointerLeave}
      onPointerDown={props.onPointerDown}
      style={{ position: "absolute", inset: "0" }}
    >
      <Show when={index() !== undefined}>
        {/*
          Deliberately NOT focusable. An option in an `aria-activedescendant`
          composite must not be a tab stop — the container holds DOM focus and
          the option is referenced, which is the entire mechanism that keeps this
          chart to one tab stop instead of one per mark. Biome's rule is written
          for the roving-focus variant of the pattern.
        */}
        {/* biome-ignore lint/a11y/useFocusableInteractive: aria-activedescendant options are referenced, never focused */}
        <div
          id={kb().optionId}
          role="option"
          aria-selected="true"
          // The collection is described, not rendered. `setsize`/`posinset` are
          // how ARIA expresses a virtualized set, and they are what make one
          // option honest rather than a claim that the chart has one point.
          aria-setsize={kb().active.count()}
          aria-posinset={index()! + 1}
          style={VISUALLY_HIDDEN}
        >
          {props.optionLabel(index()!)}
        </div>
      </Show>
    </div>
  );
};
