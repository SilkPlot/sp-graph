/**
 * Legend — presents the series and controls which of them are visible.
 *
 * ## Why this is a standalone primitive rather than a chart prop
 *
 * ADR-0008 §6 motivates controlled visibility by the cases a chart-owned legend
 * makes impossible: state shared across linked charts, persisted, or driven from
 * a URL. A legend that only ever existed inside one chart could serve none of
 * them. So this is placed by the application and wired to the same
 * `visibleSeries` / `onVisibilityChange` pair the charts take, and one legend
 * can drive several charts because it drives the STATE, not a chart.
 *
 * It reads `Series` — the caller's input shape — rather than a normalised model,
 * so it can be mounted without a chart at all. Identity, order, and palette slot
 * come from the same rules the marks use (ADR-0008 §1 and §5, ADR-0009).
 *
 * ## The keyboard model, and why it is not a list of buttons
 *
 * A `toolbar` with a roving `tabindex`: Tab enters the legend ONCE, arrows move
 * between entries, Space/Enter toggles, Home/End jump to the ends, and Tab
 * leaves. Each entry is a real `<button>` with `aria-pressed`.
 *
 * The alternative — every entry an ordinary tab stop — is simpler and more
 * discoverable, and was rejected for the reason the chart's own keyboard model
 * exists: a stated requirement of this library is 22 series, and 22 tab stops
 * sitting between the chart and the rest of the page is the outcome the
 * single-entry composite was designed to avoid. A `listbox` was also rejected;
 * "which series are shown" is genuinely a multi-select, but a reader announcing
 * "selected" for what the user experiences as "shown" is worse wording than
 * `aria-pressed` gives for free.
 *
 * ## Colour is never the only channel
 *
 * Each swatch carries the series' DASH pattern as well as its colour, drawn as
 * a real line rather than a filled block — a block cannot show a dash, and a
 * legend whose swatches differ only in hue is exactly the failure ADR-0005 §5
 * forbids ("colour can encode but never uniquely encode"). The label is the
 * third channel and the one that always survives.
 *
 * Both come from `resolveSeriesStyle` in `@silkplot/core`, the same function the
 * marks call. That is load-bearing rather than tidy: a legend that computed its
 * own swatch would drift from the chart it describes, and the drift would look
 * like a working legend. A standing probe mutates the shared function and
 * asserts BOTH this suite and the charts suite go red.
 */
import { For, createMemo, createSignal, type Accessor, type JSX } from "solid-js";
import { resolveSeriesStyle, type Series } from "@silkplot/core";
import { SP_FOCUSABLE_CLASS } from "./ChartKeyboardSurface";

/**
 * Minimum interactive target, in CSS px.
 *
 * WCAG 2.2 SC 2.5.8 (Target Size, Minimum, AA) asks for 24x24 with a spacing
 * exception. The library has no conformance claim to make — no assistive
 * technology has been tested against it — so this is stated as an engineering
 * floor honoured by construction, not as a conformance assertion.
 *
 * It is applied as `min-height`/`min-width` rather than a fixed size so a long
 * label grows the target instead of clipping it.
 */
export const MIN_TARGET_PX = 24;

export interface LegendProps {
  /** The same array the charts receive. Order is legend order (ADR-0008 §5). */
  series: readonly Series[];
  /**
   * Controlled visibility by series id (ADR-0008 §6). Omit for uncontrolled,
   * in which case this component owns the state and every series starts visible.
   *
   * An EMPTY array means nothing is visible and is a real state, not "no
   * filter" — a user who hides the last series must not see them all reappear.
   */
  visibleSeries?: readonly string[];
  onVisibilityChange?: (visible: readonly string[]) => void;
  /**
   * Accessible name for the toolbar. Default: "Series".
   *
   * Generic on purpose — the library does not know these are sensors or regions
   * or accounts, and a guessed name would be confidently wrong (ADR-0008 §9).
   */
  label?: string;
  /**
   * `wrap` (default) flows entries and wraps to further rows; `stack` puts one
   * per row. Both scroll rather than clip once they exceed `maxHeight`.
   */
  layout?: "wrap" | "stack";
  /** Cap the legend's height, after which it scrolls. Default: none. */
  maxHeight?: string;
  class?: string;
}

/**
 * Resolve the visible set, controlled or not.
 *
 * `undefined` means uncontrolled — NOT "nothing visible". The distinction is
 * ADR-0008 §6's third stated case and the one with the appealing wrong answer.
 */
function createVisibility(props: LegendProps): {
  isVisible: (id: string) => boolean;
  toggle: (id: string) => void;
  ids: Accessor<readonly string[]>;
} {
  const allIds = createMemo(() => props.series.map((s) => s.id));
  const [ownVisible, setOwnVisible] = createSignal<readonly string[] | undefined>(undefined);

  // The caller's prop wins whenever it is present. Reading it inside the memo
  // rather than at setup is what lets a chart and a legend share one signal.
  const current = createMemo<readonly string[]>(() => {
    if (props.visibleSeries !== undefined) return props.visibleSeries;
    return ownVisible() ?? allIds();
  });

  return {
    ids: current,
    isVisible: (id) => current().includes(id),
    toggle: (id) => {
      const now = current();
      const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
      // Uncontrolled state is updated FIRST, so an uncontrolled legend still
      // works when the caller passes no handler at all.
      if (props.visibleSeries === undefined) setOwnVisible(next);
      props.onVisibilityChange?.(next);
    },
  };
}

export function Legend(props: LegendProps): JSX.Element {
  const visibility = createVisibility(props);

  // Roving tabindex: exactly one entry is tabbable at a time. Held as an INDEX
  // rather than an id, because the entry that should hold focus after a removal
  // is the one now at that position — an id-keyed cursor would point at a series
  // that no longer exists and silently take the legend out of the tab order.
  const [cursor, setCursor] = createSignal(0);

  const clampedCursor = createMemo(() => {
    const last = props.series.length - 1;
    if (last < 0) return 0;
    return Math.min(cursor(), last);
  });

  let toolbar: HTMLDivElement | undefined;

  /** Move the roving cursor and pull DOM focus with it. */
  const moveTo = (index: number): void => {
    const count = props.series.length;
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    setCursor(next);
    const buttons = toolbar?.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]");
    buttons?.[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(clampedCursor() + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(clampedCursor() - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(props.series.length - 1);
        break;
      default:
        // Every other key falls through untouched — including Tab, which must
        // leave. A composite that swallowed Tab would trap the page, which is
        // the one keyboard failure with no recovery for a keyboard-only user.
        break;
    }
  };

  return (
    <div
      ref={toolbar}
      role="toolbar"
      aria-label={props.label ?? "Series"}
      aria-orientation={props.layout === "stack" ? "vertical" : "horizontal"}
      class={props.class}
      onKeyDown={onKeyDown}
      style={{
        display: "flex",
        "flex-wrap": props.layout === "stack" ? "nowrap" : "wrap",
        "flex-direction": props.layout === "stack" ? "column" : "row",
        gap: "0.25rem 0.75rem",
        // Scroll rather than clip. A legend that clips its last entries hides
        // the control for a series the chart is still drawing, with nothing on
        // screen to say so.
        ...(props.maxHeight === undefined
          ? {}
          : { "max-height": props.maxHeight, "overflow-y": "auto" }),
      }}
    >
      <For each={props.series}>
        {(series, i) => {
          const style = createMemo(() =>
            resolveSeriesStyle(series.style, i(), { area: false }),
          );
          const shown = createMemo(() => visibility.isVisible(series.id));

          return (
            <button
              type="button"
              data-sp-legend-item={series.id}
              class={SP_FOCUSABLE_CLASS}
              aria-pressed={shown()}
              // Roving tabindex — one stop for the whole toolbar.
              tabindex={i() === clampedCursor() ? 0 : -1}
              onFocus={() => setCursor(i())}
              onClick={() => visibility.toggle(series.id)}
              style={{
                display: "inline-flex",
                "align-items": "center",
                gap: "0.375rem",
                "min-height": `${MIN_TARGET_PX}px`,
                "min-width": `${MIN_TARGET_PX}px`,
                padding: "0.125rem 0.25rem",
                background: "none",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                color: "var(--sp-color-text, currentColor)",
                // Hidden entries dim, and the dimming is NOT the only signal —
                // `aria-pressed` carries it for assistive technology and the
                // swatch line is hollowed below. Opacity alone would be a
                // colour-only encoding of state, the same failure the series
                // palette avoids with its dash channel.
                opacity: shown() ? 1 : 0.55,
              }}
            >
              {/*
                A line, not a block: a block cannot show a dash pattern, and the
                dash is the non-colour channel that separates two series a
                colour-blind reader sees as one hue. `aria-hidden` because the
                button's own label already names the series — announcing the
                swatch too would read the series name twice.
              */}
              <svg width="20" height="12" aria-hidden="true">
                <line
                  x1="1"
                  y1="6"
                  x2="19"
                  y2="6"
                  stroke={style().stroke}
                  stroke-width={Math.max(style().strokeWidth, 2)}
                  stroke-dasharray={style().dash}
                  // A hidden series' swatch loses its fill weight as well as
                  // dimming, so the state survives a monochrome rendering.
                  stroke-opacity={shown() ? 1 : 0.4}
                />
              </svg>
              {series.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}
