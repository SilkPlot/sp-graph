/**
 * Site entry point.
 *
 * The startup itself lives in `installThemeStyles` so the tests can perform the
 * identical boot rather than an approximation of it — see that file for the
 * defect that cost.
 */
import { render } from "solid-js/web";
import { installThemeStyles } from "./install-styles";
import { App } from "./App";
import "./styles.css";

installThemeStyles();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Site root element #root is missing from index.html.");
}

render(() => <App />, root);
