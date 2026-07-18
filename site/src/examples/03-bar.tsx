import { BarChart, type CategoryPoint } from "@silkplot/charts";
import type { Component } from "solid-js";

const perDay: CategoryPoint[] = [
  { label: "Mon", y: 12 },
  { label: "Tue", y: 19 },
  { label: "Wed", y: -6 },
  { label: "Thu", y: 8 },
  { label: "Fri", y: 15 },
];

const Example: Component = () => (
  <BarChart
    data={perDay}
    height={260}
    title="Net change by weekday"
    summary="Four positive days and one negative, Wednesday, at minus six."
    table={{ columns: ["Weekday", "Net change"] }}
  />
);

export default Example;
