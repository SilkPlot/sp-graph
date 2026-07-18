/**
 * The visual-regression fixture page.
 *
 * One chart, one case, one fixed box, chosen by query string:
 *
 *     /?chart=line&case=dense-label
 *
 * One chart per page load rather than a gallery, deliberately. A gallery makes
 * every baseline depend on the layout of every other fixture beside it, so
 * adding a case re-pins baselines it has nothing to do with, and a diff points
 * at the page instead of at the chart.
 *
 * Scheme, contrast, and reduced motion are NOT set here. They are emulated as
 * user-agent preferences by the Playwright context, which is the path a real
 * user's OS drives — and contrast and motion are deliberately not
 * application-selectable in this library.
 */
import { type Component, Show } from "solid-js";
import { AreaChart, BarChart, LineChart, ScatterChart } from "@silkplot/charts";
import { seriesChannel } from "@silkplot/theme";
import {
  CATEGORY_DEFAULT,
  CATEGORY_DENSE,
  CATEGORY_EMPTY,
  CATEGORY_NEGATIVE,
  TIME_DEFAULT,
  TIME_DENSE,
  TIME_EMPTY,
  TIME_NEGATIVE,
  XY_DEFAULT,
  XY_DENSE,
  XY_EMPTY,
  XY_NEGATIVE,
} from "./fixtures";

type Chart = "line" | "area" | "bar" | "scatter";
type Case = "default" | "empty" | "negative" | "dense-label" | "responsive-mobile";

const CHARTS: readonly Chart[] = ["line", "area", "bar", "scatter"];
const CASES: readonly Case[] = [
  "default",
  "empty",
  "negative",
  "dense-label",
  "responsive-mobile",
];

/**
 * A bad query string throws rather than falling back to a default.
 *
 * A fixture page that silently substitutes `default` for a typo would still
 * screenshot successfully, and the resulting baseline would be a picture of the
 * wrong case under the right name — the most expensive kind of green.
 */
const parse = <T extends string>(value: string | null, allowed: readonly T[], what: string): T => {
  if (value !== null && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`visual fixture: unknown ${what} ${JSON.stringify(value)}`);
};

/** Fixed pixel boxes, except the mobile case which is fluid on purpose. */
const boxFor = (kase: Case): { width: string; height: string } =>
  kase === "responsive-mobile"
    ? { width: "100%", height: "260px" }
    : kase === "dense-label"
      ? { width: "380px", height: "220px" }
      : { width: "640px", height: "360px" };

const timeData = (kase: Case) =>
  kase === "empty"
    ? TIME_EMPTY
    : kase === "negative"
      ? TIME_NEGATIVE
      : kase === "dense-label"
        ? TIME_DENSE
        : TIME_DEFAULT;

const categoryData = (kase: Case) =>
  kase === "empty"
    ? CATEGORY_EMPTY
    : kase === "negative"
      ? CATEGORY_NEGATIVE
      : kase === "dense-label"
        ? CATEGORY_DENSE
        : CATEGORY_DEFAULT;

const xyData = (kase: Case) =>
  kase === "empty"
    ? XY_EMPTY
    : kase === "negative"
      ? XY_NEGATIVE
      : kase === "dense-label"
        ? XY_DENSE
        : XY_DEFAULT;

/**
 * Every chart is informative and named. That is not fixture politeness: an
 * informative chart with no name throws in a development build, and this page
 * is served by a dev server.
 *
 * No `table` prop is passed, so no HTML data alternative renders. The table's
 * markup and ARIA relationships are asserted by the accessibility suite; its
 * pixels would put a page of text in every frame, where a screenshot gate is at
 * its most brittle and least informative. That exclusion is recorded in
 * `acceptance-set.ts` rather than left to be inferred from an empty frame.
 */
const ChartFor: Component<{ chart: Chart; case: Case }> = (props) => (
  <>
    <Show when={props.chart === "line"}>
      <LineChart
        data={timeData(props.case)}
        title="Daily samples"
        desc="A deterministic daily series in units, rendered for a visual baseline."
        stroke={seriesChannel(0).color}
        strokeWidth={2}
      />
    </Show>
    <Show when={props.chart === "area"}>
      <AreaChart
        data={timeData(props.case)}
        title="Daily samples, filled"
        desc="The same deterministic daily series, filled from the zero baseline."
        fill={seriesChannel(1).color}
        stroke={seriesChannel(1).color}
      />
    </Show>
    <Show when={props.chart === "bar"}>
      <BarChart
        data={categoryData(props.case)}
        title="Totals by category"
        desc="Deterministic categorical totals, drawn from the zero baseline."
        fill={seriesChannel(2).color}
      />
    </Show>
    <Show when={props.chart === "scatter"}>
      <ScatterChart
        data={xyData(props.case)}
        title="Two-dimensional cloud"
        desc="A deterministic point cloud over two linear scales, domain taken from the data extent."
        fill={seriesChannel(3).color}
        fillOpacity={0.7}
      />
    </Show>
  </>
);

export const App: Component = () => {
  const params = new URLSearchParams(window.location.search);
  const chart = parse<Chart>(params.get("chart"), CHARTS, "chart");
  const kase = parse<Case>(params.get("case"), CASES, "case");
  const box = boxFor(kase);

  return (
    <div
      data-visual-target=""
      data-visual-chart={chart}
      data-visual-case={kase}
      style={{
        width: box.width,
        height: box.height,
        // The box is the screenshot subject, so its own edges must be stable:
        // padding and border-box sizing keep the plot area identical whether or
        // not a border is painted by the resolved theme.
        padding: "8px",
        "box-sizing": "border-box",
      }}
    >
      <ChartFor chart={chart} case={kase} />
    </div>
  );
};
