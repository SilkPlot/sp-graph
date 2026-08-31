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
import { timeScale, type Series, type SeriesDatum } from "@silkplot/core";
import { createSignal, onMount, type Component } from "solid-js";
import {
  W4_SPIKE_INDICES,
  w4Seconds,
} from "../../../packages/charts/test/workload-fixtures";
import {
  decimateSeries,
  decimationError,
  everyNth,
  expectedInspectionAtFraction,
  minMaxBuckets,
  type Candidate,
  type DecimationError,
} from "./decimate";
import { lttb } from "./decimate-lttb";
import { m4Columns } from "./decimate-m4";
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
  m4: m4Columns,
  lttb,
};
const CANDIDATE_DATA = Object.fromEntries(
  Object.entries(CANDIDATES).map(([name, candidate]) => [
    name,
    candidate(RAW_DATA, WD_TARGET_POINTS),
  ]),
) as Record<Exclude<DecimationChoice, "raw">, SeriesDatum[]>;

function inspectionTarget(fraction: number) {
  const first = RAW_DATA[0];
  const last = RAW_DATA.at(-1);
  if (!first || !last || fraction < 0 || fraction > 1) return undefined;
  const targetMs =
    first.t.getTime() + fraction * (last.t.getTime() - first.t.getTime());
  const scale = timeScale({ domain: [first.t, last.t], range: [0, 1] });
  const appliedDomain = scale.domain();
  const domainStart = appliedDomain[0];
  const domainEnd = appliedDomain[1];
  if (!domainStart || !domainEnd) return undefined;
  return {
    rawDomainFraction: fraction,
    plotFraction: scale(new Date(targetMs)),
    targetTime: new Date(targetMs).toISOString(),
    appliedDomain: [domainStart.toISOString(), domainEnd.toISOString()] as const,
  };
}

/**
 * Score every candidate once, at module scope.
 *
 * Once rather than per swap, because scoring walks all 86,400 raw points and
 * would otherwise land inside a settle measurement — the harness's own cost
 * reported as the chart's. It is pure and the data is frozen, so once is correct.
 */
const REPORT: readonly DecimationError[] = (
    Object.keys(CANDIDATES) as Exclude<DecimationChoice, "raw">[]
  ).map((name) =>
    decimationError(name, RAW_DATA, CANDIDATE_DATA[name], W4_SPIKE_INDICES),
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
        setPathological(on, host, on ? RAW : undefined);
        return pathologicalRebuilds();
      },
      decimate: (choice) =>
        settle(root, () => {
          setSeries(
            choice === "raw"
              ? RAW
              : decimateSeries(
                  RAW,
                  () => CANDIDATE_DATA[choice],
                  WD_TARGET_POINTS,
                ),
          );
        }),
      inspectionExpected: (choice, fraction) =>
        expectedInspectionAtFraction(
          "raw",
          RAW_DATA,
          choice === "raw" ? RAW_DATA : CANDIDATE_DATA[choice],
          fraction,
        ),
      inspectionTarget,
      decimationReport: () => REPORT,
			paintDecimation: {
				budget: WD_TARGET_POINTS,
				drawnPoints: () => {
					const value = root
						.querySelector("[data-silkplot-canvas-plot]")
						?.getAttribute("data-silkplot-drawn-points");
					return value === null || value === undefined ? null : Number(value);
				},
			},
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
        // The ADR-0023 disposition, mounted: explicit min/max decimation at
        // the same budget the scorer measured. Paint only — the hit index,
        // announcements, table, and CSV still read the raw 86,400. The earlier
        // run recorded the pre-disposition raw figures (NOT VIABLE RAW); the
        // exit run judges THIS composition, which is what ships for this
        // density. The data-level candidate swap below stays as the
        // comparison instrument; a swapped 2,000-point candidate is at the
        // budget, so the prop is the identity there.
        decimation={WD_TARGET_POINTS}
        onVisibleDomainChange={(_domain, cause) => noteViewport(cause)}
        onActivePointChange={(point) => noteActive(point)}
        table={tableProp()}
        title="W-D — one day at one-second resolution"
        summary="Eighty-six thousand four hundred one-second readings across a single day, with a diurnal swell, a fast oscillation, and eight isolated excursions."
        xTickFormat={(t) => t.toISOString().slice(11, 19)}
      />
    </div>
  );
};
