/**
 * Visible focus and non-colour encoding, proven on COMPUTED styles in a real
 * browser, on the elements that actually removed their own outline.
 *
 * The dark high-contrast cascade defect hid because node tests checked that a
 * CSS block existed
 * and never which declaration won the cascade. A focus ring is worse in that
 * respect: it is a computed style resolved under a `:focus-visible` pseudo-class
 * AND a media query AND a custom-property cascade, so a "the rule is in the
 * sheet" assertion proves nothing about whether a keyboard user ever sees it.
 * Everything below therefore reads `getComputedStyle` on a genuinely focused
 * element, reached by a real Tab press rather than `el.focus()` — Chromium only
 * matches `:focus-visible` when the focus came from the keyboard, so a
 * programmatic focus would silently test the wrong pseudo-class.
 *
 * Two anti-vacuity controls run alongside the real assertions, because a browser
 * that crashes and a browser that renders an invisible ring produce the same
 * empty output:
 *
 *   - `an unclassed focusable has NO ring` — proves the ring assertions can tell
 *     the presence of an indicator from its absence, rather than passing on any
 *     element at all;
 *   - `the contrast helper rejects a known-failing colour` — proves the 3:1
 *     assertion can fail, using the measured 2.02:1 value the dark
 *     high-contrast cascade defect actually produced.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { cdp, userEvent } from "@vitest/browser/context";
import { tokensToCss, FOCUS_CLASS, THEME_ATTR } from "@silkplot/theme";
import { App } from "../src/App";

// CDPSession is typed as an empty interface by vitest; `send` is all we need.
interface CdpLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}
const session = cdp() as unknown as CdpLike;

type Scheme = "light" | "dark";
type Contrast = "no-preference" | "more";
type Motion = "no-preference" | "reduce";

async function setMedia(
  scheme: Scheme,
  contrast: Contrast,
  motion: Motion = "no-preference",
): Promise<void> {
  await session.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: scheme },
      { name: "prefers-contrast", value: contrast },
      { name: "prefers-reduced-motion", value: motion },
    ],
  });
}

/** WCAG relative luminance from sRGB channel bytes. */
function luminance(r: number, g: number, b: number): number {
  const chan = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** Parse `rgb(r, g, b)` / `rgba(...)` / `#rrggbb` into channel bytes. */
function parseColor(value: string): [number, number, number] {
  const v = value.trim();
  const rgb = v.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return [1, 2, 3].map((i) => Number.parseInt(hex[i]!, 16)) as [number, number, number];
  throw new Error(`unparseable colour: ${value}`);
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(...parseColor(a));
  const lb = luminance(...parseColor(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The resolved value of a token custom property at the document root. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface Ring {
  style: string;
  width: number;
  color: string;
}

function ringOf(el: Element): Ring {
  const s = getComputedStyle(el);
  return {
    style: s.outlineStyle,
    width: Number.parseFloat(s.outlineWidth) || 0,
    color: s.outlineColor,
  };
}

/** Tab until `el` is the active element, or fail loudly. */
async function tabTo(el: HTMLElement): Promise<void> {
  for (let i = 0; i < 25; i++) {
    if (document.activeElement === el) return;
    await userEvent.tab();
  }
  throw new Error(`could not reach ${el.tagName}.${el.className} by tabbing`);
}

let sheet: HTMLStyleElement;

beforeAll(() => {
  // main.tsx injects this at runtime; tests render <App /> directly, so the
  // stylesheet under test has to be installed the same way here.
  sheet = document.createElement("style");
  sheet.textContent = tokensToCss();
  document.head.appendChild(sheet);
});

afterAll(async () => {
  sheet.remove();
  await setMedia("light", "no-preference");
  document.documentElement.removeAttribute(THEME_ATTR);
});

afterEach(() => {
  document.documentElement.removeAttribute(THEME_ATTR);
});

/**
 * The reference composition's keyboard/pointer surface — the element that had G1.
 *
 * It used to be located by `role="application"`. That role is gone: ADR-0005 §3
 * rejects it as a default, and the surface is now a `listbox` composite. The
 * `data-` attribute is the stable handle, and the focus-class assertion is kept
 * because the visible-focus contract is what this file exists to hold.
 */
function captureSurface(container: HTMLElement): HTMLElement {
  // Selected by its own label: composed charts now ship the same composite, so
  // the playground has more than one of these and the first in the DOM is
  // LineChart's, not the reference composition's.
  const el = container.querySelector<HTMLElement>(
    `[data-silkplot-keyboard-surface].${FOCUS_CLASS}[aria-label^="Sample daily series."]`,
  );
  if (!el) throw new Error("capture surface not found");
  expect(el.getAttribute("role")).not.toBe("application");
  return el;
}

describe("G1 — the reference interaction surface has a visible focus indicator", () => {
  // [name, scheme, contrast, explicit data-sp-theme attribute or null]
  const matrix: Array<[string, Scheme, Contrast, Scheme | null]> = [
    ["light", "light", "no-preference", null],
    ["dark (OS)", "dark", "no-preference", null],
    ["light high-contrast", "light", "more", null],
    ["dark high-contrast (OS)", "dark", "more", null],
    ["explicit dark under a light OS", "light", "no-preference", "dark"],
    ["explicit light under a dark OS", "dark", "no-preference", "light"],
    ["explicit dark + high contrast", "light", "more", "dark"],
    ["explicit light + high contrast", "dark", "more", "light"],
  ];

  for (const [name, scheme, contrast, forced] of matrix) {
    it(`${name}: draws a ring that clears 3:1 against the resolved surface`, async () => {
      await setMedia(scheme, contrast);
      if (forced) document.documentElement.setAttribute(THEME_ATTR, forced);

      const { container } = render(() => <App />);
      const surface = captureSurface(container);
      await tabTo(surface);

      const ring = ringOf(surface);
      const surfaceColor = token("--sp-color-surface");

      // The defect was the absence of all three of these at once.
      expect(ring.style, `${name}: outline-style`).not.toBe("none");
      expect(ring.width, `${name}: outline-width`).toBeGreaterThanOrEqual(2);

      const ratio = contrastRatio(ring.color, surfaceColor);
      expect(
        ratio,
        `${name}: ring ${ring.color} on surface ${surfaceColor} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);

      // Pin the SOURCE of the colour, not only its ratio. `currentColor` — what
      // an unresolved `var()` falls back to — is the text colour, which clears
      // 3:1 on every surface by construction. A ratio-only assertion therefore
      // passes while the focus token is doing nothing, which is how the eased
      // `outline-color` defect initially hid here.
      expect(
        parseColor(ring.color),
        `${name}: ring is not --sp-color-focus-ring (${token("--sp-color-focus-ring")})`,
      ).toEqual(parseColor(token("--sp-color-focus-ring")));
    });
  }

  it("draws the ring in the focus-ring TOKEN, not an inherited or default colour", async () => {
    await setMedia("dark", "more");
    const { container } = render(() => <App />);
    const surface = captureSurface(container);
    await tabTo(surface);

    // #4d8dff is the dark-high-contrast focus ring. A ring painted from
    // `currentColor` or the UA default would still be "visible" and would still
    // pass a bare outline-style check, while ignoring the token contract.
    expect(contrastRatio(ringOf(surface).color, "#14161a")).toBeCloseTo(5.67, 1);
    expect(parseColor(ringOf(surface).color)).toEqual(parseColor("#4d8dff"));
  });

  it("separates the ring from the content with a surface-coloured halo", async () => {
    // outline-offset alone leaves the ring sitting on gridlines and series
    // strokes, against which no ratio is guaranteed. The halo is what makes the
    // measured surface ratio the ratio a user actually experiences.
    await setMedia("light", "no-preference");
    const { container } = render(() => <App />);
    const surface = captureSurface(container);
    await tabTo(surface);

    const s = getComputedStyle(surface);
    expect(Number.parseFloat(s.outlineOffset)).toBeGreaterThan(0);
    expect(s.boxShadow).not.toBe("none");
    expect(contrastRatio(s.boxShadow, token("--sp-color-surface"))).toBeCloseTo(1, 1);
  });

  it("CONTROL: a probe reproducing G1 is invisible, so the assertions can fail", async () => {
    // The exact shape of the defect this phase closes: `outline: none` with no
    // `:focus-visible` replacement. If this probe passed the assertions above,
    // those assertions would be proving nothing.
    await setMedia("light", "no-preference");
    const probe = document.createElement("div");
    probe.tabIndex = 0;
    probe.style.outline = "none";
    document.body.appendChild(probe);
    try {
      await tabTo(probe);
      expect(ringOf(probe).style).toBe("none");
    } finally {
      probe.remove();
    }
  });

  it("CONTROL: the ring measured is ours, not the user-agent default", async () => {
    // Chromium draws `auto 1px` on any focused tabbable element. Without this
    // control, every ring assertion above could be passing on the UA outline
    // while the token treatment was absent entirely.
    await setMedia("light", "no-preference");
    const probe = document.createElement("div");
    probe.tabIndex = 0;
    document.body.appendChild(probe);
    try {
      await tabTo(probe);
      const ua = ringOf(probe);
      expect(ua.style).toBe("auto");
      expect(ua.width).toBeLessThan(2);
    } finally {
      probe.remove();
    }

    const { container } = render(() => <App />);
    const surface = captureSurface(container);
    await tabTo(surface);
    const ours = ringOf(surface);
    expect(ours.style).toBe("solid");
    expect(ours.width).toBeGreaterThanOrEqual(3);
  });

  it("CONTROL: the 3:1 assertion can fail — the pre-fix ring measured 2.02:1", () => {
    expect(contrastRatio("#0033cc", "#14161a")).toBeCloseTo(2.02, 1);
    expect(contrastRatio("#0033cc", "#14161a")).toBeLessThan(3);
  });
});

describe("the focus treatment and the motion preference", () => {
  for (const motion of ["no-preference", "reduce"] as Motion[]) {
    it(`is instant and identical under prefers-reduced-motion: ${motion}`, async () => {
      // The indicator does not animate at all, so there is nothing for the
      // motion preference to change — which is the strongest form of honouring
      // it. This also pins the defect that removing the transition fixed: an
      // eased `outline-color` starts at `currentColor`, so the ring is the TEXT
      // colour for the first frames and a read here returns the wrong token.
      await setMedia("dark", "more", motion);
      const { container } = render(() => <App />);
      const surface = captureSurface(container);
      await tabTo(surface);

      expect(getComputedStyle(surface).transitionDuration).toBe("0s");
      // Read immediately after focus: the ring must ALREADY be the token colour.
      expect(parseColor(ringOf(surface).color)).toEqual(parseColor("#4d8dff"));
    });
  }

  it("collapses the motion tokens themselves under reduced motion", async () => {
    // The token half of the contract, on computed values rather than on the
    // emitted string the node tests read.
    await setMedia("light", "no-preference", "reduce");
    render(() => <App />);
    expect(token("--sp-motion-fast")).toBe("0ms");
    expect(token("--sp-motion-slow")).toBe("0ms");
  });

  it("leaves the motion tokens alone when the user has not asked for less", async () => {
    await setMedia("light", "no-preference", "no-preference");
    render(() => <App />);
    expect(token("--sp-motion-fast")).not.toBe("0ms");
  });
});

describe("every focusable control in the playground is visibly focusable", () => {
  it("gives each theme button a ring clearing 3:1", async () => {
    await setMedia("light", "no-preference");
    const { container } = render(() => <App />);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.length).toBeGreaterThan(0);

    for (const b of buttons) {
      await tabTo(b);
      const ring = ringOf(b);
      expect(ring.style, `${b.textContent}: outline-style`).not.toBe("none");
      expect(contrastRatio(ring.color, token("--sp-color-surface"))).toBeGreaterThanOrEqual(3);
    }
  });

  it("marks the selected theme by more than colour", async () => {
    await setMedia("light", "no-preference");
    const { container } = render(() => <App />);
    const pressed = container.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    expect(pressed, "no button reports aria-pressed").not.toBeNull();
    // A "✓" in the label and a heavier border — both readable without colour.
    expect(pressed!.textContent).toContain("✓");
    const others = [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed="false"]')];
    expect(others.length).toBeGreaterThan(0);
    expect(Number.parseFloat(getComputedStyle(pressed!).borderTopWidth)).toBeGreaterThan(
      Number.parseFloat(getComputedStyle(others[0]!).borderTopWidth),
    );
  });

  it("leaves no unguarded outline suppression on any focusable element", async () => {
    // The G1 shape of defect, generalised: any focusable that resolves to
    // outline-style: none while focus-visible is the same bug under a new name.
    await setMedia("light", "no-preference");
    const { container } = render(() => <App />);
    const focusables = [
      ...container.querySelectorAll<HTMLElement>('button, [tabindex="0"]'),
    ];
    expect(focusables.length).toBeGreaterThan(1);
    for (const el of focusables) {
      await tabTo(el);
      expect(ringOf(el).style, `${el.tagName} suppresses its outline`).not.toBe("none");
    }
  });
});

describe("G6 — series are not distinguished by colour alone", () => {
  /** The multi-series SVG, located by its accessible title. */
  function multiSeries(container: HTMLElement): SVGElement {
    const title = [...container.querySelectorAll("title")].find((t) =>
      t.textContent?.includes("Bookings, cancellations and walk-ins"),
    );
    if (!title?.parentElement) throw new Error("multi-series chart not found");
    return title.parentElement as unknown as SVGElement;
  }

  /** One <g> per series, in render order. */
  function seriesGroups(svg: SVGElement): SVGGElement[] {
    return [...svg.querySelectorAll<SVGGElement>("g")].filter((g) =>
      g.querySelector(":scope > path[stroke-dasharray]"),
    );
  }

  it("renders every series with a distinct stroke dash pattern", async () => {
    await setMedia("light", "no-preference");
    const { container } = render(() => <App />);
    const groups = seriesGroups(multiSeries(container));
    expect(groups.length).toBeGreaterThanOrEqual(3);

    const dashes = groups.map(
      (g) => getComputedStyle(g.querySelector("path[stroke-dasharray]")!).strokeDasharray,
    );
    // Computed, not the attribute: a `var()` that failed to resolve would come
    // back as "none" for every series and read as "all solid, all identical".
    expect(new Set(dashes).size, `dash patterns were ${JSON.stringify(dashes)}`).toBe(
      groups.length,
    );
  });

  it("renders every series with a distinct marker shape", async () => {
    await setMedia("light", "no-preference");
    const { container } = render(() => <App />);
    const groups = seriesGroups(multiSeries(container));

    // Normalise away position so shapes are compared as shapes: take the marker
    // path's command letters, which differ per shape and not per datum.
    const shapes = groups.map((g) => {
      const marker = [...g.querySelectorAll("path")].at(1);
      return (marker?.getAttribute("d") ?? "").replace(/[-\d.,]/g, "");
    });
    expect(new Set(shapes).size, `marker shapes were ${JSON.stringify(shapes)}`).toBe(
      groups.length,
    );
  });

  it("direct-labels every series on the plot, so no legend lookup is required", async () => {
    await setMedia("light", "no-preference");
    const { container } = render(() => <App />);
    const labels = [...multiSeries(container).querySelectorAll("text")].map((t) =>
      t.textContent?.trim(),
    );
    for (const name of ["Bookings", "Cancellations", "Walk-ins"]) {
      expect(labels, `${name} is not direct-labelled`).toContain(name);
    }
  });

  it("resolves every series stroke to a colour clearing 3:1 on the surface", async () => {
    for (const [scheme, contrast] of [
      ["light", "no-preference"],
      ["dark", "no-preference"],
      ["light", "more"],
      ["dark", "more"],
    ] as Array<[Scheme, Contrast]>) {
      await setMedia(scheme, contrast);
      const { container, unmount } = render(() => <App />);
      try {
        const groups = seriesGroups(multiSeries(container));
        const surfaceColor = token("--sp-color-surface");
        for (const g of groups) {
          const stroke = getComputedStyle(g.querySelector("path[stroke-dasharray]")!).stroke;
          const ratio = contrastRatio(stroke, surfaceColor);
          expect(
            ratio,
            `${scheme}/${contrast}: series stroke ${stroke} on ${surfaceColor} is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(3);
        }
      } finally {
        unmount();
      }
    }
  });

  it("no longer paints series data in the focus-ring colour", async () => {
    // The interaction reference used to stroke its line with
    // `--sp-color-focus-ring`, which made the focus indicator and the data the
    // same colour — an indicator indistinguishable from what it indicates.
    await setMedia("light", "no-preference");
    const { container } = render(() => <App />);
    const focusRing = token("--sp-color-focus-ring");
    const strokes = [...container.querySelectorAll<SVGPathElement>("path[stroke]")]
      .map((p) => getComputedStyle(p).stroke)
      .filter((s) => s && s !== "none");
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      expect(contrastRatio(s, focusRing), `a series stroke is the focus colour`).not.toBeCloseTo(
        1,
        2,
      );
    }
  });
});
