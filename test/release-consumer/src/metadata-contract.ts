/**
 * Public type regression exercised from outside the workspace by both release
 * resolution paths. The multi-series arm must preserve caller metadata through
 * every active-record callback; the single-series arm must not manufacture that
 * metadata merely because a caller supplies an explicit generic argument.
 */
import type { LineChartProps } from "@silkplot/charts";
import type { Series } from "@silkplot/core";

interface Reading {
  serial: string;
}

const readings: Series<Reading>[] = [
  {
    id: "probe",
    label: "Probe",
    data: [
      {
        t: new Date("2026-01-01T00:00:00Z"),
        y: 5,
        meta: { serial: "PA-1" },
      },
    ],
  },
];

export const typedMultiSeries: LineChartProps<Reading> = {
  series: readings,
  title: "Probe",
  desc: "One typed probe reading.",
  tooltip: (active) => active.datum.meta?.serial ?? "unknown probe",
  onActivePointChange: (active) => {
    const serial: string | undefined = active?.datum.meta?.serial;
    void serial;
  },
};

type SingleSeriesArm = Extract<LineChartProps<Reading>, { data: readonly unknown[] }>;

export const untypedSingleSeriesMetadata: SingleSeriesArm = {
  data: [{ t: new Date("2026-01-01T00:00:00Z"), y: 5 }],
  title: "Single series",
  desc: "One untyped reading.",
  tooltip: (active) => {
    // @ts-expect-error The single-series TimePoint input has no Reading metadata.
    const serial: string | undefined = active.datum.meta?.serial;
    return serial ?? "no metadata";
  },
};
