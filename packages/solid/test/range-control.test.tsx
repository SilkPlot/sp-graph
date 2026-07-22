/**
 * RangeControl — the accessible viewport navigator (ADR-0019).
 *
 * These prove the three sliders drive one shared window: the keyboard moves each
 * thumb by the documented steps and stops at its limit, the ARIA exposes each
 * thumb as a real slider, the handles clear the 24px target floor, and a pointer
 * drag commits through the same path. The control is CONTROLLED, so each test
 * wires `visibleDomain` to a signal the callback updates — exactly how an
 * application wires it beside a chart.
 *
 * A wide track (1000px over 10 days = 100px/day) keeps the pixel maths legible;
 * the fine step is 1% of the extent (0.1 day) and the coarse step 10% (1 day).
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { RangeControl } from "../src/index";
import type { TimeInterval, ViewportCause } from "@silkplot/core";

const T0 = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const day = (n: number): Date => new Date(T0 + n * DAY);
const FULL: TimeInterval = { start: day(0), end: day(10) };

function mount(minSpan = DAY, initial: TimeInterval = { start: day(3), end: day(7) }) {
  const [vd, setVd] = createSignal<TimeInterval>(initial);
  const causes: ViewportCause[] = [];
  const { container } = render(() => (
    <RangeControl
      fullExtent={FULL}
      visibleDomain={vd()}
      minSpan={minSpan}
      width={1000}
      height={40}
      onVisibleDomainChange={(domain, cause) => {
        causes.push(cause);
        setVd(domain);
      }}
    />
  ));
  const el = (sel: string): HTMLElement => {
    const found = container.querySelector<HTMLElement>(sel);
    if (found === null) throw new Error(`no element for ${sel}`);
    return found;
  };
  return {
    container,
    causes,
    window: () => el("[data-silkplot-range-window]"),
    startHandle: () => el('[data-silkplot-range-handle="start"]'),
    endHandle: () => el('[data-silkplot-range-handle="end"]'),
    start: () => vd().start.getTime(),
    end: () => vd().end.getTime(),
  };
}

function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("RangeControl — ARIA and target size", () => {
  it("exposes three sliders with the window's bounds and values", () => {
    const c = mount();
    expect(c.container.querySelectorAll('[role="slider"]')).toHaveLength(3);
    // The start handle is a slider over [extent start, end − minSpan].
    expect(c.startHandle().getAttribute("aria-valuenow")).toBe(String(day(3).getTime()));
    expect(c.startHandle().getAttribute("aria-valuemin")).toBe(String(day(0).getTime()));
    expect(c.startHandle().getAttribute("aria-valuemax")).toBe(String(day(7).getTime() - DAY));
    expect(c.endHandle().getAttribute("aria-valuenow")).toBe(String(day(7).getTime()));
    expect(c.startHandle().getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("gives each handle at least the 24px target width", () => {
    const c = mount();
    expect(Number.parseFloat(c.startHandle().style.width)).toBeGreaterThanOrEqual(24);
    expect(Number.parseFloat(c.endHandle().style.width)).toBeGreaterThanOrEqual(24);
  });
});

describe("RangeControl — keyboard", () => {
  it("moves the start handle by a fine step on Arrow, a coarse step on Page", () => {
    const c = mount();
    press(c.startHandle(), "ArrowRight"); // +0.1 day (narrow)
    expect(c.start()).toBe(day(3).getTime() + 0.1 * DAY);
    press(c.startHandle(), "ArrowLeft"); // back
    expect(c.start()).toBe(day(3).getTime());
    press(c.startHandle(), "PageUp"); // +1 day (coarse)
    expect(c.start()).toBe(day(4).getTime());
    expect(c.end()).toBe(day(7).getTime()); // the far edge did not move
  });

  it("stops a handle at its limit and never crosses the other past minSpan", () => {
    const c = mount();
    press(c.startHandle(), "End"); // to its max: end − minSpan
    expect(c.start()).toBe(day(7).getTime() - DAY);
    // Another push does not cross the end handle.
    press(c.startHandle(), "PageUp");
    expect(c.start()).toBe(day(7).getTime() - DAY);
    press(c.startHandle(), "Home"); // to the extent start
    expect(c.start()).toBe(day(0).getTime());
  });

  it("pans the window on Arrow and resets it on 0", () => {
    const c = mount();
    press(c.window(), "ArrowRight"); // pan later by 0.1 day, span preserved
    expect(c.start()).toBe(day(3).getTime() + 0.1 * DAY);
    expect(c.end()).toBe(day(7).getTime() + 0.1 * DAY);
    press(c.window(), "0"); // reset to the full extent
    expect(c.start()).toBe(day(0).getTime());
    expect(c.end()).toBe(day(10).getTime());
    expect(c.causes.every((cause) => cause === "range-control")).toBe(true);
  });

  it("slides the window flush against an edge rather than past it", () => {
    const c = mount();
    press(c.window(), "End"); // window flush right → [day 6, day 10]
    expect(c.start()).toBe(day(6).getTime());
    expect(c.end()).toBe(day(10).getTime());
  });
});

describe("RangeControl — the end handle and the window's other keys", () => {
  it("widens on the end handle, and stops at its own limits", () => {
    const c = mount();
    press(c.endHandle(), "ArrowRight"); // +0.1 day (widen)
    expect(c.end()).toBe(day(7).getTime() + 0.1 * DAY);
    press(c.endHandle(), "PageDown"); // −1 day (coarse narrow)
    expect(c.end()).toBe(day(7).getTime() + 0.1 * DAY - DAY);
    press(c.endHandle(), "End"); // to the extent end
    expect(c.end()).toBe(day(10).getTime());
    press(c.endHandle(), "Home"); // to its min: start + minSpan
    expect(c.end()).toBe(day(3).getTime() + DAY);
  });

  it("treats ArrowUp/ArrowDown as Right/Left on a handle", () => {
    const c = mount();
    press(c.startHandle(), "ArrowUp");
    expect(c.start()).toBe(day(3).getTime() + 0.1 * DAY);
    press(c.startHandle(), "ArrowDown");
    expect(c.start()).toBe(day(3).getTime());
  });

  it("slides the window flush LEFT on Home and pans coarse on Page", () => {
    const c = mount();
    press(c.window(), "Home"); // flush left → [day 0, day 4]
    expect(c.start()).toBe(day(0).getTime());
    expect(c.end()).toBe(day(4).getTime());
    press(c.window(), "PageUp"); // +1 day
    expect(c.start()).toBe(day(1).getTime());
  });
});

describe("RangeControl — guards and no-ops", () => {
  it("ignores a modified key, an unbound key, and 0 on a handle", () => {
    const c = mount();
    press(c.startHandle(), "q"); // no binding
    c.startHandle().dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, bubbles: true }),
    );
    press(c.startHandle(), "0"); // reset is the window's key only
    expect(c.causes).toHaveLength(0);
    expect(c.start()).toBe(day(3).getTime());
  });

  it("emits nothing when a key does not move the window", () => {
    const c = mount();
    press(c.startHandle(), "Home"); // to full.start
    expect(c.causes).toHaveLength(1);
    press(c.startHandle(), "Home"); // already there — no commit
    expect(c.causes).toHaveLength(1);
  });
});

describe("RangeControl — options", () => {
  it("uses a supplied valueText for the handles", () => {
    const [vd] = createSignal<TimeInterval>({ start: day(3), end: day(7) });
    const { container } = render(() => (
      <RangeControl
        fullExtent={FULL}
        visibleDomain={vd()}
        width={1000}
        valueText={(ms, which) => `${which}:${ms}`}
        onVisibleDomainChange={() => {}}
      />
    ));
    const start = container.querySelector('[data-silkplot-range-handle="start"]');
    expect(start?.getAttribute("aria-valuetext")).toBe(`start:${day(3).getTime()}`);
  });

  it("renders an optional density slot, hidden from assistive tech", () => {
    const [vd] = createSignal<TimeInterval>({ start: day(3), end: day(7) });
    const { container } = render(() => (
      <RangeControl
        fullExtent={FULL}
        visibleDomain={vd()}
        onVisibleDomainChange={() => {}}
        density={<div data-testid="minimap" />}
      />
    ));
    const minimap = container.querySelector('[data-testid="minimap"]');
    expect(minimap).not.toBeNull();
    expect(minimap?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("clamps the height to the 24px target floor", () => {
    const [vd] = createSignal<TimeInterval>({ start: day(3), end: day(7) });
    const { container } = render(() => (
      <RangeControl fullExtent={FULL} visibleDomain={vd()} height={10} onVisibleDomainChange={() => {}} />
    ));
    const control = container.querySelector<HTMLElement>("[data-silkplot-range-control]");
    expect(control?.style.height).toBe("24px");
  });
});

describe("RangeControl — pointer", () => {
  function pointer(
    el: HTMLElement,
    type: "pointerdown" | "pointermove" | "pointerup",
    plotX: number,
  ): void {
    const track = el.closest("[data-silkplot-range-control]") as HTMLElement;
    const clientX = track.getBoundingClientRect().left + plotX;
    el.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  const frame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()));

  const trackOf = (c: ReturnType<typeof mount>): HTMLElement => {
    const track = c.container.querySelector<HTMLElement>("[data-silkplot-range-track]");
    if (track === null) throw new Error("no track");
    return track;
  };

  it("drags the end handle to commit a new window", async () => {
    const c = mount();
    const track = trackOf(c);
    // Grab the end handle (at 700px = day 7) and drag it to 500px = day 5.
    pointer(c.endHandle(), "pointerdown", 700);
    pointer(track, "pointermove", 500);
    await frame();
    pointer(track, "pointerup", 500);
    expect(c.end()).toBe(day(5).getTime());
    expect(c.start()).toBe(day(3).getTime()); // the other edge stayed
  });

  it("drags the start handle", async () => {
    const c = mount();
    const track = trackOf(c);
    pointer(c.startHandle(), "pointerdown", 300); // day 3
    pointer(track, "pointermove", 100); // day 1
    await frame();
    pointer(track, "pointerup", 100);
    expect(c.start()).toBe(day(1).getTime());
    expect(c.end()).toBe(day(7).getTime());
  });

  it("drags the WINDOW to pan it, keeping the offset under the pointer", async () => {
    const c = mount();
    const track = trackOf(c);
    // Grab the window at 400px (day 4, one day into the [day3,day7] window).
    pointer(c.window(), "pointerdown", 400);
    pointer(track, "pointermove", 500); // pointer moved +1 day
    await frame();
    pointer(track, "pointerup", 500);
    // The window slid by one day, span preserved: [day 4, day 8].
    expect(c.start()).toBe(day(4).getTime());
    expect(c.end()).toBe(day(8).getTime());
  });

  it("creates a new window from a drag on the empty track", async () => {
    const c = mount();
    const track = trackOf(c);
    // Press at 200px (day 2), left of the window, then drag right to day 5.
    pointer(track, "pointerdown", 200);
    pointer(track, "pointermove", 500);
    await frame();
    pointer(track, "pointerup", 500);
    expect(c.start()).toBe(day(2).getTime());
    expect(c.end()).toBe(day(5).getTime());
  });

  it("ends a drag on pointercancel", async () => {
    const c = mount();
    const track = trackOf(c);
    pointer(c.endHandle(), "pointerdown", 700);
    track.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }));
    // After cancel, a move commits nothing.
    pointer(track, "pointermove", 300);
    await frame();
    expect(c.end()).toBe(day(7).getTime());
  });

  it("commits the final move on a fast release (before the frame fires)", () => {
    const c = mount();
    const track = trackOf(c);
    pointer(c.endHandle(), "pointerdown", 700);
    pointer(track, "pointermove", 500); // schedules a frame
    pointer(track, "pointerup", 500); // releases BEFORE it fires
    // The pending move is applied on release, not lost.
    expect(c.end()).toBe(day(5).getTime());
  });

  it("ignores a non-primary button on a handle and on the track", async () => {
    const c = mount();
    const track = trackOf(c);
    const secondary = (el: HTMLElement, plotX: number): void => {
      const clientX = track.getBoundingClientRect().left + plotX;
      el.dispatchEvent(
        new PointerEvent("pointerdown", { pointerId: 1, isPrimary: true, button: 2, clientX, bubbles: true }),
      );
    };
    secondary(c.startHandle(), 300);
    secondary(track, 200);
    pointer(track, "pointermove", 100);
    await frame();
    expect(c.causes).toHaveLength(0);
  });

  it("cancels a pending frame on unmount without throwing", () => {
    const [vd, setVd] = createSignal<TimeInterval>({ start: day(3), end: day(7) });
    const { container, unmount } = render(() => (
      <RangeControl
        fullExtent={FULL}
        visibleDomain={vd()}
        width={1000}
        onVisibleDomainChange={(d) => setVd(d)}
      />
    ));
    const track = container.querySelector<HTMLElement>("[data-silkplot-range-track]");
    const handle = container.querySelector<HTMLElement>('[data-silkplot-range-handle="end"]');
    if (track === null || handle === null) throw new Error("no elements");
    const clientX = track.getBoundingClientRect().left;
    handle.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, isPrimary: true, button: 0, clientX: clientX + 700, bubbles: true }));
    track.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: clientX + 500, bubbles: true })); // schedules a frame
    expect(() => unmount()).not.toThrow();
  });
});
