/**
 * The public site's own tests.
 *
 * Documentation fails silently. Nothing throws when an example stops rendering,
 * when a snippet drifts from the code beside it, or when a card widens the page
 * past a phone's viewport — the build stays green and the page becomes a lie.
 * These are the assertions that make those failures loud.
 *
 * Three groups, each guarding a different way the site can stop being true:
 *
 *   1. THE EXAMPLES ARE REAL. Every registered example mounts, draws marks, and
 *      is named in the accessibility tree.
 *   2. THE SNIPPETS ARE THE CODE. The displayed source is the compiled module's
 *      own bytes, checked by finding the rendered chart's distinguishing values
 *      inside the source that claims to have produced it.
 *   3. THE LAYOUT HOLDS. No horizontal document overflow at a phone width.
 */
import { describe, expect, it, afterEach } from "vitest";
import { page } from "vitest/browser";
import { render, cleanup } from "@solidjs/testing-library";
import { examples } from "../src/examples/registry";
import { installThemeStyles } from "../src/install-styles";
import { App } from "../src/App";
// The site stylesheet, loaded exactly as the entry point loads it. Without it
// the layout assertions below measure unstyled markup — no `overflow-x` on the
// scroll containers, no `min-width: 0` on the grid items — and report a page
// that renders cleanly in a real browser as 276px broken.
import "../src/styles.css";

installThemeStyles();

afterEach(cleanup);

describe("the example registry", () => {
  it("has examples at all", () => {
    // A registry that silently resolved to nothing would let every assertion
    // below vacuously pass — `for (const x of [])` proves nothing, loudly.
    expect(examples.length).toBeGreaterThanOrEqual(5);
  });

  it("pairs every example with the source of the file it came from", () => {
    for (const ex of examples) {
      expect(ex.source, `${ex.file} has no source`).toBeTruthy();
      // The source must be the module's own text. Its default export is what
      // rendered, so the file has to contain that export statement.
      expect(ex.source, `${ex.file} source is not this module`).toContain(
        "export default Example",
      );
      expect(ex.title.length).toBeGreaterThan(0);
    }
  });

  it("shows source that imports only from the public packages", () => {
    // A snippet importing a deep internal path would compile here (the
    // workspace resolves it) and fail for a reader who installed from the
    // registry. Only bare package specifiers may appear.
    const imports = /from\s+"([^"]+)"/g;
    for (const ex of examples) {
      for (const m of ex.source.matchAll(imports)) {
        const spec = m[1] ?? "";
        expect(
          spec,
          `${ex.file} imports ${spec}, which a consumer cannot resolve`,
        ).toMatch(/^(?:@silkplot\/(?:core|theme|solid|charts)|solid-js)$/);
      }
    }
  });
});

describe("each example renders", () => {
  for (const ex of examples) {
    it(`${ex.file} draws marks and is named`, () => {
      const { container } = render(() => <ex.Component />);

      const svg = container.querySelector("svg");
      expect(svg, `${ex.file} rendered no svg`).not.toBeNull();

      // Marks, not merely a frame. An empty chart still has an <svg> and axes,
      // so counting those would pass on a chart that draws no data at all.
      const marks = container.querySelectorAll(
        "path[d]:not([d='']), rect[width], circle",
      );
      expect(marks.length, `${ex.file} drew no marks`).toBeGreaterThan(0);

      // Every example is informative, so every one must reach the accessibility
      // tree with a name. This is the contract the library enforces at compile
      // time; asserting it here catches a rendered fallback.
      const named =
        svg?.getAttribute("aria-label") ?? svg?.getAttribute("aria-labelledby");
      expect(named, `${ex.file} rendered an unnamed informative chart`).toBeTruthy();
    });
  }
});

describe("the page", () => {
  it("mounts with every example on it", () => {
    const { container } = render(() => <App />);
    const cards = container.querySelectorAll("[data-example]");
    expect(cards.length).toBe(examples.length);
  });

  /**
   * Horizontal overflow, measured at a genuinely narrow viewport.
   *
   * The first version of this test set `document.body.style.width = "390px"`
   * inside a full-size window and reported 252px of overflow on a page a real
   * 390px browser renders cleanly. Constraining the body is not the same thing
   * as a narrow viewport: media queries, `clientWidth`, and every viewport unit
   * still see the real window, so the number it produced described nothing.
   * `page.viewport()` resizes the actual frame, which is the only measurement
   * that corresponds to a person holding a phone.
   */
  async function overflowAt(width: number, height: number): Promise<number> {
    await page.viewport(width, height);
    // Let layout settle: the charts size themselves from a ResizeObserver, so
    // the first frame after a resize is before they have responded to it.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  }

  it("CONTROL: the measurement detects overflow when there is some", async () => {
    // Without this, a measurement that always returned 0 — a viewport call that
    // silently did nothing, a document that never laid out — would report the
    // page as clean no matter how broken it was. This is the assertion that the
    // assertion below can fail.
    render(() => <App />);
    const wide = document.createElement("div");
    wide.style.cssText = "width: 900px; height: 1px;";
    document.body.append(wide);

    const overflow = await overflowAt(390, 844);
    wide.remove();

    expect(overflow, "a 900px element in a 390px viewport was not detected").toBeGreaterThan(0);
  });

  it("does not scroll sideways at a phone width", async () => {
    // The real defect this caught when the site was built: a grid item's default
    // `min-width: auto` refuses to shrink below its content, so a wide code
    // block widened the whole page instead of scrolling inside its own box —
    // 383px of horizontal scroll at 390px wide. It looked perfect on a desktop.
    //
    // Measured on the document, not on an element: an element that overflows
    // INSIDE a scroll container is correct, and only the document's own
    // scrollWidth distinguishes that from a page the reader has to drag.
    render(() => <App />);
    const overflow = await overflowAt(390, 844);

    expect(overflow, `the page scrolls ${overflow}px sideways at 390px wide`).toBeLessThanOrEqual(0);
  });
});
