/**
 * Canvas axis ticks follow S001-P07 `--sp-color-axis` as *pixels*, not only as
 * a var() string on the recorded mark.
 *
 * Composed charts paint ticks on Canvas. A 1px stroke on an integer coordinate
 * anti-aliases to ~50% coverage: invisible on the dark axis token, washed grey
 * under light `prefers-contrast: more` next to the 11px black labels. SVG
 * follows the cascade live; the bitmap does not, so a theme/contrast change
 * must repaint.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { render } from "@solidjs/testing-library";
import { tokensToCss, THEME_ATTR } from "@silkplot/theme";
import { BarChart, ScatterChart } from "../src/index";
import type { LineMark } from "../src/canvas-marks";
import { marksOnCanvas, plotCanvases } from "./support";

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

function luminanceRgb(r: number, g: number, b: number): number {
  const chan = (s: number): number => {
    const x = s / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const la = luminanceRgb(a[0], a[1], a[2]);
  const lb = luminanceRgb(b[0], b[1], b[2]);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function parseHex(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [
    Number.parseInt(n.slice(0, 2), 16),
    Number.parseInt(n.slice(2, 4), 16),
    Number.parseInt(n.slice(4, 6), 16),
  ];
}

function compositeOver(
  fg: readonly [number, number, number, number],
  bg: readonly [number, number, number],
): [number, number, number] {
  const t = fg[3] / 255;
  return [
    fg[0] * t + bg[0] * (1 - t),
    fg[1] * t + bg[1] * (1 - t),
    fg[2] * t + bg[2] * (1 - t),
  ];
}

/** Oracle values: hardcoded so a palette move fails here rather than being followed. */
const DARK_AXIS = "#667085";
const DARK_SURFACE = "#14161a";
const LIGHT_HC_AXIS = "#000000";
const LIGHT_SURFACE = "#ffffff";
const LIGHT_AXIS = "#7d8aa1";

const CATS = [
  { label: "Mon", y: 12 },
  { label: "Tue", y: 19 },
  { label: "Wed", y: 8 },
];
const CLOUD = [
  { x: 1, y: 3 },
  { x: 4, y: 7 },
  { x: 2, y: 5 },
];

let styleEl: HTMLStyleElement;

beforeAll(() => {
  styleEl = document.createElement("style");
  styleEl.textContent = tokensToCss();
  document.head.appendChild(styleEl);
});

afterAll(async () => {
  styleEl.remove();
  document.documentElement.removeAttribute(THEME_ATTR);
  await session.send("Emulation.setEmulatedMedia", { features: [] });
});

afterEach(() => {
  document.documentElement.removeAttribute(THEME_ATTR);
});

function axisTicks(container: HTMLElement): LineMark[] {
  const canvas = plotCanvases(container)[0];
  expect(canvas, "expected a Canvas plot").toBeTruthy();
  return marksOnCanvas(canvas as HTMLCanvasElement).filter(
    (m): m is LineMark => m.kind === "line" && m.role === "axis-tick",
  );
}

function strongestTickPixel(
  canvas: HTMLCanvasElement,
  tick: LineMark,
): [number, number, number, number] {
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("expected a 2d context");
  const dpr = window.devicePixelRatio || 1;
  const originX = Number(canvas.getAttribute("data-silkplot-plot-origin-x"));
  const originY = Number(canvas.getAttribute("data-silkplot-plot-origin-y"));
  const x1 = (originX + Number(tick.x1)) * dpr;
  const x2 = (originX + Number(tick.x2)) * dpr;
  const y1 = (originY + Number(tick.y1)) * dpr;
  const y2 = (originY + Number(tick.y2)) * dpr;
  const left = Math.max(0, Math.floor(Math.min(x1, x2)) - 2);
  const top = Math.max(0, Math.floor(Math.min(y1, y2)) - 2);
  const right = Math.min(canvas.width - 1, Math.ceil(Math.max(x1, x2)) + 2);
  const bottom = Math.min(canvas.height - 1, Math.ceil(Math.max(y1, y2)) + 2);
  let best: [number, number, number, number] = [0, 0, 0, 0];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const p = ctx.getImageData(x, y, 1, 1).data;
      if (p[3] > best[3]) best = [p[0], p[1], p[2], p[3]];
    }
  }
  return best;
}

function assertTickVisible(
  container: HTMLElement,
  axisHex: string,
  surfaceHex: string,
): void {
  const canvas = plotCanvases(container)[0];
  expect(canvas, "expected a Canvas plot").toBeTruthy();
  const ticks = axisTicks(container);
  expect(ticks.length, "expected axis tick marks").toBeGreaterThan(0);
  for (const tick of ticks) {
    expect(tick.stroke).toBe("var(--sp-color-axis, currentColor)");
  }
  const used = getComputedStyle(canvas as HTMLCanvasElement)
    .getPropertyValue("--sp-color-axis")
    .trim()
    .toLowerCase();
  expect(used).toBe(axisHex);
  const axis = parseHex(axisHex);
  const surface = parseHex(surfaceHex);
  let seen = 0;
  for (const tick of ticks) {
    const px = strongestTickPixel(canvas as HTMLCanvasElement, tick);
    if (px[3] < 8) continue;
    seen += 1;
    expect(px[3], "tick hairline must be opaque, not a 50% smear").toBeGreaterThan(200);
    const visual = compositeOver(px, surface);
    expect(contrastRatio(visual, surface)).toBeGreaterThanOrEqual(3);
    const distAxis = Math.hypot(visual[0] - axis[0], visual[1] - axis[1], visual[2] - axis[2]);
    const distSurface = Math.hypot(
      visual[0] - surface[0],
      visual[1] - surface[1],
      visual[2] - surface[2],
    );
    expect(distAxis, "painted tick must match --sp-color-axis, not currentColor/black").toBeLessThan(
      50,
    );
    expect(distAxis).toBeLessThan(distSurface);
  }
  expect(seen, "expected at least one tick with painted pixels").toBeGreaterThan(0);
}

describe("Canvas axis ticks use --sp-color-axis pixels that stay visible", () => {
  it("dark: bar and scatter ticks paint the dark axis token, not a smear into the surface", async () => {
    await setMedia("dark", "no-preference");
    const charts = [
      () => <BarChart title="Net" data={CATS} width={400} height={260} />,
      () => <ScatterChart title="Cloud" data={CLOUD} width={400} height={260} />,
    ];
    for (const ui of charts) {
      const { container, unmount } = render(ui);
      assertTickVisible(container, DARK_AXIS, DARK_SURFACE);
      unmount();
    }
  });

  it("light + prefers-contrast more: ticks paint #000000, not washed grey", async () => {
    await setMedia("light", "more");
    const { container, unmount } = render(() => (
      <BarChart title="Net" data={CATS} width={400} height={260} />
    ));
    assertTickVisible(container, LIGHT_HC_AXIS, LIGHT_SURFACE);
    unmount();
  });

  it("repaints ticks when data-sp-theme moves the cascade", async () => {
    await setMedia("dark", "no-preference");
    const { container, unmount } = render(() => (
      <BarChart title="Net" data={CATS} width={400} height={260} />
    ));
    assertTickVisible(container, DARK_AXIS, DARK_SURFACE);
    document.documentElement.setAttribute(THEME_ATTR, "light");
    await expect
      .poll(() =>
        getComputedStyle(plotCanvases(container)[0] as HTMLCanvasElement)
          .getPropertyValue("--sp-color-axis")
          .trim()
          .toLowerCase(),
      )
      .toBe(LIGHT_AXIS);
    await expect
      .poll(() => {
        const canvas = plotCanvases(container)[0] as HTMLCanvasElement;
        const tick = axisTicks(container)[0];
        if (tick === undefined) return 255;
        return strongestTickPixel(canvas, tick)[0];
      })
      .toBeGreaterThan(100);
    assertTickVisible(container, LIGHT_AXIS, LIGHT_SURFACE);
    unmount();
  });
});
