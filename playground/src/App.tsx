/**
 * Playground app — renders a real @silkplot/charts LineChart from sample data.
 *
 * This is the end-to-end proof: @silkplot/core computes scales/paths/ticks,
 * @silkplot/solid renders the SVG + axes, @silkplot/charts composes them, and
 * @silkplot/theme supplies the tokens — all wired across workspace packages.
 */
import { createSignal, type Component, type JSX } from "solid-js";
import {
  LineChart,
  AreaChart,
  BarChart,
  ScatterChart,
  type TimePoint,
  type CategoryPoint,
  type XYPoint,
} from "@silkplot/charts";
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

/** Categories including a negative, so the zero baseline is visible. */
const CATEGORIES: CategoryPoint[] = [
  { label: "Mon", y: 12 },
  { label: "Tue", y: 19 },
  { label: "Wed", y: -6 },
  { label: "Thu", y: 8 },
  { label: "Fri", y: 15 },
];

/** Deterministic 2-D cloud — a lattice with a sine offset, no Math.random. */
function makeCloud(n: number): XYPoint[] {
  const out: XYPoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: (i % 10) * 4 + Math.sin(i) * 1.5, y: Math.cos(i / 2) * 10 + i * 0.3 });
  }
  return out;
}

const Panel: Component<{ title: string; note: string; children: JSX.Element }> = (props) => (
  <section style={{ "margin-bottom": cssVar("space-lg") }}>
    <h2 style={{ margin: "0 0 2px", "font-size": "15px" }}>{props.title}</h2>
    <p style={{ margin: "0 0 6px", "font-size": "13px", color: cssVar("color-muted") }}>
      {props.note}
    </p>
    <div
      style={{
        width: "100%",
        height: "260px",
        border: `1px solid ${cssVar("color-grid")}`,
        "border-radius": cssVar("radius-lg"),
        padding: cssVar("space-md"),
        "box-sizing": "border-box",
      }}
    >
      {props.children}
    </div>
  </section>
);

export const App: Component = () => {
  const [series] = createSignal<TimePoint[]>(makeSeries(30));
  const [cloud] = createSignal<XYPoint[]>(makeCloud(40));

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

      <div style={{ "margin-top": cssVar("space-lg") }}>
        <Panel title="AreaChart" note="areaPath fill from the zero baseline, beneath a linePath stroke.">
          <AreaChart
            data={series()}
            title="Sample daily series, filled"
            fill={cssVar("color-focus-ring")}
            stroke={cssVar("color-focus-ring")}
          />
        </Panel>

        <Panel title="BarChart" note="bandScale x + linear y. Wednesday is negative — it hangs below zero.">
          <BarChart
            data={CATEGORIES}
            title="Weekday totals, including a negative"
            fill={cssVar("color-focus-ring")}
          />
        </Panel>

        <Panel title="ScatterChart" note="Two linear scales. Domain is the data extent — no forced zero.">
          <ScatterChart
            data={cloud()}
            title="Deterministic 2-D point cloud"
            fill={cssVar("color-focus-ring")}
            fillOpacity={0.7}
          />
        </Panel>
      </div>

      <p style={{ "margin-top": cssVar("space-lg"), color: cssVar("color-muted") }}>
        Resize the window — <code>ChartRoot</code> re-measures via
        <code> ResizeObserver</code> and every scale, path, and tick recomputes
        through Solid memos.
      </p>
    </main>
  );
};
