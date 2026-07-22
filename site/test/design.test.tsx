/**
 * The redesign's load-bearing claims, each proven the way it could fail.
 *
 * The roadmap section derives from ROADMAP.md — so the test takes its
 * expectations FROM the file and asserts the rendering follows, which is what
 * makes deleting a section propagate. The markdown renderer supports a narrow
 * subset — so unsupported syntax must THROW, not render wrong. Glass is
 * presentation — so text on a glass panel must hold the contrast floor on
 * computed styles, in both schemes, with the translucent background
 * composited over the real surface rather than eyeballed. And the wordmark
 * replaced the h1's text — so the page keeping an h1 named "SilkPlot" is
 * asserted, not assumed.
 */
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import roadmapSource from "../../ROADMAP.md?raw";
import { ThemeSwitcher } from "../src/components/ThemeSwitcher";
import { installThemeStyles } from "../src/install-styles";
import { renderMarkdownSubset } from "../src/markdown";
import { Hero } from "../src/sections/Hero";
import { Roadmap } from "../src/sections/Roadmap";
import "../src/styles.css";

installThemeStyles();

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-sp-theme");
  localStorage.removeItem("sp-theme");
});

describe("the markdown subset renderer", () => {
  it("renders headings demoted, inline marks, and lists", () => {
    const html = renderMarkdownSubset(
      "## Shipped\n\nSome **bold** and `code` and a [link](https://example.com/x).\n\n- one\n- two",
      1,
    );
    expect(html).toContain("<h3>Shipped</h3>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com/x">link</a>');
    expect(html).toContain("<li>one</li><li>two</li>");
  });

  it("escapes markup instead of rendering it", () => {
    const html = renderMarkdownSubset("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("throws on syntax outside the subset rather than rendering it wrong", () => {
    expect(() => renderMarkdownSubset("| a | b |")).toThrow(/table/);
    expect(() => renderMarkdownSubset("> quoted")).toThrow(/blockquote/);
    expect(() => renderMarkdownSubset("```js\nx\n```")).toThrow(/fenced/);
  });

  it("accepts the whole of ROADMAP.md today", () => {
    // The guard above only protects the page if the real document passes the
    // renderer NOW — this is the assertion that goes red the day ROADMAP.md
    // gains a table.
    expect(() => renderMarkdownSubset(roadmapSource)).not.toThrow();
  });
});

describe("the roadmap section", () => {
  it("renders every section heading ROADMAP.md declares", () => {
    const headings = [...roadmapSource.matchAll(/^## (.+)$/gm)].map(
      (m) => m[1],
    );
    expect(headings.length).toBeGreaterThanOrEqual(4);
    const { container } = render(() => <Roadmap />);
    for (const heading of headings) {
      const found = [...container.querySelectorAll("h3")].some(
        (h) => h.textContent === heading,
      );
      expect(found, `"${heading}" from ROADMAP.md is not on the page`).toBe(
        true,
      );
    }
  });

  it("resolves every link to somewhere that exists on THIS host", () => {
    // ROADMAP.md's relative links are repository paths; rendered verbatim on
    // silkplot.com they 404. Every anchor must be absolute or a fragment.
    const { container } = render(() => <Roadmap />);
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors.length).toBeGreaterThan(3);
    for (const a of anchors) {
      const href = a.getAttribute("href") ?? "";
      expect(
        /^https?:\/\/|^#/.test(href),
        `relative link would 404 on the site: ${href}`,
      ).toBe(true);
    }
  });
});

/** Parse a computed `rgb()`/`rgba()` string. */
function parseColor(value: string): [number, number, number, number] {
  const m = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) throw new Error(`unparseable color: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

/** Composite a translucent foreground over an opaque background. */
function composite(
  fg: [number, number, number, number],
  bg: [number, number, number, number],
): [number, number, number] {
  const a = fg[3];
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

describe("the glass material", () => {
  for (const scheme of ["light", "dark"] as const) {
    it(`holds the text contrast floor on a glass panel (${scheme})`, () => {
      document.documentElement.setAttribute("data-sp-theme", scheme);
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.textContent = "measurable";
      document.body.appendChild(panel);
      try {
        const styles = getComputedStyle(panel);
        const surface = parseColor(
          getComputedStyle(document.body).backgroundColor,
        );
        const effective = composite(
          parseColor(styles.backgroundColor),
          [surface[0], surface[1], surface[2], 1],
        );
        const text = parseColor(styles.color);
        const ratio = contrastRatio(
          [text[0], text[1], text[2]],
          effective,
        );
        expect(
          ratio,
          `glass text contrast ${ratio.toFixed(2)}:1 under ${scheme}`,
        ).toBeGreaterThanOrEqual(4.5);
      } finally {
        panel.remove();
      }
    });
  }
});

describe("the scheme switcher", () => {
  it("sets and clears the theme attribute the theme package defines", async () => {
    const { getByRole } = render(() => <ThemeSwitcher />);
    getByRole("button", { name: "Dark" }).click();
    expect(document.documentElement.getAttribute("data-sp-theme")).toBe(
      "dark",
    );
    expect(localStorage.getItem("sp-theme")).toBe("dark");
    getByRole("button", { name: "System" }).click();
    expect(document.documentElement.getAttribute("data-sp-theme")).toBeNull();
    expect(localStorage.getItem("sp-theme")).toBeNull();
  });
});

describe("the hero", () => {
  it("keeps the page's h1, named SilkPlot, with the wordmark inside it", () => {
    const { getByRole } = render(() => <Hero />);
    const h1 = getByRole("heading", { level: 1, name: "SilkPlot" });
    expect(h1.querySelector("img")).not.toBeNull();
  });

  it("states the under-construction facts, specifically", () => {
    const { container } = render(() => <Hero />);
    const text = container.textContent ?? "";
    expect(text).toContain("No assistive technology has been verified");
    expect(text).toContain("0.3.0-next");
    expect(text).toContain("No performance number is claimed");
  });
});
