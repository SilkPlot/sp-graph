/**
 * Categorical fill patterns for Canvas marks.
 *
 * Colour can encode; it must not uniquely encode. These strokes are clipped
 * into a pie slice, a treemap cell, or a pack/tree circle so a monochrome
 * copy still separates marks. Geometry stays in `@silkplot/core`.
 */
import type { StyleResolver } from "./canvas-style";

const PATTERN_STROKE = "var(--sp-color-text, #16181d)";

type PatternPaint = (ctx: CanvasRenderingContext2D, radius: number) => void;

const PATTERNS: readonly PatternPaint[] = [
  (ctx, radius) => paintDots(ctx, radius, 8),
  (ctx, radius) => paintStripes(ctx, radius, 6, Math.PI / 4),
  (ctx, radius) => paintStripes(ctx, radius, 6, -Math.PI / 4),
  (ctx, radius) => paintStripes(ctx, radius, 6, 0),
  (ctx, radius) => paintStripes(ctx, radius, 6, Math.PI / 2),
  (ctx, radius) => {
    paintStripes(ctx, radius, 8, 0);
    paintStripes(ctx, radius, 8, Math.PI / 2);
  },
  (ctx, radius) => paintDots(ctx, radius, 5),
  (ctx, radius) => {
    paintStripes(ctx, radius, 7, Math.PI / 6);
    paintStripes(ctx, radius, 7, -Math.PI / 6);
  },
];

export const CATEGORICAL_PATTERN_COUNT = PATTERNS.length;

function paintDots(ctx: CanvasRenderingContext2D, radius: number, step: number): void {
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle;
  for (let y = -radius; y <= radius; y += step) {
    for (let x = -radius; x <= radius; x += step) {
      ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
  }
  ctx.restore();
}

function paintStripes(ctx: CanvasRenderingContext2D, radius: number, step: number, angle: number): void {
  const span = radius * 2;
  ctx.save();
  ctx.rotate(angle);
  for (let y = -span; y <= span; y += step) {
    ctx.beginPath();
    ctx.moveTo(-span, y);
    ctx.lineTo(span, y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Stroke the pattern catalog into the current clip, centred at the origin.
 * The caller translates and clips.
 */
export function paintCategoricalPattern(
  ctx: CanvasRenderingContext2D,
  radius: number,
  pattern: number,
  resolve: StyleResolver,
): void {
  ctx.strokeStyle = resolve.color(PATTERN_STROKE);
  ctx.fillStyle = resolve.color(PATTERN_STROKE);
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.setLineDash([]);
  const slot = ((pattern % PATTERNS.length) + PATTERNS.length) % PATTERNS.length;
  PATTERNS[slot]!(ctx, radius);
}
