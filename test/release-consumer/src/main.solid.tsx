/**
 * Resolution path A — a Solid-aware consumer.
 *
 * `vite-plugin-solid` adds the "solid" export condition, so every `@silkplot/*`
 * import here resolves to the package's shipped TSX **source** and this app's own
 * bundler compiles the JSX for its own target. That is the path the "solid"
 * condition exists to serve, and the reason it must never be "simplified" to the
 * compiled entry.
 *
 * Written as ordinary application code — JSX, a signal, a chart — because that is
 * what has to work. If this file needs a workaround, so does every consumer.
 */
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { LineChart } from "@silkplot/charts";
import { tokensToCss } from "@silkplot/theme";
import { extentOf } from "@silkplot/core";
import { initial, replacement, type Point } from "./series";

const style = document.createElement("style");
style.textContent = tokensToCss();
document.head.append(style);

function App() {
  const [series, setSeries] = createSignal<Point[]>(initial);

  // Exposed so the browser smoke can replace the data from outside the bundle
  // and watch the marks follow. A chart that renders once and then ignores its
  // data is pixel-identical to a correct one in a screenshot; the only way to
  // tell them apart is to change the data and look again.
  (globalThis as Record<string, unknown>).__silkplotReplace = () => setSeries(replacement);
  (globalThis as Record<string, unknown>).__silkplotExtent = () =>
    extentOf(series(), (d) => d.y);

  return (
    <div style={{ width: "640px", height: "320px" }}>
      <LineChart
        data={series()}
        title="Release consumer — Solid condition"
        desc="Five daily readings, 1–5 January 2026, values 9 to 27."
        curve="linear"
      />
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("no #root");
render(() => <App />, root);

(globalThis as Record<string, unknown>).__silkplotReady = "solid";
