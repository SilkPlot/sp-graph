/**
 * The palette constants this package holds locally, pinned against the theme.
 *
 * `series-style.ts` deliberately does NOT import `@silkplot/theme` — the seam
 * between a chart and its theme is the CSS custom property, and importing the
 * theme to learn a colour would drag the palette tables and the contrast
 * machinery into every consumer's bundle to obtain a string the chart can write
 * directly.
 *
 * The cost of that decision is one duplicated fact: how many entries the palette
 * has, which is where indices wrap. Duplication is exactly what diverges
 * silently, so this file imports the theme — a devDependency, absent from the
 * shipped bundle — and asserts the two still agree. The production path keeps
 * the contract; this keeps it honest.
 *
 * If this fails, the theme's palette changed size. Update `SERIES_PALETTE_SIZE`
 * to match; do not relax the assertion.
 */
import { describe, expect, it } from "vitest";
import {
  categoricalPalette,
  seriesChannel,
  seriesDashPatterns,
} from "@silkplot/theme";
import {
  SERIES_DASH_COUNT,
  SERIES_PALETTE_SIZE,
  resolveSeriesStyle,
  seriesColorToken,
  seriesDashToken,
} from "@silkplot/core";

describe("the local palette constants match the theme", () => {
  it("pins the colour count", () => {
    expect(SERIES_PALETTE_SIZE).toBe(categoricalPalette.length);
  });

  it("pins the dash count", () => {
    expect(SERIES_DASH_COUNT).toBe(seriesDashPatterns.length);
  });

  it("emits the same token the theme's own channel resolves", () => {
    // The strings must agree, not merely the counts — a chart writing
    // `--sp-cat-3` while the theme emits `--sp-series-3` would produce an
    // unresolved variable and a chart drawn entirely in `currentColor`.
    for (let i = 0; i < SERIES_PALETTE_SIZE; i += 1) {
      expect(seriesColorToken(i)).toContain(`--sp-cat-${i}`);
      expect(seriesChannel(i).color).toContain(`--sp-cat-${i}`);
      expect(seriesDashToken(i)).toContain(`--sp-cat-dash-${i}`);
      expect(seriesChannel(i).dash).toContain(`--sp-cat-dash-${i}`);
    }
  });
});

describe("index wrapping", () => {
  it("wraps rather than running out, so a 22-series chart keeps distinct tokens", () => {
    // Index 8 wraps to 0. NOT `--sp-cat-8`, which resolves to nothing and would
    // fall back to currentColor — turning fourteen of twenty-two series into one
    // indistinguishable colour.
    expect(seriesColorToken(SERIES_PALETTE_SIZE)).toBe(seriesColorToken(0));
    expect(seriesColorToken(21)).toContain(`--sp-cat-${21 % SERIES_PALETTE_SIZE}`);
    expect(seriesColorToken(21)).not.toContain("--sp-cat-21");
  });

  it("tolerates a negative index", () => {
    expect(seriesColorToken(-1)).toBe(seriesColorToken(SERIES_PALETTE_SIZE - 1));
  });

  it("carries a currentColor fallback for a consumer shipping no theme", () => {
    // Without the fallback an unthemed consumer gets an unresolved variable,
    // which paints nothing — an invisible chart rather than a plain one.
    expect(seriesColorToken(0)).toContain("currentColor");
  });
});

describe("caller styles override per property, not per object", () => {
  it("keeps the dash channel when only the stroke is set", () => {
    const style = resolveSeriesStyle({ stroke: "#ff0000" }, 3, { area: false });

    expect(style.stroke).toBe("#ff0000");
    // The accessibility channel survives. Taking the whole object as an
    // override would discard it the moment anyone picked a brand colour, which
    // is the most likely thing a caller ever does.
    expect(style.dash).toContain("--sp-cat-dash-3");
  });

  it("lets a caller set an explicit dash", () => {
    expect(resolveSeriesStyle({ dash: [4, 2] }, 0, { area: false }).dash).toBe("4 2");
  });

  it("gives a non-area chart no fill at all", () => {
    expect(resolveSeriesStyle(undefined, 0, { area: false }).fill).toBeUndefined();
  });

  it("defaults an area fill to the series' own stroke", () => {
    const style = resolveSeriesStyle(undefined, 2, { area: true });
    // Fill and line cannot disagree about which series they belong to.
    expect(style.fill).toBe(style.stroke);
  });

  it("lets a caller set the fill independently of the stroke", () => {
    const style = resolveSeriesStyle({ stroke: "#111111", fill: "#eeeeee" }, 0, { area: true });
    expect(style.stroke).toBe("#111111");
    expect(style.fill).toBe("#eeeeee");
  });
});
