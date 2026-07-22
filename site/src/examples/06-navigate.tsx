import { LineChart, seriesColorToken, type TimePoint } from "@silkplot/charts";
import type { ViewportCommands } from "@silkplot/solid";
import { createSignal, type Component } from "solid-js";

// Ninety days, deterministic — a drifting baseline with a weekly rhythm, so
// there is genuinely something to zoom into.
const START = Date.UTC(2026, 3, 1);
const DAY = 86_400_000;
const latency: TimePoint[] = Array.from({ length: 90 }, (_, i) => ({
  t: new Date(START + i * DAY),
  y: Math.round(120 + 40 * Math.sin(i / 6) + i * 0.8 + 18 * Math.sin(i / 1.7)),
}));

// The chart hands its viewport commands out once on mount; the buttons below
// are the application-owned toolbar the library deliberately does not force
// on every chart. Keyboard users have the same four commands on the chart
// itself: + and - zoom, a autoscales, 0 resets.
const Example: Component = () => {
  const [commands, setCommands] = createSignal<ViewportCommands>();
  return (
    <div>
      <LineChart
        data={latency}
        stroke={seriesColorToken(1)}
        height={280}
        wheelZoom
        pinchZoom
        brushSelect
        minSpan={3 * DAY}
        onViewportCommands={setCommands}
        title="API p95 latency, ninety days"
        summary="Daily p95 latency in milliseconds over ninety days, drifting upward with a weekly rhythm."
        table={{ columns: ["Day", "p95 (ms)"] }}
        pointLabel={(d) => `${d.t.toISOString().slice(0, 10)}, ${d.y} ms`}
      />
      <fieldset class="viewport-toolbar">
        <legend class="viewport-toolbar__legend">Chart viewport controls</legend>
        <button type="button" class="sp-focusable" onClick={() => commands()?.zoomIn()}>Zoom in</button>
        <button type="button" class="sp-focusable" onClick={() => commands()?.zoomOut()}>Zoom out</button>
        <button type="button" class="sp-focusable" onClick={() => commands()?.autoscale()}>Autoscale</button>
        <button type="button" class="sp-focusable" onClick={() => commands()?.reset()}>Reset</button>
      </fieldset>
    </div>
  );
};

export default Example;
