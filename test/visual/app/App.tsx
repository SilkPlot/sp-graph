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
import type { Series } from "@silkplot/core";
import {
  CATEGORY_DEFAULT,
  CATEGORY_DENSE,
  CATEGORY_EMPTY,
  CATEGORY_NEGATIVE,
  SERIES_22,
  SERIES_FOUR,
  SERIES_GAPS,
  SERIES_ONE,
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
type Case =
  | "default"
  | "empty"
  | "negative"
  | "dense-label"
  | "responsive-mobile"
  | MultiCase;

/**
 * The multi-series cases (ADR-0008), which only `line` and `area` can render —
 * `bar` and `scatter` have no multi-series surface. The acceptance set is what
 * keeps a bar+multi request from ever being made; `ChartFor` renders nothing
 * for that pair rather than inventing a fallback, and a blank baseline would be
 * caught by the declared-versus-on-disk inventory.
 */
type MultiCase = "multi-one" | "multi-four" | "multi-22" | "multi-22-narrow" | "multi-gaps";

const MULTI_CASES: readonly MultiCase[] = [
  "multi-one",
  "multi-four",
  "multi-22",
  "multi-22-narrow",
  "multi-gaps",
];

const isMulti = (kase: Case): kase is MultiCase =>
  (MULTI_CASES as readonly string[]).includes(kase);

const CHARTS: readonly Chart[] = ["line", "area", "bar", "scatter"];
const CASES: readonly Case[] = [
  "default",
  "empty",
  "negative",
  "dense-label",
  "responsive-mobile",
  ...MULTI_CASES,
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
  kase === "responsive-mobile" || kase === "multi-22-narrow"
    ? { width: "100%", height: "260px" }
    : kase === "dense-label"
      ? { width: "380px", height: "220px" }
      : { width: "640px", height: "360px" };

/** Which series set a multi-series case draws. */
const seriesData = (kase: MultiCase): readonly Series[] =>
  kase === "multi-one"
    ? SERIES_ONE
    : kase === "multi-four"
      ? SERIES_FOUR
      : kase === "multi-gaps"
        ? SERIES_GAPS
        : SERIES_22;

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
 * Every chart passes `tableHidden`, which keeps the data alternative in the
 * accessibility tree and out of the picture. Charts began rendering a table by
 * default on 2026-07-19; before that, passing no `table` prop was enough to keep
 * it out of frame, and this comment said so.
 *
 * The reason for keeping it out is unchanged and is the point: the table's
 * markup and ARIA relationships are asserted by the accessibility suite, while
 * its pixels would put a page of text in every frame — text layout is where a
 * screenshot gate is least informative and most brittle. `tableHidden` is the
 * right opt-out rather than a test-only flag because it is exactly what it
 * claims: the application presents this content itself. That exclusion is
 * recorded in `acceptance-set.ts` rather than left to be inferred from a frame
 * that happens to look empty.
 */
const ChartFor: Component<{ chart: Chart; case: Case }> = (props) => (
  <>
    <Show when={props.chart === "line" && !isMulti(props.case)}>
      <LineChart
        tableHidden
        data={timeData(props.case)}
        title="Daily samples"
        desc="A deterministic daily series in units, rendered for a visual baseline."
        stroke={seriesChannel(0).color}
        strokeWidth={2}
      />
    </Show>
    {/*
      The multi-series branches pass NO `stroke`, deliberately. The whole point
      of these baselines is what the library assigns by default — the
      array-position palette of ADR-0009 and the dash channel that keeps series
      apart in monochrome. Pinning a caller-supplied colour here would pin the
      fixture's choice and prove nothing about the palette.
    */}
    <Show when={props.chart === "line" && isMulti(props.case)}>
      <LineChart
        tableHidden
        series={seriesData(props.case as MultiCase)}
        title="Daily samples by sensor"
        desc="Deterministic multi-series daily readings, rendered for a visual baseline."
      />
    </Show>
    <Show when={props.chart === "area" && !isMulti(props.case)}>
      <AreaChart
        tableHidden
        data={timeData(props.case)}
        title="Daily samples, filled"
        desc="The same deterministic daily series, filled from the zero baseline."
        fill={seriesChannel(1).color}
        stroke={seriesChannel(1).color}
      />
    </Show>
    <Show when={props.chart === "area" && isMulti(props.case)}>
      <AreaChart
        tableHidden
        series={seriesData(props.case as MultiCase)}
        title="Daily samples by sensor, filled"
        desc="Deterministic multi-series daily readings, filled from the zero baseline."
      />
    </Show>
    <Show when={props.chart === "bar" && !isMulti(props.case)}>
      <BarChart
        tableHidden
        data={categoryData(props.case)}
        title="Totals by category"
        desc="Deterministic categorical totals, drawn from the zero baseline."
        fill={seriesChannel(2).color}
      />
    </Show>
    <Show when={props.chart === "scatter" && !isMulti(props.case)}>
      <ScatterChart
        tableHidden
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
