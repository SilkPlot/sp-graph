/**
 * W-A — four series x 5,000 points. The dense single-family case.
 *
 * Everything the protocol asks of this workload is reachable from one mounted
 * chart: hover and shared-time inspection through the pointer, zoom through
 * `Ctrl`+wheel, pan through the keyboard, a brush through a drag, the range
 * control through its thumbs, reset through the command API, and a complete
 * 20,000-value replacement through the signal.
 *
 * It is CONTROLLED (`visibleDomain` is our signal) rather than uncontrolled,
 * because the range control has to read the same visible domain the chart does.
 * That is the composition a consumer writes when they want a navigator, and the
 * one where a second authority would show up as drift — so it is the one worth
 * measuring.
 */
import { LineChart } from "@silkplot/charts";
import type { Series, TimeInterval } from "@silkplot/core";
import { RangeControl, type ViewportCommands } from "@silkplot/solid";
import { createSignal, onMount, type Component } from "solid-js";
import {
  w2History,
  w2Replacement,
} from "../../../packages/charts/test/workload-fixtures";
import { settle, setPathological, pathologicalRebuilds } from "./instrument";
import { noteActive, noteViewport, publish } from "./state";
import { isTableSuppressed, tableProp } from "./table-mode";
import { WA_POINTS, WA_SERIES, countPoints, seriesExtent } from "./workloads";

const BASE: Series[] = w2History(WA_SERIES, WA_POINTS);
const REPLACEMENT: Series[] = w2Replacement(WA_SERIES, WA_POINTS);
const FULL: TimeInterval = seriesExtent(BASE);
const DAY = 86_400_000;

export const WorkloadA: Component = () => {
  const [series, setSeries] = createSignal<Series[]>(BASE);
  const [visible, setVisible] = createSignal<TimeInterval>(FULL);
  let commands: ViewportCommands | undefined;
  let host: HTMLDivElement | undefined;

  const commitDomain = (domain: TimeInterval): void => {
    noteViewport();
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
        setPathological(on, host, on ? series().flatMap((s) => s.data) : undefined);
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
        minSpan={30 * DAY}
        visibleDomain={visible()}
        onVisibleDomainChange={commitDomain}
        onViewportCommands={(c) => {
          commands = c;
        }}
        onActivePointChange={(point) => noteActive(point)}
        table={tableProp()}
        title="W-A — four probes at five thousand points"
        summary="Four same-unit probe series of five thousand daily readings each, navigable by pointer, wheel, and keyboard."
        xTickFormat={(t) => t.toISOString().slice(0, 10)}
      />
      <div data-perf-range="" style={{ "margin-top": "8px" }}>
        <RangeControl
          fullExtent={FULL}
          visibleDomain={visible()}
          onVisibleDomainChange={commitDomain}
          minSpan={30 * DAY}
          width={1000}
          label="W-A visible range"
          valueText={(ms) => new Date(ms).toISOString().slice(0, 10)}
        />
      </div>
    </div>
  );
};
