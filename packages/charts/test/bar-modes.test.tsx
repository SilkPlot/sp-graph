/**
 * Grouped and stacked BarChart — both orientations, mixed signs.
 *
 * Geometry is cross-checked against `@silkplot/core` layout helpers, never
 * hardcoded d3 numbers. The single-series `data` / `categories` path is
 * deliberately not re-tested here; those pictures live in BarChart.test and
 * ranked-bars.test and must stay.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@solidjs/testing-library";
import { vi } from "vitest";
import { createSignal, type ComponentProps } from "solid-js";
import {
  bandScale,
  categoryTimesOf,
  groupSeries,
  layoutBarRects,
  linearScale,
  normalizeSeries,
  stackSeries,
  stackedValueDomain,
  valueDomainOf,
  type Series,
} from "@silkplot/core";
import { applyYDomainPolicy } from "@silkplot/solid";
import { BarChart } from "../src/index";
import {
  activeFromBarRect,
  announceMultiBar,
  categoryLabel,
  seriesFillOf,
  valueLabel,
  type MultiSeriesBarProps,
} from "../src/BarChartMulti";
import { assertBarInputs } from "../src/scaffold";
import {
  HEIGHT,
  INNER_HEIGHT,
  INNER_WIDTH,
  WIDTH,
  bars as getBars,
  expectNoNaN,
  num,
  axisLabels,
} from "./support";

const RECT_ATTRS = ["x", "y", "width", "height"] as const;

const T0 = Date.UTC(2026, 2, 1);
const T1 = Date.UTC(2026, 2, 2);
const T2 = Date.UTC(2026, 2, 3);

const SIGNED: readonly Series[] = [
  {
    id: "inlet",
    label: "Inlet",
    data: [
      { t: new Date(T0), y: 10 },
      { t: new Date(T1), y: -8 },
      { t: new Date(T2), y: 4 },
    ],
  },
  {
    id: "outlet",
    label: "Outlet",
    data: [
      { t: new Date(T0), y: 5 },
      { t: new Date(T1), y: 6 },
      { t: new Date(T2), y: -3 },
    ],
  },
];

const NAME = "Flow by sensor";
const DESC = "Inlet and outlet, mixed signs, grouped or stacked.";

interface ModeCase {
  mode: "grouped" | "stacked";
  series?: readonly Series[];
  visibleSeries?: readonly string[];
  orientation?: "vertical" | "horizontal";
  keyboard?: boolean;
  data?: readonly { label: string; y: number }[];
  categories?: readonly { id: string; label: string; value: number }[];
}

const mount = (props: ModeCase) =>
  render(() => {
    const merged = {
      title: NAME,
      desc: DESC,
      width: WIDTH,
      height: HEIGHT,
      ...props,
    } as ComponentProps<typeof BarChart>;
    return <BarChart {...merged} />;
  });

function expectedRects(
  series: readonly Series[],
  mode: "grouped" | "stacked",
  orientation: "vertical" | "horizontal",
) {
  const visible = normalizeSeries(series, { strict: false }).visible;
  const keys = categoryTimesOf(visible);
  const segs = mode === "stacked" ? stackSeries(visible, keys) : groupSeries(visible, keys);
  const raw = mode === "stacked" ? stackedValueDomain(segs) : valueDomainOf(visible);
  const band = bandScale({
    domain: keys.map(String),
    range: orientation === "vertical" ? [0, INNER_WIDTH] : [0, INNER_HEIGHT],
  });
  const value = linearScale({
    domain: applyYDomainPolicy(raw, "zero-baseline"),
    range: orientation === "vertical" ? [INNER_HEIGHT, 0] : [0, INNER_WIDTH],
  });
  return layoutBarRects(segs, {
    mode,
    orientation,
    band,
    value,
    seriesIds: visible.map((s) => s.id),
  });
}

describe("grouped geometry", () => {
  it("draws one bar per present reading, matching the core layout", () => {
    const { container } = mount({ mode: "grouped", series: SIGNED });
    const rects = getBars(container);
    const expected = expectedRects(SIGNED, "grouped", "vertical");
    expect(rects).toHaveLength(expected.length);
    expected.forEach((e, i) => {
      const r = rects[i] as SVGRectElement;
      expect(num(r, "x")).toBeCloseTo(e.x, 5);
      expect(num(r, "y")).toBeCloseTo(e.y, 5);
      expect(num(r, "width")).toBeCloseTo(e.width, 5);
      expect(num(r, "height")).toBeCloseTo(e.height, 5);
    });
  });

  it("hangs negatives below the baseline when vertical", () => {
    const { container } = mount({ mode: "grouped", series: SIGNED });
    const expected = expectedRects(SIGNED, "grouped", "vertical");
    const negative = expected.find((r) => r.value < 0)!;
    const painted = getBars(container)[expected.indexOf(negative)] as SVGRectElement;
    expect(num(painted, "height")).toBeGreaterThan(0);
    expect(num(painted, "y")).toBeCloseTo(negative.y, 5);
  });

  it("transposes onto the other axis when horizontal", () => {
    const { container } = mount({
      mode: "grouped",
      series: SIGNED,
      orientation: "horizontal",
    });
    const expected = expectedRects(SIGNED, "grouped", "horizontal");
    const rects = getBars(container);
    expect(rects).toHaveLength(expected.length);
    expected.forEach((e, i) => {
      expect(num(rects[i] as SVGRectElement, "x")).toBeCloseTo(e.x, 5);
      expect(num(rects[i] as SVGRectElement, "y")).toBeCloseTo(e.y, 5);
      expect(num(rects[i] as SVGRectElement, "width")).toBeCloseTo(e.width, 5);
      expect(num(rects[i] as SVGRectElement, "height")).toBeCloseTo(e.height, 5);
    });
  });
});

describe("stacked geometry", () => {
  it("stacks positives up and negatives down, matching the core layout", () => {
    const { container } = mount({ mode: "stacked", series: SIGNED });
    const expected = expectedRects(SIGNED, "stacked", "vertical");
    const rects = getBars(container);
    expect(rects).toHaveLength(expected.length);
    expected.forEach((e, i) => {
      const r = rects[i] as SVGRectElement;
      expect(num(r, "x")).toBeCloseTo(e.x, 5);
      expect(num(r, "y")).toBeCloseTo(e.y, 5);
      expect(num(r, "width")).toBeCloseTo(e.width, 5);
      expect(num(r, "height")).toBeCloseTo(e.height, 5);
    });
  });

  it("transposes when horizontal", () => {
    const { container } = mount({
      mode: "stacked",
      series: SIGNED,
      orientation: "horizontal",
    });
    const expected = expectedRects(SIGNED, "stacked", "horizontal");
    getBars(container).forEach((r, i) => {
      expect(num(r, "x")).toBeCloseTo(expected[i]!.x, 5);
      expect(num(r, "width")).toBeCloseTo(expected[i]!.width, 5);
      expect(num(r, "y")).toBeCloseTo(expected[i]!.y, 5);
      expect(num(r, "height")).toBeCloseTo(expected[i]!.height, 5);
    });
  });
});

describe("shared bar interaction contracts", () => {
  it("drops a hidden series from the picture and the table", () => {
    const { container } = mount({
      mode: "grouped",
      series: SIGNED,
      visibleSeries: ["inlet"],
    });
    expect(getBars(container)).toHaveLength(3);
    expect(container.textContent).toContain("Inlet");
    expect(container.textContent).not.toContain("Outlet");
  });

  it("omits a missing category rather than drawing zero", () => {
    const gapped: readonly Series[] = [
      {
        id: "a",
        label: "A",
        data: [
          { t: new Date(T0), y: 10 },
          { t: new Date(T1), y: null },
        ],
      },
      {
        id: "b",
        label: "B",
        data: [
          { t: new Date(T0), y: 4 },
          { t: new Date(T1), y: 7 },
        ],
      },
    ];
    const { container } = mount({ mode: "stacked", series: gapped });
    expect(getBars(container)).toHaveLength(3);
  });

  it("exposes the series table as the semantic alternative", () => {
    const { container } = mount({ mode: "grouped", series: SIGNED });
    expect(container.textContent).toContain("Time");
    expect(container.textContent).toContain("Inlet");
    expect(container.textContent).toContain("Outlet");
  });

  it("announces series, category, and value together", () => {
    const { container } = mount({ mode: "grouped", series: SIGNED, keyboard: true });
    const surface = container.querySelector("[tabindex]") as HTMLElement | null;
    expect(surface).not.toBeNull();
    surface!.focus();
    fireEvent.keyDown(surface!, { key: "ArrowRight" });
    const live = container.querySelector("[aria-live]");
    expect(live?.textContent ?? "").toMatch(/Inlet|Outlet/);
  });

  it("announces without a chart-name prefix when named only by reference", () => {
    const { container } = render(() => (
      <>
        <h2 id="bar-heading">External heading</h2>
        <BarChart
          labelledBy="bar-heading"
          desc={DESC}
          width={WIDTH}
          height={HEIGHT}
          mode="grouped"
          series={SIGNED}
          keyboard
        />
      </>
    ));
    const surface = container.querySelector("[tabindex]") as HTMLElement | null;
    expect(surface).not.toBeNull();
    surface!.focus();
    fireEvent.keyDown(surface!, { key: "ArrowRight" });
    const live = container.querySelector("[aria-live]");
    const said = live?.textContent ?? "";
    expect(said).toMatch(/Inlet|Outlet/);
    expect(said.startsWith("External heading")).toBe(false);
  });
});

describe("the single-series path is unchanged", () => {
  it("draws ranked `data` exactly as BarChart.test does", () => {
    const data = [
      { label: "a", y: 10 },
      { label: "b", y: 25 },
      { label: "c", y: 5 },
    ];
    const { container } = render(() => (
      <BarChart title={NAME} desc={DESC} data={data} width={WIDTH} height={HEIGHT} />
    ));
    expect(getBars(container)).toHaveLength(3);
    expectNoNaN(container, "*", RECT_ATTRS);
  });
});

describe("assertBarInputs", () => {
  it("stays silent when only one honest input is present", () => {
    const seen: string[] = [];
    const sink = (m: string) => seen.push(m);
    assertBarInputs({ data: [] }, { strict: false, onIssue: sink });
    assertBarInputs({ categories: [] }, { strict: false, onIssue: sink });
    assertBarInputs({ series: [], mode: "grouped" }, { strict: false, onIssue: sink });
    expect(seen).toHaveLength(0);
  });

  it("diagnoses data and categories the same way as before", () => {
    const seen: string[] = [];
    expect(() =>
      assertBarInputs({ data: [], categories: [] }, { strict: false, onIssue: (m) => seen.push(m) }),
    ).not.toThrow();
    expect(seen[0]).toContain("`categories` is used and `data` is ignored");
  });

  it("refuses to let series silently fight data", () => {
    const seen: string[] = [];
    assertBarInputs(
      { data: [], series: [], mode: "grouped" },
      { strict: false, onIssue: (m) => seen.push(m) },
    );
    expect(seen.some((m) => m.includes("`series` is used"))).toBe(true);
  });

  it("refuses mode on the single-series path", () => {
    const seen: string[] = [];
    assertBarInputs({ data: [], mode: "stacked" }, { strict: false, onIssue: (m) => seen.push(m) });
    expect(seen[0]).toContain("`mode` is ignored");
  });

  it("refuses series without mode", () => {
    const seen: string[] = [];
    assertBarInputs({ series: [] }, { strict: false, onIssue: (m) => seen.push(m) });
    expect(seen[0]).toContain("`series` is ignored");
  });

  it("throws in the strict posture", () => {
    expect(() => assertBarInputs({ data: [], series: [] }, { strict: true })).toThrow(/series/);
  });

  it("falls back to console.warn when no sink is supplied", () => {
    const original = console.warn;
    const seen: unknown[] = [];
    console.warn = (...args: unknown[]) => void seen.push(args[0]);
    try {
      assertBarInputs({ series: [] }, { strict: false });
    } finally {
      console.warn = original;
    }
    expect(seen).toHaveLength(1);
  });
});

describe("formatters and opt-ins", () => {
  it("uses categoryTickFormat on the category axis", () => {
    const { container } = render(() => (
      <BarChart
        title={NAME}
        desc={DESC}
        width={WIDTH}
        height={HEIGHT}
        mode="grouped"
        series={SIGNED}
        categoryTickFormat={(label) => `d:${label.slice(8)}`}
      />
    ));
    expect(axisLabels(container, "bottom").some((t) => t?.startsWith("d:"))).toBe(true);
  });

  it("falls back to xTickFormat and yTickFormat when the ranked names are absent", () => {
    const { container } = render(() => (
      <BarChart
        title={NAME}
        desc={DESC}
        width={WIDTH}
        height={HEIGHT}
        mode="stacked"
        series={SIGNED}
        xTickFormat={(d) => d.toISOString().slice(5, 10)}
        yTickFormat={(n) => `${n}|`}
        tableTimeFormat={(d) => d.toISOString()}
        tableValueFormat={(y, label) => `${label}:${y}`}
      />
    ));
    expect(container.textContent).toContain("Inlet:");
    expect(getBars(container).length).toBeGreaterThan(0);
  });

  it("honours rotate and measured-left opt-ins without throwing", () => {
    const vertical = render(() => (
      <BarChart
        title={NAME}
        desc={DESC}
        width={200}
        height={HEIGHT}
        mode="grouped"
        series={SIGNED}
        rotateCategoryLabels
      />
    ));
    expect(getBars(vertical.container).length).toBeGreaterThan(0);
    vertical.unmount();

    const { container } = render(() => (
      <BarChart
        title={NAME}
        desc={DESC}
        width={WIDTH}
        height={HEIGHT}
        mode="grouped"
        series={SIGNED}
        orientation="horizontal"
        rotateCategoryLabels
        measureCategoryLeftMargin
      />
    ));
    expect(getBars(container).length).toBeGreaterThan(0);
  });

  it("resolves a pointer hover to one series datum", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <BarChart
        title={NAME}
        desc={DESC}
        width={WIDTH}
        height={HEIGHT}
        mode="grouped"
        series={SIGNED}
        tooltip={(a) => <span data-testid="tt">{a.seriesId}</span>}
        onActivePointChange={onChange}
      />
    ));
    const surface =
      container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]") ??
      container.querySelector<HTMLElement>("[data-silkplot-pointer-surface]");
    expect(surface).not.toBeNull();
    const box = surface!.getBoundingClientRect();
    surface!.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: box.left + box.width * 0.2,
        clientY: box.top + box.height * 0.4,
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(onChange).toHaveBeenCalled();
    expect(container.querySelector("[data-testid='tt']")?.textContent).toMatch(/inlet|outlet/);
  });

  it("renders an empty series as a frame with no bars", () => {
    const { container } = render(() => (
      <BarChart title={NAME} desc={DESC} width={WIDTH} height={HEIGHT} mode="grouped" series={[]} />
    ));
    expect(getBars(container)).toHaveLength(0);
  });

  it("commits the active datum through onActivate", () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <BarChart
        title={NAME}
        desc={DESC}
        width={WIDTH}
        height={HEIGHT}
        mode="grouped"
        series={SIGNED}
        keyboard
        onActivate={onActivate}
      />
    ));
    const surface = container.querySelector("[tabindex]") as HTMLElement | null;
    expect(surface).not.toBeNull();
    surface!.focus();
    fireEvent.keyDown(surface!, { key: "ArrowRight" });
    fireEvent.keyDown(surface!, { key: "Enter" });
    expect(onActivate).toHaveBeenCalled();
    expect(onActivate.mock.calls[0]?.[0]?.seriesId).toMatch(/inlet|outlet/);
  });

  it("keeps pointer hover when the keyboard composite is off", async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <BarChart
        title={NAME}
        desc={DESC}
        width={WIDTH}
        height={HEIGHT}
        mode="stacked"
        series={SIGNED}
        keyboard={false}
        onActivePointChange={onChange}
      />
    ));
    expect(container.querySelector("[data-silkplot-keyboard-surface]")).toBeNull();
    const surface = container.querySelector<HTMLElement>("[data-silkplot-pointer-surface]");
    expect(surface).not.toBeNull();
    const box = surface!.getBoundingClientRect();
    surface!.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: box.left + box.width * 0.2,
        clientY: box.top + box.height * 0.4,
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(onChange).toHaveBeenCalled();
  });
});

describe("visibility is live", () => {
  it("removes bars when a series is hidden after mount", () => {
    const [visible, setVisible] = createSignal<readonly string[]>(["inlet", "outlet"]);
    const { container } = render(() => (
      <BarChart
        title={NAME}
        desc={DESC}
        width={WIDTH}
        height={HEIGHT}
        mode="grouped"
        series={SIGNED}
        visibleSeries={visible()}
      />
    ));
    expect(getBars(container)).toHaveLength(6);
    setVisible(["inlet"]);
    expect(getBars(container)).toHaveLength(3);
  });
});

describe("wording and lookup helpers", () => {
  const point = {
    seriesId: "inlet",
    sourceIndex: 0,
    datum: { t: new Date(T0), y: 10 },
    position: { x: 1, y: 2 },
    at: { kind: "category" as const, category: "2026-03-01" },
  };

  it("announces name, series, category, and value", () => {
    expect(
      announceMultiBar(point, {
        seriesLabel: "Inlet",
        chartName: NAME,
        category: "2026-03-01",
        formatValue: (v, label) => `${label}:${v}`,
      }),
    ).toBe(`${NAME}, Inlet, 2026-03-01, Inlet:10`);
  });

  it("drops the chart name when the chart is named only by reference", () => {
    expect(
      announceMultiBar(point, {
        seriesLabel: "Inlet",
        chartName: "",
        category: "2026-03-01",
        formatValue: (v) => String(v),
      }),
    ).toBe("Inlet, 2026-03-01, 10");
  });

  it("falls back to the series id when the series has no label", () => {
    expect(
      announceMultiBar(point, {
        chartName: "",
        category: "day",
        formatValue: (v) => String(v),
      }),
    ).toBe("inlet, day, 10");
  });

  it("says no value for a missing or non-finite reading", () => {
    expect(
      announceMultiBar(
        { ...point, datum: { t: new Date(T0), y: null } },
        {
          seriesLabel: "Inlet",
          chartName: "",
          category: "day",
          formatValue: (v) => String(v),
        },
      ),
    ).toBe("Inlet, day, no value");
    expect(
      announceMultiBar(
        { ...point, datum: { t: new Date(T0), y: Number.NaN } },
        {
          seriesLabel: "Inlet",
          chartName: "",
          category: "day",
          formatValue: (v) => String(v),
        },
      ),
    ).toBe("Inlet, day, no value");
  });

  it("returns an empty string when nothing is active", () => {
    expect(
      announceMultiBar(undefined, {
        chartName: NAME,
        category: "day",
        formatValue: (v) => String(v),
      }),
    ).toBe("");
  });

  it("formats category and value through each named formatter, then the default", () => {
    const time = T0;
    const withCategory: MultiSeriesBarProps = {
      mode: "grouped",
      series: SIGNED,
      semantics: {} as MultiSeriesBarProps["semantics"],
      categoryTickFormat: (label) => `d:${label.slice(8)}`,
    };
    expect(categoryLabel(time, withCategory)).toBe("d:01");

    const withX: MultiSeriesBarProps = {
      mode: "grouped",
      series: SIGNED,
      semantics: {} as MultiSeriesBarProps["semantics"],
      xTickFormat: (d) => d.toISOString().slice(5, 10),
    };
    expect(categoryLabel(time, withX)).toBe("03-01");

    const bare: MultiSeriesBarProps = {
      mode: "grouped",
      series: SIGNED,
      semantics: {} as MultiSeriesBarProps["semantics"],
    };
    expect(categoryLabel(time, bare)).toBe("2026-03-01");

    expect(valueLabel(4, "Inlet", { ...bare, tableValueFormat: (y, label) => `${label}:${y}` })).toBe(
      "Inlet:4",
    );
    expect(valueLabel(4, "Inlet", { ...bare, valueTickFormat: (n) => `${n}|` })).toBe("4|");
    expect(valueLabel(4, "Inlet", bare)).toBe("4");
  });

  it("builds an inspectable record from a rectangle, and nothing from a miss", () => {
    const rect = {
      x: 0,
      y: 0,
      width: 10,
      height: 8,
      seriesId: "inlet",
      time: T0,
      value: 10,
      y0: 0,
      y1: 10,
    };
    const model = normalizeSeries(SIGNED, { strict: false });
    const hit = activeFromBarRect(rect, model.byId, () => "day");
    expect(hit?.seriesId).toBe("inlet");
    expect(hit?.datum.y).toBe(10);
    expect(hit?.at).toEqual({ kind: "category", category: "day" });
    expect(activeFromBarRect(undefined, model.byId, () => "day")).toBeUndefined();

    const orphan = activeFromBarRect({ ...rect, seriesId: "ghost", time: 1 }, model.byId, () => "x");
    expect(orphan?.sourceIndex).toBe(0);
    expect(orphan?.datum.meta).toBeUndefined();
  });

  it("falls back to currentColor when the series has no resolved fill", () => {
    expect(seriesFillOf(new Map([["inlet", "#abc"]]), "inlet")).toBe("#abc");
    expect(seriesFillOf(new Map(), "inlet")).toBe("currentColor");
  });
});
