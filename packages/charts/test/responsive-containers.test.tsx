/**
 * Responsive and hidden containers.
 *
 * The dynamic surface has to survive the containers real dashboards put it in:
 * a hidden tab that mounts at zero size, a resize, and as many as 48 charts on
 * one page. These prove the container contract that is a CORRECTNESS case before
 * it is a performance one — most sharply, that a chart adds **no global `window`
 * listeners**, so 48 of them do not stack 192 listeners that all fire on every
 * scroll. The hover and gesture layers now measure their surface rect on
 * `pointerenter` (and a touch `pointerdown`) instead.
 */
import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";
import { HEIGHT, NO_MARGINS, WIDTH, expectNoNaN, markD, pathXs } from "./support";

const T0 = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const day = (n: number): Date => new Date(T0 + n * DAY);
const DATA: TimePoint[] = [0, 1, 2, 3, 4].map((n) => ({ t: day(n), y: 10 + n * 10 }));

describe("no global window listeners per chart", () => {
  it("mounts a fully interactive chart without adding any window resize/scroll listener", () => {
    const spy = vi.spyOn(window, "addEventListener");
    const { unmount } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        wheelZoom
        brushSelect
        pinchZoom
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
      />
    ));
    const windowEvents = spy.mock.calls.map((call) => call[0]);
    expect(windowEvents).not.toContain("resize");
    expect(windowEvents).not.toContain("scroll");
    unmount();
    spy.mockRestore();
  });

  it("48 mounted charts add no window listeners and unmount cleanly", () => {
    const spy = vi.spyOn(window, "addEventListener");
    const { unmount } = render(() => (
      <>
        {Array.from({ length: 48 }, (_, i) => (
          <LineChart title={`Chart ${i}`} data={DATA} wheelZoom width={200} height={80} margins={NO_MARGINS} />
        ))}
      </>
    ));
    const windowEvents = spy.mock.calls.map((call) => call[0]);
    expect(windowEvents.filter((e) => e === "resize" || e === "scroll")).toHaveLength(0);
    expect(() => unmount()).not.toThrow();
    spy.mockRestore();
  });
});

describe("zero size and resize", () => {
  it("a zero-size chart emits no non-finite geometry", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={0} height={0} />
    ));
    for (const selector of ["path", "line", "rect", "circle"]) {
      expectNoNaN(container, selector, ["d", "x", "y", "cx", "cy", "x1", "x2", "y1", "y2", "width", "height"]);
    }
  });

  it("preserves the data-domain viewport across a resize (width change)", () => {
    const [w, setW] = createSignal(400);
    const mid = { start: day(1), end: day(3) };
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        visibleDomain={mid}
        width={w()}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    // The controlled window [day1, day3] draws three points at 400px wide.
    expect(pathXs(markD(container))).toHaveLength(3);
    // A resize changes only the pixel mapping — the DATA interval is unchanged, so
    // the same three points are drawn, now spread across the wider plot.
    setW(800);
    const xs = pathXs(markD(container));
    expect(xs).toHaveLength(3);
    expect(xs[2] ?? 0).toBeGreaterThan(700); // day 3 now sits near the wider right edge
  });
});
