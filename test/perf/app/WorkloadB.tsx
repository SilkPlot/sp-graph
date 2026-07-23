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
 */
import { LineChart } from "@silkplot/charts";
import type { Series } from "@silkplot/core";
import { Legend } from "@silkplot/solid";
import { createSignal, onMount, type Component } from "solid-js";
import {
  w1DenseSeries,
  w1References,
} from "../../../packages/charts/test/workload-fixtures";
import { settle, setPathological, pathologicalRebuilds } from "./instrument";
import { noteActive, noteViewport, publish } from "./state";
import { isTableSuppressed, tableProp } from "./table-mode";
import { countPoints } from "./workloads";

const SERIES: Series[] = w1DenseSeries();
const REFERENCES = w1References();
const ALL_IDS = SERIES.map((s) => s.id);

/** The narrower width the resize pass moves to, and back. */
const WIDE = 1100;
const NARROW = 720;

export const WorkloadB: Component = () => {
  const [visibleSeries, setVisibleSeries] = createSignal<readonly string[]>(ALL_IDS);
  let host: HTMLDivElement | undefined;
  let toggleAt = 0;
  let isolated = false;

  onMount(() => {
    const root = document.getElementById("root");
    const surface = document.getElementById("surface");
    if (!root || !surface) return;

    publish({
      workload: "w-b",
      points: countPoints(SERIES),
      surface: "[data-perf-surface] [data-silkplot-keyboard-surface]",
      pathological: (on) => {
        setPathological(on, host, on ? SERIES.flatMap((s) => s.data) : undefined);
        return pathologicalRebuilds();
      },
      // Toggling ONE series at a time, cycling: each call is the commit a user's
      // legend click produces. The driver calls this repeatedly inside a recorded
      // pass, so the frames measured are the frames of a user working the legend.
      legendToggle: () => {
        const id = ALL_IDS[toggleAt % ALL_IDS.length] as string;
        toggleAt++;
        setVisibleSeries((now) =>
          now.includes(id) ? now.filter((x) => x !== id) : [...now, id],
        );
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
        visibleSeries={visibleSeries()}
        height={420}
        wheelZoom
        brushSelect
        onVisibleDomainChange={() => noteViewport()}
        onActivePointChange={(point) => noteActive(point)}
        table={tableProp()}
        title="W-B — twenty-two sensors with three references"
        summary="Twenty-two same-domain sensor series crossing zero, with two value references and one temporal reference."
        xTickFormat={(t) => t.toISOString().slice(0, 10)}
      />
      <Legend
        series={SERIES}
        visibleSeries={visibleSeries()}
        onVisibilityChange={setVisibleSeries}
        label="W-B sensors"
        maxHeight="120px"
      />
    </div>
  );
};
