/**
 * Workload page entry point.
 *
 * Mirrors the playground's and the visual fixture's wiring — theme tokens
 * injected as a stylesheet, app rendered into `#root` — so what is measured is
 * the composition path a consumer uses. A private faster path would produce
 * numbers about a page nobody ships.
 *
 * Readiness is NOT signalled here. Each workload calls `publish` when its own
 * surface is mounted, and `publish` sets `data-perf-ready` two frames later.
 * Signalling from this file would mark the page ready before the chart had
 * measured itself, and the harness's warm-up would spend part of its second on a
 * zero-size chart — which is fast, and would quietly improve every number.
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
