/**
 * Install the theme stylesheet — the site's startup, in one place.
 *
 * This exists because it was already wrong once. The site's layout test rendered
 * `<App />` without the tokens or the site stylesheet and reported 276px of
 * horizontal overflow on a page a real browser renders cleanly. The failure was
 * entirely the test's: an unstyled page has no `overflow-x` on its scroll
 * containers, so of course everything spilled. It looked like a genuine layout
 * defect, and "fixing" the CSS to satisfy it would have been chasing a ghost.
 *
 * Startup is therefore a function both the entry point and the tests call,
 * rather than statements typed into `main.tsx` that a test has to remember to
 * imitate. A test that boots the page differently from the way the page boots is
 * not testing the page.
 *
 * Idempotent, because the tests mount many times per run and a stylesheet
 * appended once per mount would be pointless work and a misleading DOM.
 */
import { tokensToCss, focusVisibleCss } from "@silkplot/theme";

const MARKER = "data-silkplot-tokens";

export function installThemeStyles(doc: Document = document): void {
  if (doc.querySelector(`style[${MARKER}]`)) return;

  const style = doc.createElement("style");
  style.setAttribute(MARKER, "");
  // `focusVisibleCss()` is not optional decoration: without it every focusable
  // element on the page falls back to whatever the user agent draws, which is
  // what the library's own visible-focus contract exists to replace.
  style.textContent = `${tokensToCss()}\n${focusVisibleCss()}`;
  doc.head.append(style);
}
