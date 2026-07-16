/* SilkPlot playground entry. Proves the workspace wires together end to end. */
import { render } from "solid-js/web";
import { tokensToCss } from "@silkplot/theme";
import { App } from "./App";

// Inject the theme tokens as CSS custom properties (dark/contrast/motion aware).
const style = document.createElement("style");
style.textContent = tokensToCss();
document.head.appendChild(style);

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

render(() => <App />, root);
