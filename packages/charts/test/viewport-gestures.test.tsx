/**
 * The viewport GESTURE adapters — the keyboard bindings (ADR-0018 §1).
 *
 * These prove the last layer: a keypress on the chart's one keyboard surface
 * reaches the viewport commands wired in the previous phase, and moves what the
 * chart draws. The bindings dodge the datum-stepping keys, and the viewport
 * handler runs BEFORE the datum one so `Shift`+arrow pans rather than stepping a
 * datum — the ordering this suite exists to pin.
 *
 * `curve="linear"` and `NO_MARGINS` for the same reasons as the scope suite:
 * real data positions, legible pixel maths. Point counts are deterministic given
 * the fixed zoom step (½) and pan fraction (¼).
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { AreaChart, LineChart } from "../src/index";
import type { TimePoint } from "../src/index";
import { HEIGHT, NO_MARGINS, WIDTH, expectedYScale, markD, pathXs, pathYs } from "./support";

const T0 = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const day = (n: number): Date => new Date(T0 + n * DAY);

const DATA: TimePoint[] = [
  { t: day(0), y: 100 },
  { t: day(1), y: 40 },
  { t: day(2), y: 60 },
  { t: day(3), y: 50 },
  { t: day(4), y: 5 },
];

/** The chart's single keyboard surface — the one tab stop that also receives keys. */
function surfaceOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]");
  if (el === null) throw new Error("no keyboard surface rendered");
  return el;
}

/** Dispatch a keydown on the surface, as the browser would to the focused widget. */
function press(el: HTMLElement, key: string, modifiers: { shift?: boolean } = {}): void {
  el.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey: modifiers.shift ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function pointCount(container: HTMLElement): number {
  return pathXs(markD(container)).length;
}

/** Dispatch a wheel notch on the surface. The zoom commits on the next frame. */
function wheel(el: HTMLElement, opts: { deltaY: number; ctrl?: boolean }): void {
  el.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY: opts.deltaY,
      ctrlKey: opts.ctrl ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Wheel zoom coalesces into one commit per animation frame — wait for it. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Dispatch a pointer event at a plot-x (inner px), converted to a client x
 *  against the surface's own rect — the same conversion the gesture makes. */
function pointer(
  el: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  plotX: number,
): void {
  const clientX = el.getBoundingClientRect().left + plotX; // NO_MARGINS → margin.left = 0
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

/** The live brush rectangle, if one is being drawn. */
function brushRect(container: HTMLElement): SVGRectElement | null {
  return container.querySelector<SVGRectElement>("[data-silkplot-brush]");
}

/** Dispatch one finger of a multi-touch gesture at a plot-x. */
function touch(
  el: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  pointerId: number,
  plotX: number,
): void {
  const clientX = el.getBoundingClientRect().left + plotX;
  el.dispatchEvent(
    new PointerEvent(type, {
      pointerId,
      isPrimary: pointerId === 1,
      button: 0,
      clientX,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("viewport keyboard bindings", () => {
  it("zooms in on + and out on -, about the visible centre", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    expect(pointCount(container)).toBe(5); // un-navigated: the full extent

    press(surface, "+");
    // Half the 4-day span about day 2 → [day 1, day 3], three points.
    expect(pointCount(container)).toBe(3);

    press(surface, "-");
    // Double it back → the full extent again.
    expect(pointCount(container)).toBe(5);
  });

  it("treats = as + (its unshifted twin)", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    press(surfaceOf(container), "=");
    expect(pointCount(container)).toBe(3);
  });

  it("resets on 0", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    press(surface, "+");
    expect(pointCount(container)).toBe(3);
    press(surface, "0");
    expect(pointCount(container)).toBe(5);
  });

  it("pans later on Shift+ArrowRight, and the plain arrow does NOT (it steps a datum)", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    press(surface, "+"); // zoom to [day 1, day 3], 3 points
    expect(pointCount(container)).toBe(3);

    // A PLAIN arrow is a datum step — it must not move the viewport.
    press(surface, "ArrowRight");
    expect(pointCount(container)).toBe(3);

    // Shift+arrow pans: [day 1, day 3] slides later by ¼ span (½ day) → [day 1.5,
    // day 3.5], which drops day 1 off the left edge → two points.
    press(surface, "ArrowRight", { shift: true });
    expect(pointCount(container)).toBe(2);
  });

  it("pans earlier on Shift+ArrowLeft", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    press(surface, "+"); // [day 1, day 3], 3 points
    expect(pointCount(container)).toBe(3);
    // Slide the window earlier by ¼ span → [day 0.5, day 2.5], dropping day 3 off
    // the right edge → two points.
    press(surface, "ArrowLeft", { shift: true });
    expect(pointCount(container)).toBe(2);
  });

  it("does not claim a key it has no binding for, nor a modified one", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    // A letter with no binding (plain and shifted), and Escape (the active-point
    // clear), leave the viewport at the full extent.
    press(surface, "z");
    press(surface, "x", { shift: true });
    press(surface, "Escape");
    expect(pointCount(container)).toBe(5);
  });
});

describe("gestures reach every time chart (Area, multi-series)", () => {
  it("keyboard-, wheel-, and brush-drives an AreaChart", async () => {
    const { container } = render(() => (
      <AreaChart
        title="Readings"
        data={DATA}
        wheelZoom
        capturePlainWheel
        brushSelect
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const surface = surfaceOf(container);
    press(surface, "+");
    // The stroked line is the second path (the first is the fill).
    expect(pathXs(markD(container, 1)).length).toBeLessThan(5);
    press(surface, "0");
    expect(pathXs(markD(container, 1))).toHaveLength(5);

    wheel(surface, { deltaY: -100, ctrl: true });
    await nextFrame();
    expect(pathXs(markD(container, 1)).length).toBeLessThan(5);
    press(surface, "0");

    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointermove", 300);
    await nextFrame();
    expect(brushRect(container)).not.toBeNull();
    pointer(surface, "pointerup", 300);
    expect(brushRect(container)).toBeNull();
  });

  it("keyboard-, wheel-, and brush-drives a multi-series LineChart", async () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        series={[{ id: "a", label: "A", data: DATA }]}
        wheelZoom
        capturePlainWheel
        brushSelect
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const surface = surfaceOf(container);
    press(surface, "+");
    expect(pointCount(container)).toBeLessThan(5);
    press(surface, "0");

    wheel(surface, { deltaY: -100, ctrl: true });
    await nextFrame();
    expect(pointCount(container)).toBeLessThan(5);
    press(surface, "0");

    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointermove", 300);
    await nextFrame();
    expect(brushRect(container)).not.toBeNull();
    pointer(surface, "pointerup", 300);
    expect(brushRect(container)).toBeNull();
  });

  it("keyboard-, wheel-, and brush-drives a multi-series AreaChart", async () => {
    const { container } = render(() => (
      <AreaChart
        title="Readings"
        series={[{ id: "a", label: "A", data: DATA }]}
        wheelZoom
        capturePlainWheel
        brushSelect
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const surface = surfaceOf(container);
    press(surface, "+");
    expect(pathXs(markD(container, 1)).length).toBeLessThan(5);
    press(surface, "0");

    wheel(surface, { deltaY: -100, ctrl: true });
    await nextFrame();
    expect(pathXs(markD(container, 1)).length).toBeLessThan(5);
    press(surface, "0");

    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointermove", 300);
    await nextFrame();
    expect(brushRect(container)).not.toBeNull();
    pointer(surface, "pointerup", 300);
    expect(brushRect(container)).toBeNull();
  });

  it("tears its listeners down on unmount without throwing", () => {
    const { container, unmount } = render(() => (
      <LineChart title="Readings" data={DATA} brushSelect wheelZoom width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    // Start a brush, then unmount mid-gesture — cleanup releases capture, removes
    // every listener, and cancels the pending frame, all without a throw.
    pointer(surfaceOf(container), "pointerdown", 100);
    pointer(surfaceOf(container), "pointermove", 300);
    expect(() => unmount()).not.toThrow();
  });
});

describe("viewport wheel zoom (opt-in)", () => {
  it("zooms on Ctrl+wheel when wheelZoom is on, and plain wheel is left to the page", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} wheelZoom width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);

    // Plain wheel (no modifier) does NOT zoom — it belongs to the page scroll.
    wheel(surface, { deltaY: -100 });
    await nextFrame();
    expect(pointCount(container)).toBe(5);

    // Ctrl+wheel up zooms in — the span narrows, so fewer points are drawn.
    wheel(surface, { deltaY: -100, ctrl: true });
    await nextFrame();
    expect(pointCount(container)).toBeLessThan(5);
  });

  it("does nothing on Ctrl+wheel when wheelZoom is off (the default)", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    wheel(surfaceOf(container), { deltaY: -100, ctrl: true });
    await nextFrame();
    expect(pointCount(container)).toBe(5);
  });

  it("zooms on a PLAIN wheel when capturePlainWheel is set (the full-bleed hatch)", async () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        wheelZoom
        capturePlainWheel
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    wheel(surfaceOf(container), { deltaY: -100 });
    await nextFrame();
    expect(pointCount(container)).toBeLessThan(5);
  });

  it("zooms back out on a downward Ctrl+wheel", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} wheelZoom width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    wheel(surface, { deltaY: -100, ctrl: true });
    await nextFrame();
    const zoomedIn = pointCount(container);
    expect(zoomedIn).toBeLessThan(5);

    // A few notches the other way widen it back to the full extent.
    for (let i = 0; i < 5; i += 1) wheel(surface, { deltaY: 100, ctrl: true });
    await nextFrame();
    expect(pointCount(container)).toBe(5);
  });
});

describe("viewport drag-to-brush (opt-in)", () => {
  it("zooms to the dragged interval on release, and draws a live rectangle during", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} brushSelect width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    expect(pointCount(container)).toBe(5);
    expect(brushRect(container)).toBeNull();

    // Drag across the middle of the plot.
    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointermove", 300);
    await nextFrame();
    // The live rectangle is drawn while the drag is in flight.
    expect(brushRect(container)).not.toBeNull();

    pointer(surface, "pointerup", 300);
    // On release the viewport is the dragged sub-interval, so fewer points draw,
    // and the rectangle is gone.
    expect(pointCount(container)).toBeLessThan(5);
    expect(brushRect(container)).toBeNull();
  });

  it("commits nothing on a click (a drag below the min-travel threshold)", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} brushSelect width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    pointer(surface, "pointerdown", 200);
    pointer(surface, "pointermove", 201); // 1px < MIN_BRUSH_PX
    pointer(surface, "pointerup", 201);
    expect(pointCount(container)).toBe(5);
  });

  it("cancels the brush on Escape mid-drag, committing nothing", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} brushSelect width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointermove", 300);
    await nextFrame();
    expect(brushRect(container)).not.toBeNull();

    press(surface, "Escape");
    // The rectangle is gone and the viewport did not move; a later pointerup
    // (capture lost) commits nothing.
    expect(brushRect(container)).toBeNull();
    pointer(surface, "pointerup", 300);
    expect(pointCount(container)).toBe(5);
  });

  it("does nothing when brushSelect is off (the default)", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointermove", 300);
    await nextFrame();
    expect(brushRect(container)).toBeNull();
    pointer(surface, "pointerup", 300);
    expect(pointCount(container)).toBe(5);
  });

  it("ignores a non-primary button (a right-click is not a brush)", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} brushSelect width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    const r = surface.getBoundingClientRect();
    surface.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        isPrimary: true,
        button: 2, // secondary button
        clientX: r.left + 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    pointer(surface, "pointermove", 300);
    await nextFrame();
    expect(brushRect(container)).toBeNull();
  });

  it("cancels the brush on a lost pointer (pointercancel)", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} brushSelect width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    pointer(surface, "pointerdown", 100);
    pointer(surface, "pointermove", 300);
    await nextFrame();
    expect(brushRect(container)).not.toBeNull();
    surface.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }));
    expect(brushRect(container)).toBeNull();
    expect(pointCount(container)).toBe(5);
  });
});

describe("viewport pinch zoom (opt-in)", () => {
  it("zooms in when two fingers move apart", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} pinchZoom width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    // Two fingers down near the centre, then spread apart — the gap grows, so the
    // span shrinks and fewer points draw.
    touch(surface, "pointerdown", 1, 180);
    touch(surface, "pointerdown", 2, 220);
    touch(surface, "pointermove", 1, 100);
    touch(surface, "pointermove", 2, 300);
    await nextFrame();
    expect(pointCount(container)).toBeLessThan(5);
  });

  it("does nothing when pinchZoom is off (the default)", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    touch(surface, "pointerdown", 1, 180);
    touch(surface, "pointerdown", 2, 220);
    touch(surface, "pointermove", 1, 100);
    touch(surface, "pointermove", 2, 300);
    await nextFrame();
    expect(pointCount(container)).toBe(5);
  });

  it("ends the pinch when a finger lifts (no brush fallback on the survivor)", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} pinchZoom width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    touch(surface, "pointerdown", 1, 180);
    touch(surface, "pointerdown", 2, 220);
    touch(surface, "pointerup", 1, 180); // one finger up ends the pinch
    const settled = pointCount(container);
    // Moving the surviving finger does nothing — the pinch is over and it does
    // not fall back into a brush.
    touch(surface, "pointermove", 2, 360);
    await nextFrame();
    expect(pointCount(container)).toBe(settled);
  });
});

describe("viewport autoscale (a) and reset (0) move y", () => {
  it("fits y to the visible values on 'a', and reset restores the pinned axis", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    // Zoom to [day 1, day 3] — the visible values are 40, 60, 50, so the visible
    // point at index 1 is day 2 (y=60), the visible maximum.
    press(surface, "+");
    const pinned = expectedYScale(DATA.map((d) => d.y), "zero-floor", HEIGHT); // [0, 100]
    const fitted = expectedYScale([40, 60, 50], "zero-floor", HEIGHT); // [0, 60]

    // A plain zoom leaves y pinned to the full-data extent.
    expect(pathYs(markD(container))[1] ?? Number.NaN).toBeCloseTo(pinned(60), 3);

    // Autoscale fits y to the visible values — day 2 (the visible max) rises to
    // the top of the plot.
    press(surface, "a");
    expect(pathYs(markD(container))[1] ?? Number.NaN).toBeCloseTo(fitted(60), 3);

    // Reset clears the autoscale AND the zoom: five points again, y pinned. Day 2
    // is now the middle of the five (index 2).
    press(surface, "0");
    expect(pointCount(container)).toBe(5);
    expect(pathYs(markD(container))[2] ?? Number.NaN).toBeCloseTo(pinned(60), 3);
  });
});
