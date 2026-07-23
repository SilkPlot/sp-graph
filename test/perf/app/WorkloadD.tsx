/**
 * W-D — one day at one-second resolution. The declared density POLICY.
 *
 * This workload is different in kind from the other three. W-A to W-C ask "does
 * the shipped surface hold its budget"; W-D asks "what actually happens at a
 * scale the capability boundary declares a position about rather than support
 * for", and its output is a described contract, not a pass.
 *
 * The point that makes this workload worth running at all: an informative chart
 * ships an accessible data table, and that table is a real DOM row per datum —
 * 86,400 of them here. That is the accessibility contract behaving exactly as
 * designed, at a scale nobody had ever run it at. Its cost belongs in the result
 * rather than being tuned out of it, which is why this page also renders with
 * `?table=none` (see `table-mode.ts`) and both figures are recorded.
 *
 * Reporting both is what lets the density result name a MECHANISM instead of a
 * number. "86,400 points is slow" is not a finding anyone can act on; "86,400
 * points costs X in marks and Y in table rows" tells the next phase which of the
 * two to go after — and they have completely different recoveries.
 */
import { LineChart } from "@silkplot/charts";
import type { Series, SeriesDatum } from "@silkplot/core";
import { createSignal, onMount, type Component } from "solid-js";
import {
  W4_SPIKE_INDICES,
  w4Seconds,
} from "../../../packages/charts/test/workload-fixtures";
import {
  decimateSeries,
  decimationError,
  everyNth,
  minMaxBuckets,
  type Candidate,
  type DecimationError,
} from "./decimate";
import { settle, setPathological, pathologicalRebuilds } from "./instrument";
import { noteActive, noteViewport, publish } from "./state";
import { isTableSuppressed, tableProp } from "./table-mode";
import { WD_TARGET_POINTS, countPoints } from "./workloads";
import type { DecimationChoice } from "./state";

const RAW: Series[] = w4Seconds();
const RAW_DATA: readonly SeriesDatum[] = RAW[0]?.data ?? [];

const CANDIDATES: Record<Exclude<DecimationChoice, "raw">, Candidate> = {
  "min-max": minMaxBuckets,
  "every-nth": everyNth,
};

/**
 * Score every candidate once, at module scope.
 *
 * Once rather than per swap, because scoring walks all 86,400 raw points and
 * would otherwise land inside a settle measurement — the harness's own cost
 * reported as the chart's. It is pure and the data is frozen, so once is correct.
 */
const REPORT: readonly DecimationError[] = (
    Object.entries(CANDIDATES) as [Exclude<DecimationChoice, "raw">, Candidate][]
  ).map(([name, candidate]) =>
    decimationError(name, RAW_DATA, candidate(RAW_DATA, WD_TARGET_POINTS), W4_SPIKE_INDICES),
  );

export const WorkloadD: Component = () => {
  const [series, setSeries] = createSignal<Series[]>(RAW);
  let host: HTMLDivElement | undefined;

  onMount(() => {
    const root = document.getElementById("root");
    if (!root) return;
    publish({
      workload: "w-d",
      points: countPoints(series()),
      surface: "[data-perf-surface] [data-silkplot-keyboard-surface]",
      pathological: (on) => {
        setPathological(on, host, on ? RAW_DATA : undefined);
        return pathologicalRebuilds();
      },
      decimate: (choice) =>
        settle(root, () => {
          setSeries(
            choice === "raw" ? RAW : decimateSeries(RAW, CANDIDATES[choice], WD_TARGET_POINTS),
          );
        }),
      decimationReport: () => REPORT,
    });
  });

  return (
    <div
      ref={host}
      data-perf-surface=""
      data-perf-table={isTableSuppressed() ? "none" : "derived"}
    >
      <LineChart
        series={series()}
        height={420}
        wheelZoom
        onVisibleDomainChange={() => noteViewport()}
        onActivePointChange={(point) => noteActive(point)}
        table={tableProp()}
        title="W-D — one day at one-second resolution"
        summary="Eighty-six thousand four hundred one-second readings across a single day, with a diurnal swell, a fast oscillation, and eight isolated excursions."
        xTickFormat={(t) => t.toISOString().slice(11, 19)}
      />
    </div>
  );
};
