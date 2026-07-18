/**
 * @silkplot/charts — composed chart components.
 *
 * `LineChart`, `BarChart`, `AreaChart`, and `ScatterChart` are all implemented
 * and covered by browser-mode tests.
 */
export { LineChart } from "./LineChart";
export type { LineChartProps, LineChartBaseProps } from "./LineChart";

export { BarChart } from "./BarChart";
export type { BarChartProps, BarChartBaseProps } from "./BarChart";

export { AreaChart } from "./AreaChart";
export type { AreaChartProps, AreaChartBaseProps } from "./AreaChart";

export { ScatterChart } from "./ScatterChart";
export type { ScatterChartProps, ScatterChartBaseProps } from "./ScatterChart";

export type { TimePoint, CategoryPoint, XYPoint } from "./types";

// Re-exported so a consumer can type its own semantic inputs without also
// depending on @silkplot/solid directly. See ADR-0005.
export type {
  ChartSemanticsProps,
  ChartSemanticsIssue,
  ChartDataTable,
  InformativeSemantics,
  DecorativeSemantics,
} from "@silkplot/solid";
