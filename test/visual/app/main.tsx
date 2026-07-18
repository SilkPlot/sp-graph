/**
 * Visual fixture entry point.
 *
 * Mirrors the playground's wiring — the theme tokens are injected as a
 * stylesheet and the app is rendered into `#root` — so the baselines are taken
 * of the same composition path a consumer uses, not a private one built for the
 * screenshots.
 */
import { render } from "solid-js/web";
import { tokensToCss } from "@silkplot/theme";
import { App } from "./App";

const style = document.createElement("style");
style.textContent = tokensToCss();
document.head.appendChild(style);

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

render(() => <App />, root);

/**
 * `ChartRoot` measures itself with a `ResizeObserver`, so the first painted
 * frame is a chart with no bounds and the second is the real one. Signal
 * readiness only after the layout has settled, so a screenshot can never be
 * taken of the zero-size intermediate.
 *
 * Two frames rather than one: the observer callback fires before paint, and the
 * Solid update it schedules lands in the frame after that.
 */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.documentElement.setAttribute("data-visual-ready", "");
  });
});
