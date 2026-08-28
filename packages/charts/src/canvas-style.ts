/**
 * Resolve CSS paint values for a Canvas 2D context.
 *
 * Canvas does not understand `currentColor` or `var(--sp-…)`. SVG did, which
 * is why the series contract writes those strings: the theme cascade is the
 * colour, not a computed hex. A Canvas plot has to resolve the same strings
 * against a live element so a themed chart and an unthemed one still agree
 * with the tokens the SVG axes beside them inherit.
 *
 * Resolution is a probe `<path>` appended to the host — `getComputedStyle`
 * on a Canvas element has no `stroke` / `stroke-dasharray` used-value. The
 * probe is removed before this function returns.
 */

export interface StyleResolver {
  color: (specified: string | undefined) => string;
  dash: (specified: string | undefined) => number[];
}

const NONE = "none";

/**
 * Parse a `stroke-dasharray` used-value into Canvas `setLineDash` numbers.
 *
 * `undefined` and `"none"` are the solid line. Commas, spaces, and the `px`
 * suffix a computed style may add are all accepted; a token that does not
 * yield a number is skipped rather than becoming `NaN` on the dash list.
 */
export function parseDash(specified: string | undefined): number[] {
  if (specified === undefined || specified === NONE || specified === "") return [];
  const out: number[] = [];
  for (const part of specified.split(/[\s,]+/)) {
    if (part === "") continue;
    const n = Number.parseFloat(part);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function readUsed(host: Element, specified: string, attr: "stroke" | "stroke-dasharray"): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(attr, specified);
  svg.appendChild(path);
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.overflow = "hidden";
  host.appendChild(svg);
  const used =
    attr === "stroke" ? getComputedStyle(path).stroke : getComputedStyle(path).strokeDasharray;
  svg.remove();
  return used;
}

function resolveColor(host: Element, specified: string | undefined): string {
  const raw = specified ?? "currentColor";
  if (raw === NONE) return "rgba(0, 0, 0, 0)";
  if (!host.isConnected) return raw === "currentColor" || raw.includes("var(") ? "#000000" : raw;
  return readUsed(host, raw, "stroke");
}

function resolveDash(host: Element, specified: string | undefined): number[] {
  if (specified === undefined || specified === NONE) return [];
  if (!host.isConnected) return parseDash(specified);
  return parseDash(readUsed(host, specified, "stroke-dasharray"));
}

/**
 * A resolver bound to one host element, with a per-paint cache so 22 series
 * sharing eight palette tokens do not each mount a probe.
 */
export function createStyleResolver(host: Element): StyleResolver {
  const colors = new Map<string, string>();
  const dashes = new Map<string, number[]>();
  return {
    color: (specified) => {
      const key = specified ?? "currentColor";
      const hit = colors.get(key);
      if (hit !== undefined) return hit;
      const resolved = resolveColor(host, specified);
      colors.set(key, resolved);
      return resolved;
    },
    dash: (specified) => {
      const key = specified ?? NONE;
      const hit = dashes.get(key);
      if (hit !== undefined) return hit;
      const resolved = resolveDash(host, specified);
      dashes.set(key, resolved);
      return resolved;
    },
  };
}
