/**
 * Resolve CSS paint values for a Canvas 2D context.
 *
 * Canvas does not understand `currentColor` or `var(--sp-…)`. The series
 * contract writes those strings so the theme cascade is the colour, not a
 * computed hex. A Canvas plot resolves the same strings against a live host
 * (`color` for paint, custom properties for dash) so a themed chart and an
 * unthemed one still agree with the tokens the rest of the page inherits.
 *
 * No SVG is mounted. `getComputedStyle` on the host's `color` is the used
 * paint; a dash token is the custom property the `var()` names, or its
 * fallback. A font size still needs a short-lived HTML span — Canvas has no
 * `font-size` used-value either — and that span is not an SVG element.
 */

export interface StyleResolver {
  color: (specified: string | undefined) => string;
  dash: (specified: string | undefined) => number[];
  /** Canvas `font` shorthand for a CSS size (token or px). */
  font: (size: string) => string;
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

function resolveColor(host: Element, specified: string | undefined): string {
  const raw = specified ?? "currentColor";
  if (raw === NONE) return "rgba(0, 0, 0, 0)";
  if (!host.isConnected || !(host instanceof HTMLElement)) {
    return raw === "currentColor" || raw.includes("var(") ? "#000000" : raw;
  }
  // `currentColor` is already the host's used colour. Assigning it would
  // replace a set `style.color` with the parent's colour instead.
  if (raw === "currentColor") return getComputedStyle(host).color;
  // Token paint is a custom property. Read it — do not assign `style.color`
  // and force a reflow. Live brush chrome restrokes every frame; a style
  // mutation per token was a layout tax on a path that does not change colour.
  if (raw.includes("var(")) {
    const name = raw.match(/--[a-z0-9-]+/i);
    if (name !== null) {
      const used = getComputedStyle(host).getPropertyValue(name[0]).trim();
      if (used !== "" && used !== NONE) return used;
    }
    const fallback = raw.match(/var\([^,]+,\s*([^)]+)\)/);
    const fb = fallback?.[1]?.trim();
    if (fb === "currentColor") return getComputedStyle(host).color;
    if (fb !== undefined && fb !== "" && fb !== NONE) return fb;
  }
  const previous = host.style.color;
  host.style.color = raw;
  const used = getComputedStyle(host).color;
  host.style.color = previous;
  return used;
}

function resolveDash(host: Element, specified: string | undefined): number[] {
  if (specified === undefined || specified === NONE || specified === "") return [];
  // A `var(--token, 6 3)` string contains numbers. Parsing it first would take
  // the fallback and skip the custom property that is the actual dash.
  if (!specified.includes("var(")) return parseDash(specified);
  if (host.isConnected) {
    const name = specified.match(/--[a-z0-9-]+/i);
    if (name !== null) {
      const used = getComputedStyle(host).getPropertyValue(name[0]).trim();
      if (used !== "" && used !== NONE) return parseDash(used);
    }
  }
  const fallback = specified.match(/var\([^,]+,\s*([^)]+)\)/);
  return parseDash(fallback?.[1]?.trim());
}

const FONT_CACHE = new WeakMap<Element, Map<string, string>>();

function resolveFont(host: Element, size: string): string {
  if (!host.isConnected) return `${size} sans-serif`;
  let bySize = FONT_CACHE.get(host);
  if (bySize === undefined) {
    bySize = new Map();
    FONT_CACHE.set(host, bySize);
  }
  const hit = bySize.get(size);
  if (hit !== undefined) return hit;
  const span = document.createElement("span");
  span.style.fontSize = size;
  span.style.position = "absolute";
  host.appendChild(span);
  const computed = getComputedStyle(span);
  const font = `${computed.fontSize} ${computed.fontFamily}`;
  span.remove();
  bySize.set(size, font);
  return font;
}

/**
 * A resolver bound to one host element, with a per-paint cache so 22 series
 * sharing eight palette tokens do not each re-resolve.
 */
export function createStyleResolver(host: Element): StyleResolver {
  const colors = new Map<string, string>();
  const dashes = new Map<string, number[]>();
  const fonts = new Map<string, string>();
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
    font: (size) => {
      const hit = fonts.get(size);
      if (hit !== undefined) return hit;
      const resolved = resolveFont(host, size);
      fonts.set(size, resolved);
      return resolved;
    },
  };
}
