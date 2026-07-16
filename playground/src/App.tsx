/**
 * Playground app — renders a real @silkplot/charts LineChart from sample data.
 *
 * This is the end-to-end proof: @silkplot/core computes scales/paths/ticks,
 * @silkplot/solid renders the SVG + axes, @silkplot/charts composes them, and
 * @silkplot/theme supplies the tokens — all wired across workspace packages.
 */
import { createSignal, type Component } from "solid-js";
import { LineChart, type TimePoint } from "@silkplot/charts";
import { cssVar } from "@silkplot/theme";

/** Deterministic sample series: 30 days of a wandering value. */
function makeSeries(days: number): TimePoint[] {
  const start = new Date("2026-01-01T00:00:00Z").getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  let value = 20;
  const out: TimePoint[] = [];
  for (let i = 0; i < days; i++) {
    // Deterministic pseudo-random walk (no Math.random — stable across renders).
    const wobble = Math.sin(i / 3) * 6 + Math.cos(i / 7) * 3;
    value = Math.max(2, 20 + wobble + i * 0.4);
    out.push({ t: new Date(start + i * dayMs), y: Math.round(value * 10) / 10 });
  }
  return out;
}

export const App: Component = () => {
  const [series] = createSignal<TimePoint[]>(makeSeries(30));

  return (
    <main
      style={{
        "font-family": "system-ui, sans-serif",
        "max-width": "820px",
        margin: "0 auto",
        padding: cssVar("space-xl"),
        color: cssVar("color-text"),
        background: cssVar("color-surface"),
        "min-height": "100vh",
      }}
    >
      <header style={{ "margin-bottom": cssVar("space-lg") }}>
        <h1 style={{ margin: "0 0 4px" }}>SilkPlot</h1>
        <p style={{ margin: 0, color: cssVar("color-muted") }}>
          D3 computes, Solid renders. A live <code>LineChart</code> — axes computed
          from scales, no <code>d3-axis</code>.
        </p>
      </header>

      <section
        style={{
          width: "100%",
          height: "360px",
          border: `1px solid ${cssVar("color-grid")}`,
          "border-radius": cssVar("radius-lg"),
          padding: cssVar("space-md"),
          "box-sizing": "border-box",
        }}
      >
        <LineChart
          data={series()}
          title="Sample daily series, January 2026"
          stroke={cssVar("color-focus-ring")}
          strokeWidth={2}
        />
      </section>

      <p style={{ "margin-top": cssVar("space-lg"), color: cssVar("color-muted") }}>
        Resize the window — <code>ChartRoot</code> re-measures via
        <code> ResizeObserver</code> and every scale, path, and tick recomputes
        through Solid memos.
      </p>
    </main>
  );
};
