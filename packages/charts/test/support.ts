/**
 * Shared SETUP for the chart suites — fixtures, DOM queries, and scale oracles.
 *
 * What belongs here is what every suite was writing identically and what no
 * single test is *about*: the canvas size, how to find a mark among the axis
 * elements, how to read points back out of a path `d`.
 *
 * Cartesian marks paint on Canvas. Geometry assertions read the descriptors
 * recorded on that surface (`canvas-marks.ts`), presented as attribute nodes
 * so a test that used to call `getAttribute("d")` still names the same
 * properties. Axis ticks, titles, and overlay SVG are still in the DOM.
 *
 * What deliberately does NOT belong here is any test's assertions. A helper that
 * absorbs the checks is how a suite gets quietly weaker — twelve real
 * expectations become one, every test starts failing for the same reason, and
 * the run still reports green. Each test keeps its own `expect` calls so it
 * still fails for its own reason.
 *
 * ── On `expectedYScale` ─────────────────────────────────────────────────────
 *
 * The y-domain policy is reimplemented here rather than imported from
 * `applyYDomainPolicy`. That is the whole point of it: a test that asked the
 * source what the source should do would pass against any change to the source,
 * including collapsing Area's `zero-baseline` into Line's `zero-floor`. The
 * duplication is the oracle. Each suite names the policy its chart is supposed
 * to hold, and the names are not interchangeable — an all-negative series is
 * exactly where two of them part company.
 */
import { expect } from "vitest";
import { linearScale, timeScale } from "@silkplot/core";
import {
  canvasMarksOf,
  canvasPlotsOf,
  type CanvasMark,
  type CircleMark,
  type PathMark,
  type RectMark,
} from "../src/canvas-marks";

export const WIDTH = 400;
export const HEIGHT = 300;

/**
 * `DEFAULT_MARGINS`, written out rather than imported, for the same reason the
 * y-policy is: an expectation that reads its answer from the code under test
 * cannot contradict it.
 */
export const MARGINS = { top: 8, right: 12, bottom: 24, left: 40 } as const;

/** Zeroed margins, so a plot's pixel space is the full canvas and the maths is readable. */
export const NO_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 } as const;

export const INNER_WIDTH = WIDTH - MARGINS.left - MARGINS.right;
export const INNER_HEIGHT = HEIGHT - MARGINS.top - MARGINS.bottom;

/**
 * The named graphic (`role="img"`), excluding the plot overlay SVG that sits
 * above the Canvas. Counting every `<svg>` would double once overlays exist.
 */
export function chartSvgs(container: ParentNode): SVGSVGElement[] {
  return Array.from(container.querySelectorAll("svg")).filter(
    (el) => !el.hasAttribute("data-silkplot-plot-overlay"),
  ) as SVGSVGElement[];
}

/** The Canvas plot(s) cartesian marks paint onto. */
export function plotCanvases(container: ParentNode): HTMLCanvasElement[] {
  return canvasPlotsOf(container);
}

/**
 * An attribute-shaped view of a Canvas mark, so existing `getAttribute`
 * assertions keep naming `d`, `stroke`, `cx`, and so on.
 */
export interface MarkNode {
  tagName: string;
  getAttribute(name: string): string | null;
}

function markAttr(mark: CanvasMark, name: string): string | null {
  switch (mark.kind) {
    case "path":
      if (name === "d") return mark.d;
      if (name === "fill") return mark.fill;
      if (name === "stroke") return mark.stroke;
      if (name === "stroke-width") return mark.strokeWidth;
      if (name === "stroke-dasharray") return mark.dash ?? null;
      if (name === "fill-opacity") return mark.fillOpacity ?? null;
      return null;
    case "circle":
      if (name === "cx") return mark.cx;
      if (name === "cy") return mark.cy;
      if (name === "r") return mark.r;
      if (name === "fill") return mark.fill;
      if (name === "fill-opacity") return mark.fillOpacity;
      return null;
    case "rect":
      if (name === "x") return mark.x;
      if (name === "y") return mark.y;
      if (name === "width") return mark.width;
      if (name === "height") return mark.height;
      if (name === "fill") return mark.fill;
      if (name === "stroke") return mark.stroke;
      if (name === "stroke-width") return mark.strokeWidth;
      return null;
  }
}

function asNode(mark: CanvasMark): MarkNode {
  return {
    tagName: mark.kind.toUpperCase(),
    getAttribute: (name) => markAttr(mark, name),
  };
}

/**
 * The chart's own path marks, from the Canvas surface.
 *
 * Axis domain paths are still SVG `<path>` elements; they are not here.
 */
export function markPaths(container: HTMLElement): MarkNode[] {
  return canvasMarksOf(container)
    .filter((m): m is PathMark => m.kind === "path")
    .map(asNode);
}

/** The `d` of the nth chart mark, or "" when there is none. */
export function markD(container: HTMLElement, index = 0): string {
  return markPaths(container)[index]?.getAttribute("d") ?? "";
}

export function circles(container: HTMLElement): MarkNode[] {
  return canvasMarksOf(container)
    .filter((m): m is CircleMark => m.kind === "circle")
    .map(asNode);
}

export function bars(container: HTMLElement): MarkNode[] {
  return canvasMarksOf(container)
    .filter((m): m is RectMark => m.kind === "rect")
    .map(asNode);
}

/** The text of every label on one axis, in document order. */
export function axisLabels(container: HTMLElement, side: "left" | "bottom"): (string | null)[] {
  const axis = container.querySelector(`g[data-silkplot-axis="${side}"]`);
  return Array.from(axis?.querySelectorAll("text") ?? []).map((t) => t.textContent);
}

/** The tick groups on one axis — one `<g>` per tick. */
export function axisTicks(container: HTMLElement, side: "left" | "bottom"): Element[] {
  const axis = container.querySelector(`g[data-silkplot-axis="${side}"]`);
  return Array.from(axis?.querySelectorAll(":scope > g") ?? []);
}

const POINT = /[ML](-?[\d.]+),(-?[\d.]+)/g;

/**
 * Y coordinates of every M/L point in a path `d`, in order.
 *
 * Only valid for `curve="linear"` output. `d3-shape`'s default `monotoneX`
 * emits cubic bezier `C` segments whose control points are NOT data positions,
 * so a test parsing points must pass `curve="linear"` or it reads the curve's
 * scaffolding as if it were the series.
 */
export function pathYs(d: string): number[] {
  return Array.from(d.matchAll(POINT)).map((m) => Number(m[2]));
}

/** X coordinates of every M/L point in a path `d`, in order. Linear curve only. */
export function pathXs(d: string): number[] {
  return Array.from(d.matchAll(POINT)).map((m) => Number(m[1]));
}

/**
 * Path vertices whose x sits inside the plot `[0, plotWidth]`.
 *
 * A narrowed viewport paints one neighbour past each edge so a segment can
 * enter or leave; those vertices sit strictly outside and are excluded here.
 * Suites that ask "how many points are in the window" read this, not `pathXs`.
 */
export function pathXsOnPlot(d: string, plotWidth: number): number[] {
  return pathXs(d).filter((x) => x >= 0 && x <= plotWidth);
}

/** Count of subpath moves — one per contiguous region, so `> 1` means a gap. */
export function moveCount(d: string): number {
  return (d.match(/M/g) ?? []).length;
}

/**
 * Sweep every matching element for a `NaN` in the named geometry attributes.
 *
 * This is one uniform check, not a stand-in for a test's own expectations. A
 * `NaN` in a `d` makes the browser abandon the path at the bad segment and a
 * `NaN` in a rect attribute renders nothing at all — both fail silently, which
 * is why the sweep is broad. Every caller pairs it with the assertions that say
 * what the chart should have drawn INSTEAD.
 */
export function expectNoNaN(
  container: HTMLElement,
  selector: string,
  attrs: readonly string[],
): void {
  for (const el of Array.from(container.querySelectorAll(selector))) {
    for (const attr of attrs) {
      const value = el.getAttribute(attr);
      if (value !== null) {
        expect(value, `<${el.tagName} ${attr}> contains NaN`).not.toContain("NaN");
      }
    }
  }
  for (const mark of canvasMarksOf(container)) {
    for (const attr of attrs) {
      const value = markAttr(mark, attr);
      if (value !== null) {
        expect(value, `canvas ${mark.kind} ${attr} contains NaN`).not.toContain("NaN");
      }
    }
  }
}

/** Read a numeric attribute, failing loudly if it is absent or unparseable. */
export function num(
  el: { tagName: string; getAttribute: (name: string) => string | null },
  attr: string,
): number {
  const raw = el.getAttribute(attr);
  expect(raw, `expected <${el.tagName}> to have a numeric "${attr}" attribute`).not.toBeNull();
  const value = Number(raw);
  expect(Number.isNaN(value), `"${attr}"="${raw}" parsed as NaN`).toBe(false);
  return value;
}

/**
 * How a chart's y-domain treats zero. Named per chart at every call site, never
 * defaulted here — picking one for the caller is precisely the mistake these
 * tests exist to catch.
 */
export type YPolicy = "extent" | "zero-floor" | "zero-baseline";

/** Apply a policy to a raw extent. Reimplemented, not imported — see the file header. */
export function applyPolicy(lo: number, hi: number, policy: YPolicy): [number, number] {
  if (policy === "extent") return [lo, hi];
  if (policy === "zero-floor") return [Math.min(0, lo), hi];
  return [Math.min(0, lo), Math.max(0, hi)];
}

/**
 * Rebuild the y scale a chart under `policy` should have composed.
 *
 * `innerHeight` is explicit because suites vary it: `NO_MARGINS` renders make it
 * the full canvas height, default-margin renders make it `INNER_HEIGHT`.
 */
export function expectedYScale(
  values: readonly number[],
  policy: YPolicy,
  innerHeight: number,
): ReturnType<typeof linearScale> {
  const lo = values.length === 0 ? 0 : Math.min(...values);
  const hi = values.length === 0 ? 0 : Math.max(...values);
  return linearScale({ domain: applyPolicy(lo, hi, policy), range: [innerHeight, 0] });
}

/** Rebuild the x scale a linear-x chart should have composed, from the data's own extent. */
export function expectedLinearXScale(
  values: readonly number[],
  innerWidth: number,
): ReturnType<typeof linearScale> {
  return linearScale({
    domain: [Math.min(...values), Math.max(...values)],
    range: [0, innerWidth],
  });
}

/** Rebuild the x scale a time-series chart should have composed, over the data's extent. */
export function expectedTimeXScale(
  times: readonly Date[],
  innerWidth: number,
): ReturnType<typeof timeScale> {
  const ms = times.map((t) => t.getTime());
  return timeScale({
    domain: [new Date(Math.min(...ms)), new Date(Math.max(...ms))],
    range: [0, innerWidth],
  });
}
