/**
 * W-B — twenty-two series plus three references. The wide multi-series case.
 *
 * The interactions the protocol names here are the ones that change what is
 * DRAWN rather than where it is drawn: a legend toggle removes a series from the
 * union domain, so every remaining series rescales; isolate does that twenty-one
 * times over in one commit. Those are the passes where a chart that recomputes
 * too much shows it.
 *
 * Visibility is CONTROLLED and shared between the chart and the legend — one
 * array, two readers. An uncontrolled legend would leave the chart and the
 * legend each holding their own idea of what is visible, which is a correctness
 * bug the composition gate already forbids and would also make this measurement
 * meaningless: the two would be doing different work.
 *
 * Inspection is composed at this page boundary too: the chart supplies the
 * actual shared-time active record, while this caller owns the locale, time
 * zone, units, and tooltip markup that give the record domain meaning.
 */
import { LineChart } from "@silkplot/charts";
import type { ActivePoint, Series, SeriesDatum } from "@silkplot/core";
import { Legend } from "@silkplot/solid";
import { createEffect, createSignal, For, onMount, type Component } from "solid-js";
import {
  w1DenseSeries,
  w1References,
} from "../../../packages/charts/test/workload-fixtures";
import { settle, setPathological, pathologicalRebuilds } from "./instrument";
import {
  noteActive,
  noteViewport,
  noteVisibility,
  publish,
  visibilityStateChanged,
} from "./state";
import { isTableSuppressed, tableProp } from "./table-mode";
import { expectedVisibleLineGeometryPoints } from "./visibility-proof";
import { selectVisiblePathologicalSeries } from "./workload-fidelity";
import { countPoints } from "./workloads";

const SERIES: Series[] = w1DenseSeries();
const REFERENCES = w1References();
const ALL_IDS = SERIES.map((s) => s.id);
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

const power = new Intl.NumberFormat("en-ZA", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const formatLocalTime = (instant: Date): string => localTime.format(instant);
const formatPower = (value: number): string => `${power.format(value)} kW`;

// Explicit identity formatters keep the inspectable/exportable table on source
// instants and numeric values even though the axis, references, and tooltip use
// caller-owned display wording.
const formatSourceTime = (instant: Date): string => instant.toISOString();
const formatSourceValue = (value: number): number => value;

interface TooltipReading {
  id: string;
  label: string;
  datum: SeriesDatum | undefined;
}

const readingsAtActiveTime = (
  active: ActivePoint<SeriesDatum>,
  visibleIds: readonly string[],
): readonly TooltipReading[] => {
  const shared = new Map<string, SeriesDatum>();
  for (const entry of active.atTime ?? []) shared.set(entry.seriesId, entry.datum);
  const time = active.datum.t.getTime();

  return visibleIds.map((id) => {
    const series = SERIES.find((candidate) => candidate.id === id);
    const sourceDatum = series?.data[active.sourceIndex];
    return {
      id,
      label: series?.label ?? id,
      // The active record carries every present same-time reading. These
      // deterministic series align by source index, so the one source slot is
      // consulted only when a series declares a gap at this instant; no search
      // or parallel timestamp index enters the inspection path.
      datum:
        shared.get(id) ??
        (sourceDatum?.t.getTime() === time ? sourceDatum : undefined),
    };
  });
};

const WorkloadBTooltip: Component<{
  active: ActivePoint<SeriesDatum>;
  visibleIds: readonly string[];
}> = (props) => {
  const readings = () => readingsAtActiveTime(props.active, props.visibleIds);

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
        "font-size": "11px",
        "line-height": 1.2,
        "white-space": "nowrap",
      }}
    >
      <div>{formatLocalTime(props.active.datum.t)}</div>
      <dl
        style={{
          margin: "4px 0 0",
          display: "grid",
          "grid-template-columns": "auto auto",
          gap: "1px 8px",
        }}
      >
        <For each={readings()}>
          {(reading) => (
            <div data-perf-tooltip-series={reading.id} style={{ display: "contents" }}>
              <dt>{reading.label}</dt>
              <dd style={{ margin: 0, "text-align": "right" }}>
                {reading.datum?.y === null || reading.datum?.y === undefined
                  ? "No reading"
                  : formatPower(reading.datum.y)}
              </dd>
            </div>
          )}
        </For>
      </dl>
    </div>
  );
};

/** The narrower width the resize pass moves to, and back. */
const WIDE = 1100;
const NARROW = 720;

export const WorkloadB: Component = () => {
  const [visibleSeries, setVisibleSeries] = createSignal<readonly string[]>(ALL_IDS);
  let observedVisibleSeries = visibleSeries();
  let host: HTMLDivElement | undefined;
  let isolated = false;

  createEffect(() => {
    const current = visibleSeries();
    if (visibilityStateChanged(observedVisibleSeries, current)) {
      const signature = current.join("\0");
      const expectedPoints = expectedVisibleLineGeometryPoints(SERIES, current);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const painted = Number(
            host
              ?.querySelector("[data-silkplot-canvas-plot]")
              ?.getAttribute("data-silkplot-drawn-points"),
          );
          if (visibleSeries().join("\0") === signature && painted === expectedPoints) {
            noteVisibility();
          }
        });
      });
    }
    observedVisibleSeries = current;
  });

  onMount(() => {
    const root = document.getElementById("root");
    const surface = document.getElementById("surface");
    if (!root || !surface) return;

    publish({
      workload: "w-b",
      points: countPoints(SERIES),
      surface: "[data-perf-surface] [data-silkplot-keyboard-surface]",
      pathological: (on) => {
        setPathological(
          on,
          host,
          on ? selectVisiblePathologicalSeries(SERIES, visibleSeries()) : undefined,
        );
        return pathologicalRebuilds();
      },
      // Isolate is the large commit: twenty-one series leave the domain at once,
      // and come back at once. Alternating rather than latching, so a repeated
      // call keeps doing work instead of settling into a no-op that would read
      // as a fast chart.
      isolate: () => {
        isolated = !isolated;
        setVisibleSeries(isolated ? [ALL_IDS[0] as string] : ALL_IDS);
      },
      resize: (width) =>
        settle(root, () => {
          surface.style.width = `${width}px`;
        }),
    });
  });

  return (
    <div
      ref={host}
      data-perf-surface=""
      data-perf-wide={WIDE}
      data-perf-narrow={NARROW}
      data-perf-table={isTableSuppressed() ? "none" : "derived"}
    >
      <LineChart
        series={SERIES}
        references={REFERENCES}
        // ADR-0013: the caller who owns the formatter reserves the room its
        // labels need; the library does not measure the default left margin.
        // `-20,0 kW` is the widest tick this page formats; the conformance suite
        // proves every painted left-axis label fits inside this margin.
        margins={{ left: 64 }}
        visibleSeries={visibleSeries()}
        onVisibilityChange={setVisibleSeries}
        legend={
          <Legend
            series={SERIES}
            visibleSeries={visibleSeries()}
            onVisibilityChange={setVisibleSeries}
            label="W-B sensors"
            maxHeight="120px"
          />
        }
        height={420}
        wheelZoom
        brushSelect
        onVisibleDomainChange={(_domain, cause) => noteViewport(cause)}
        onActivePointChange={(point) => noteActive(point)}
        tooltip={(active) => (
          <WorkloadBTooltip active={active} visibleIds={visibleSeries()} />
        )}
        table={tableProp()}
        title="W-B — twenty-two sensors with three references"
        summary="Twenty-two same-domain sensor series crossing zero, with two value references and one temporal reference."
        xTickFormat={formatLocalTime}
        yTickFormat={formatPower}
        tableTimeFormat={formatSourceTime}
        tableValueFormat={formatSourceValue}
      />
    </div>
  );
};
