/**
 * Playground app — renders a real @silkplot/charts LineChart from sample data.
 *
 * This is the end-to-end proof: @silkplot/core computes scales/paths/ticks,
 * @silkplot/solid renders the SVG + axes, @silkplot/charts composes them, and
 * @silkplot/theme supplies the tokens — all wired across workspace packages.
 */
import {
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  Show,
  For,
  type Component,
  type JSX,
} from "solid-js";
import {
  LineChart,
  AreaChart,
  BarChart,
  ScatterChart,
  type TimePoint,
  type CategoryPoint,
  type XYPoint,
} from "@silkplot/charts";
import {
  ChartRoot,
  SvgLayer,
  Axis,
  Dashboard,
  DashboardSection,
  DashboardTimeControl,
  Gridlines,
  Crosshair,
  TooltipAnchor,
  ChartAnnouncer,
  ChartKeyboardSurface,
  createActiveDatum,
  createCartesianModel,
  createChartKeyboard,
  useChartBounds,
} from "@silkplot/solid";
import { timeScale, linePath, createHitIndex, timeLabelFormat } from "@silkplot/core";
import {
  cssVar,
  seriesChannel,
  markerPath,
  FOCUS_CLASS,
  THEME_ATTR,
  type SeriesChannel,
} from "@silkplot/theme";

/** Deterministic sample series: 30 days of a wandering value. */
function makeSeries(days: number): TimePoint[] {
  const start = new Date("2026-01-01T00:00:00Z").getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  let value = 20;
  const out: TimePoint[] = [];
  for (let i = 0; i < days; i++) {
    // Deterministic pseudo-random walk (no Math.random — stable across renders).
    const wobble = Math.sin(i / 3) * 6 + Math.cos(i / 7) * 3;
    value = Math.max(2, 20 + wobble + i * 0.4);
    out.push({ t: new Date(start + i * dayMs), y: Math.round(value * 10) / 10 });
  }
  return out;
}

/** Categories including a negative, so the zero baseline is visible. */
const CATEGORIES: CategoryPoint[] = [
  { label: "Mon", y: 12 },
  { label: "Tue", y: 19 },
  { label: "Wed", y: -6 },
  { label: "Thu", y: 8 },
  { label: "Fri", y: 15 },
];

/** Deterministic 2-D cloud — a lattice with a sine offset, no Math.random. */
function makeCloud(n: number): XYPoint[] {
  const out: XYPoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: (i % 10) * 4 + Math.sin(i) * 1.5, y: Math.cos(i / 2) * 10 + i * 0.3 });
  }
  return out;
}

/**
 * The reference composition for interaction.
 *
 * This is what a consumer writes, and it is written HERE rather than inside
 * LineChart on purpose: the primitives are told a position, and resolving a
 * pointer into an active datum is the caller's job (ADR-0002). Nothing below
 * needs library support that does not already exist.
 *
 * It follows the ADR's frame-budget rules literally, because a demo that
 * ignored them would be the thing people copy:
 *   - the index is a memo, rebuilt when data or scales change, never per event;
 *   - pointermove only records coordinates and asks for a frame;
 *   - the container rect is cached and refreshed on resize/scroll, never read
 *     per event — getBoundingClientRect on every move forces sync layout;
 *   - one state write per frame, however many events arrived.
 */
const InteractiveLineBody: Component<{ data: readonly TimePoint[] }> = (props) => {
  const bounds = useChartBounds();
  // ONE active-datum state, written by the pointer path below and by the
  // keyboard composite. Not two signals kept in step — the same object, which is
  // the only arrangement in which the two paths cannot resolve different points
  // (ADR-0002 §1, §4).
  const active = createActiveDatum({ count: () => props.data.length });
  const keyboard = createChartKeyboard({ active });

  const model = createCartesianModel({
    data: () => props.data,
    x: (range) =>
      timeScale({
        domain: [
          props.data[0]?.t ?? new Date(0),
          props.data[props.data.length - 1]?.t ?? new Date(1),
        ],
        range,
      }),
    y: { accessor: (d) => d.y, domain: "zero-floor" },
  });

  // Delaunay is the wrong index for a monotonic series — a bisector answers the
  // same question far cheaper — but the bisector does not exist yet. That the
  // swap will touch nothing below is the point of the ADR's split.
  const index = createMemo(() =>
    createHitIndex(props.data, {
      x: (d) => model.x()(d.t),
      y: (d) => model.y()(d.y),
    }),
  );

  const pathD = createMemo(() =>
    linePath(props.data, {
      x: (d) => model.x()(d.t),
      y: (d) => model.y()(d.y),
      curve: "monotoneX",
    }),
  );

  const datum = () =>
    active.index() === undefined ? undefined : props.data[active.index()!];
  const label = timeLabelFormat("%b %-d");
  // Series, x, y and units, not a bare number — the wording ADR-0005 §4 asks
  // for, supplied here because it is domain language the library cannot invent.
  const pointLabel = (index: number): string => {
    const d = props.data[index];
    return d ? `Sample daily series, ${label(d.t)}, ${d.y} units` : "";
  };
  const message = () => (active.index() === undefined ? "" : pointLabel(active.index()!));

  let surface: HTMLDivElement | undefined;
  let rect: DOMRect | undefined;
  let frame = 0;
  let clientX = 0;
  let clientY = 0;

  const refreshRect = (): void => {
    rect = surface?.getBoundingClientRect();
  };

  onMount(() => {
    refreshRect();
    window.addEventListener("resize", refreshRect, { passive: true });
    // Capture phase: a scroll in any ancestor moves us, not just the window.
    window.addEventListener("scroll", refreshRect, { passive: true, capture: true });
    onCleanup(() => {
      window.removeEventListener("resize", refreshRect);
      window.removeEventListener("scroll", refreshRect, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    });
  });

  const resolve = (): void => {
    frame = 0;
    if (!rect) return;
    const b = bounds();
    const nearest = index().nearest(
      clientX - rect.left - b.margins.left,
      clientY - rect.top - b.margins.top,
    );
    // The pointer writes the shared state through the same `set` the keyboard
    // composite writes through. A miss clears rather than clamping to an end.
    active.set(nearest < 0 ? undefined : nearest);
  };

  const onPointerMove = (e: PointerEvent): void => {
    clientX = e.clientX;
    clientY = e.clientY;
    // Coalesce: pointermove outruns paints, and rendering positions nobody sees
    // is the easiest way to lose the frame budget.
    if (!frame) frame = requestAnimationFrame(resolve);
  };

  return (
    <>
      <SvgLayer role="img" title="Sample daily series, hover or arrow-key to inspect">
        <Show when={model.hasArea()}>
          <Gridlines scale={model.y()} axis="y" />
          <Gridlines scale={model.x()} axis="x" />
          <Axis scale={model.y()} orientation="left" />
          <Axis scale={model.x()} orientation="bottom" />
          {/*
            The series reads a CATEGORICAL token, not the focus-ring token it
            used to borrow. Painting data in the focus colour meant the focus
            indicator and the data were the same colour — an indicator that
            cannot be told apart from the thing it indicates is not one.
          */}
          <path
            d={pathD()}
            fill="none"
            stroke={seriesChannel(0).color}
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <For each={datum() ? [datum()!] : []}>
            {(d) => (
              <>
                {/*
                  The active point is marked by SIZE and a ringed OUTLINE as well
                  as colour, so "which point is selected" survives both a
                  monochrome rendering and a reader who cannot separate the
                  series hue from the cursor hue. The surface-coloured under-ring
                  keeps the marker legible where it lands on a gridline.
                */}
                <circle
                  cx={model.x()(d.t)}
                  cy={model.y()(d.y)}
                  r="7"
                  fill="none"
                  stroke={cssVar("color-surface")}
                  stroke-width="4"
                />
                <circle
                  cx={model.x()(d.t)}
                  cy={model.y()(d.y)}
                  r="7"
                  fill="none"
                  stroke={cssVar("color-cursor")}
                  stroke-width="2"
                />
                <path
                  d={markerPath(seriesChannel(0).shape, model.x()(d.t), model.y()(d.y), 4)}
                  fill={seriesChannel(0).color}
                />
              </>
            )}
          </For>
          <Crosshair
            x={datum() ? model.x()(datum()!.t) : undefined}
            y={datum() ? model.y()(datum()!.y) : undefined}
          />
        </Show>
      </SvgLayer>

      <Show when={datum()}>
        {(d) => (
          <TooltipAnchor x={model.x()(d().t)} y={model.y()(d().y)}>
            <div
              style={{
                background: cssVar("color-text"),
                color: cssVar("color-surface"),
                padding: "4px 8px",
                "border-radius": cssVar("radius-md"),
                "font-size": cssVar("font-sm"),
                "white-space": "nowrap",
              }}
            >
              {label(d().t)} · <strong>{d().y}</strong>
            </div>
          </TooltipAnchor>
        )}
      </Show>

      <ChartAnnouncer message={message()} />

      {/*
        The composite. A transparent layer over the whole container that is both
        the pointer capture surface and the chart's ONE tab stop — the same
        element, so the two input paths cannot attach to different things and
        drift. The tooltip sets pointer-events: none, so it never steals the
        events that position it.

        This element used to be `role="application"` with only ArrowLeft/Right,
        and ADR-0005 §3 rejects that outright: it competes with the screen
        reader's own browse-mode keys, is not a reliable win, and a proper widget
        role already performs the mode switch. It is now a `listbox` — one tab
        stop, arrows/Home/End/Page inside, Tab out, Escape to clear — with the
        active point exposed as a real option element.

        `activeDescendant={false}` because the live region below carries the
        step. Doing both would announce every step twice.
      */}
      <ChartKeyboardSurface
        keyboard={keyboard}
        optionLabel={pointLabel}
        activeDescendant={false}
        class={FOCUS_CLASS}
        label="Sample daily series. Use arrow keys to step through points."
        onPointerMove={onPointerMove}
        onPointerLeave={() => active.clear()}
        ref={surface}
      />
    </>
  );
};

const InteractiveLine: Component<{ data: readonly TimePoint[] }> = (props) => (
  <ChartRoot>
    <InteractiveLineBody data={props.data} />
  </ChartRoot>
);

/** A named series plus the redundant channels that identify it. */
interface NamedSeries {
  name: string;
  points: TimePoint[];
  channel: SeriesChannel;
}

/** Three deterministic series over a shared 12-day domain. */
function makeNamedSeries(): NamedSeries[] {
  const start = new Date("2026-03-01T00:00:00Z").getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const shapes: Array<[string, (i: number) => number]> = [
    ["Bookings", (i) => 30 + Math.sin(i / 2.5) * 8 + i * 1.1],
    ["Cancellations", (i) => 18 + Math.cos(i / 3) * 5],
    ["Walk-ins", (i) => 8 + Math.sin(i / 1.7) * 4 + i * 0.5],
  ];
  return shapes.map(([name, f], s) => ({
    name,
    channel: seriesChannel(s),
    points: Array.from({ length: 12 }, (_, i) => ({
      t: new Date(start + i * dayMs),
      y: Math.round(f(i) * 10) / 10,
    })),
  }));
}

/**
 * Multi-series lines where colour is one channel of four, not the only one.
 *
 * ADR-0005 §5: "Colour never uniquely encodes. Meaning is redundant across
 * direct label, marker shape, stroke pattern, or luminance as well as colour."
 * Each series here carries all four:
 *
 *   - COLOUR   — `--sp-cat-N`, which follows the scheme × contrast cascade and
 *                clears 3:1 against whichever surface it resolves on;
 *   - DASH     — `--sp-cat-dash-N`, readable along the whole stroke;
 *   - SHAPE    — a distinct marker per series, readable at a single point where
 *                a dash pattern is not;
 *   - LABEL    — the series name drawn at its own last point, so identification
 *                needs no legend lookup at all.
 *
 * The legend below repeats the encoding rather than replacing it; a chart that
 * is only readable via its legend has moved the problem, not solved it.
 */
const MultiSeriesBody: Component<{ series: NamedSeries[] }> = (props) => {
  // All points across all series: the y domain has to cover every series, and
  // the x domain has to span the union of their time ranges.
  const allPoints = () => props.series.flatMap((s) => s.points);
  const first = () => props.series[0]!.points;

  const model = createCartesianModel({
    data: allPoints,
    x: (range) =>
      timeScale({
        domain: [first()[0]!.t, first()[first().length - 1]!.t],
        range,
      }),
    y: { accessor: (d) => d.y, domain: "zero-floor" },
  });

  const label = timeLabelFormat("%b %-d");

  return (
    <SvgLayer
      role="img"
      title="Bookings, cancellations and walk-ins over twelve days"
    >
      <Show when={model.hasArea()}>
        <Gridlines scale={model.y()} axis="y" />
        <Axis scale={model.y()} orientation="left" />
        <Axis scale={model.x()} orientation="bottom" format={label} />
        <For each={props.series}>
          {(s) => {
            const last = () => s.points[s.points.length - 1]!;
            return (
              <g>
                <path
                  d={linePath(s.points, {
                    x: (d) => model.x()(d.t),
                    y: (d) => model.y()(d.y),
                    curve: "linear",
                  })}
                  fill="none"
                  stroke={s.channel.color}
                  stroke-width="2"
                  stroke-dasharray={s.channel.dash}
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                <For each={s.points}>
                  {(d) => (
                    <path
                      d={markerPath(
                        s.channel.shape,
                        model.x()(d.t),
                        model.y()(d.y),
                        3.5,
                      )}
                      fill={s.channel.color}
                    />
                  )}
                </For>
                {/*
                  Direct label at the series' own last point. `text-anchor: end`
                  keeps it inside the plot; the surface-coloured paint-order
                  stroke keeps it legible where it crosses another series.
                */}
                <text
                  x={model.x()(last().t) - 6}
                  y={model.y()(last().y) - 8}
                  text-anchor="end"
                  fill={s.channel.color}
                  stroke={cssVar("color-surface")}
                  stroke-width="3"
                  paint-order="stroke"
                  font-size={cssVar("font-sm")}
                  font-weight="600"
                >
                  {s.name}
                </text>
              </g>
            );
          }}
        </For>
      </Show>
    </SvgLayer>
  );
};

const MultiSeries: Component<{ series: NamedSeries[] }> = (props) => (
  <ChartRoot margins={{ right: 24 }}>
    <MultiSeriesBody series={props.series} />
  </ChartRoot>
);

/**
 * The legend repeats each series' colour, dash AND shape in a swatch, so the
 * legend itself is not colour-only either — the usual place this rule is
 * broken even by charts that follow it on the plot.
 */
const SeriesLegend: Component<{ series: NamedSeries[] }> = (props) => (
  <ul
    style={{
      display: "flex",
      "flex-wrap": "wrap",
      gap: cssVar("space-lg"),
      "list-style": "none",
      margin: `${cssVar("space-md")} 0 0`,
      padding: "0",
      "font-size": cssVar("font-md"),
    }}
  >
    <For each={props.series}>
      {(s) => (
        <li style={{ display: "flex", "align-items": "center", gap: cssVar("space-sm") }}>
          <svg width="34" height="14" aria-hidden="true">
            <line
              x1="1"
              y1="7"
              x2="33"
              y2="7"
              stroke={s.channel.color}
              stroke-width="2"
              stroke-dasharray={s.channel.dash}
            />
            <path d={markerPath(s.channel.shape, 17, 7, 4)} fill={s.channel.color} />
          </svg>
          {s.name}
        </li>
      )}
    </For>
  </ul>
);

/**
 * Explicit theme selection, so the `data-sp-theme` paths are reachable in the
 * playground rather than only under an OS setting nobody can toggle mid-review.
 *
 * The selected button is marked by `aria-pressed`, a heavier border and a
 * leading "✓" — never by colour alone, which is the same rule the charts follow.
 */
const ThemeControl: Component = () => {
  const [mode, setMode] = createSignal<"system" | "light" | "dark">("system");

  const apply = (next: "system" | "light" | "dark"): void => {
    setMode(next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute(THEME_ATTR);
    else root.setAttribute(THEME_ATTR, next);
  };

  return (
    <fieldset
      style={{
        border: `1px solid ${cssVar("color-grid")}`,
        "border-radius": cssVar("radius-md"),
        padding: cssVar("space-md"),
        margin: `0 0 ${cssVar("space-lg")}`,
        display: "flex",
        "align-items": "center",
        gap: cssVar("space-md"),
      }}
    >
      <legend style={{ "font-size": cssVar("font-sm"), color: cssVar("color-muted") }}>
        Colour scheme
      </legend>
      <For each={["system", "light", "dark"] as const}>
        {(m) => (
          <button
            type="button"
            class={FOCUS_CLASS}
            aria-pressed={mode() === m}
            onClick={() => apply(m)}
            style={{
              font: "inherit",
              "font-size": cssVar("font-md"),
              padding: `${cssVar("space-sm")} ${cssVar("space-md")}`,
              "border-radius": cssVar("radius-md"),
              border: `${mode() === m ? "2px" : "1px"} solid ${cssVar("color-axis")}`,
              background: cssVar("color-surface"),
              color: cssVar("color-text"),
              cursor: "pointer",
            }}
          >
            {mode() === m ? "✓ " : ""}
            {m}
          </button>
        )}
      </For>
    </fieldset>
  );
};

const Panel: Component<{ title: string; note: string; children: JSX.Element }> = (props) => (
  <section style={{ "margin-bottom": cssVar("space-lg") }}>
    <h2 style={{ margin: "0 0 2px", "font-size": "15px" }}>{props.title}</h2>
    <p style={{ margin: "0 0 6px", "font-size": "13px", color: cssVar("color-muted") }}>
      {props.note}
    </p>
    <div
      style={{
        width: "100%",
        height: "260px",
        border: `1px solid ${cssVar("color-grid")}`,
        "border-radius": cssVar("radius-lg"),
        padding: cssVar("space-md"),
        "box-sizing": "border-box",
      }}
    >
      {props.children}
    </div>
  </section>
);

export const App: Component = () => {
  const [series] = createSignal<TimePoint[]>(makeSeries(30));
  const [cloud] = createSignal<XYPoint[]>(makeCloud(40));
  const [named] = createSignal<NamedSeries[]>(makeNamedSeries());

  return (
    <main
      style={{
        "font-family": "system-ui, sans-serif",
        "max-width": "820px",
        margin: "0 auto",
        padding: cssVar("space-xl"),
        color: cssVar("color-text"),
        background: cssVar("color-surface"),
        "min-height": "100vh",
      }}
    >
      <header style={{ "margin-bottom": cssVar("space-lg") }}>
        <h1 style={{ margin: "0 0 4px" }}>SilkPlot</h1>
        <p style={{ margin: 0, color: cssVar("color-muted") }}>
          D3 computes, Solid renders. A live <code>LineChart</code> — axes computed
          from scales, no <code>d3-axis</code>.
        </p>
      </header>

      <ThemeControl />

      <section
        style={{
          width: "100%",
          height: "360px",
          border: `1px solid ${cssVar("color-grid")}`,
          "border-radius": cssVar("radius-lg"),
          padding: cssVar("space-md"),
          "box-sizing": "border-box",
        }}
      >
        <LineChart
          data={series()}
          title="Sample daily series, January 2026"
          stroke={seriesChannel(0).color}
          strokeWidth={2}
        />
      </section>

      <div style={{ "margin-top": cssVar("space-lg") }}>
        <Panel
          title="Interaction — the reference composition"
          note="Hover, or focus it and use arrow keys. Crosshair and TooltipAnchor are told a position; resolving the pointer is this page's job, not theirs."
        >
          <InteractiveLine data={series()} />
        </Panel>

        <Panel
          title="Multi-series — colour is one channel of four"
          note="Each series carries colour, a stroke dash, a marker shape and a direct label. Cover the colours and the chart still reads; that is the test ADR-0005 §5 sets."
        >
          <MultiSeries series={named()} />
        </Panel>
        <SeriesLegend series={named()} />

        <Panel title="AreaChart" note="areaPath fill from the zero baseline, beneath a linePath stroke.">
          <AreaChart
            data={series()}
            title="Sample daily series, filled"
            fill={seriesChannel(1).color}
            stroke={seriesChannel(1).color}
          />
        </Panel>

        <Panel title="BarChart" note="bandScale x + linear y. Wednesday is negative — it hangs below zero.">
          <BarChart
            data={CATEGORIES}
            title="Weekday totals, including a negative"
            fill={seriesChannel(2).color}
          />
        </Panel>

        <Panel title="ScatterChart" note="Two linear scales. Domain is the data extent — no forced zero.">
          <ScatterChart
            data={cloud()}
            title="Deterministic 2-D point cloud"
            fill={seriesChannel(3).color}
            fillOpacity={0.7}
          />
        </Panel>
      </div>

      {/*
        A composed dashboard: one selection, two isolated sections, one
        latest-value reading. It is here because the playground is the library's
        reference surface and this is the composition consumers build — and
        because the frame-budget harness needs a served composed page to measure
        rather than a single chart. Point it here with
        `--selector "[data-perf-dashboard] [data-silkplot-keyboard-surface]"`.
      */}
      <div data-perf-dashboard="" style={{ "margin-top": cssVar("space-lg") }}>
        <Dashboard
          defaultRange={{
            start: series()[0]?.t.getTime() ?? 0,
            end: series()[series().length - 1]?.t.getTime() ?? 1,
          }}
        >
          <Panel title="Dashboard" note="One global range drives every member below.">
            <DashboardTimeControl />
          </Panel>

          <DashboardSection
            label="Whole range"
            window={{
              start: series()[0]?.t.getTime() ?? 0,
              end: series()[series().length - 1]?.t.getTime() ?? 1,
            }}
          >
            <LineChart data={series()} title="Samples over the selected range" />
          </DashboardSection>

          <DashboardSection label="Most recent" latest>
            <LineChart data={series()} title="Current reading" />
          </DashboardSection>
        </Dashboard>
      </div>

      <p style={{ "margin-top": cssVar("space-lg"), color: cssVar("color-muted") }}>
        Resize the window — <code>ChartRoot</code> re-measures via
        <code> ResizeObserver</code> and every scale, path, and tick recomputes
        through Solid memos.
      </p>
    </main>
  );
};
