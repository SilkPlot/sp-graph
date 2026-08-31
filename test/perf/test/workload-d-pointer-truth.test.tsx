import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkloadD } from "../app/WorkloadD";

afterEach(() => {
  window.__perf = undefined;
  document.documentElement.removeAttribute("data-perf-ready");
  history.replaceState({}, "", location.pathname);
});

describe("density inspection pointer truth", () => {
  it("maps the real plot-fraction mouse coordinate to lastActive", async () => {
    history.replaceState({}, "", `${location.pathname}?table=none`);
    render(() => (
      <div id="root">
        <WorkloadD />
      </div>
    ));
    await vi.waitFor(() => expect(window.__perf).toBeDefined(), { timeout: 10_000 });

    const surface = document.querySelector<HTMLElement>(
      "[data-perf-surface] [data-silkplot-keyboard-surface]",
    );
    const canvas = document.querySelector<HTMLElement>("[data-silkplot-canvas-plot]");
    expect(surface).not.toBeNull();
    expect(canvas).not.toBeNull();
    const originX = Number(canvas?.getAttribute("data-silkplot-plot-origin-x"));
    const originY = Number(canvas?.getAttribute("data-silkplot-plot-origin-y"));
    const plotWidth = Number(canvas?.getAttribute("data-silkplot-plot-width"));
    const plotHeight = Number(canvas?.getAttribute("data-silkplot-plot-height"));
    const fraction = 0.62;
    const expected = window.__perf?.inspectionExpected?.("raw", fraction);
    const target = window.__perf?.inspectionTarget?.(fraction);
    expect(target?.rawDomainFraction).toBe(fraction);
    expect(target?.plotFraction).toBeGreaterThan(0);
    expect(target?.plotFraction).toBeLessThan(1);

    const rect = surface!.getBoundingClientRect();
    const pointer = {
      bubbles: true,
      clientX: rect.left + originX + plotWidth * target!.plotFraction,
      clientY: rect.top + originY + plotHeight / 2,
      pointerType: "mouse",
    };
    surface!.dispatchEvent(new PointerEvent("pointerenter", pointer));
    surface!.dispatchEvent(new PointerEvent("pointermove", pointer));

    await vi.waitFor(() => expect(window.__perf?.lastActive()).toEqual(expected));
  });
});
