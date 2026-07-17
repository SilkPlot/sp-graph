/**
 * The theme cascade, proven on COMPUTED styles in a real browser.
 *
 * The node `theme` project can only see that the CSS blocks EXIST; it cannot see
 * which declaration WINS, which is exactly where the scheme×contrast bug lived —
 * a light-only high-contrast palette that either got discarded on a dark surface
 * or painted `#000000` text onto `#14161a`. Both pass a "the block is present"
 * check while being wrong.
 *
 * So these tests inject `tokensToCss()` into a live document, emulate
 * `prefers-color-scheme` and `prefers-contrast` through the CDP media emulation,
 * drive the scheme the three ways the contract promises (OS media, an explicit
 * `data-sp-theme` on the root, and a themed subtree), then read
 * `getComputedStyle(el).getPropertyValue("--sp-color-…")` for every matrix cell
 * and assert BOTH the resolved value and its WCAG contrast ratio. The
 * load-bearing claim is that the increased-contrast preference survives every
 * dark path.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cdp } from "@vitest/browser/context";
import { tokensToCss, THEME_ATTR } from "@silkplot/theme";

// CDPSession is typed as an empty interface by vitest; the only method we need
// is `send`, so pin a minimal shape rather than reach for `any`.
interface CdpLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}
const session = cdp() as unknown as CdpLike;

type Scheme = "light" | "dark";
type Contrast = "no-preference" | "more";

async function setMedia(scheme: Scheme, contrast: Contrast): Promise<void> {
  await session.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: scheme },
      { name: "prefers-contrast", value: contrast },
    ],
  });
}

/** WCAG relative luminance of an #rrggbb string. */
function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const chan = (i: number): number => {
    const s = Number.parseInt(n.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const varOf = (el: Element, name: string): string =>
  getComputedStyle(el).getPropertyValue(name).trim().toLowerCase();

let styleEl: HTMLStyleElement;
const spawned: HTMLElement[] = [];

beforeAll(() => {
  styleEl = document.createElement("style");
  styleEl.textContent = tokensToCss();
  document.head.appendChild(styleEl);
});

afterAll(async () => {
  styleEl.remove();
  await session.send("Emulation.setEmulatedMedia", { features: [] });
});

afterEach(() => {
  document.documentElement.removeAttribute(THEME_ATTR);
  for (const el of spawned.splice(0)) el.remove();
});

/** A themed subtree island, so a document-level scheme does not decide it. */
function subtree(attr: "dark" | "light"): HTMLElement {
  const div = document.createElement("div");
  div.setAttribute(THEME_ATTR, attr);
  document.body.appendChild(div);
  spawned.push(div);
  return div;
}

/** The document root, optionally forced to a scheme via the attribute. */
function root(attr?: "dark" | "light"): HTMLElement {
  if (attr) document.documentElement.setAttribute(THEME_ATTR, attr);
  return document.documentElement;
}

const LIGHT_NORMAL = {
  text: "#16181d",
  surface: "#ffffff",
  focus: "#2563eb",
  grid: "#e4e7ec",
  axis: "#98a2b3",
};
const DARK_NORMAL = {
  text: "#e7eaf0",
  surface: "#14161a",
  focus: "#2563eb",
  grid: "#2a2f3a",
  axis: "#667085",
};
const LIGHT_HC = {
  text: "#000000",
  surface: "#ffffff",
  focus: "#0033cc",
  grid: "#000000",
  axis: "#000000",
};
const DARK_HC = {
  text: "#ffffff",
  surface: "#14161a",
  focus: "#4d8dff",
  grid: "#626a7a",
  axis: "#808a9c",
};

type Palette = typeof LIGHT_NORMAL;

function assertPalette(el: Element, expected: Palette): void {
  expect(varOf(el, "--sp-color-text")).toBe(expected.text);
  expect(varOf(el, "--sp-color-surface")).toBe(expected.surface);
  expect(varOf(el, "--sp-color-focus-ring")).toBe(expected.focus);
  expect(varOf(el, "--sp-color-grid")).toBe(expected.grid);
  expect(varOf(el, "--sp-color-axis")).toBe(expected.axis);
}

describe("CDP media emulation actually reaches the test document", () => {
  it("flips matchMedia for both axes, or every assertion below is vacuous", async () => {
    await setMedia("dark", "more");
    expect(matchMedia("(prefers-color-scheme: dark)").matches).toBe(true);
    expect(matchMedia("(prefers-contrast: more)").matches).toBe(true);
    await setMedia("light", "no-preference");
    expect(matchMedia("(prefers-color-scheme: dark)").matches).toBe(false);
    expect(matchMedia("(prefers-contrast: more)").matches).toBe(false);
  });
});

interface Cell {
  name: string;
  scheme: Scheme;
  contrast: Contrast;
  el: () => Element;
  expected: Palette;
}

// The full matrix: {light,dark} × {normal,high-contrast}, each reached through
// the OS media path, the explicit-root-attribute path, and a themed subtree.
const CELLS: Cell[] = [
  // ── normal contrast ────────────────────────────────────────────────
  { name: "OS light, normal, root", scheme: "light", contrast: "no-preference", el: () => root(), expected: LIGHT_NORMAL },
  { name: "OS dark, normal, root (OS path)", scheme: "dark", contrast: "no-preference", el: () => root(), expected: DARK_NORMAL },
  { name: "forced-light root under OS dark", scheme: "dark", contrast: "no-preference", el: () => root("light"), expected: LIGHT_NORMAL },
  { name: "forced-dark root under OS light", scheme: "light", contrast: "no-preference", el: () => root("dark"), expected: DARK_NORMAL },
  { name: "dark subtree under OS light", scheme: "light", contrast: "no-preference", el: () => subtree("dark"), expected: DARK_NORMAL },
  { name: "light subtree under OS dark", scheme: "dark", contrast: "no-preference", el: () => subtree("light"), expected: LIGHT_NORMAL },
  // ── high contrast (the fix) ────────────────────────────────────────
  { name: "OS light, MORE, root", scheme: "light", contrast: "more", el: () => root(), expected: LIGHT_HC },
  { name: "OS dark, MORE, root (was silently discarded)", scheme: "dark", contrast: "more", el: () => root(), expected: DARK_HC },
  { name: "explicit-dark root, MORE (was black-on-black)", scheme: "dark", contrast: "more", el: () => root("dark"), expected: DARK_HC },
  { name: "attr-dark root under OS light, MORE", scheme: "light", contrast: "more", el: () => root("dark"), expected: DARK_HC },
  { name: "forced-light root under OS dark, MORE", scheme: "dark", contrast: "more", el: () => root("light"), expected: LIGHT_HC },
  { name: "dark subtree under OS light, MORE (load-bearing)", scheme: "light", contrast: "more", el: () => subtree("dark"), expected: DARK_HC },
  { name: "dark subtree under OS dark, MORE", scheme: "dark", contrast: "more", el: () => subtree("dark"), expected: DARK_HC },
  { name: "light subtree under OS dark, MORE", scheme: "dark", contrast: "more", el: () => subtree("light"), expected: LIGHT_HC },
];

describe("every matrix cell resolves to the right palette on computed styles", () => {
  for (const cell of CELLS) {
    it(cell.name, async () => {
      await setMedia(cell.scheme, cell.contrast);
      assertPalette(cell.el(), cell.expected);
    });
  }
});

describe("the increased-contrast preference RAISES text contrast on every dark path", () => {
  // The bug: high contrast on a dark surface either did nothing or went to
  // 1.16:1 (black on #14161a). Every dark high-contrast path must instead clear
  // AAA (7:1) — measured on the actually-resolved computed values.
  const darkHcPaths: Cell[] = CELLS.filter(
    (c) => c.contrast === "more" && c.expected === DARK_HC,
  );
  for (const cell of darkHcPaths) {
    it(`${cell.name}: text vs surface >= 7:1`, async () => {
      await setMedia(cell.scheme, cell.contrast);
      const el = cell.el();
      const ratio = contrastRatio(
        varOf(el, "--sp-color-text"),
        varOf(el, "--sp-color-surface"),
      );
      expect(ratio).toBeGreaterThanOrEqual(7);
    });
  }
});

describe("dark high-contrast inherits muted from dark-normal (minimal delta)", () => {
  // DARK_HC overrides only text/grid/axis/focus-ring; muted must fall through to
  // the dark-normal #98a2b3 (7.03:1), one legible step below primary text. Proven
  // on the resolved computed value, not on the source object.
  const darkHcPaths: Cell[] = CELLS.filter(
    (c) => c.contrast === "more" && c.expected === DARK_HC,
  );
  for (const cell of darkHcPaths) {
    it(`${cell.name}: muted resolves to the inherited #98a2b3 at >= 4.5:1`, async () => {
      await setMedia(cell.scheme, cell.contrast);
      const el = cell.el();
      expect(varOf(el, "--sp-color-muted")).toBe("#98a2b3");
      const ratio = contrastRatio(
        varOf(el, "--sp-color-muted"),
        varOf(el, "--sp-color-surface"),
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("non-text scaffolding clears 3:1 in every supported mode (Decision 6)", () => {
  for (const cell of CELLS) {
    it(`${cell.name}: focus ring and cursor >= 3:1 on their surface`, async () => {
      await setMedia(cell.scheme, cell.contrast);
      const el = cell.el();
      const surface = varOf(el, "--sp-color-surface");
      const focus = varOf(el, "--sp-color-focus-ring");
      const cursor = varOf(el, "--sp-color-cursor");
      expect(contrastRatio(focus, surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(cursor, surface)).toBeGreaterThanOrEqual(3);
    });
  }
});
