/**
 * Legend swatch — a Canvas line carrying colour AND dash.
 *
 * A filled block cannot show a dash, and a legend whose swatches differ only
 * in hue is the failure ADR-0005 §5 forbids. The bitmap is 20×12, the same
 * box the SVG line used to occupy. Tokens stay on data-attributes so a test
 * can still read the specified stroke and dash; Canvas cannot hold `var(--sp-…)`.
 *
 * Colour and dash resolve against this element so a themed page and an
 * unthemed one still agree with the cascade. No SVG is mounted.
 */
import { createEffect, createSignal, type JSX } from "solid-js";

export const SWATCH_WIDTH = 20;
export const SWATCH_HEIGHT = 12;

export interface LegendSwatchSpec {
  stroke: string;
  dash: string;
  strokeWidth: number;
  opacity: number;
}

export function parseSwatchDash(specified: string | undefined): number[] {
  if (specified === undefined || specified === "none" || specified === "") return [];
  const out: number[] = [];
  for (const part of specified.split(/[\s,]+/)) {
    if (part === "") continue;
    const n = Number.parseFloat(part);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function resolveColor(host: HTMLCanvasElement, specified: string): string {
  if (specified === "none") return "rgba(0, 0, 0, 0)";
  if (!host.isConnected) {
    return specified === "currentColor" || specified.includes("var(") ? "#000000" : specified;
  }
  const previous = host.style.color;
  host.style.color = specified;
  const used = getComputedStyle(host).color;
  host.style.color = previous;
  return used;
}

function resolveDash(host: HTMLCanvasElement, specified: string): number[] {
  const direct = parseSwatchDash(specified);
  if (direct.length > 0) return direct;
  if (specified === "none" || specified === "") return [];
  const name = specified.match(/--[a-z0-9-]+/i);
  if (name === null) return [];
  const used = getComputedStyle(host).getPropertyValue(name[0]).trim();
  if (used !== "" && used !== "none") return parseSwatchDash(used);
  const fallback = specified.match(/var\([^,]+,\s*([^)]+)\)/);
  return parseSwatchDash(fallback?.[1]?.trim());
}

/** Paint the swatch line in CSS-pixel coordinates, scaled by devicePixelRatio. */
export function paintLegendSwatch(el: HTMLCanvasElement, spec: LegendSwatchSpec): void {
  const dpr = window.devicePixelRatio || 1;
  el.width = Math.round(SWATCH_WIDTH * dpr);
  el.height = Math.round(SWATCH_HEIGHT * dpr);
  const ctx = el.getContext("2d");
  if (ctx === null) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, SWATCH_WIDTH, SWATCH_HEIGHT);
  ctx.strokeStyle = resolveColor(el, spec.stroke);
  ctx.lineWidth = spec.strokeWidth;
  ctx.lineCap = "butt";
  ctx.globalAlpha = spec.opacity;
  ctx.setLineDash(resolveDash(el, spec.dash));
  ctx.beginPath();
  ctx.moveTo(1, SWATCH_HEIGHT / 2);
  ctx.lineTo(SWATCH_WIDTH - 1, SWATCH_HEIGHT / 2);
  ctx.stroke();
}

export function LegendSwatch(props: LegendSwatchSpec): JSX.Element {
  const [host, setHost] = createSignal<HTMLCanvasElement>();

  createEffect(() => {
    const el = host();
    if (el === undefined) return;
    paintLegendSwatch(el, {
      stroke: props.stroke,
      dash: props.dash,
      strokeWidth: props.strokeWidth,
      opacity: props.opacity,
    });
  });

  return (
    // The wrapper, not the canvas, is `aria-hidden`: Biome treats `<canvas>` as
    // focusable, and hiding a focusable node is the confusing case the lint
    // exists for. The button already names the series.
    <span aria-hidden="true">
      <canvas
        ref={setHost}
        width={SWATCH_WIDTH}
        height={SWATCH_HEIGHT}
        data-silkplot-legend-swatch=""
        data-silkplot-swatch-stroke={props.stroke}
        data-silkplot-swatch-dash={props.dash}
        data-silkplot-swatch-opacity={String(props.opacity)}
        style={{
          width: `${SWATCH_WIDTH}px`,
          height: `${SWATCH_HEIGHT}px`,
          display: "block",
          "pointer-events": "none",
        }}
      />
    </span>
  );
}
