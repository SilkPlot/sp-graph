/**
 * Shared SETUP for the chart suites — fixtures, DOM queries, and scale oracles.
 *
 * What belongs here is what every suite was writing identically and what no
 * single test is *about*: the canvas size, how to find a mark among the axis
 * elements, how to read points back out of a path `d`.
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
 * The chart's own `<path>` marks.
 *
 * Axis domain paths are `<path>` elements too; a chart's marks are the ones
 * without a `data-silkplot-axis` ancestor.
 */
export function markPaths(container: HTMLElement): SVGPathElement[] {
  return Array.from(container.querySelectorAll("svg > g > path")).filter(
    (p) => !p.closest("[data-silkplot-axis]"),
  ) as SVGPathElement[];
}

/** The `d` of the nth chart mark, or "" when there is none. */
export function markD(container: HTMLElement, index = 0): string {
  return markPaths(container)[index]?.getAttribute("d") ?? "";
}

export function circles(container: HTMLElement): SVGCircleElement[] {
  return Array.from(container.querySelectorAll("svg > g > circle")) as SVGCircleElement[];
}

export function bars(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect"));
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
}

/** Read a numeric attribute, failing loudly if it is absent or unparseable. */
export function num(el: Element, attr: string): number {
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
