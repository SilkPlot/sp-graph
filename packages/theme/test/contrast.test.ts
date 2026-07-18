/**
 * The theming contract makes an accessibility PROMISE: dark and high-contrast
 * are first-class, and the increased-contrast preference actually raises
 * contrast on every surface. `tokens.test.ts` pins the name mapping and that the
 * variant BLOCKS exist; this file pins the two things that file cannot see —
 * that the palette VALUES clear their WCAG ratios, and that the four
 * scheme×contrast combinations are emitted with the selectors that make them
 * resolve. WHICH declaration wins per rendered path is proven on computed styles
 * in the browser (`packages/solid/test/theme-cascade.test.tsx`); this is the
 * value-and-structure half, cheap enough to run in node.
 *
 * The ratios are recomputed here with the WCAG relative-luminance formula rather
 * than pasted, so a wrong hex fails the number, not just a stale comment.
 */
import { describe, expect, it } from "vitest";
import { tokensToCss } from "../src/index";

/** WCAG 2.x relative luminance of an #rrggbb colour. */
function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const chan = (i: number): number => {
    const s = Number.parseInt(n.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}

/** WCAG contrast ratio between two #rrggbb colours (>= 1). */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The body of the CSS block whose selector/at-rule line first matches. */
function blockAfter(css: string, marker: string): string {
  const at = css.indexOf(marker);
  expect(at, `marker not found: ${marker}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at + marker.length);
  return css.slice(open + 1, css.indexOf("}", open));
}

const DARK_SURFACE = "#14161a";
const LIGHT_SURFACE = "#ffffff";

describe("the WCAG helper is itself correct", () => {
  it("gives 21:1 for black on white and 1:1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#14161a", "#14161a")).toBeCloseTo(1, 5);
  });
});

describe("dark high-contrast palette — verified against the dark surface", () => {
  // [token, value, background, floor, expected ratio]. The floor is the WCAG
  // minimum the token must clear as its kind (text 7:1 AAA, non-text 3:1); the
  // expected ratio is the computed value pinned so a hex change fails loudly.
  const cases: Array<[string, string, string, number, number]> = [
    ["text", "#ffffff", DARK_SURFACE, 7, 18.11],
    ["muted", "#98a2b3", DARK_SURFACE, 4.5, 7.03],
    ["focusRing", "#4d8dff", DARK_SURFACE, 3, 5.67],
    ["axis", "#808a9c", DARK_SURFACE, 3, 5.2],
    ["grid", "#626a7a", DARK_SURFACE, 3, 3.33],
    ["cursor", "#cbd2dd", DARK_SURFACE, 3, 11.9],
  ];

  for (const [name, value, bg, floor, expected] of cases) {
    it(`${name} ${value} clears ${floor}:1 (${expected}:1)`, () => {
      const ratio = contrastRatio(value, bg);
      expect(ratio).toBeCloseTo(expected, 1);
      expect(ratio).toBeGreaterThanOrEqual(floor);
    });
  }

  it("is a descending legibility ladder: text > muted > axis ≈ focus > grid", () => {
    // The ordering itself encodes hierarchy, so a maintainer cannot brighten the
    // grid past the axis (or the axis past secondary text) without failing here.
    const r = (hex: string) => contrastRatio(hex, DARK_SURFACE);
    expect(r("#ffffff")).toBeGreaterThan(r("#98a2b3")); // text > muted
    expect(r("#98a2b3")).toBeGreaterThan(r("#808a9c")); // muted > axis
    expect(r("#4d8dff")).toBeGreaterThan(r("#626a7a")); // focus > grid
    expect(r("#808a9c")).toBeGreaterThan(r("#626a7a")); // axis > grid (grid faintest meaningful)
  });

  it("promotes grid to a MEANINGFUL line — a contrast request is not honoured by a faint one", () => {
    // The dark-normal grid (#2a2f3a) is near-invisible on the dark surface; the
    // high-contrast grid must be a line the eye can actually follow (>= 3:1),
    // while staying the faintest of the meaningful elements.
    expect(contrastRatio("#2a2f3a", DARK_SURFACE)).toBeLessThan(3);
    expect(contrastRatio("#626a7a", DARK_SURFACE)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#626a7a", DARK_SURFACE)).toBeLessThan(
      contrastRatio("#808a9c", DARK_SURFACE),
    );
  });
});

describe("the focus ring the dark path used to inherit was the defect", () => {
  it("light high-contrast focus #0033cc is fine on white but fails on dark", () => {
    expect(contrastRatio("#0033cc", LIGHT_SURFACE)).toBeCloseTo(8.95, 1);
    // 2.02:1 — below the 3:1 non-text floor exactly when contrast was asked to
    // rise. This is why the dark path gets its own #4d8dff.
    expect(contrastRatio("#0033cc", DARK_SURFACE)).toBeLessThan(3);
    expect(contrastRatio("#4d8dff", DARK_SURFACE)).toBeGreaterThanOrEqual(3);
  });
});

describe("light high-contrast palette — verified against white", () => {
  it("text is maximal and the focus ring clears the non-text floor", () => {
    expect(contrastRatio("#000000", LIGHT_SURFACE)).toBeCloseTo(21, 1);
    expect(contrastRatio("#0033cc", LIGHT_SURFACE)).toBeGreaterThanOrEqual(3);
  });
});

describe("the axis line is decorative low-contrast scaffolding, not a label", () => {
  it("keeps the 2.58:1 evidence for why the axis token is not a text colour", () => {
    // Wiring axis LABELS to this token would regress them below 4.5:1 — the
    // reason labels stay currentColor and only the LINE reads the token.
    expect(contrastRatio("#98a2b3", LIGHT_SURFACE)).toBeCloseTo(2.58, 1);
    expect(contrastRatio("#98a2b3", LIGHT_SURFACE)).toBeLessThan(4.5);
  });
});

describe("categorical series palettes clear the 3:1 non-text floor per surface", () => {
  const css = tokensToCss();

  /**
   * The `--sp-cat-N` values from a block, in index order. Read out of the
   * EMITTED CSS rather than imported from the module: the palettes are only
   * accessibility-relevant once they reach a selector, and importing the arrays
   * would pass even if a block forgot to emit them.
   */
  function paletteIn(block: string): string[] {
    return [...block.matchAll(/--sp-cat-(\d+):\s*(#[0-9a-f]{6});/g)]
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((m) => m[2]!);
  }

  // [name, block marker, surface, floor]. The floor is the contract's non-text
  // 3:1 for the normal variants; the high-contrast variants must actually be
  // HIGHER, which the ladder test below pins separately.
  const cases: Array<[string, string, string, number]> = [
    ["light (base :root)", ":root", LIGHT_SURFACE, 3],
    [
      "dark (OS)",
      '@media (prefers-color-scheme: dark) {\n  :root:not([data-sp-theme="light"])',
      DARK_SURFACE,
      3,
    ],
    ["dark (explicit attribute)", '\n[data-sp-theme="dark"]', DARK_SURFACE, 3],
    ["light forced", '\n[data-sp-theme="light"]', LIGHT_SURFACE, 3],
    ["light high-contrast", "@media (prefers-contrast: more) {\n  :root", LIGHT_SURFACE, 4.5],
    [
      "dark high-contrast (OS)",
      '@media (prefers-color-scheme: dark) and (prefers-contrast: more) {\n  :root:not([data-sp-theme="light"])',
      DARK_SURFACE,
      4.5,
    ],
    [
      "dark high-contrast (attribute)",
      '@media (prefers-contrast: more) {\n  [data-sp-theme="dark"]',
      DARK_SURFACE,
      4.5,
    ],
  ];

  for (const [name, marker, surface, floor] of cases) {
    it(`${name}: every series colour clears ${floor}:1 on ${surface}`, () => {
      const palette = paletteIn(blockAfter(css, marker));
      // A block that emitted no palette would vacuously pass a forEach.
      expect(palette.length, `${name} emitted no --sp-cat-* values`).toBeGreaterThan(0);
      for (const [i, colour] of palette.entries()) {
        const ratio = contrastRatio(colour, surface);
        expect(
          ratio,
          `--sp-cat-${i} ${colour} is ${ratio.toFixed(2)}:1 on ${surface}, below ${floor}:1`,
        ).toBeGreaterThanOrEqual(floor);
      }
    });
  }

  it("every variant emits the same NUMBER of series colours", () => {
    // A dark palette one entry short would silently fall through to a light
    // colour for the last series — legible background, illegible series.
    const counts = cases.map(([, marker]) => paletteIn(blockAfter(css, marker)).length);
    expect(new Set(counts).size, `palette lengths differ: ${counts.join(",")}`).toBe(1);
  });

  it("raises series contrast when the user asks for more, on both surfaces", () => {
    const mean = (marker: string, surface: string): number => {
      const p = paletteIn(blockAfter(css, marker));
      return p.reduce((s, c) => s + contrastRatio(c, surface), 0) / p.length;
    };
    expect(mean("@media (prefers-contrast: more) {\n  :root", LIGHT_SURFACE)).toBeGreaterThan(
      mean(":root", LIGHT_SURFACE),
    );
    expect(
      mean(
        '@media (prefers-contrast: more) {\n  [data-sp-theme="dark"]',
        DARK_SURFACE,
      ),
    ).toBeGreaterThan(
      mean('\n[data-sp-theme="dark"]', DARK_SURFACE),
    );
  });

  it("keeps the Tableau 10 failure it replaced as evidence for why per-surface", () => {
    // The previous palette was one array on :root. These five entries are why a
    // single categorical palette cannot satisfy a threshold defined against a
    // background — they are legible on dark and illegible on white.
    for (const [colour, onWhite] of [
      ["#edc949", 1.61],
      ["#ff9da7", 1.98],
      ["#bab0ab", 2.12],
      ["#76b7b2", 2.29],
      ["#f28e2c", 2.42],
    ] as Array<[string, number]>) {
      expect(contrastRatio(colour, LIGHT_SURFACE)).toBeCloseTo(onWhite, 1);
      expect(contrastRatio(colour, LIGHT_SURFACE)).toBeLessThan(3);
      expect(contrastRatio(colour, DARK_SURFACE)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("tokensToCss emits scheme×contrast as four combined blocks", () => {
  const css = tokensToCss();

  it("emits a dark high-contrast block under the combined OS media query", () => {
    const block = blockAfter(
      css,
      "@media (prefers-color-scheme: dark) and (prefers-contrast: more) {\n  :root:not([data-sp-theme=\"light\"])",
    );
    expect(block).toContain("--sp-color-text: #ffffff;");
    expect(block).toContain("--sp-color-focus-ring: #4d8dff;");
    expect(block).toContain("--sp-color-grid: #626a7a;");
  });

  it("emits a dark high-contrast block for the explicit/subtree attribute path", () => {
    const block = blockAfter(
      css,
      "@media (prefers-contrast: more) {\n  [data-sp-theme=\"dark\"]",
    );
    expect(block).toContain("--sp-color-text: #ffffff;");
    expect(block).toContain("--sp-color-focus-ring: #4d8dff;");
  });

  it("dark high-contrast is a minimal delta — muted is inherited, not re-declared", () => {
    // The ladder's muted rung (#98a2b3, 7.03:1) is exactly the dark-normal muted,
    // so the dark-HC blocks override only text/grid/axis/focus-ring and let muted
    // (and surface, cursor) fall through the cascade. Emitting muted here would be
    // a second place deciding one value.
    const darkOs = blockAfter(
      css,
      "@media (prefers-color-scheme: dark) and (prefers-contrast: more) {\n  :root:not([data-sp-theme=\"light\"])",
    );
    const darkAttr = blockAfter(
      css,
      "@media (prefers-contrast: more) {\n  [data-sp-theme=\"dark\"]",
    );
    for (const block of [darkOs, darkAttr]) {
      expect(block).not.toContain("--sp-color-muted");
      expect(block).not.toContain("--sp-color-surface");
      expect(block).not.toContain("--sp-color-cursor");
    }
  });

  it("keeps light high-contrast light — black text is never emitted onto a dark surface", () => {
    // The light-HC #000000 text appears only in :root / [data-sp-theme="light"]
    // contrast blocks, never in a dark-scheme block.
    const darkOs = blockAfter(
      css,
      "@media (prefers-color-scheme: dark) and (prefers-contrast: more) {\n  :root:not([data-sp-theme=\"light\"])",
    );
    const darkAttr = blockAfter(
      css,
      "@media (prefers-contrast: more) {\n  [data-sp-theme=\"dark\"]",
    );
    expect(darkOs).not.toContain("#000000");
    expect(darkAttr).not.toContain("#000000");
  });

  it("restores light on a forced-light subtree so it does not inherit dark", () => {
    // Newline-anchored: the top-level block starts at column 0, unlike the
    // indented `:not([data-sp-theme="light"])` and the high-contrast media block.
    const block = blockAfter(css, "\n[data-sp-theme=\"light\"]");
    expect(block).toContain("--sp-color-surface: #ffffff;");
    expect(block).toContain("--sp-color-text: #16181d;");
  });

  it("keeps contrast media-only — no data-sp-contrast opt-in leaks in", () => {
    expect(css).not.toContain("data-sp-contrast");
  });
});
