/**
 * The rotate-or-not decision and the reserved bottom must be deterministic:
 * same labels, band width, padding, and opt-in flag → same answer every run.
 * No DOM, no font metrics.
 */
import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABEL_CHAR_PX,
  CATEGORY_LABEL_ROTATION_DEG,
  adjacentCategoryLabelsCollide,
  reservedRotatedCategoryBottom,
  resolveCategoryLabelRotation,
} from "../src/index";

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const LONG = [
  "Aberdeen Clinic",
  "Bloemfontein North",
  "Cape Town Central",
  "Durban Berea",
  "East London Quigney",
  "Gqeberha Summerstra…",
  "Johannesburg Roseba…",
  "Kimberley Beaconsfi…",
  "Nelspruit West",
  "Polokwane Bendor",
  "Pretoria Hatfield",
  "Rustenburg Waterfal…",
] as const;

/** Inner width of the 400×300 chart tests after default left/right margins. */
const WIDE = 400 - 40 - 12;
/** Inner width of the 380px dense-label visual box after the same margins. */
const NARROW = 380 - 40 - 12;

describe("resolveCategoryLabelRotation — opt-in and collision", () => {
  it("never rotates and never reserves when the caller did not opt in", () => {
    const a = resolveCategoryLabelRotation({
      optedIn: false,
      labels: LONG,
      innerWidth: NARROW,
    });
    const b = resolveCategoryLabelRotation({
      optedIn: false,
      labels: LONG,
      innerWidth: NARROW,
    });
    expect(a).toEqual({ rotate: false, reservedBottom: 0 });
    expect(b).toEqual(a);
  });

  it("stays horizontal with no extra bottom when opted in but labels fit", () => {
    const a = resolveCategoryLabelRotation({
      optedIn: true,
      labels: SHORT,
      innerWidth: WIDE,
    });
    const b = resolveCategoryLabelRotation({
      optedIn: true,
      labels: SHORT,
      innerWidth: WIDE,
    });
    expect(a).toEqual({ rotate: false, reservedBottom: 0 });
    expect(b).toEqual(a);
  });

  it("rotates ~45° and reserves the same extra bottom when opted in and labels collide", () => {
    const a = resolveCategoryLabelRotation({
      optedIn: true,
      labels: LONG,
      innerWidth: NARROW,
    });
    const b = resolveCategoryLabelRotation({
      optedIn: true,
      labels: LONG,
      innerWidth: NARROW,
    });
    expect(a.rotate).toBe(true);
    expect(a.reservedBottom).toBeGreaterThan(24);
    expect(a.reservedBottom).toBe(reservedRotatedCategoryBottom(LONG));
    expect(b).toEqual(a);
    expect(CATEGORY_LABEL_ROTATION_DEG).toBe(-45);
  });

  it("does not treat an unmeasured (0) inner width as a collision", () => {
    expect(
      resolveCategoryLabelRotation({
        optedIn: true,
        labels: LONG,
        innerWidth: 0,
      }),
    ).toEqual({ rotate: false, reservedBottom: 0 });
  });

  it("does not rotate a single label — there is no neighbour to collide with", () => {
    expect(
      resolveCategoryLabelRotation({
        optedIn: true,
        labels: ["Only"],
        innerWidth: 40,
      }),
    ).toEqual({ rotate: false, reservedBottom: 0 });
  });
});

describe("adjacentCategoryLabelsCollide — char-count × constant", () => {
  it("compares half-extents against the band step, not measured text", () => {
    // Two 10-char labels: half+half = 10 * CHAR_PX. Collide when step is smaller.
    const labels = ["abcdefghij", "klmnopqrst"];
    const extent = 10 * CATEGORY_LABEL_CHAR_PX;
    expect(adjacentCategoryLabelsCollide(labels, extent - 1)).toBe(true);
    expect(adjacentCategoryLabelsCollide(labels, extent)).toBe(false);
    expect(adjacentCategoryLabelsCollide(labels, extent + 1)).toBe(false);
  });
});

describe("reservedRotatedCategoryBottom — integer projection", () => {
  it("is a pure function of the longest label and the published constants", () => {
    const once = reservedRotatedCategoryBottom(LONG);
    const twice = reservedRotatedCategoryBottom(LONG);
    expect(twice).toBe(once);
    expect(once).toBe(reservedRotatedCategoryBottom(["x".repeat(20)]));
  });
});
