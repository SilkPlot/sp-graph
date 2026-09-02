/**
 * W-A — four series x 5,000 points. The dense single-family case.
 *
 * Everything the protocol asks of this workload is reachable from one mounted
 * chart: hover and a caller-owned shared-time tooltip through the pointer,
 * controlled series visibility through the legend, zoom through `Ctrl`+wheel,
 * pan through the keyboard, a brush through a drag, the range control through
 * its thumbs, reset through the command API, and a complete 20,000-value
 * replacement through the signal.
 *
 * It is CONTROLLED (`visibleDomain` is our signal) rather than uncontrolled,
 * because the range control has to read the same visible domain the chart does.
 * That is the composition a consumer writes when they want a navigator, and the
 * one where a second authority would show up as drift — so it is the one worth
 * measuring.
 */
import { LineChart } from "@silkplot/charts";
import type {
  ActivePoint,
  Series,
  SeriesDatum,
  TimeInterval,
  ViewportCause,
} from "@silkplot/core";
import { RangeControl, type ViewportCommands } from "@silkplot/solid";
import { createSignal, For, onMount, type Component } from "solid-js";
import {
  w2History,
  w2Replacement,
  type W2SampleMetadata,
} from "../../../packages/charts/test/workload-fixtures";
import { settle, setPathological, pathologicalRebuilds } from "./instrument";
import { noteActive, noteViewport, publish } from "./state";
import { isTableSuppressed, tableProp } from "./table-mode";
import { WA_POINTS, WA_SERIES, countPoints, seriesExtent } from "./workloads";

const BASE: Series<W2SampleMetadata>[] = w2History(WA_SERIES, WA_POINTS);
const REPLACEMENT: Series<W2SampleMetadata>[] = w2Replacement(WA_SERIES, WA_POINTS);
const FULL: TimeInterval = seriesExtent(BASE);
const DAY = 86_400_000;
const ALL_IDS = BASE.map((entry) => entry.id);
const TIME_ZONE = "Africa/Johannesburg";

const axisTime = new Intl.DateTimeFormat("en-ZA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const tooltipTime = new Intl.DateTimeFormat("en-ZA", {
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

const formatAxisTime = (instant: Date): string => axisTime.format(instant);
const formatTooltipTime = (instant: Date): string => tooltipTime.format(instant);
const formatTemperature = (value: number): string => `${temperature.format(value)} °C`;

// These explicit table formatters preserve source-value cells. The table is an
// inspectable/exportable data surface, not a second display axis: dates remain
// unambiguous instants and numbers remain numbers rather than unit-suffixed text.
const formatSourceTime = (instant: Date): string => instant.toISOString();
const formatSourceValue = (value: number): number => value;

interface TooltipReading {
  id: string;
  label: string;
  datum: SeriesDatum<W2SampleMetadata> | undefined;
}

const readingsAtActiveTime = (
  active: ActivePoint<SeriesDatum<W2SampleMetadata>>,
  current: readonly Series<W2SampleMetadata>[],
  visibleIds: readonly string[],
): readonly TooltipReading[] => {
  const shared = new Map<string, SeriesDatum<W2SampleMetadata>>();
  for (const entry of active.atTime ?? []) shared.set(entry.seriesId, entry.datum);
  const time = active.datum.t.getTime();

  return visibleIds.map((id) => {
    const entry = current.find((candidate) => candidate.id === id);
    const sourceDatum = entry?.data[active.sourceIndex];
    return {
      id,
      label: entry?.label ?? id,
      // `atTime` is the chart's actual shared-cursor record. A declared gap is
      // absent from that present-point record. This frozen fixture aligns every
      // series by source index, so read that one source slot only for the gap —
      // never a 5,000-point search on an inspection event — and render it
      // honestly as "No reading" rather than dropping a series.
      datum:
        shared.get(id) ??
        (sourceDatum?.t.getTime() === time ? sourceDatum : undefined),
    };
  });
};

const WorkloadATooltip: Component<{
  active: ActivePoint<SeriesDatum<W2SampleMetadata>>;
  series: readonly Series<W2SampleMetadata>[];
  visibleIds: readonly string[];
}> = (props) => {
  const metadata = () => props.active.datum.meta;
  const readings = () => readingsAtActiveTime(props.active, props.series, props.visibleIds);

  return (
    <div
      data-perf-tooltip-content=""
      style={{
        padding: "6px 8px",
        background: "var(--sp-color-surface, #ffffff)",
        color: "var(--sp-color-text, #000000)",
        border: "1px solid var(--sp-color-grid, #e4e7ec)",
        "border-radius": "var(--sp-radius-md, 4px)",
        "box-shadow": "0 2px 8px rgb(0 0 0 / 16%)",
        "font-size": "12px",
        "white-space": "nowrap",
      }}
    >
      <div>{formatTooltipTime(props.active.datum.t)}</div>
      <div>Sample {metadata()?.sampleId ?? "unavailable"}</div>
      <div>Quality {metadata()?.quality ?? "unavailable"}</div>
      <dl
        style={{
          margin: "4px 0 0",
          display: "grid",
          "grid-template-columns": "auto auto",
          gap: "2px 8px",
        }}
      >
        <For each={readings()}>
          {(reading) => (
            <div data-perf-tooltip-series={reading.id} style={{ display: "contents" }}>
              <dt>{reading.label}</dt>
              <dd style={{ margin: 0, "text-align": "right" }}>
                {reading.datum?.y === null || reading.datum?.y === undefined
                  ? "No reading"
                  : formatTemperature(reading.datum.y)}
              </dd>
            </div>
          )}
        </For>
      </dl>
    </div>
  );
};

export const WorkloadA: Component = () => {
  const [series, setSeries] = createSignal<Series<W2SampleMetadata>[]>(BASE);
  const [visibleSeries, setVisibleSeries] = createSignal<readonly string[]>(ALL_IDS);
  const [visible, setVisible] = createSignal<TimeInterval>(FULL);
  let commands: ViewportCommands | undefined;
  let host: HTMLDivElement | undefined;

  const commitDomain = (domain: TimeInterval, cause: ViewportCause): void => {
    noteViewport(cause);
    setVisible(domain);
  };

  onMount(() => {
    const root = document.getElementById("root");
    if (!root) return;
    publish({
      workload: "w-a",
      points: countPoints(series()),
      surface: "[data-perf-surface] [data-silkplot-keyboard-surface]",
      range: "[data-perf-range] [role='slider']",
      pathological: (on) => {
        // The mutation is fed the SAME points the chart is drawing, so the work
        // it does is the work a per-event rebuild would do here — not a token
        // loop that would under-state the regression on a dense series.
        setPathological(on, host, on ? series() : undefined);
        return pathologicalRebuilds();
      },
      // A complete replacement: every one of the 20,000 values moves, and the y
      // domain moves with them, so the axis recomputes rather than only the paths.
      replace: () =>
        settle(root, () => setSeries((current) => (current === BASE ? REPLACEMENT : BASE))),
      reset: () => settle(root, () => commands?.reset()),
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
        legendLabel="W-A probes"
        height={420}
        wheelZoom
        pinchZoom
        brushSelect
        // The ADR-0023 disposition at this density: 20,000 raw points missed
        // the commit budget on zoom/brush/range-drag even after the
        // derivation corrections, so a consumer at this scale engages the
        // explicit per-series budget. 2,000 per series ≈ one bucket per
        // rendered column at this width, so the painted envelope is
        // column-exact. Paint only — inspection, table, and CSV stay raw.
        decimation={2000}
        // At this diagnostic density, monotone interpolation spends commit
        // time deriving two control points per segment. The envelope already
        // preserves excursions; a linear join is the explicit density-tier
        // geometry consumed by the Canvas renderer and leaves inspection,
        // table, CSV and the raw data unchanged.
        curve="linear"
        minSpan={30 * DAY}
        visibleDomain={visible()}
        onVisibleDomainChange={commitDomain}
        onViewportCommands={(c) => {
          commands = c;
        }}
        onActivePointChange={(point) => noteActive(point)}
        tooltip={(active) => (
          <WorkloadATooltip
            active={active}
            series={series()}
            visibleIds={visibleSeries()}
          />
        )}
        table={tableProp()}
        title="W-A — four probes at five thousand points"
        summary="Four same-unit probe series of five thousand daily readings each, navigable by pointer, wheel, and keyboard."
        xTickFormat={formatAxisTime}
        yTickFormat={formatTemperature}
        tableTimeFormat={formatSourceTime}
        tableValueFormat={formatSourceValue}
      />
      <div data-perf-range="" style={{ "margin-top": "8px" }}>
        <RangeControl
          fullExtent={FULL}
          visibleDomain={visible()}
          onVisibleDomainChange={commitDomain}
          minSpan={30 * DAY}
          width={1000}
          label="W-A visible range"
          valueText={(ms) => formatAxisTime(new Date(ms))}
        />
      </div>
    </div>
  );
};
