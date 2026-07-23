/**
 * W-C — forty-eight mounted charts. The many-chart dashboard.
 *
 * This workload measures the things that only go wrong at scale, and each one is
 * a different failure:
 *
 *   - the initial REVEAL, from a hidden container, because a chart that measures
 *     itself has nothing to measure while hidden and forty-eight of them
 *     discovering their size in the same frame is the worst case for that path;
 *   - the final RESIZE of all forty-eight, which is the same path driven by a
 *     real layout change rather than a first appearance;
 *   - active interaction on ONE chart while forty-seven sit idle, which is where
 *     a page-level listener per chart would show up as forty-eight handlers
 *     running for one pointer;
 *   - UNMOUNT and the heap either side of it, which is where a retained listener,
 *     observer, or animation frame shows up as memory that never comes back.
 *
 * It starts HIDDEN. `display: none` rather than zero height or `visibility`,
 * because that is the hard case: a container with no box at all. A chart that
 * measures itself has nothing to measure there, and the contract is that it
 * emits NO geometry rather than non-finite geometry — a `NaN` in a path is a
 * silently blank chart, and forty-eight of them appearing at once is where that
 * would first show up.
 */
import { AreaChart, BarChart, LineChart } from "@silkplot/charts";
import { For, Show, createSignal, onMount, type Component } from "solid-js";
import { w1DashboardDeck } from "../../../packages/charts/test/workload-fixtures";
import { settle, setPathological, pathologicalRebuilds } from "./instrument";
import { noteActive, publish } from "./state";
import { WC_CHARTS } from "./workloads";

const DECK = w1DashboardDeck(WC_CHARTS);

/** Points across the whole deck — the number a per-chart figure has to be read against. */
const DECK_POINTS = DECK.reduce((n, p) => n + p.time.length, 0);

const WIDE = 1100;
const NARROW = 720;

/**
 * One panel. Split out as its own component deliberately: forty-eight inline
 * ternaries in a `For` is the shape that produced a real complexity finding on
 * the public site, and the fix there was the same one — name the piece.
 */
const Panel: Component<{ panel: (typeof DECK)[number]; index: number }> = (props) => {
  const common = {
    height: 150,
    title: props.panel.title,
    summary: `Panel ${props.index + 1} of ${WC_CHARTS} in the mounted deck.`,
  };
  return (
    <Show when={props.panel.family !== "bar"} fallback={
      <BarChart
        data={props.panel.categories.map((c) => ({ label: c.label, y: c.value }))}
        {...common}
      />
    }>
      <Show
        when={props.panel.family === "line"}
        fallback={<AreaChart data={props.panel.time} {...common} />}
      >
        <LineChart
          data={props.panel.time}
          {...common}
          onActivePointChange={(point) => noteActive(point)}
        />
      </Show>
    </Show>
  );
};

export const WorkloadC: Component = () => {
  const [revealed, setRevealed] = createSignal(false);
  const [mounted, setMounted] = createSignal(true);
  let host: HTMLDivElement | undefined;

  onMount(() => {
    const root = document.getElementById("root");
    const surface = document.getElementById("surface");
    if (!root || !surface) return;

    publish({
      workload: "w-c",
      points: DECK_POINTS,
      // The FIRST chart's surface. The interaction pass drives one chart while
      // the other forty-seven sit idle, which is the whole question here.
      surface: "[data-perf-deck] [data-silkplot-keyboard-surface]",
      pathological: (on) => {
        setPathological(on, host, on ? DECK.flatMap((p) => p.time) : undefined);
        return pathologicalRebuilds();
      },
      reveal: () => settle(root, () => setRevealed(true)),
      resize: (width) =>
        settle(root, () => {
          surface.style.width = `${width}px`;
        }),
      unmount: () => settle(root, () => setMounted(false)),
    });
  });

  return (
    <div
      ref={host}
      data-perf-surface=""
      data-perf-wide={WIDE}
      data-perf-narrow={NARROW}
      data-perf-charts={WC_CHARTS}
    >
      <Show when={mounted()}>
        <div class="deck" data-perf-deck="" style={{ display: revealed() ? "grid" : "none" }}>
          <For each={DECK}>{(panel, i) => <Panel panel={panel} index={i()} />}</For>
        </div>
      </Show>
    </div>
  );
};
