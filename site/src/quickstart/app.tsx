/**
 * The five-minute quickstart, as a real file.
 *
 * This is not a snippet in a paragraph — it is a module in the site's own
 * `src/`, so `tsc -b` typechecks it on every CI run against the same public
 * exports a consumer installs. If an export is renamed or a signature changes,
 * this file stops compiling and CI goes red, which is the only reliable way a
 * quickstart stays true.
 *
 * It is displayed on the site by reading this file's own bytes, never by
 * retyping them.
 */
import { render } from "solid-js/web";
import { LineChart, type TimePoint } from "@silkplot/charts";
import { tokensToCss, focusVisibleCss } from "@silkplot/theme";

// 1. Inject the design tokens once, at startup. Charts read their colours,
//    spacing, and type scale from these CSS custom properties, which is what
//    makes light/dark, high-contrast, and reduced-motion work without any
//    per-chart configuration. `focusVisibleCss()` carries the visible-focus
//    treatment; ship it or keyboard users lose the focus ring.
const style = document.createElement("style");
style.textContent = `${tokensToCss()}\n${focusVisibleCss()}`;
document.head.append(style);

// 2. Your data. `TimePoint` is `{ t: Date, y: number }`.
const bookings: TimePoint[] = [
  { t: new Date("2026-03-02"), y: 31 },
  { t: new Date("2026-03-03"), y: 42 },
  { t: new Date("2026-03-04"), y: 38 },
  { t: new Date("2026-03-05"), y: 55 },
];

// 3. Render. `title` is required on an informative chart — an unnamed one is a
//    compile error, not a runtime warning. `summary` and `table.columns` carry
//    the wording only your application knows.
function App() {
  return (
    <LineChart
      data={bookings}
      height={300}
      title="Weekly bookings"
      summary="Bookings rose from 31 on Monday to 55 on Thursday."
      table={{ columns: ["Day", "Bookings"] }}
    />
  );
}

const root = document.getElementById("root");
if (root) render(() => <App />, root);
