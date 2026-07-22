import { LineChart, type TimePoint } from "@silkplot/charts";
import type { Component } from "solid-js";

// Ninety days, deterministic — a drifting baseline with a weekly rhythm, so
// there is genuinely something to zoom into.
const START = Date.UTC(2026, 3, 1);
const DAY = 86_400_000;
const latency: TimePoint[] = Array.from({ length: 90 }, (_, i) => ({
  t: new Date(START + i * DAY),
  y: Math.round(120 + 40 * Math.sin(i / 6) + i * 0.8 + 18 * Math.sin(i / 1.7)),
}));

const Example: Component = () => (
  <LineChart
    data={latency}
    height={280}
    wheelZoom
    pinchZoom
    brushSelect
    minSpan={3 * DAY}
    title="API p95 latency, ninety days"
    summary="Daily p95 latency in milliseconds over ninety days, drifting upward with a weekly rhythm."
    table={{ columns: ["Day", "p95 (ms)"] }}
    pointLabel={(d) => `${d.t.toISOString().slice(0, 10)}, ${d.y} ms`}
  />
);

export default Example;
