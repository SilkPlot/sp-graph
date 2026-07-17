/**
 * @silkplot/theme is a public contract, not just a palette: once a consumer's
 * stylesheet names `--sp-color-grid`, renaming it breaks them. These tests pin
 * the contract that ADR-0001 fixes.
 *
 * The mapping from token object to custom property is deliberately checked
 * name-by-name rather than recomputed with the same `kebab()` the source uses.
 * Recomputing it would assert that the code agrees with itself and would pass
 * just as happily if every name changed at once. It is also NOT mechanical —
 * `fontSize` becomes `--sp-font-*` and `categorical` becomes `--sp-cat-N` —
 * so a derived expectation would encode the wrong rule anyway.
 */
import { describe, expect, it } from "vitest";
import {
  tokens,
  tokensToCss,
  cssVar,
  categoricalPalette,
  sequentialRamp,
  CSS_PREFIX,
  THEME_ATTR,
} from "../src/index";

/** Custom properties declared anywhere in the sheet. */
function declaredVars(css: string): Set<string> {
  return new Set([...css.matchAll(/(--sp-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

/** The body of the first block whose selector line matches. */
function blockAfter(css: string, selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("token object", () => {
  it("carries every documented group", () => {
    expect(Object.keys(tokens).sort()).toEqual(
      ["categorical", "color", "fontSize", "motion", "radius", "space"].sort(),
    );
  });

  it("exposes the categorical palette as the same values", () => {
    expect(tokens.categorical).toEqual(categoricalPalette);
    expect(tokens.categorical.length).toBeGreaterThan(0);
  });
});

describe("cssVar", () => {
  it("composes the documented name", () => {
    expect(cssVar("color-text")).toBe("var(--sp-color-text)");
    expect(CSS_PREFIX).toBe("--sp");
  });

  it("emits a fallback when given one, so an unthemed consumer still renders", () => {
    expect(cssVar("color-grid", "currentColor")).toBe(
      "var(--sp-color-grid, currentColor)",
    );
  });

  it("omits the comma entirely when no fallback is given", () => {
    expect(cssVar("color-grid")).not.toContain(",");
  });
});

describe("tokensToCss — the object-to-property mapping", () => {
  const css = tokensToCss();
  const declared = declaredVars(css);

  // Pinned by hand. See the file header for why these are not derived.
  const EXPECTED: Record<string, string> = {
    "--sp-space-md": tokens.space.md,
    "--sp-radius-pill": tokens.radius.pill,
    "--sp-font-sm": tokens.fontSize.sm, // fontSize -> "font", not "font-size"
    "--sp-motion-base": tokens.motion.base,
    "--sp-color-surface": tokens.color.surface,
    "--sp-color-focus-ring": tokens.color.focusRing, // camelCase -> kebab-case
    "--sp-cat-0": tokens.categorical[0]!, // categorical -> "cat", index-suffixed
  };

  for (const [name, value] of Object.entries(EXPECTED)) {
    it(`maps ${name} to its token value`, () => {
      expect(blockAfter(css, ":root {")).toContain(`${name}: ${value};`);
    });
  }

  it("declares every token in the object — nothing silently unexposed", () => {
    const root = blockAfter(css, ":root {");
    const groups: Array<[string, Record<string, string>]> = [
      ["space", tokens.space],
      ["radius", tokens.radius],
      ["font", tokens.fontSize],
      ["motion", tokens.motion],
      ["color", tokens.color],
    ];
    for (const [prefix, group] of groups) {
      expect(Object.keys(group).length).toBeGreaterThan(0);
      for (const key of Object.keys(group)) {
        const kebab = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
        expect(root, `${prefix}.${key} is missing from :root`).toContain(
          `${CSS_PREFIX}-${prefix}-${kebab}:`,
        );
      }
    }
    tokens.categorical.forEach((_, i) => {
      expect(root).toContain(`${CSS_PREFIX}-cat-${i}:`);
    });
  });
});

describe("tokensToCss — variants", () => {
  const css = tokensToCss();

  it("follows the user agent for dark, unless the consumer forces light", () => {
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(`:root:not([${THEME_ATTR}="light"])`);
  });

  it("lets a consumer force dark without restating the palette", () => {
    const forced = blockAfter(css, `[${THEME_ATTR}="dark"] {`);
    expect(forced).toContain(`${CSS_PREFIX}-color-surface: #14161a;`);
  });

  it("emits identical dark values in both selectors", () => {
    const auto = blockAfter(css, `:root:not([${THEME_ATTR}="light"])`);
    const forced = blockAfter(css, `[${THEME_ATTR}="dark"] {`);
    const props = (block: string) =>
      [...block.matchAll(/(--sp-[a-z-]+):\s*([^;]+);/g)]
        .map((m) => `${m[1]}:${m[2]!.trim()}`)
        .sort();
    expect(props(auto)).toEqual(props(forced));
    expect(props(auto).length).toBeGreaterThan(0);
  });

  it("overrides only colours it means to in dark — every one is a real token", () => {
    const auto = blockAfter(css, `:root:not([${THEME_ATTR}="light"])`);
    const overridden = [...auto.matchAll(/--sp-color-([a-z-]+):/g)].map((m) => m[1]!);
    const known = Object.keys(tokens.color).map((k) =>
      k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
    );
    for (const name of overridden) expect(known).toContain(name);
  });

  it("raises contrast on user preference only — an app must not force it", () => {
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).not.toContain("data-sp-contrast");
  });

  it("collapses every motion token to 0ms under reduced motion, with no opt-out", () => {
    const block = blockAfter(css, "@media (prefers-reduced-motion: reduce) {\n  :root {");
    for (const key of Object.keys(tokens.motion)) {
      expect(block).toContain(`${CSS_PREFIX}-motion-${key}: 0ms;`);
    }
    expect(css).not.toContain("data-sp-motion");
  });

  it("declares no variant property that the base does not also declare", () => {
    // A variant introducing a property absent from :root would leave consumers
    // with a value that exists only for some users.
    const root = declaredVars(blockAfter(css, ":root {"));
    for (const name of declaredVars(css)) expect(root).toContain(name);
  });
});

describe("sequentialRamp", () => {
  it("returns the requested number of samples", () => {
    expect(sequentialRamp(5)).toHaveLength(5);
    expect(sequentialRamp(1)).toHaveLength(1);
  });

  it("spans the interpolator rather than repeating one colour", () => {
    const ramp = sequentialRamp(5);
    expect(new Set(ramp).size).toBe(5);
  });
});
