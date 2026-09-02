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
import {
  timeScale,
  type ActivePoint,
  type Series,
  type SeriesDatum,
} from "@silkplot/core";
import { createSignal, onMount, type Component } from "solid-js";
import {
  W4_SPIKE_INDICES,
  w4Seconds,
  type W4SampleMetadata,
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

const RAW: Series<W4SampleMetadata>[] = w4Seconds();
const RAW_DATA: readonly SeriesDatum<W4SampleMetadata>[] = RAW[0]?.data ?? [];
const ALL_IDS = RAW.map((entry) => entry.id);
const TIME_ZONE = "Africa/Johannesburg";

const localTime = new Intl.DateTimeFormat("en-ZA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const temperature = new Intl.NumberFormat("en-ZA", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const formatLocalTime = (instant: Date): string => localTime.format(instant);
const formatTemperature = (value: number): string => `${temperature.format(value)} °C`;

// Explicit identity formatters keep the complete table on source instants and
// numeric source cells while the visual inspection surfaces use zoned/unit
// wording owned by this caller.
const formatSourceTime = (instant: Date): string => instant.toISOString();
const formatSourceValue = (value: number): number => value;

const WorkloadDTooltip: Component<{
  active: ActivePoint<SeriesDatum<W4SampleMetadata>>;
}> = (props) => (
  <div
    data-perf-tooltip-content=""
    style={{
      padding: "6px 8px",
      background: "var(--sp-color-surface, #ffffff)",
      color: "var(--sp-color-text, #000000)",
      border: "1px solid var(--sp-color-grid, #e4e7ec)",
      "border-radius": "var(--sp-radius-md, 4px)",
      "box-shadow": "0 2px 8px rgb(0 0 0 / 16%)",
      "font-size": "11px",
      "white-space": "nowrap",
    }}
  >
    <div>{formatLocalTime(props.active.datum.t)}</div>
    <div>
      {props.active.datum.y === null
        ? "No reading"
        : formatTemperature(props.active.datum.y)}
    </div>
    <div>Sample {props.active.datum.meta?.sampleId ?? "unavailable"}</div>
    <div>Quality {props.active.datum.meta?.quality ?? "unavailable"}</div>
  </div>
);

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
) as Record<
  Exclude<DecimationChoice, "raw">,
  SeriesDatum<W4SampleMetadata>[]
>;

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
  const [series, setSeries] = createSignal<Series<W4SampleMetadata>[]>(RAW);
  const [visibleSeries, setVisibleSeries] = createSignal<readonly string[]>(ALL_IDS);
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
              : (decimateSeries(
                  RAW,
                  () => CANDIDATE_DATA[choice],
                  WD_TARGET_POINTS,
                ) as Series<W4SampleMetadata>[]),
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
        visibleSeries={visibleSeries()}
        onVisibilityChange={setVisibleSeries}
        legendLabel="W-D source series"
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
        tooltip={(active) => <WorkloadDTooltip active={active} />}
        table={tableProp()}
        title="W-D — one day at one-second resolution"
        summary="Eighty-six thousand four hundred one-second readings across a single day, with a diurnal swell, a fast oscillation, and eight isolated excursions."
        xTickFormat={formatLocalTime}
        yTickFormat={formatTemperature}
        tableTimeFormat={formatSourceTime}
        tableValueFormat={formatSourceValue}
      />
    </div>
  );
};
