/**
 * Repaint Canvas when scheme × contrast tokens change.
 *
 * SVG `stroke="var(--sp-color-axis)"` follows the cascade live. A Canvas
 * bitmap does not: `createStyleResolver` reads the used token at paint time
 * and the pixels stay that colour until the next paint. The site theme
 * switcher (`data-sp-theme`), a themed subtree, and `prefers-contrast: more`
 * all change `--sp-color-*` without resizing the chart, so a plot that only
 * paints from `bounds` keeps the previous surface's ticks.
 *
 * Contrast is media-only (ADR-0001 / ADR-0004). There is no `data-sp-contrast`
 * to observe; `prefers-contrast` is the signal.
 */
import { createSignal, onCleanup, onMount } from "solid-js";
import { THEME_ATTR } from "@silkplot/theme";

const SCHEME_QUERY = "(prefers-color-scheme: dark)";
const CONTRAST_QUERY = "(prefers-contrast: more)";

/** Subscribe to scheme, contrast, and `data-sp-theme` mutations. Returns unsubscribe. */
export function subscribeThemeRevision(onChange: () => void): () => void {
  const scheme = window.matchMedia(SCHEME_QUERY);
  const contrast = window.matchMedia(CONTRAST_QUERY);
  scheme.addEventListener("change", onChange);
  contrast.addEventListener("change", onChange);
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [THEME_ATTR],
    subtree: true,
  });
  return () => {
    scheme.removeEventListener("change", onChange);
    contrast.removeEventListener("change", onChange);
    mo.disconnect();
  };
}

/** A Solid signal that increments whenever the cascade's colour tokens may have moved. */
export function createThemeRevision(): () => number {
  const [rev, setRev] = createSignal(0);
  onMount(() => {
    const stop = subscribeThemeRevision(() => setRev((n) => n + 1));
    onCleanup(stop);
  });
  return rev;
}
