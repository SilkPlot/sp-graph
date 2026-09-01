/**
 * Pre-correction cartesian-dashboard composition, mounted as
 * `cartesian-dashboard-representative-v1`.
 *
 * This is the retained v1 page: no tooltip renderer, no W2 legend, no raw
 * tooltip metadata, and no caller-owned en-ZA display wording. The table is
 * the library default; the v1 proof for it is the row count after the public
 * reveal control, not source-cell or display-formatter claims added later.
 *
 * Interaction still runs — pointer, keyboard, and the range control — so the
 * omitted surfaces fail from observed UI, not from unread component props.
 */
import { LineChart } from "@silkplot/charts";
import type { TimeInterval, ViewportCause } from "@silkplot/core";
import { RangeControl, type ViewportCommands } from "@silkplot/solid";
import { createSignal, onMount, type Component } from "solid-js";
import { w2History, w2Replacement } from "../../../packages/charts/test/workload-fixtures";
import { HISTORICAL_COMPOSITION_IDENTITY } from "./composition-revision";
import { settle, setPathological, pathologicalRebuilds } from "./instrument";
import { noteActive, noteViewport, publish } from "./state";
import { isTableSuppressed, tableProp } from "./table-mode";
import { WA_POINTS, WA_SERIES, countPoints, seriesExtent } from "./workloads";

const BASE = w2History(WA_SERIES, WA_POINTS);
const REPLACEMENT = w2Replacement(WA_SERIES, WA_POINTS);
const FULL: TimeInterval = seriesExtent(BASE);
const DAY = 86_400_000;

export const WorkloadAV1: Component = () => {
  const [series, setSeries] = createSignal(BASE);
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
      compositionIdentity: HISTORICAL_COMPOSITION_IDENTITY,
      points: countPoints(series()),
      surface: "[data-perf-surface] [data-silkplot-keyboard-surface]",
      range: "[data-perf-range] [role='slider']",
      pathological: (on) => {
        setPathological(on, host, on ? series() : undefined);
        return pathologicalRebuilds();
      },
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
        decimation={2000}
        curve="linear"
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
