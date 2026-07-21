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
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";
import { HEIGHT, NO_MARGINS, WIDTH, markD, pathXs } from "./support";

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

  it("does not claim a key it has no binding for, nor a modified one", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    // A letter with no binding, and Escape (the active-point clear), leave the
    // viewport at the full extent.
    press(surface, "z");
    press(surface, "Escape");
    expect(pointCount(container)).toBe(5);
  });
});
