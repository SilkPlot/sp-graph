/**
 * "Colour can encode but never uniquely encode" (ADR-0005 §5) is a claim about
 * what a reader who cannot separate two hues can still separate. These tests pin
 * the machinery that makes it true: a dash pattern and a marker shape per series
 * index, and a `seriesChannel` accessor that hands out all three together so a
 * caller cannot take the colour and drop the rest.
 *
 * The load-bearing assertion here is not "a dash array exists" — it is that
 * every PAIR of series differs in a non-colour channel. A palette where series 2
 * and 5 happened to share both dash and shape would satisfy every per-item check
 * and still be colour-only for that pair.
 *
 * Whether the focus treatment actually WINS the cascade is a computed-style
 * question and is proven in the browser (`playground/test/focus.test.tsx`); what
 * is provable here is that the sheet contains no unguarded outline suppression.
 */
import { describe, expect, it } from "vitest";
import {
  FOCUS_CLASS,
  categoricalPalette,
  focusVisibleCss,
  markerPath,
  seriesChannel,
  seriesDashPatterns,
  seriesMarkerShapes,
  type MarkerShape,
} from "../src/index";

describe("seriesChannel hands out colour AND dash AND shape", () => {
  it("returns token references, not frozen literal colours", () => {
    // A literal hex here would defeat the whole scheme × contrast cascade: the
    // series would keep its light-surface colour on a dark surface. The var()
    // reference is what lets the palette follow the resolved variant.
    const c = seriesChannel(0);
    expect(c.color).toBe("var(--sp-cat-0)");
    expect(c.dash).toBe("var(--sp-cat-dash-0)");
    expect(c.color).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it("wraps indices past the palette, including negatives", () => {
    const n = categoricalPalette.length;
    expect(seriesChannel(n).index).toBe(0);
    expect(seriesChannel(n + 3).index).toBe(3);
    expect(seriesChannel(-1).index).toBe(n - 1);
    // A modulo that returns a negative index would produce `var(--sp-cat--1)`,
    // which is a syntactically valid custom property that resolves to nothing.
    expect(seriesChannel(-1).color).toBe(`var(--sp-cat-${n - 1})`);
  });

  it("keeps every channel index-aligned with the palette", () => {
    for (let i = 0; i < categoricalPalette.length; i++) {
      const c = seriesChannel(i);
      expect(c.color).toBe(`var(--sp-cat-${i})`);
      expect(c.dash).toBe(`var(--sp-cat-dash-${i})`);
      expect(seriesMarkerShapes).toContain(c.shape);
    }
  });
});

describe("colour is never the only differentiator between two series", () => {
  const n = categoricalPalette.length;

  it("covers every palette index with a dash pattern and a shape", () => {
    expect(seriesDashPatterns.length).toBeGreaterThanOrEqual(n);
    expect(seriesMarkerShapes.length).toBeGreaterThanOrEqual(n);
  });

  it("leaves index 0 solid — a single series is not gratuitously dashed", () => {
    expect(seriesDashPatterns[0]).toBe("none");
  });

  it("gives EVERY pair of series a non-colour difference", () => {
    const failures: string[] = [];
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const ca = seriesChannel(a);
        const cb = seriesChannel(b);
        const sameDash = seriesDashPatterns[ca.index] === seriesDashPatterns[cb.index];
        const sameShape = ca.shape === cb.shape;
        if (sameDash && sameShape) {
          failures.push(`series ${a} and ${b} differ only by colour`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("gives ADJACENT series a different shape, not just a different dash", () => {
    // Adjacent series are the ones most often compared side by side, and a dash
    // pattern is hard to read on a short segment or a single marker.
    for (let i = 0; i + 1 < n; i++) {
      expect(
        seriesChannel(i).shape,
        `series ${i} and ${i + 1} share a marker shape`,
      ).not.toBe(seriesChannel(i + 1).shape);
    }
  });

  it("emits dash patterns that are actually distinct arrays", () => {
    expect(new Set(seriesDashPatterns.slice(0, n)).size).toBe(n);
  });
});

describe("markerPath draws discriminable shapes", () => {
  const SHAPES: MarkerShape[] = ["circle", "square", "triangle", "diamond", "cross"];

  /** Every coordinate pair in an SVG path, as absolute numbers. */
  function coords(d: string): number[] {
    return [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  }

  it("produces a non-empty path for every shape", () => {
    for (const shape of SHAPES) {
      const d = markerPath(shape, 50, 50, 5);
      expect(d.length, `${shape} produced an empty path`).toBeGreaterThan(0);
      expect(Number.isNaN(coords(d).find(Number.isNaN))).toBe(false);
    }
  });

  it("draws every shape distinctly — a shape channel nobody can read is not one", () => {
    const paths = SHAPES.map((s) => markerPath(s, 50, 50, 5));
    expect(new Set(paths).size).toBe(SHAPES.length);
  });

  it("keeps every shape near its centre and near its nominal size", () => {
    // A marker that drifts off its datum, or that renders at half the weight of
    // its neighbours, breaks the channel just as surely as a duplicate shape.
    const r = 6;
    for (const shape of SHAPES) {
      const nums = coords(markerPath(shape, 100, 100, r));
      for (const v of nums) {
        // Coordinates are all around 100 (± the marker's own extent), except
        // the arc's radius arguments in the circle path.
        if (Math.abs(v - 100) > 50) continue;
        expect(Math.abs(v - 100), `${shape} coordinate ${v} is far from centre`).toBeLessThanOrEqual(
          r * 1.6,
        );
      }
      // Each shape must actually reach out toward its radius, not collapse.
      const spread = Math.max(...nums.filter((v) => Math.abs(v - 100) <= 50).map((v) => Math.abs(v - 100)));
      expect(spread, `${shape} collapsed to a point`).toBeGreaterThanOrEqual(r * 0.5);
    }
  });

  it("moves with cx/cy rather than baking in an origin", () => {
    for (const shape of SHAPES) {
      expect(markerPath(shape, 10, 20, 4)).not.toBe(markerPath(shape, 30, 20, 4));
      expect(markerPath(shape, 10, 20, 4)).not.toBe(markerPath(shape, 10, 40, 4));
    }
  });
});

describe("focusVisibleCss never suppresses an outline it has not replaced", () => {
  const css = focusVisibleCss();

  it("provides a :focus-visible indicator drawn from tokens", () => {
    expect(css).toContain(`.${FOCUS_CLASS}:focus-visible`);
    expect(css).toContain("var(--sp-color-focus-ring)");
    expect(css).toContain("outline:");
  });

  it("guards its ONLY outline suppression behind :focus:not(:focus-visible)", () => {
    // This is the G1 regression guard. A bare `outline: none` anywhere in the
    // sheet reintroduces exactly the defect this phase exists to close, and it
    // would be invisible in review because the replacement rule is right above.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const suppressions = [...bare.matchAll(/([^{}]*)\{[^}]*outline:\s*none/g)].map((m) =>
      m[1]!.trim(),
    );
    expect(suppressions).toEqual([`.${FOCUS_CLASS}:focus:not(:focus-visible)`]);
  });

  it("draws the ring against the surface, not against whatever it overlaps", () => {
    // The halo is what makes `--sp-color-focus-ring`'s measured ratio against
    // the surface the ratio that is actually experienced.
    expect(css).toContain("var(--sp-color-surface)");
  });

  it("does not animate the indicator at all", () => {
    // `outline-color` transitions FROM `currentColor`, so an eased ring is
    // painted in the TEXT colour for the first frames after focus — the browser
    // tests measured 18.11:1 instead of the token's 5.67:1 on the dark surface.
    // It still cleared 3:1, which is exactly why it would have passed review.
    // An indicator has nothing to gain from easing, so there is no transition
    // and no animation to reduce.
    expect(css).not.toContain("transition");
    expect(css).not.toContain("animation");
  });
});
