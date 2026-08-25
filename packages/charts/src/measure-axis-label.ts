/**
 * Runtime width of an axis tick label, using the same font size Axis paints.
 *
 * Off-document SVG `getBBox` — the opt-in measured-margin path is the
 * explicit determinism trade-off, so font metrics are allowed here and
 * nowhere on the default (constant 40px) path.
 */
const AXIS_FONT_SIZE = "var(--sp-font-sm, 11px)";

let measureText: SVGTextElement | undefined;

function ensureMeasureText(): SVGTextElement | undefined {
  if (typeof document === "undefined") return undefined;
  if (measureText !== undefined) return measureText;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden";
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("font-size", AXIS_FONT_SIZE);
  svg.appendChild(text);
  document.body.appendChild(svg);
  measureText = text;
  return text;
}

/** Width in px of `label` as Axis would paint it. 0 when no document. */
export function measurePaintedAxisLabelWidth(label: string): number {
  const text = ensureMeasureText();
  if (text === undefined) return 0;
  text.textContent = label;
  return text.getBBox().width;
}
