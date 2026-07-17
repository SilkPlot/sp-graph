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
  Gridlines,
  Crosshair,
  TooltipAnchor,
  ChartAnnouncer,
  createCartesianModel,
  useChartBounds,
} from "@silkplot/solid";
import { timeScale, linePath, createHitIndex, timeLabelFormat } from "@silkplot/core";
import { cssVar } from "@silkplot/theme";

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
  const [active, setActive] = createSignal<number | undefined>(undefined);

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

  const datum = () => (active() === undefined ? undefined : props.data[active()!]);
  const label = timeLabelFormat("%b %-d");
  const message = () => {
    const d = datum();
    return d ? `${label(d.t)}, ${d.y}` : "";
  };

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
    setActive(nearest < 0 ? undefined : nearest);
  };

  const onPointerMove = (e: PointerEvent): void => {
    clientX = e.clientX;
    clientY = e.clientY;
    // Coalesce: pointermove outruns paints, and rendering positions nobody sees
    // is the easiest way to lose the frame budget.
    if (!frame) frame = requestAnimationFrame(resolve);
  };

  // Keyboard writes the SAME state the pointer does — one active point, not a
  // parallel path. Single active point, not a tab stop per datum.
  const onKeyDown = (e: KeyboardEvent): void => {
    const last = props.data.length - 1;
    if (e.key === "Escape") {
      setActive(undefined);
      return;
    }
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    const current = active();
    setActive(
      current === undefined
        ? e.key === "ArrowRight"
          ? 0
          : last
        : Math.min(last, Math.max(0, current + step)),
    );
  };

  return (
    <>
      <SvgLayer role="img" title="Sample daily series, hover or arrow-key to inspect">
        <Show when={model.hasArea()}>
          <Gridlines scale={model.y()} axis="y" />
          <Gridlines scale={model.x()} axis="x" />
          <Axis scale={model.y()} orientation="left" />
          <Axis scale={model.x()} orientation="bottom" />
          <path
            d={pathD()}
            fill="none"
            stroke={cssVar("color-focus-ring")}
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <For each={datum() ? [datum()!] : []}>
            {(d) => (
              <circle
                cx={model.x()(d.t)}
                cy={model.y()(d.y)}
                r="4"
                fill={cssVar("color-focus-ring")}
              />
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
        A transparent capture layer over the whole container. The tooltip sets
        pointer-events: none, so it never steals the events that position it.
        tabindex makes the chart ONE focus stop — arrow keys move within it.
      */}
      <div
        ref={surface}
        role="application"
        aria-label="Sample daily series. Use arrow keys to step through points."
        tabindex="0"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(undefined)}
        onKeyDown={onKeyDown}
        style={{ position: "absolute", inset: "0", outline: "none" }}
      />
    </>
  );
};

const InteractiveLine: Component<{ data: readonly TimePoint[] }> = (props) => (
  <ChartRoot>
    <InteractiveLineBody data={props.data} />
  </ChartRoot>
);

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
          stroke={cssVar("color-focus-ring")}
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

        <Panel title="AreaChart" note="areaPath fill from the zero baseline, beneath a linePath stroke.">
          <AreaChart
            data={series()}
            title="Sample daily series, filled"
            fill={cssVar("color-focus-ring")}
            stroke={cssVar("color-focus-ring")}
          />
        </Panel>

        <Panel title="BarChart" note="bandScale x + linear y. Wednesday is negative — it hangs below zero.">
          <BarChart
            data={CATEGORIES}
            title="Weekday totals, including a negative"
            fill={cssVar("color-focus-ring")}
          />
        </Panel>

        <Panel title="ScatterChart" note="Two linear scales. Domain is the data extent — no forced zero.">
          <ScatterChart
            data={cloud()}
            title="Deterministic 2-D point cloud"
            fill={cssVar("color-focus-ring")}
            fillOpacity={0.7}
          />
        </Panel>
      </div>

      <p style={{ "margin-top": cssVar("space-lg"), color: cssVar("color-muted") }}>
        Resize the window — <code>ChartRoot</code> re-measures via
        <code> ResizeObserver</code> and every scale, path, and tick recomputes
        through Solid memos.
      </p>
    </main>
  );
};
