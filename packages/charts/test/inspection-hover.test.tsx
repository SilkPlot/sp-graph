/**
 * Composed-chart pointer inspection — the hover half of the interaction contract
 * (the record-and-viewport decision, and the tooltip/hover decision).
 *
 * The keyboard half is proven in `LineChart-keyboard.test.tsx`; this is the
 * pointer half: a hover resolves the nearest datum, drives the crosshair, the
 * active mark, the tooltip, and the announcement from that ONE state, and clears
 * on pointer-leave. Real browser, real `PointerEvent`s, real layout — a pointer
 * coordinate means nothing without them — and a double-frame wait, because the
 * pointer path coalesces into `requestAnimationFrame`.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import type {
  ActivePoint,
  RankedCategory,
  Series,
  SeriesDatum,
} from "@silkplot/core";
import { AreaChart, BarChart, LineChart, ScatterChart } from "../src/index";
import type { TimePoint, XYPoint } from "../src/index";

const SIZE = { width: 400, height: 300 };

const DATA: TimePoint[] = [
  { t: new Date(Date.UTC(2026, 0, 1)), y: 3 },
  { t: new Date(Date.UTC(2026, 0, 2)), y: 7 },
  { t: new Date(Date.UTC(2026, 0, 3)), y: 2 },
  { t: new Date(Date.UTC(2026, 0, 4)), y: 9 },
];

const surfaceOf = (c: HTMLElement) =>
  c.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]") ??
  c.querySelector<HTMLElement>("[data-silkplot-pointer-surface]");
const crosshairOf = (c: HTMLElement) => c.querySelector("[data-silkplot-crosshair]");
const tooltipOf = (c: HTMLElement) => c.querySelector("[data-silkplot-tooltip]");
const announcerOf = (c: HTMLElement) => c.querySelector("[data-silkplot-announcer]");

/** Two frames: the pointer path schedules one rAF, and layout settles in the next. */
const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** Move the pointer to a fraction across the surface and let the frame settle. */
async function hoverAt(surface: HTMLElement, fx: number, fy = 0.5): Promise<void> {
  const rect = surface.getBoundingClientRect();
  surface.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: rect.left + rect.width * fx,
      clientY: rect.top + rect.height * fy,
    }),
  );
  await frame();
}

async function leave(surface: HTMLElement): Promise<void> {
  surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
  await frame();
}

describe("LineChart hover", () => {
  it("resolves the nearest datum and drives crosshair, tooltip, and announcement from one state", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <LineChart
        data={DATA}
        title="Weekly bookings"
        desc="Four days"
        {...SIZE}
        tooltip={(a) => <span data-testid="tt">{String(a.datum.y)}</span>}
        onActivePointChange={onChange}
      />
    ));
    const surface = surfaceOf(container)!;
    expect(surface).not.toBeNull();

    // Nothing active before a hover.
    expect(crosshairOf(container)).toBeNull();
    expect(tooltipOf(container)).toBeNull();

    await hoverAt(surface, 0.5);

    // One target, read by every surface.
    expect(crosshairOf(container)).not.toBeNull();
    const tip = tooltipOf(container);
    expect(tip).not.toBeNull();
    expect(tip!.querySelector('[data-testid="tt"]')).not.toBeNull();
    expect(announcerOf(container)!.textContent).not.toBe("");

    // The callback fired with a real record whose datum is a present reading.
    expect(onChange).toHaveBeenCalled();
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<SeriesDatum> | undefined;
    expect(active).toBeDefined();
    expect(active?.at.kind).toBe("time");
    expect(typeof active?.datum.y).toBe("number");

    // Leaving the plot clears everything together.
    await leave(surface);
    expect(crosshairOf(container)).toBeNull();
    expect(tooltipOf(container)).toBeNull();
    expect(announcerOf(container)!.textContent).toBe("");
    expect(onChange.mock.calls.at(-1)?.[0]).toBeUndefined();
  });

  it("hands raw datum metadata to the tooltip without a cast", async () => {
    interface Reading {
      serial: string;
    }
    const series: Series<Reading>[] = [
      {
        id: "probe",
        label: "Probe",
        data: [
          { t: new Date(Date.UTC(2026, 0, 1)), y: 5, meta: { serial: "PA-1" } },
          { t: new Date(Date.UTC(2026, 0, 2)), y: 8, meta: { serial: "PA-2" } },
        ],
      },
    ];
    let seen: unknown;
    const { container } = render(() => (
      <LineChart
        series={series}
        title="Probe"
        desc="Two readings"
        {...SIZE}
        tooltip={(a) => {
          seen = (a.datum.meta as Reading | undefined)?.serial;
          return <span>{String(a.datum.y)}</span>;
        }}
      />
    ));
    const surface = surfaceOf(container)!;
    await hoverAt(surface, 0.9); // near the second reading
    expect(seen).toBe("PA-2");
  });

  it("shared-time: the record carries every visible series' value at the instant", async () => {
    const t0 = new Date(Date.UTC(2026, 0, 1));
    const t1 = new Date(Date.UTC(2026, 0, 2));
    const series: Series[] = [
      { id: "a", label: "A", data: [{ t: t0, y: 1 }, { t: t1, y: 2 }] },
      { id: "b", label: "B", data: [{ t: t0, y: 10 }, { t: t1, y: 20 }] },
    ];
    const onChange = vi.fn();
    const { container } = render(() => (
      <LineChart series={series} title="Two series" desc="Shared time" {...SIZE} onActivePointChange={onChange} />
    ));
    const surface = surfaceOf(container)!;
    await hoverAt(surface, 0.05); // near the first instant
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<SeriesDatum> | undefined;
    expect(active?.atTime?.map((e: { seriesId: string }) => e.seriesId)).toEqual(["a", "b"]);
  });
});

describe("other families hover", () => {
  it("Area resolves a datum on hover", async () => {
    const { container } = render(() => (
      <AreaChart data={DATA} title="Area" desc="Four days" {...SIZE} tooltip={(a) => <span>{String(a.datum.y)}</span>} />
    ));
    const surface = surfaceOf(container)!;
    await hoverAt(surface, 0.5);
    expect(crosshairOf(container)).not.toBeNull();
    expect(tooltipOf(container)).not.toBeNull();
  });

  it("Scatter resolves the nearest point, with a value-kind record", async () => {
    const data: XYPoint[] = [
      { x: 1, y: 1 },
      { x: 5, y: 9 },
      { x: 9, y: 2 },
    ];
    const onChange = vi.fn();
    const { container } = render(() => (
      <ScatterChart data={data} title="Cloud" desc="Three points" {...SIZE} onActivePointChange={onChange} />
    ));
    const surface = surfaceOf(container)!;
    await hoverAt(surface, 0.5, 0.5);
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<XYPoint> | undefined;
    expect(active).toBeDefined();
    expect(active?.at.kind).toBe("value");
    expect(crosshairOf(container)).not.toBeNull();
  });

  it("Bar resolves the band under the pointer, with a category-kind record", async () => {
    const categories: RankedCategory[] = [
      { id: "a", label: "Alpha", value: 3 },
      { id: "b", label: "Bravo", value: 7 },
      { id: "c", label: "Cad", value: 5 },
    ];
    const onChange = vi.fn();
    const { container } = render(() => (
      <BarChart categories={categories} title="Ranked" desc="Three bars" {...SIZE} onActivePointChange={onChange} />
    ));
    const surface = surfaceOf(container)!;
    await hoverAt(surface, 0.5, 0.5); // over the middle band
    const active = onChange.mock.calls.at(-1)?.[0] as ActivePoint<RankedCategory> | undefined;
    expect(active).toBeDefined();
    expect(active?.at.kind).toBe("category");
    // The active bar is emphasised with a stroke.
    const emphasised = container.querySelector('rect[stroke-width="2"]');
    expect(emphasised).not.toBeNull();
  });
});

describe("hover wording and configuration", () => {
  it("uses a caller pointLabel over the default, on the time families", async () => {
    const pointLabel = (d: TimePoint) => `custom ${d.y}`;

    const ln = render(() => (
      <LineChart data={DATA} title="L" desc="d" {...SIZE} pointLabel={pointLabel} onActivePointChange={() => {}} />
    ));
    await hoverAt(surfaceOf(ln.container)!, 0.5);
    expect(announcerOf(ln.container)!.textContent).toContain("custom ");
    ln.unmount();

    const ar = render(() => <AreaChart data={DATA} title="A" desc="d" {...SIZE} pointLabel={pointLabel} />);
    await hoverAt(surfaceOf(ar.container)!, 0.5);
    expect(announcerOf(ar.container)!.textContent).toContain("custom ");
    ar.unmount();
  });

  it("uses a caller pointLabel on the scatter family", async () => {
    const { container } = render(() => (
      <ScatterChart
        data={[{ x: 1, y: 1 }, { x: 9, y: 9 }]}
        title="S"
        desc="d"
        {...SIZE}
        pointLabel={(d) => `pt ${d.x}`}
      />
    ));
    await hoverAt(surfaceOf(container)!, 0.9, 0.9);
    expect(announcerOf(container)!.textContent).toContain("pt ");
  });

  it("falls back to a nameless default label when the chart is only labelledBy", async () => {
    // No `title` — the name comes from a page heading via `labelledBy`, so the
    // chart's own `name()` is empty and the default wording drops the series.
    const { container } = render(() => (
      <>
        <h2 id="h">External heading</h2>
        <LineChart data={DATA} labelledBy="h" desc="d" {...SIZE} onActivePointChange={() => {}} />
      </>
    ));
    const surface = surfaceOf(container)!;
    await hoverAt(surface, 0.5);
    const said = announcerOf(container)!.textContent ?? "";
    expect(said).not.toBe("");
    expect(said).not.toContain("External heading"); // the heading is not the wording
  });

  it("keeps hover working with the keyboard explicitly off, over a bare surface, on every family", async () => {
    const cats: RankedCategory[] = [
      { id: "a", label: "Alpha", value: 3 },
      { id: "b", label: "Bravo", value: 7 },
    ];
    const series: Series[] = [{ id: "s", label: "S", data: DATA }];
    const renders = [
      () => <LineChart data={DATA} title="L" desc="d" {...SIZE} keyboard={false} onActivePointChange={vi.fn()} />,
      () => <AreaChart data={DATA} title="A" desc="d" {...SIZE} keyboard={false} />,
      () => (
        <ScatterChart data={[{ x: 1, y: 1 }, { x: 9, y: 9 }]} title="S" desc="d" {...SIZE} keyboard={false} />
      ),
      () => <BarChart categories={cats} title="B" desc="d" {...SIZE} keyboard={false} />,
      // Multi-series paths (Line and Area share MultiSeriesBody), keyboard off.
      () => <LineChart series={series} title="Lm" desc="d" {...SIZE} keyboard={false} />,
      () => <AreaChart series={series} title="Am" desc="d" {...SIZE} keyboard={false} />,
    ];
    for (const r of renders) {
      const { container, unmount } = render(r);
      // No keyboard composite — the tab stop is gone; a bare pointer surface stands in.
      expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
      const bare = container.querySelector<HTMLElement>("[data-silkplot-pointer-surface]");
      expect(bare, "a bare pointer surface should stand in for the keyboard one").not.toBeNull();
      await hoverAt(bare!, 0.5, 0.5);
      // A hover resolves even without the keyboard composite.
      const hit = container.querySelector("[data-silkplot-crosshair]") ?? container.querySelector('rect[stroke-width="2"]');
      expect(hit).not.toBeNull();
      unmount();
    }
  });

  it("resolves a horizontal bar on the vertical (py) axis", async () => {
    const categories: RankedCategory[] = [
      { id: "a", label: "Alpha", value: 3 },
      { id: "b", label: "Bravo", value: 7 },
      { id: "c", label: "Cad", value: 5 },
    ];
    const { container } = render(() => (
      <BarChart categories={categories} orientation="horizontal" title="Ranked" desc="d" {...SIZE} />
    ));
    const surface = surfaceOf(container)!;
    await hoverAt(surface, 0.5, 0.5);
    expect(container.querySelector('rect[stroke-width="2"]')).not.toBeNull();
  });

  it("announces a bar with no finite value as 'no value'", async () => {
    const categories: RankedCategory[] = [
      { id: "a", label: "Alpha", value: Number.NaN },
      { id: "b", label: "Bravo", value: 7 },
    ];
    const { container } = render(() => (
      <BarChart categories={categories} title="Ranked" desc="d" {...SIZE} />
    ));
    const surface = surfaceOf(container)!;
    await hoverAt(surface, 0.2, 0.5); // over the first (NaN) band
    expect(announcerOf(container)!.textContent).toContain("no value");
  });
});
