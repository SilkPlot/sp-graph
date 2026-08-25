/**
 * The measured-left decision must not call the measure function on the
 * default path, and must not reserve left when orientation is vertical.
 * Same opted-in inputs + same measured widths → same reserved left.
 */
import { describe, expect, it, vi } from "vitest";
import {
  CATEGORY_LABEL_LEFT_TICK_GAP_PX,
  reservedMeasuredCategoryLeft,
  resolveMeasuredCategoryLeft,
} from "../src/index";

const LONG = [
  "Aberdeen Clinic",
  "Gqeberha Summerstra…",
  "Rustenburg Waterfal…",
] as const;

const SHORT = ["Alpha", "Bravo", "Charlie"] as const;

function widths(map: Record<string, number>): (label: string) => number {
  return (label) => map[label] ?? 0;
}

describe("resolveMeasuredCategoryLeft — opt-in and orientation", () => {
  it("never measures and never reserves when the caller did not opt in", () => {
    const measureWidth = vi.fn((label: string) => label.length * 8);
    const a = resolveMeasuredCategoryLeft({
      optedIn: false,
      orientation: "horizontal",
      labels: LONG,
      measureWidth,
    });
    const b = resolveMeasuredCategoryLeft({
      optedIn: false,
      orientation: "horizontal",
      labels: LONG,
      measureWidth,
    });
    expect(a).toEqual({ reservedLeft: 0 });
    expect(b).toEqual(a);
    expect(measureWidth).not.toHaveBeenCalled();
  });

  it("is a no-op on left when opted in but orientation is vertical", () => {
    const measureWidth = vi.fn((label: string) => label.length * 8);
    const a = resolveMeasuredCategoryLeft({
      optedIn: true,
      orientation: "vertical",
      labels: LONG,
      measureWidth,
    });
    const b = resolveMeasuredCategoryLeft({
      optedIn: true,
      orientation: "vertical",
      labels: LONG,
      measureWidth,
    });
    expect(a).toEqual({ reservedLeft: 0 });
    expect(b).toEqual(a);
    expect(measureWidth).not.toHaveBeenCalled();
  });

  it("reserves longest painted width plus the left tick/gap when opted in and horizontal", () => {
    const measureWidth = widths({
      "Aberdeen Clinic": 72,
      "Gqeberha Summerstra…": 91.4,
      "Rustenburg Waterfal…": 88,
    });
    const a = resolveMeasuredCategoryLeft({
      optedIn: true,
      orientation: "horizontal",
      labels: LONG,
      measureWidth,
    });
    const b = resolveMeasuredCategoryLeft({
      optedIn: true,
      orientation: "horizontal",
      labels: LONG,
      measureWidth,
    });
    expect(a.reservedLeft).toBe(reservedMeasuredCategoryLeft(91.4));
    expect(a.reservedLeft).toBe(Math.ceil(91.4) + CATEGORY_LABEL_LEFT_TICK_GAP_PX);
    expect(b).toEqual(a);
  });

  it("does not invent a reservation for an empty label set", () => {
    const measureWidth = vi.fn();
    expect(
      resolveMeasuredCategoryLeft({
        optedIn: true,
        orientation: "horizontal",
        labels: [],
        measureWidth,
      }),
    ).toEqual({ reservedLeft: 0 });
    expect(measureWidth).not.toHaveBeenCalled();
  });
});

describe("reservedMeasuredCategoryLeft — tight fit", () => {
  it("is the painted width plus the Axis left tick/gap, with no extra pad", () => {
    expect(reservedMeasuredCategoryLeft(40)).toBe(40 + CATEGORY_LABEL_LEFT_TICK_GAP_PX);
    expect(reservedMeasuredCategoryLeft(12.2)).toBe(13 + CATEGORY_LABEL_LEFT_TICK_GAP_PX);
    expect(CATEGORY_LABEL_LEFT_TICK_GAP_PX).toBe(10);
  });

  it("is a pure function of the measured width", () => {
    const once = reservedMeasuredCategoryLeft(64);
    const twice = reservedMeasuredCategoryLeft(64);
    expect(twice).toBe(once);
  });
});

describe("short labels — no generous pad", () => {
  it("reserves only the tight fit of the longest short label", () => {
    const reserved = resolveMeasuredCategoryLeft({
      optedIn: true,
      orientation: "horizontal",
      labels: SHORT,
      measureWidth: widths({ Alpha: 28, Bravo: 31, Charlie: 42 }),
    });
    expect(reserved.reservedLeft).toBe(42 + CATEGORY_LABEL_LEFT_TICK_GAP_PX);
    expect(reserved.reservedLeft).toBeLessThanOrEqual(42 + CATEGORY_LABEL_LEFT_TICK_GAP_PX);
  });
});
