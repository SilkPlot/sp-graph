/**
 * createActiveDatum — the one active-datum state a chart has.
 *
 * ADR-0002 §1 puts pointer resolution in a pointer model rather than in the
 * cursor or the tooltip, so that the two primitives cannot disagree about which
 * point is active. ADR-0002 §4 extends the same rule to the keyboard: "Keyboard
 * and pointer write the same state. Not a parallel path — the same one.
 * Otherwise they drift, and only one of them gets tested."
 *
 * This is that state. It is deliberately tiny and knows nothing about pixels,
 * keys, or data: a pointer resolves a pixel to an index and calls `set`; the
 * keyboard composite calls `step`, `toFirst`, `toLast`, or `clear`. Both write
 * here, both read here, and there is no second place a chart could keep an
 * answer that disagrees.
 *
 * The index is stored rather than the datum. An index survives a data
 * replacement that produces structurally-equal-but-not-identical objects, and it
 * is what every hit index in this library already returns.
 */
import { createMemo, createSignal, type Accessor } from "solid-js";

export interface ActiveDatumSpec {
  /**
   * How many data points are navigable. An accessor, so a data replacement
   * re-clamps the active index instead of leaving it dangling past the end.
   */
  count: Accessor<number>;
  /**
   * How far Page Up / Page Down move, in points. Default: `DEFAULT_PAGE_SIZE`.
   *
   * ENGINEERING POLICY, not an evidence-backed standard — see the constant.
   */
  pageSize?: number;
}

export interface ActiveDatum {
  /** The active index, or undefined when nothing is active. */
  index: Accessor<number | undefined>;
  /** The navigable point count, as given. */
  count: Accessor<number>;
  /** Points moved by one page step. */
  pageSize: Accessor<number>;
  /**
   * Write the active index directly — the pointer path's entry point.
   *
   * Anything outside `[0, count)` clears rather than clamping: a hit index that
   * found nothing returns `-1`, and turning that into "the first point" would
   * invent a selection the user never made.
   */
  set(next: number | undefined): void;
  /** Clear the active point. Escape, and pointer-leave. */
  clear(): void;
  /**
   * Move by `delta` points, clamping at both ends.
   *
   * From no selection, a forward step selects the first point and a backward
   * step the last, so the first arrow press after Tab always lands somewhere.
   */
  step(delta: number): void;
  /** Select the first point. Home. */
  toFirst(): void;
  /** Select the last point. End. */
  toLast(): void;
}

/**
 * Points moved per Page Up / Page Down.
 *
 * **This number is an engineering policy, not a standard.** ADR-0005 §3 is
 * explicit that no dependable universal point count has been published for any
 * keyboard-navigation switch-over, and the same honesty applies here: ten is a
 * step large enough to cross a chart in a usable number of presses and small
 * enough to still land somewhere the user can reason about. It is a default to
 * be overridden per chart, not a claim about what works.
 */
export const DEFAULT_PAGE_SIZE = 10;

export function createActiveDatum(spec: ActiveDatumSpec): ActiveDatum {
  const [raw, setRaw] = createSignal<number | undefined>(undefined);

  // Clamped on READ rather than on write. A chart whose data shrinks under a
  // held selection would otherwise keep an index past the end, and every reader
  // — cursor, option label, announcement — would independently index out of
  // bounds. Clamping here means one place decides what "active" means.
  const index = createMemo(() => {
    const n = spec.count();
    const i = raw();
    if (i === undefined || n <= 0) return undefined;
    return Math.min(i, n - 1);
  });

  const pageSize = (): number => spec.pageSize ?? DEFAULT_PAGE_SIZE;

  const set = (next: number | undefined): void => {
    if (next === undefined || !Number.isInteger(next) || next < 0 || next >= spec.count()) {
      setRaw(undefined);
      return;
    }
    setRaw(next);
  };

  const step = (delta: number): void => {
    const n = spec.count();
    if (n <= 0 || delta === 0) return;
    const current = index();
    if (current === undefined) {
      setRaw(delta > 0 ? 0 : n - 1);
      return;
    }
    // Clamp, never wrap. Wrapping at the end of a time series silently teleports
    // the reader from December to January while the announcement sounds like an
    // ordinary step. ENGINEERING POLICY: clamping is the conservative choice,
    // not a researched one.
    setRaw(Math.min(n - 1, Math.max(0, current + delta)));
  };

  return {
    index,
    count: () => spec.count(),
    pageSize,
    set,
    clear: () => setRaw(undefined),
    step,
    toFirst: () => {
      if (spec.count() > 0) setRaw(0);
    },
    toLast: () => {
      const n = spec.count();
      if (n > 0) setRaw(n - 1);
    },
  };
}
