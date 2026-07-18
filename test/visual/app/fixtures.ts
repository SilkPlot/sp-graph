/**
 * Deterministic fixture data for the visual baselines.
 *
 * Every series here is generated from a closed-form function of the index —
 * no `Math.random`, no `Date.now`, no locale-dependent parsing. A baseline is
 * only worth anything if the input that produced it is reproducible, and a
 * single random series would make every diff unreadable.
 *
 * Timestamps are built from an explicit UTC epoch and a whole number of days.
 * The browser context is pinned to UTC as well (see playwright.visual.config.ts)
 * because axis tick labels are formatted in the browser's zone: a series built
 * in one zone and rendered in another shifts its labels, which reads as a
 * rendering regression and is not one.
 */
import type { CategoryPoint, TimePoint, XYPoint } from "@silkplot/charts";

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2026, 0, 1);

const days = (count: number, value: (i: number) => number): TimePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    t: new Date(EPOCH + i * DAY_MS),
    // One decimal place: enough shape to see, few enough digits that a tick
    // label is not a wall of text.
    y: Math.round(value(i) * 10) / 10,
  }));

/** An ordinary wandering series — the reference geometry. */
export const TIME_DEFAULT: readonly TimePoint[] = days(
  24,
  (i) => 20 + Math.sin(i / 3) * 6 + Math.cos(i / 7) * 3 + i * 0.4,
);

/**
 * An all-negative series.
 *
 * This is the input that separates `zero-floor` from `zero-baseline`: under one
 * the fill's flat edge lands on a pixel the axis labels `-2`, so the mark
 * contradicts its own axis. Every other series makes the two policies look
 * identical.
 */
export const TIME_NEGATIVE: readonly TimePoint[] = days(
  24,
  (i) => -8 - Math.sin(i / 3) * 5 - i * 0.35,
);

/** Enough points over a long enough span that the x labels have to compete. */
export const TIME_DENSE: readonly TimePoint[] = days(
  140,
  (i) => 500 + Math.sin(i / 9) * 320 + Math.cos(i / 3) * 90,
);

export const TIME_EMPTY: readonly TimePoint[] = [];

const categories = (
  labels: readonly string[],
  value: (i: number) => number,
): CategoryPoint[] => labels.map((label, i) => ({ label, y: Math.round(value(i) * 10) / 10 }));

export const CATEGORY_DEFAULT: readonly CategoryPoint[] = categories(
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  (i) => 12 + Math.sin(i) * 7 + i * 1.5,
);

export const CATEGORY_NEGATIVE: readonly CategoryPoint[] = categories(
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  (i) => -6 - Math.cos(i) * 4 - i * 1.2,
);

/** Long labels in a narrow box: the collision case, not merely a busy one. */
export const CATEGORY_DENSE: readonly CategoryPoint[] = categories(
  [
    "Aberdeen Clinic",
    "Bloemfontein North",
    "Cape Town Central",
    "Durban Berea",
    "East London Quigney",
    "Gqeberha Summerstrand",
    "Johannesburg Rosebank",
    "Kimberley Beaconsfield",
    "Nelspruit West",
    "Polokwane Bendor",
    "Pretoria Hatfield",
    "Rustenburg Waterfall",
  ],
  (i) => 40 + Math.sin(i / 2) * 25 + i * 2,
);

export const CATEGORY_EMPTY: readonly CategoryPoint[] = [];

const cloud = (count: number, point: (i: number) => XYPoint): XYPoint[] =>
  Array.from({ length: count }, (_, i) => point(i));

export const XY_DEFAULT: readonly XYPoint[] = cloud(48, (i) => ({
  x: (i % 12) * 4 + Math.sin(i) * 1.5,
  y: Math.cos(i / 2) * 10 + i * 0.3,
}));

export const XY_NEGATIVE: readonly XYPoint[] = cloud(48, (i) => ({
  x: -((i % 12) * 4) - Math.sin(i) * 1.5,
  y: -Math.abs(Math.cos(i / 2) * 10) - i * 0.3,
}));

export const XY_DENSE: readonly XYPoint[] = cloud(320, (i) => ({
  x: (i % 40) * 137.5 + Math.sin(i / 5) * 40,
  y: Math.floor(i / 40) * 1250 + Math.cos(i / 3) * 380,
}));

export const XY_EMPTY: readonly XYPoint[] = [];
