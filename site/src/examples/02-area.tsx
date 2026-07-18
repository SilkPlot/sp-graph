import { AreaChart, type TimePoint } from "@silkplot/charts";
import type { Component } from "solid-js";

// An area is drawn FROM a zero baseline, so its y-domain always contains zero.
// A line's does not — see the y-domain policy table in the guides.
const balance: TimePoint[] = [
  { t: new Date("2026-03-02"), y: 12 },
  { t: new Date("2026-03-03"), y: 4 },
  { t: new Date("2026-03-04"), y: -6 },
  { t: new Date("2026-03-05"), y: -2 },
  { t: new Date("2026-03-06"), y: 9 },
  { t: new Date("2026-03-07"), y: 17 },
];

const Example: Component = () => (
  <AreaChart
    data={balance}
    height={260}
    title="Daily net balance"
    summary="The balance dips below zero midweek and recovers to 17 by Saturday."
    table={{ columns: ["Day", "Net balance"] }}
  />
);

export default Example;
