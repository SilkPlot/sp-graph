import { LineChart, type TimePoint } from "@silkplot/charts";
import { THEME_ATTR, seriesChannel } from "@silkplot/theme";
import { createSignal, type Component } from "solid-js";

// Charts read their colours from CSS custom properties, so theming is a
// stylesheet concern, not a prop drilled through every component. Inject
// `tokensToCss()` once at app startup (see the quickstart), then force a scheme
// on any subtree by setting the theme attribute on an ancestor.
//
// Contrast and motion are deliberately NOT attribute-controllable: they are
// user-agent preferences, so an app cannot override someone who asked for more
// contrast or less motion.

const series: TimePoint[] = [
  { t: new Date("2026-03-02"), y: 18 },
  { t: new Date("2026-03-03"), y: 27 },
  { t: new Date("2026-03-04"), y: 22 },
  { t: new Date("2026-03-05"), y: 34 },
  { t: new Date("2026-03-06"), y: 41 },
];

const Example: Component = () => {
  const [scheme, setScheme] = createSignal<"light" | "dark">("dark");

  return (
    <div {...{ [THEME_ATTR]: scheme() }}>
      <button
        type="button"
        onClick={() => setScheme(scheme() === "dark" ? "light" : "dark")}
      >
        Switch to {scheme() === "dark" ? "light" : "dark"}
      </button>

      <LineChart
        data={series}
        height={240}
        // `seriesChannel(i)` returns the colour AND the redundant non-colour
        // channels — dash pattern and marker shape — so series stay
        // distinguishable without relying on colour alone.
        stroke={seriesChannel(0).color}
        title="Throughput"
        summary="Throughput climbs from 18 to 41 across the week."
        table={{ columns: ["Day", "Requests per second"] }}
      />
    </div>
  );
};

export default Example;
