/**
 * RangeControl — the accessible, touch-usable navigator over a chart's viewport
 * (ADR-0019).
 *
 * The gestures ([ADR-0018](../decisions/adr-0018-viewport-gesture-bindings.md))
 * move the viewport but leave its extent invisible. This is the visible partner:
 * a one-dimensional track whose full width is the data's full time extent, with a
 * selected WINDOW (the visible domain) shown as a band between two handles. It is
 * a **view and input adapter** — it reads `fullExtent` and `visibleDomain` and
 * writes `visibleDomain` through `onVisibleDomainChange`, and holds no viewport
 * state of its own, so it cannot drift from the chart the application wires to the
 * same domain (ADR-0019 §3).
 *
 * ## Three sliders (ADR-0019 §1)
 *
 * The track carries three `role="slider"` elements — a **window body** that pans,
 * a **start handle** and an **end handle** that resize — tabbed in the order
 * window → start → end and wrapped in a labelled group. Each is a real slider with
 * `aria-valuemin`/`max`/`now` in epoch ms and an application-supplied
 * `aria-valuetext`; a screen reader announces the value as the thumb moves, which
 * is the announcement (no second live region doubles it).
 *
 * ## The keyboard (ADR-0019 §2)
 *
 * A handle moves its own edge; the window pans. Fine is `Arrow`, coarse is `Page`,
 * `Home`/`End` go to the thumb's own limit, and `0` on the window resets to the
 * full extent. A handle cannot cross the other past `minSpan`. Every claimed key
 * is prevented so the page does not also scroll; every unclaimed key passes
 * through, so Tab always leaves.
 *
 * ## The budget (ADR-0014 §7; ADR-0019 §5)
 *
 * A pointer drag caches the track rect once, coalesces to one commit per
 * `requestAnimationFrame`, releases capture and removes nothing from `window`
 * (its listeners are on the track and the captured pointer), and cancels any
 * pending frame on unmount. Nothing is touched at module load, so a server render
 * reaches none of it.
 */
import { type JSX, createMemo, createUniqueId, onCleanup, type Component } from "solid-js";
import {
  DEFAULT_MIN_SPAN_MS,
  clampInterval,
  slideIntoBound,
  spanOf,
  toMsInterval,
  toTimeInterval,
  type MsInterval,
  type TimeInterval,
  type ViewportCause,
} from "@silkplot/core";
import { SP_FOCUSABLE_CLASS } from "./ChartKeyboardSurface";
import { MIN_TARGET_PX } from "./Legend";

/** The fraction of the FULL extent one fine (`Arrow`) step moves, and one coarse
 *  (`Page`) step. Engineering policy, not researched — a fine press makes a
 *  visible move, ten coarse presses cross the overview (ADR-0019 §2). */
export const FINE_STEP_FRACTION = 0.01;
export const COARSE_STEP_FRACTION = 0.1;

export interface RangeControlProps {
  /** The full data time extent — the track's whole width (`Date`, ADR-0017). */
  fullExtent: TimeInterval;
  /** The current visible window — the selected band (`Date`). */
  visibleDomain: TimeInterval;
  /** Fired on every committed change, cause `"range-control"`, `Date` at the
   *  boundary. A controlled parent wires this and `visibleDomain` to the same
   *  state as its chart. */
  onVisibleDomainChange: (domain: TimeInterval, cause: ViewportCause) => void;
  /** The zoom-in floor in ms; a handle cannot narrow the window below it. */
  minSpan?: number;
  /** Track width in px. Default 320. */
  width?: number;
  /** Track height in px; clamped to the 24px target floor. Default 40. */
  height?: number;
  /** Accessible name for the control group. Default "Time range". */
  label?: string;
  /** Human-readable text for a handle's value, e.g. an ISO instant. Default: the
   *  ISO string. Supply domain wording (a formatted date) for a real chart. */
  valueText?: (ms: number, which: "start" | "end" | "window") => string;
  /** An optional density drawing behind the track (a miniature of the data). It is
   *  `aria-hidden` and never load-bearing — the control is fully usable without it
   *  (ADR-0019 §4). */
  density?: JSX.Element;
  class?: string;
}

type Thumb = "window" | "start" | "end";

/** The reachable range of a thumb, in ms, given the window and the extent. */
function limitsOf(thumb: Thumb, visible: MsInterval, full: MsInterval, minSpan: number): {
  min: number;
  max: number;
} {
  if (thumb === "start") return { min: full.start, max: visible.end - minSpan };
  if (thumb === "end") return { min: visible.start + minSpan, max: full.end };
  // The window body's "value" is its start; it may slide until its far edge meets
  // the extent, so its start ranges over [full.start, full.end - span].
  return { min: full.start, max: full.end - spanOf(visible) };
}

/** Apply a new ms value to a thumb, producing the resulting window (clamped). */
function moveThumb(thumb: Thumb, value: number, visible: MsInterval, full: MsInterval): MsInterval {
  if (thumb === "start") return { start: value, end: visible.end };
  if (thumb === "end") return { start: visible.start, end: value };
  // The window keeps its span and slides so its start sits at `value`.
  return slideIntoBound(
    { start: value, end: value + spanOf(visible) },
    full,
  );
}

export const RangeControl: Component<RangeControlProps> = (props) => {
  const full = createMemo<MsInterval>(() => toMsInterval(props.fullExtent));
  const visible = createMemo<MsInterval>(() =>
    clampInterval(toMsInterval(props.visibleDomain), full()),
  );
  const minSpan = (): number => props.minSpan ?? DEFAULT_MIN_SPAN_MS;
  const width = (): number => props.width ?? 320;
  const height = (): number => Math.max(MIN_TARGET_PX, props.height ?? 40);
  const groupId = createUniqueId();

  const fullSpan = (): number => Math.max(1, spanOf(full()));
  const toPx = (ms: number): number => ((ms - full().start) / fullSpan()) * width();
  const toMs = (px: number): number => full().start + (px / width()) * fullSpan();

  const valueText = (ms: number, which: Thumb): string =>
    props.valueText?.(ms, which) ?? new Date(ms).toISOString();

  /** Commit a window, clamped to the extent, if it actually moved. */
  const commit = (next: MsInterval): void => {
    const clamped = clampInterval(next, full());
    if (clamped.start === visible().start && clamped.end === visible().end) return;
    props.onVisibleDomainChange(toTimeInterval(clamped), "range-control");
  };

  /* ---- keyboard ------------------------------------------------------------ */

  const step = (coarse: boolean): number =>
    fullSpan() * (coarse ? COARSE_STEP_FRACTION : FINE_STEP_FRACTION);

  const onKeyDown = (thumb: Thumb, event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const v = visible();
    const f = full();
    const { min, max } = limitsOf(thumb, v, f, minSpan());
    const clampVal = (value: number): number => Math.max(min, Math.min(value, max));
    const current = thumb === "end" ? v.end : v.start;

    let next: MsInterval | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = moveThumb(thumb, clampVal(current + step(false)), v, f);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = moveThumb(thumb, clampVal(current - step(false)), v, f);
        break;
      case "PageUp":
        next = moveThumb(thumb, clampVal(current + step(true)), v, f);
        break;
      case "PageDown":
        next = moveThumb(thumb, clampVal(current - step(true)), v, f);
        break;
      case "Home":
        next = moveThumb(thumb, min, v, f);
        break;
      case "End":
        next = moveThumb(thumb, max, v, f);
        break;
      case "0":
        // Reset is the window's key: back to the full extent.
        if (thumb !== "window") return;
        next = { start: f.start, end: f.end };
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  };

  /* ---- pointer ------------------------------------------------------------- */

  let track: HTMLDivElement | undefined;
  let rect: DOMRect | undefined;
  let dragThumb: Thumb | undefined;
  let dragPointerId = -1;
  let grabOffsetMs = 0; // window drag: pointer-to-start offset, so the window does not jump
  let frame = 0;
  let pendingMs = 0;

  const trackPx = (clientX: number): number => {
    if (rect === undefined) return 0;
    return Math.max(0, Math.min(clientX - rect.left, width()));
  };

  const applyDrag = (): void => {
    frame = 0;
    if (dragThumb === undefined) return;
    const v = visible();
    const f = full();
    if (dragThumb === "window") {
      const targetStart = pendingMs - grabOffsetMs;
      commit(moveThumb("window", targetStart, v, f));
      return;
    }
    const { min, max } = limitsOf(dragThumb, v, f, minSpan());
    commit(moveThumb(dragThumb, Math.max(min, Math.min(pendingMs, max)), v, f));
  };

  const onPointerDown = (thumb: Thumb, event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary) return;
    rect = track?.getBoundingClientRect();
    dragThumb = thumb;
    dragPointerId = event.pointerId;
    grabOffsetMs = thumb === "window" ? toMs(trackPx(event.clientX)) - visible().start : 0;
    try {
      track?.setPointerCapture(event.pointerId);
    } catch {
      /* uncapturable pointer — the track's own listeners still see the drag */
    }
    event.preventDefault();
    event.stopPropagation();
  };

  /** A drag on the empty track creates a selection from the press to the release,
   *  brushing a new window rather than moving an existing edge. */
  const onTrackPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary) return;
    rect = track?.getBoundingClientRect();
    const at = toMs(trackPx(event.clientX));
    dragThumb = "end";
    dragPointerId = event.pointerId;
    // Anchor the start at the press and drag the end; a right-to-left drag is
    // handled because `moveThumb("end")` past the start is clamped by `limitsOf`.
    commit({ start: at, end: at + minSpan() });
    try {
      track?.setPointerCapture(event.pointerId);
    } catch {
      /* uncapturable */
    }
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (dragThumb === undefined || event.pointerId !== dragPointerId) return;
    pendingMs = toMs(trackPx(event.clientX));
    if (frame === 0) frame = requestAnimationFrame(applyDrag);
  };

  const endDrag = (event: PointerEvent): void => {
    if (event.pointerId !== dragPointerId) return;
    // A release before the pending frame fired would otherwise drop the final
    // move — apply it now, then cancel, so a fast drag commits where it ended.
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      applyDrag();
    }
    dragThumb = undefined;
    dragPointerId = -1;
    try {
      track?.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  onCleanup(() => {
    if (frame !== 0) cancelAnimationFrame(frame);
  });

  /* ---- render -------------------------------------------------------------- */

  const startX = (): number => toPx(visible().start);
  const endX = (): number => toPx(visible().end);

  /** A slider thumb's live ARIA values. The `aria-*` are written LITERALLY on each
   *  element (not spread) so the static analyser can see a valid slider. */
  const sliderInfo = (thumb: Thumb): { min: number; max: number; now: number; text: string } => {
    const v = visible();
    const now = thumb === "end" ? v.end : v.start;
    const { min, max } = limitsOf(thumb, v, full(), minSpan());
    return { min, max, now, text: valueText(now, thumb) };
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a slider track is a group of sliders, not a <fieldset>
    <div
      role="group"
      aria-label={props.label ?? "Time range"}
      aria-describedby={groupId}
      class={props.class}
      data-silkplot-range-control=""
      style={{ position: "relative", width: `${width()}px`, height: `${height()}px` }}
    >
      {/* The instruction the group is described by — how to drive it. */}
      <span id={groupId} style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0,0,0,0)" }}>
        Drag the handles to resize the visible time window, or the window to move it. Arrow keys adjust; Page keys move further; Home and End jump to the ends; 0 resets.
      </span>

      {/* The track, and an optional density drawing behind it. The track owns the
          pointer move/up because a captured pointer retargets here. */}
      <div
        ref={track}
        data-silkplot-range-track=""
        style={{ position: "absolute", inset: "0" }}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div aria-hidden="true" style={{ position: "absolute", inset: "0", "pointer-events": "none" }}>
          {props.density}
        </div>
      </div>

      {/* The selected window — a slider that pans. Its fill is the selection
          colour at low opacity so the band reads over the track without hiding a
          density drawing behind it. */}
      {/* biome-ignore lint/a11y/useFocusableInteractive: tabindex="0" is present; Biome only matches the React-cased tabIndex */}
      <div
        role="slider"
        tabindex="0"
        aria-orientation="horizontal"
        aria-label="Selected time window"
        aria-valuemin={sliderInfo("window").min}
        aria-valuemax={sliderInfo("window").max}
        aria-valuenow={sliderInfo("window").now}
        aria-valuetext={sliderInfo("window").text}
        class={SP_FOCUSABLE_CLASS}
        data-silkplot-range-window=""
        onKeyDown={(event) => onKeyDown("window", event)}
        onPointerDown={(event) => onPointerDown("window", event)}
        style={{
          position: "absolute",
          top: "0",
          bottom: "0",
          left: `${startX()}px`,
          width: `${Math.max(0, endX() - startX())}px`,
          background: "var(--sp-color-cursor, currentColor)",
          opacity: "0.15",
          "touch-action": "none",
        }}
      />

      {/* The two handles — sliders that resize. Each is at least the target width,
          centred on its edge, so the hit area clears 24px even when the visible
          bar inside it is thin. The bar carries the visible contrast; the wider
          div is the target. */}
      {(["start", "end"] as const).map((which) => (
        // biome-ignore lint/a11y/useFocusableInteractive: tabindex="0" is present; Biome only matches the React-cased tabIndex
        <div
          role="slider"
          tabindex="0"
          aria-orientation="horizontal"
          aria-label={which === "start" ? "Range start" : "Range end"}
          aria-valuemin={sliderInfo(which).min}
          aria-valuemax={sliderInfo(which).max}
          aria-valuenow={sliderInfo(which).now}
          aria-valuetext={sliderInfo(which).text}
          class={SP_FOCUSABLE_CLASS}
          data-silkplot-range-handle={which}
          onKeyDown={(event) => onKeyDown(which, event)}
          onPointerDown={(event) => onPointerDown(which, event)}
          style={{
            position: "absolute",
            top: "0",
            bottom: "0",
            left: `${(which === "start" ? startX() : endX()) - MIN_TARGET_PX / 2}px`,
            width: `${MIN_TARGET_PX}px`,
            display: "flex",
            "justify-content": "center",
            "touch-action": "none",
          }}
        >
          {/* The visible bar — a solid line in the cursor colour, centred in the
              target. `pointer-events: none` so the whole target grabs the drag. */}
          <span
            aria-hidden="true"
            style={{
              width: "3px",
              height: "100%",
              background: "var(--sp-color-cursor, currentColor)",
              "pointer-events": "none",
            }}
          />
        </div>
      ))}
    </div>
  );
};
