import { AreaChart, LineChart, seriesColorToken, type TimePoint } from "@silkplot/charts";
import type { TimeInterval } from "@silkplot/core";
import { Dashboard, DashboardSection } from "@silkplot/solid";
import type { Component } from "solid-js";

const START = Date.UTC(2026, 5, 1);
const DAY = 86_400_000;
const days = (n: number): Date => new Date(START + n * DAY);

const requests: TimePoint[] = Array.from({ length: 60 }, (_, i) => ({
  t: days(i),
  y: Math.round(4000 + 1200 * Math.sin(i / 5) + i * 25),
}));
const errors: TimePoint[] = Array.from({ length: 60 }, (_, i) => ({
  t: days(i),
  y: Math.round(40 + 18 * Math.sin(i / 3.1) + (i % 11 === 0 ? 55 : 0)),
}));

const RANGE: TimeInterval = { start: days(0), end: days(59) };
const FIXED_WEEK: TimeInterval = { start: days(21), end: days(28) };

const fmt = (d: Date): string =>
  d.toLocaleDateString("en", { month: "short", day: "numeric" });

// Drag on either of the first two charts and BOTH follow: an unsectioned
// member's gestures drive the dashboard's shared dynamic selection, not a
// private viewport. The third chart sits in a section pinned to one week, so
// it deliberately ignores the selection — that isolation is the point of
// sections.
const Example: Component = () => (
  <Dashboard
    defaultRange={RANGE}
    announceSelection={(r) =>
      r ? `Selected ${fmt(r.start)} to ${fmt(r.end)}` : "Selection cleared"
    }
  >
    <div style={{ display: "grid", gap: "1rem" }}>
      <LineChart
        data={requests}
        height={190}
        stroke={seriesColorToken(4)}
        brushSelect
        wheelZoom
        title="Requests per day"
        summary="Daily request volume across June and July, rising with a weekly cycle."
        table={{ columns: ["Day", "Requests"] }}
        pointLabel={(d) => `${fmt(d.t)}, ${d.y} requests`}
      />
      <AreaChart
        data={errors}
        stroke={seriesColorToken(5)}
        fill={seriesColorToken(5)}
        height={190}
        brushSelect
        wheelZoom
        title="Errors per day"
        summary="Daily error counts over the same period, with periodic spikes."
        table={{ columns: ["Day", "Errors"] }}
        pointLabel={(d) => `${fmt(d.t)}, ${d.y} errors`}
      />
      <DashboardSection window={FIXED_WEEK} label="Reference week">
        <LineChart
          data={requests}
          height={160}
          stroke={seriesColorToken(4)}
          title="Reference week (isolated)"
          summary="The same request series pinned to one fixed week; a selection on the charts above does not move it."
          table={{ columns: ["Day", "Requests"] }}
          pointLabel={(d) => `${fmt(d.t)}, ${d.y} requests`}
        />
      </DashboardSection>
    </div>
  </Dashboard>
);

export default Example;
