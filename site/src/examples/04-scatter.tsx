import { ScatterChart, seriesColorToken, type XYPoint } from "@silkplot/charts";
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
    fill={seriesColorToken(6)}
    height={260}
    title="Response time against load"
    summary="Forty samples trending upward, with visible spread at every load level."
    table={{ columns: ["Load", "Response time (ms)"] }}
    tooltip={(a) => (
      <div
        style={{
          padding: "var(--sp-space-xs, 2px) var(--sp-space-sm, 4px)",
          "font-size": "var(--sp-font-xs, 10px)",
          color: "var(--sp-color-text, #16181d)",
          background: "var(--sp-color-surface, #ffffff)",
          border: "1px solid var(--sp-color-grid, #e4e7ec)",
          "border-radius": "var(--sp-radius-md, 4px)",
        }}
      >
        Load {a.datum.x} · {a.datum.y} ms
      </div>
    )}
    // The only example that hides its table, and a deliberate trade-off rather
    // than a default: forty rows under a gallery card buries the next example.
    // `tableHidden` hides it VISUALLY and keeps it in the accessibility tree —
    // it is not `display: none`. Prefer leaving the table visible when the page
    // can carry it; sighted readers want rows and columns too. The hover
    // tooltip is the sighted reading of one point when the rows are clipped.
    tableHidden
  />
);

export default Example;
