import { ScatterChart, type XYPoint } from "@silkplot/charts";
import type { Component } from "solid-js";

// Scatter uses the "extent" y-domain policy: there is no baseline to honour, so
// forcing zero into the domain would squash the cloud into a corner.
// Rounded, because the data alternative prints these values verbatim: an
// unrounded float is noise in a table a screen-reader user has to listen to.
const round = (n: number) => Math.round(n * 10) / 10;

const cloud: XYPoint[] = Array.from({ length: 40 }, (_, i) => ({
  x: round((i % 10) * 4 + Math.sin(i) * 1.5),
  y: round(30 + Math.cos(i / 2) * 10 + i * 0.3),
}));

const Example: Component = () => (
  <ScatterChart
    data={cloud}
    height={260}
    title="Response time against load"
    summary="Forty samples trending upward, with visible spread at every load level."
    table={{ columns: ["Load", "Response time (ms)"] }}
    // The only example that hides its table, and a deliberate trade-off rather
    // than a default: forty rows under a gallery card buries the next example.
    // `tableHidden` hides it VISUALLY and keeps it in the accessibility tree —
    // it is not `display: none`. Prefer leaving the table visible when the page
    // can carry it; sighted readers want rows and columns too.
    tableHidden
  />
);

export default Example;
