/**
 * Resolution path B — a consumer whose bundler has never heard of Solid.
 *
 * No `vite-plugin-solid`, so the "solid" condition is never offered and every
 * `@silkplot/*` import resolves through "default" to the compiled ESM bundle,
 * with "types" serving the declarations beside it. This is the path that did not
 * exist before ADR-0006, and the one nothing inside the workspace exercises: the
 * workspace always passes "source", and the playground always passes "solid".
 *
 * Deliberately a `.ts` file with no JSX. There is no JSX transform configured
 * here at all — which is the point. `createComponent` is Solid's own runtime
 * entry point and needs none, so this file proves the compiled bundle loads and
 * runs without borrowing any part of the Solid-aware toolchain.
 */
import { createSignal, createComponent } from "solid-js";
import { render } from "solid-js/web";
import { LineChart } from "@silkplot/charts";
import { tokensToCss } from "@silkplot/theme";
import { extentOf } from "@silkplot/core";
import { initial, replacement, type Point } from "./series";

const style = document.createElement("style");
style.textContent = tokensToCss();
document.head.append(style);

const root = document.getElementById("root");
if (root === null) throw new Error("no #root");

const [series, setSeries] = createSignal<Point[]>(initial);

(globalThis as Record<string, unknown>).__silkplotReplace = () => setSeries(replacement);
(globalThis as Record<string, unknown>).__silkplotExtent = () => extentOf(series(), (d) => d.y);

const container = document.createElement("div");
container.style.width = "640px";
container.style.height = "320px";
root.append(container);

render(
  () =>
    createComponent(LineChart, {
      get data() {
        return series();
      },
      title: "Release consumer — default condition",
      desc: "Five daily readings, 1–5 January 2026, values 9 to 27.",
      curve: "linear",
    }),
  container,
);

(globalThis as Record<string, unknown>).__silkplotReady = "default";
