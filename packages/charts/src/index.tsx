/**
 * @silkplot/charts — composed chart components.
 *
 * `LineChart`, `BarChart`, `AreaChart`, and `ScatterChart` are all implemented
 * and covered by browser-mode tests.
 */
export { LineChart } from "./LineChart";
export type { LineChartProps, LineChartBaseProps } from "./LineChart";

// The two input shapes every time-series chart accepts (ADR-0008 §12). Exported
// so a consumer can name them in its own wrapper props; `data` and `series` are
// mutually exclusive, which these types make a compile error rather than only a
// runtime one.
export type {
  SingleSeriesInput,
  MultiSeriesInput,
  MultiSeriesInputWithFormat,
} from "./LineChart";
export type { MultiSeriesFormatProps } from "./formatters";

// Per-series presentation. Exported for a consumer building its own legend, so
// the swatch beside a label resolves the SAME token the line does rather than
// re-deriving one that can drift from it.
export { seriesColorToken, seriesDashToken, SERIES_PALETTE_SIZE } from "./series-style";

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
