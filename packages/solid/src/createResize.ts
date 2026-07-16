/**
 * createResize — measure an element's content box reactively.
 *
 * SSR-safe: no `window`, `document`, or `ResizeObserver` is touched at module
 * top level or during server render. All DOM work happens in `onMount`, and is
 * torn down in `onCleanup`. Returns a signal of the current size.
 */
import { createSignal, onMount, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";

export interface Size {
  width: number;
  height: number;
}

export interface CreateResizeReturn {
  /** Reactive current size of the observed element. */
  size: Accessor<Size>;
  /** Ref setter — pass to the element you want measured: `ref={setTarget}`. */
  setTarget: (el: HTMLElement) => void;
}

/**
 * Observe an element and expose its size as a signal. Usage:
 *
 * ```tsx
 * const { size, setTarget } = createResize();
 * return <div ref={setTarget}>{size().width} x {size().height}</div>;
 * ```
 */
export function createResize(initial: Size = { width: 0, height: 0 }): CreateResizeReturn {
  const [size, setSize] = createSignal<Size>(initial);
  const [target, setTarget] = createSignal<HTMLElement>();

  onMount(() => {
    const el = target();
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      // `contentBoxSize` is the modern path; fall back to contentRect.
      const box = entry.contentBoxSize?.[0];
      if (box) {
        setSize({ width: box.inlineSize, height: box.blockSize });
      } else {
        const rect = entry.contentRect;
        setSize({ width: rect.width, height: rect.height });
      }
    });

    observer.observe(el);
    // Seed an initial measurement so the first paint has real numbers.
    setSize({ width: el.clientWidth, height: el.clientHeight });

    onCleanup(() => observer.disconnect());
  });

  return { size, setTarget };
}
