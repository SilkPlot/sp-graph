import { LineChart, type TimePoint } from "@silkplot/charts";
import type { Component } from "solid-js";

const bookings: TimePoint[] = [
  { t: new Date("2026-03-02"), y: 31 },
  { t: new Date("2026-03-03"), y: 42 },
  { t: new Date("2026-03-04"), y: 38 },
  { t: new Date("2026-03-05"), y: 55 },
  { t: new Date("2026-03-06"), y: 49 },
  { t: new Date("2026-03-07"), y: 61 },
];

const Example: Component = () => (
  <LineChart
    data={bookings}
    height={260}
    title="Weekly bookings"
    summary="Bookings rose from 31 on Monday to 61 on Saturday, dipping once midweek."
    table={{ columns: ["Day", "Bookings"] }}
    pointLabel={(d) =>
      `${d.t.toLocaleDateString("en", { weekday: "long" })}, ${d.y} bookings`
    }
  />
);

export default Example;
