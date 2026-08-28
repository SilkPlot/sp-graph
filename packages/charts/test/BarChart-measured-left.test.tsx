/**
 * Caller-opted measured left-margin mode.
 *
 * Default path: left stays 40 (or the caller's explicit `margins.left`);
 * identical non-opt-in inputs produce the same margins. Opt-in + horizontal
 * sizes left from the painted category labels. Vertical + opt-in is a no-op.
 * Measured mode may vary with font — these assertions check fit, not pixels.
 */
import { describe, expect, it } from "vitest";
import type { ComponentProps } from "solid-js";
import { render } from "@solidjs/testing-library";
import type { RankedCategory } from "@silkplot/core";
import { CATEGORY_LABEL_LEFT_TICK_GAP_PX } from "@silkplot/core";
import { BarChart } from "../src/index";
import { HEIGHT, WIDTH, axisLabels } from "./support";
import { measurePaintedAxisLabelWidth } from "../src/measure-axis-label";

const NAME = "Spend by programme";
const DESC = "Programme spend, in rand, ranked by amount.";

const SHORT: readonly RankedCategory[] = [
  { id: "a", label: "Alpha", value: 10 },
  { id: "b", label: "Bravo", value: 40 },
  { id: "c", label: "Charlie", value: 25 },
];

const LONG: readonly RankedCategory[] = [
  { id: "ab", label: "Aberdeen Clinic", value: 10 },
  { id: "bf", label: "Bloemfontein North", value: 20 },
  { id: "ct", label: "Cape Town Central", value: 15 },
  { id: "gq", label: "Gqeberha Summerstrand", value: 22 },
  { id: "jb", label: "Johannesburg Rosebank", value: 9 },
];

function plotTranslateX(container: HTMLElement): number {
  const g = container.querySelector("svg > g");
  const transform = g?.getAttribute("transform") ?? "";
  const match = /translate\(([-.\d]+),/.exec(transform);
  return match ? Number(match[1]) : Number.NaN;
}

function paintedLeftLabelMaxWidth(container: HTMLElement): number {
  let max = 0;
  for (const label of axisLabels(container, "left")) {
    if (label === null || label === "") continue;
    const width = measurePaintedAxisLabelWidth(label);
    if (width > max) max = width;
  }
  return max;
}

function mount(
  props: {
    categories?: readonly RankedCategory[];
    data?: readonly { label: string; y: number }[];
    orientation?: "vertical" | "horizontal";
    measureCategoryLeftMargin?: boolean;
    margins?: { left?: number };
    categoryTickFormat?: (label: string) => string;
  },
) {
  const merged = {
    title: NAME,
    desc: DESC,
    width: WIDTH,
    height: HEIGHT,
    ...props,
  };
  return render(() => <BarChart {...(merged as ComponentProps<typeof BarChart>)} />);
}

describe("BarChart — measureCategoryLeftMargin default path", () => {
  it("keeps the 40px left when the caller did not opt in", () => {
    const first = mount({ categories: LONG, orientation: "horizontal" });
    const second = mount({ categories: LONG, orientation: "horizontal" });
    expect(plotTranslateX(first.container)).toBe(40);
    expect(plotTranslateX(second.container)).toBe(40);
    expect(plotTranslateX(first.container)).toBe(plotTranslateX(second.container));
    first.unmount();
    second.unmount();
  });

  it("keeps an explicit caller left when the caller did not opt in", () => {
    const { container, unmount } = mount({
      categories: LONG,
      orientation: "horizontal",
      margins: { left: 150 },
    });
    expect(plotTranslateX(container)).toBe(150);
    unmount();
  });

  it("does not change left when opted in on a vertical chart", () => {
    const { container, unmount } = mount({
      categories: LONG,
      orientation: "vertical",
      measureCategoryLeftMargin: true,
    });
    expect(plotTranslateX(container)).toBe(40);
    unmount();
  });

  it("does not change left when opted in on the legacy vertical data shape", () => {
    const { container, unmount } = mount({
      data: LONG.map((c) => ({ label: c.label, y: c.value })),
      measureCategoryLeftMargin: true,
    });
    expect(plotTranslateX(container)).toBe(40);
    unmount();
  });
});

describe("BarChart — measureCategoryLeftMargin horizontal", () => {
  it("grows left past 40 to fit the painted (truncated) long labels", () => {
    const { container, unmount } = mount({
      categories: LONG,
      orientation: "horizontal",
      measureCategoryLeftMargin: true,
    });

    const left = plotTranslateX(container);
    const painted = paintedLeftLabelMaxWidth(container);
    const ticks = axisLabels(container, "left");

    expect(ticks).toContain("Gqeberha Summerstra…");
    expect(ticks).not.toContain("Gqeberha Summerstrand");
    expect(left).toBeGreaterThan(40);
    expect(left).toBeGreaterThanOrEqual(painted + CATEGORY_LABEL_LEFT_TICK_GAP_PX - 1);
    expect(left).toBeLessThanOrEqual(Math.ceil(painted) + CATEGORY_LABEL_LEFT_TICK_GAP_PX + 1);
    unmount();
  });

  it("keeps left ≥ 40 and no larger than a tight fit for short labels", () => {
    const { container, unmount } = mount({
      categories: SHORT,
      orientation: "horizontal",
      measureCategoryLeftMargin: true,
    });

    const left = plotTranslateX(container);
    const painted = paintedLeftLabelMaxWidth(container);
    const tight = Math.ceil(painted) + CATEGORY_LABEL_LEFT_TICK_GAP_PX;

    expect(left).toBeGreaterThanOrEqual(40);
    expect(left).toBeLessThanOrEqual(Math.max(40, tight + 1));
    unmount();
  });

  it("measures the caller-formatted text, not the truncated default", () => {
    const { container, unmount } = mount({
      categories: LONG,
      orientation: "horizontal",
      measureCategoryLeftMargin: true,
      categoryTickFormat: (label) => label.slice(0, 4),
    });

    const left = plotTranslateX(container);
    const painted = paintedLeftLabelMaxWidth(container);
    const ticks = axisLabels(container, "left");

    expect(ticks).toContain("Gqeb");
    expect(ticks.some((t) => t?.includes("…"))).toBe(false);
    expect(left).toBeGreaterThanOrEqual(40);
    expect(left).toBeLessThanOrEqual(Math.max(40, Math.ceil(painted) + CATEGORY_LABEL_LEFT_TICK_GAP_PX + 1));
    unmount();
  });

  it("still honours an explicit caller left larger than the measured floor", () => {
    const { container, unmount } = mount({
      categories: SHORT,
      orientation: "horizontal",
      measureCategoryLeftMargin: true,
      margins: { left: 150 },
    });
    expect(plotTranslateX(container)).toBe(150);
    unmount();
  });
});
