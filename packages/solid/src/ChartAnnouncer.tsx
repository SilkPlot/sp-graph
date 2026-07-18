/**
 * ChartAnnouncer — the live region that speaks committed chart state.
 *
 * This is the accessible half of the cursor/tooltip pair. The tooltip is
 * `aria-hidden` and this carries the text, because a tooltip that were itself
 * a live region would re-announce on every pointer move and reduce a screen
 * reader to noise.
 *
 * `polite` rather than `assertive`: a chart step is not an emergency, and
 * assertive would interrupt the reader mid-sentence on every move. ADR-0005 §4
 * reserves assertive for urgent or destructive outcomes, which no chart cursor
 * produces.
 *
 * It is visually hidden rather than `display: none` or `visibility: hidden` —
 * both of those remove the element from the accessibility tree, which is
 * exactly the thing that would make it silent while still looking correct in
 * the DOM.
 *
 * ## What it announces, and what it must not
 *
 * ADR-0005 §4: announce state changes the user **commits to** — a keyboard step,
 * a snapped cursor position, a committed range, a series toggle — not every
 * transient hover sample. A cursor tracking a pointer must not flood speech, so
 * a pointer-driven message belongs here only if the caller has already debounced
 * it, or has snapped it to a datum.
 *
 * ## Why it throttles, and what it does NOT promise
 *
 * Screen readers queue, coalesce, or drop rapid live-region updates, and that
 * behaviour varies materially by reader and version. So this primitive makes a
 * deliberately modest promise: **modest, de-duplicated, throttleable
 * announcements.** It does NOT promise that every message it is given is spoken,
 * and no test here or anywhere else can honestly assert that it is — what a
 * reader does with a live-region mutation is the reader's business.
 *
 * What it does guarantee, and what the tests hold it to:
 *
 *   - an unchanged message is never re-written, so a re-render cannot re-announce;
 *   - within one throttle window at most two writes occur — the leading message
 *     and, if more arrived, the last of them;
 *   - the LAST message of a burst is always written. Coalescing that dropped the
 *     final state would leave the region describing a point the user has already
 *     stepped away from, which is worse than saying nothing;
 *   - an empty message clears immediately and unthrottled, because emptying a
 *     live region announces nothing and a stale sentence is the thing being
 *     cleared.
 */
import { createEffect, createSignal, onCleanup, type Component, type JSX } from "solid-js";

const VISUALLY_HIDDEN: JSX.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  "clip-path": "inset(50%)",
  "white-space": "nowrap",
  border: "0",
};

/**
 * Minimum gap between two announcements, in milliseconds.
 *
 * **This number is an engineering policy, not an evidence-backed standard.**
 * ADR-0005 records that the evidence on announcement behaviour is thin and that
 * live-region handling varies by reader and version, so no published figure
 * would be more honest than a reasoned one. 150 ms is chosen to sit below the
 * threshold at which a deliberate arrow press feels delayed, while collapsing a
 * held arrow key — which repeats far faster — into roughly six announcements a
 * second rather than thirty. Override it per chart.
 */
export const DEFAULT_ANNOUNCE_THROTTLE_MS = 150;

export interface ChartAnnouncerProps {
  /**
   * What to announce. Give the whole sentence a reader should hear — the
   * region is read as a unit, so "Bookings, Tuesday 4 March, 42 appointments"
   * beats a bare number (ADR-0005 §4).
   *
   * Empty or undefined announces nothing, which is the no-active-point state.
   */
  message?: string;
  /** Minimum gap between announcements. Default: `DEFAULT_ANNOUNCE_THROTTLE_MS`. */
  throttleMs?: number;
}

export const ChartAnnouncer: Component<ChartAnnouncerProps> = (props) => {
  const [spoken, setSpoken] = createSignal("");

  // Mirrored in a plain variable as well as the signal. The effect below has to
  // compare against what was last written WITHOUT subscribing to it — reading
  // the signal there would make the effect its own dependency and re-run it on
  // every write it performs.
  let lastWritten = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: string | undefined;

  const write = (text: string): void => {
    lastWritten = text;
    setSpoken(text);
  };

  const openWindow = (): void => {
    timer = setTimeout(() => {
      timer = undefined;
      const next = pending;
      pending = undefined;
      // The trailing write is what makes coalescing safe: whatever the user
      // last landed on is announced, even though the steps in between were not.
      if (next !== undefined && next !== lastWritten) {
        write(next);
        openWindow();
      }
    }, props.throttleMs ?? DEFAULT_ANNOUNCE_THROTTLE_MS);
  };

  createEffect(() => {
    const text = props.message ?? "";

    if (text === lastWritten) {
      // De-duplication. A re-render that produces the same sentence is not a
      // state change the user committed to, and re-writing it is how a live
      // region starts repeating itself on every unrelated update.
      pending = undefined;
      return;
    }

    if (text === "") {
      // Clearing is not an announcement — an emptied region speaks nothing — so
      // it never waits for a window, and it never leaves a stale sentence
      // queued behind it.
      pending = undefined;
      write("");
      return;
    }

    if (timer !== undefined) {
      pending = text;
      return;
    }

    write(text);
    openWindow();
  });

  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  return (
    <div
      data-silkplot-announcer
      role="status"
      aria-live="polite"
      style={VISUALLY_HIDDEN}
    >
      {spoken()}
    </div>
  );
};
