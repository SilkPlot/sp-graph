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
 *
 * Each panel uses the inspectable input shape for its family. Temporal panels
 * are one-element series (rather than the legacy single-data arm) so the caller
 * can own axis and table formatting; ranked bars keep their category identity
 * so keyboard inspection and tooltip content read the records being drawn.
 */
import { AreaChart, BarChart, LineChart } from "@silkplot/charts";
import type { ActivePoint, RankedCategory, Series, SeriesDatum } from "@silkplot/core";
import { For, Show, createSignal, onMount, type Component } from "solid-js";
import { w1DashboardDeck } from "../../../packages/charts/test/workload-fixtures";
import { settle, setPathological, pathologicalRebuilds } from "./instrument";
import { noteActive, publish } from "./state";
import { summarizeDashboardFixture } from "./workload-fidelity";
import { WC_CHARTS } from "./workloads";

const DECK = w1DashboardDeck(WC_CHARTS);
const DECK_FIDELITY = summarizeDashboardFixture(DECK);

const WIDE = 1100;
const NARROW = 720;
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

const unitValue = new Intl.NumberFormat("en-ZA", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const formatLocalTime = (instant: Date): string => localTime.format(instant);
const formatUnits = (value: number): string => `${unitValue.format(value)} units`;

// Explicit identity formatters preserve source instants and numeric cells in
// every temporal panel's inspectable/exportable table.
const formatSourceTime = (instant: Date): string => instant.toISOString();
const formatSourceValue = (value: number): number => value;

const TemporalTooltip: Component<{ active: ActivePoint<SeriesDatum> }> = (props) => (
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
    <div>{props.active.datum.y === null ? "No reading" : formatUnits(props.active.datum.y)}</div>
  </div>
);

const RankedTooltip: Component<{ active: ActivePoint<RankedCategory> }> = (props) => (
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
    <div>{props.active.datum.label}</div>
    <div>{formatUnits(props.active.datum.value)}</div>
  </div>
);

/**
 * One panel. Split out as its own component deliberately: forty-eight inline
 * ternaries in a `For` is the shape that produced a real complexity finding on
 * the public site, and the fix there was the same one — name the piece.
 */
const Panel: Component<{
  panel: (typeof DECK)[number];
  index: number;
  narrow: boolean;
}> = (props) => {
  const temporalSeries: readonly Series[] = [
    {
      id: `${props.panel.id}-value`,
      label: "Value",
      data: props.panel.time,
    },
  ];
  const title = (): string =>
    props.narrow ? `${props.panel.title} — narrow` : props.panel.title;
  const summary = (): string =>
    props.narrow
      ? `Panel ${props.index + 1} of ${WC_CHARTS} in the mounted deck, using the narrow layout.`
      : `Panel ${props.index + 1} of ${WC_CHARTS} in the mounted deck.`;

  return (
    <Show when={props.panel.family !== "bar"} fallback={
      <BarChart
        categories={props.panel.categories}
        height={150}
        title={title()}
        summary={summary()}
        valueTickFormat={formatUnits}
        tooltip={(active) => <RankedTooltip active={active} />}
      />
    }>
      <Show
        when={props.panel.family === "line"}
        fallback={
          <AreaChart
            series={temporalSeries}
            height={150}
            title={title()}
            summary={summary()}
            xTickFormat={formatLocalTime}
            yTickFormat={formatUnits}
            tableTimeFormat={formatSourceTime}
            tableValueFormat={formatSourceValue}
            tooltip={(active) => <TemporalTooltip active={active} />}
          />
        }
      >
        <LineChart
          series={temporalSeries}
          height={150}
          title={title()}
          summary={summary()}
          xTickFormat={formatLocalTime}
          yTickFormat={formatUnits}
          tableTimeFormat={formatSourceTime}
          tableValueFormat={formatSourceValue}
          tooltip={(active) => <TemporalTooltip active={active} />}
          onActivePointChange={(point) => noteActive(point)}
        />
      </Show>
    </Show>
  );
};

export const WorkloadC: Component = () => {
  const [revealed, setRevealed] = createSignal(false);
  const [mounted, setMounted] = createSignal(true);
  const [narrow, setNarrow] = createSignal(false);
  let host: HTMLDivElement | undefined;

  onMount(() => {
    const root = document.getElementById("root");
    const surface = document.getElementById("surface");
    if (!root || !surface) return;

    publish({
      workload: "w-c",
      points: DECK_FIDELITY.renderedPoints,
      // The FIRST chart's surface. The interaction pass drives one chart while
      // the other forty-seven sit idle, which is the whole question here.
      surface: "[data-perf-deck] [data-silkplot-keyboard-surface]",
      pathological: (on) => {
        setPathological(on, host, on ? DECK_FIDELITY.pathologicalSeries : undefined);
        return pathologicalRebuilds();
      },
      reveal: () => settle(root, () => setRevealed(true)),
      resize: (width) =>
        settle(root, () => {
          setNarrow(width <= NARROW);
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
          <For each={DECK}>
            {(panel, i) => <Panel panel={panel} index={i()} narrow={narrow()} />}
          </For>
        </div>
      </Show>
    </div>
  );
};
