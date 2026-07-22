/**
 * The identity's type pipeline, proven rather than assumed.
 *
 * The design language supersedes a recorded "no web fonts" stance on one
 * condition: first paint must never wait on a font. That condition decomposes
 * into checkable facts — every face declares `font-display: swap`, the
 * preloads in the HTML name exactly the files the stylesheet declares, the
 * self-hosted files actually load and parse in a real browser, and the stacks
 * land on the elements they were chosen for. Each is asserted here; a
 * renamed file, a dropped preload, or a face that silently fails to parse
 * goes red instead of quietly falling back to system type forever.
 */
import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import geistUrl from "../public/fonts/geist-latin.woff2?url";
import monoUrl from "../public/fonts/geist-mono-latin.woff2?url";
import spaceUrl from "../public/fonts/space-grotesk-latin.woff2?url";
import css from "../src/styles.css?raw";
import { installThemeStyles } from "../src/install-styles";
import "../src/styles.css";

installThemeStyles();

const FILES = [
  "space-grotesk-latin.woff2",
  "geist-latin.woff2",
  "geist-mono-latin.woff2",
];

describe("the identity type pipeline", () => {
  it("declares all three faces with swap, so text paints before fonts", () => {
    // Declarations only (`swap;`) — the explanatory comment also says
    // "font-display: swap" in prose and must not satisfy this count.
    expect(css.match(/font-display:\s*swap\s*;/g)?.length).toBe(3);
    for (const face of ["Space Grotesk", "Geist", "Geist Mono"]) {
      expect(css, `${face} is not declared`).toContain(face);
    }
  });

  it("preloads exactly the files the stylesheet declares", () => {
    for (const file of FILES) {
      expect(css, `${file} not referenced by @font-face`).toContain(
        `/fonts/${file}`,
      );
      expect(html, `${file} not preloaded`).toContain(
        `rel="preload" href="/fonts/${file}" as="font"`,
      );
    }
  });

  it("ships the favicon, touch icon, and social card in the head", () => {
    expect(html).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"');
    expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(html).toContain('property="og:image" content="https://silkplot.com/og.png"');
  });

  it("loads and parses the committed files in a real browser", async () => {
    // The committed woff2 files themselves, imported through the bundler so
    // this holds wherever the test server is rooted. A corrupt or truncated
    // file fails FontFace.load(); a missing one fails the import.
    const probes = [
      new FontFace("SpaceGroteskProbe", `url(${spaceUrl})`),
      new FontFace("GeistProbe", `url(${geistUrl})`),
      new FontFace("GeistMonoProbe", `url(${monoUrl})`),
    ];
    const loaded = await Promise.all(probes.map((f) => f.load()));
    for (const face of loaded) {
      expect(face.status, `${face.family} did not parse`).toBe("loaded");
    }
  });

  it("applies the stacks where they belong: display to headings, body to body, mono to code", () => {
    const heading = document.createElement("h2");
    const code = document.createElement("code");
    document.body.append(heading, code);
    try {
      expect(getComputedStyle(document.body).fontFamily).toContain("Geist");
      expect(getComputedStyle(heading).fontFamily).toContain("Space Grotesk");
      expect(getComputedStyle(code).fontFamily).toContain("Geist Mono");
    } finally {
      heading.remove();
      code.remove();
    }
  });
});
