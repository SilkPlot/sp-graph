/**
 * LineChart's keyboard model — the composed-chart half of ADR-0005 §3.
 *
 * The gap this closes is that the keyboard model lived only in the playground's
 * reference composition, so no chart a consumer could actually import was
 * navigable at all, and the reference itself used the `role="application"`
 * capture layer the ADR rejects.
 *
 * Widths and heights are passed explicitly, as everywhere else in this package,
 * so the tests are synchronous and do not wait on ChartRoot's ResizeObserver.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";

const DATA: TimePoint[] = [
  { t: new Date(Date.UTC(2026, 0, 1)), y: 3 },
  { t: new Date(Date.UTC(2026, 0, 2)), y: 7 },
  { t: new Date(Date.UTC(2026, 0, 3)), y: 2 },
  { t: new Date(Date.UTC(2026, 0, 4)), y: 9 },
];

const SIZE = { width: 400, height: 300 };

const surfaceOf = (c: HTMLElement) =>
  c.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]");
const optionOf = (c: HTMLElement) => c.querySelector('[role="option"]');
const announcerOf = (c: HTMLElement) => c.querySelector("[data-silkplot-announcer]");
const crosshairOf = (c: HTMLElement) => c.querySelector("[data-silkplot-crosshair]");

function renderChart(extra: Record<string, unknown> = {}) {
  const result = render(() => (
    <LineChart data={DATA} title="Weekly bookings" desc="Four days" {...SIZE} {...extra} />
  ));
  return result;
}

describe("a composed chart is keyboard-navigable", () => {
  it("gives the chart one tab stop with a widget role, never role=application", () => {
    const { container } = renderChart();
    const surface = surfaceOf(container);
    expect(surface).not.toBeNull();
    expect(surface!.getAttribute("role")).toBe("listbox");
    // The rejected model, asserted absent rather than merely not chosen.
    expect(container.querySelector('[role="application"]')).toBeNull();
    expect(container.querySelectorAll('[tabindex="0"]').length).toBe(1);
  });

  it("steps through points with the arrow keys and marks the active one visually", async () => {
    const { container } = renderChart();
    const surface = surfaceOf(container)!;
    expect(crosshairOf(container)).toBeNull();

    surface.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(optionOf(container)?.getAttribute("aria-posinset")).toBe("1");
    // A keyboard user who can see the screen gets nothing from an announcement
    // alone, so the active point is drawn as well as exposed.
    expect(crosshairOf(container)).not.toBeNull();

    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(optionOf(container)?.getAttribute("aria-posinset")).toBe("3");

    await userEvent.keyboard("{End}");
    expect(optionOf(container)?.getAttribute("aria-posinset")).toBe("4");
    expect(optionOf(container)?.getAttribute("aria-setsize")).toBe("4");
  });

  it("clears with Escape, removing the marker as well as the selection", async () => {
    const { container } = renderChart();
    surfaceOf(container)!.focus();
    await userEvent.keyboard("{End}");
    expect(crosshairOf(container)).not.toBeNull();

    await userEvent.keyboard("{Escape}");
    expect(optionOf(container)).toBeNull();
    expect(crosshairOf(container)).toBeNull();
    expect(document.activeElement).toBe(surfaceOf(container));
  });

  it("stops at the boundaries rather than wrapping", async () => {
    const { container } = renderChart();
    surfaceOf(container)!.focus();
    await userEvent.keyboard("{End}{ArrowRight}{ArrowRight}");
    expect(optionOf(container)?.getAttribute("aria-posinset")).toBe("4");
    await userEvent.keyboard("{Home}{ArrowLeft}{ArrowLeft}");
    expect(optionOf(container)?.getAttribute("aria-posinset")).toBe("1");
  });

  it("names the surface from the chart's own accessible name", () => {
    const { container } = renderChart();
    expect(surfaceOf(container)!.getAttribute("aria-label")).toContain("Weekly bookings");
  });

  it("survives empty data without a selection or a throw", async () => {
    const { container } = render(() => (
      <LineChart data={[]} title="Nothing yet" desc="No data" {...SIZE} />
    ));
    const surface = surfaceOf(container);
    expect(surface).not.toBeNull();
    surface!.focus();
    await userEvent.keyboard("{ArrowRight}{End}{Home}{Escape}");
    expect(optionOf(container)).toBeNull();
    expect(crosshairOf(container)).toBeNull();
  });

  it("re-clamps a held selection when the series is replaced by a shorter one", async () => {
    // The rapid-update case at the chart level: a selection on the last point
    // of a long series, then a shorter series arrives. The marker must land on
    // a point that exists rather than reading past the end.
    const [data, setData] = createSignal<TimePoint[]>(DATA);
    const { container } = render(() => (
      <LineChart data={data()} title="Weekly bookings" desc="x" {...SIZE} />
    ));
    surfaceOf(container)!.focus();
    await userEvent.keyboard("{End}");
    expect(optionOf(container)?.getAttribute("aria-posinset")).toBe("4");

    setData(DATA.slice(0, 2));
    expect(optionOf(container)?.getAttribute("aria-posinset")).toBe("2");
    expect(optionOf(container)?.getAttribute("aria-setsize")).toBe("2");

    setData([]);
    expect(optionOf(container)).toBeNull();
    expect(crosshairOf(container)).toBeNull();
  });

  it("does not give a decorative chart a tab stop", () => {
    // A decorative chart is out of the accessibility tree entirely, so a
    // focusable surface on one would be a tab stop that announces nothing.
    const { container } = render(() => <LineChart data={DATA} decorative {...SIZE} />);
    expect(surfaceOf(container)).toBeNull();
  });

  it("can be turned off explicitly", () => {
    const { container } = renderChart({ keyboard: false });
    expect(surfaceOf(container)).toBeNull();
  });
});

describe("the chart's announcement channel", () => {
  it("wires the live region by default and speaks series, x and y", async () => {
    const { container } = renderChart();
    const region = announcerOf(container);
    expect(region).not.toBeNull();
    expect(region!.textContent).toBe("");

    surfaceOf(container)!.focus();
    await userEvent.keyboard("{ArrowRight}");

    // Not a bare number: the chart's own name stands in for the series, and the
    // x value and y value are both present (ADR-0005 §4). The default wording is
    // honest rather than good — `pointLabel` is how an application says
    // "Bookings, Tuesday 4 March, 42 appointments".
    expect(region!.textContent).toContain("Weekly bookings");
    expect(region!.textContent).toContain("2026-01-01");
    expect(region!.textContent).toContain("3");
  });

  it("uses the application's wording when it is supplied", async () => {
    const { container } = renderChart({
      pointLabel: (d: TimePoint, i: number) => `Bookings, day ${i + 1}, ${d.y} appointments`,
    });
    surfaceOf(container)!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(announcerOf(container)!.textContent).toBe("Bookings, day 1, 3 appointments");
    expect(optionOf(container)!.textContent).toBe("Bookings, day 1, 3 appointments");
  });

  it("empties the live region when the selection is cleared", async () => {
    const { container } = renderChart();
    surfaceOf(container)!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(announcerOf(container)!.textContent).not.toBe("");
    await userEvent.keyboard("{Escape}");
    expect(announcerOf(container)!.textContent).toBe("");
  });

  it("does not run the live region and aria-activedescendant at the same time", async () => {
    // Running both announces every step twice — the reader follows the moved
    // active descendant AND reads the live-region mutation.
    const { container } = renderChart();
    surfaceOf(container)!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(announcerOf(container)).not.toBeNull();
    expect(surfaceOf(container)!.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("switches to aria-activedescendant and drops the live region on request", async () => {
    const { container } = renderChart({ announce: "option" });
    const surface = surfaceOf(container)!;
    surface.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(surface.getAttribute("aria-activedescendant")).toBe(optionOf(container)!.id);
    expect(announcerOf(container)).toBeNull();
  });
});
