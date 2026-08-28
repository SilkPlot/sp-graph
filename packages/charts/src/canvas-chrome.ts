/**
 * Plot chrome on Canvas: references, brush, active point, empty wording.
 *
 * Paint order is the caller's (marks, then this) so a threshold stays legible
 * on a dense series. Clip is the frame's `ctx.clip`, not an SVG clipPath —
 * a reference cannot paint over an axis because axes sit outside the clip.
 */
import { packOverlaps, type NormalizedReference } from "@silkplot/core";
import type { CanvasMark } from "./canvas-marks";
import { paintLine, paintRing, paintText, pushMark } from "./canvas-paint";
import type { PlotSize } from "./canvas-plot";
import type { StyleResolver } from "./canvas-style";

const REFERENCE_STROKE = "var(--sp-color-reference, currentColor)";
const REFERENCE_FONT_SIZE = "var(--sp-font-sm, 11px)";
const REFERENCE_DASH = "6 4";
const REFERENCE_STROKE_WIDTH = 1;
const LABEL_LINE_HEIGHT = 15;
const LABEL_GLYPH_RATIO = 0.62;
const LABEL_FONT_PX = 11;
const LABEL_PAD = 4;
const CURSOR = "var(--sp-color-cursor, currentColor)";
const SURFACE = "var(--sp-color-surface, #ffffff)";
const EMPTY_FILL = "var(--sp-color-axis, currentColor)";
const EMPTY_FONT = "var(--sp-font-sm, 12px)";

export interface PlacedReference {
  reference: NormalizedReference;
  at: number;
  labelX: number;
  labelY: number;
  labelDrawn: boolean;
}

const estimateWidth = (label: string): number =>
  label.length * LABEL_GLYPH_RATIO * LABEL_FONT_PX + LABEL_PAD * 2;

/**
 * Resolve positions and stack colliding labels into lanes.
 *
 * When a lane would land outside the plot, the label is not drawn. The
 * accessible reference list still carries the meaning.
 */
export function placeReferences(
  references: readonly NormalizedReference[],
  position: (reference: NormalizedReference) => number,
  innerWidth: number,
  innerHeight: number,
): readonly PlacedReference[] {
  const limit = { value: innerHeight, time: innerWidth } as const;
  const visible = references
    .map((reference) => ({ reference, at: position(reference) }))
    .filter(({ reference, at }) => Number.isFinite(at) && at >= 0 && at <= limit[reference.axis]);

  const packed = packOverlaps(
    visible.map(({ reference, at }) => {
      const span = reference.axis === "value" ? LABEL_LINE_HEIGHT : estimateWidth(reference.label);
      return { start: at - span / 2, end: at + span / 2, reference, at };
    }),
    { key: (item) => item.reference.id },
  );

  return packed.map(({ item, lane }) => {
    if (item.reference.axis === "value") {
      const width = estimateWidth(item.reference.label);
      const labelX = innerWidth - LABEL_PAD - lane * width;
      return {
        reference: item.reference,
        at: item.at,
        labelX,
        labelY: item.at - LABEL_PAD,
        labelDrawn: labelX - width >= 0,
      };
    }
    const labelY = LABEL_PAD + LABEL_LINE_HEIGHT * (lane + 1);
    return {
      reference: item.reference,
      at: item.at,
      labelX: item.at + LABEL_PAD,
      labelY,
      labelDrawn: labelY <= innerHeight,
    };
  });
}

export function paintReferences(
  ctx: CanvasRenderingContext2D,
  references: readonly NormalizedReference[],
  position: (reference: NormalizedReference) => number,
  plot: PlotSize,
  resolve: StyleResolver,
  into: CanvasMark[],
): void {
  if (plot.width <= 0 || plot.height <= 0) return;
  const placed = placeReferences(references, position, plot.width, plot.height);
  for (const p of placed) {
    const horizontal = p.reference.axis === "value";
    pushMark(
      into,
      paintLine(
        ctx,
        horizontal ? 0 : p.at,
        horizontal ? p.at : 0,
        horizontal ? plot.width : p.at,
        horizontal ? p.at : plot.height,
        {
          stroke: p.reference.style.stroke ?? REFERENCE_STROKE,
          strokeWidth: p.reference.style.strokeWidth ?? REFERENCE_STROKE_WIDTH,
          dash: p.reference.style.dash?.join(" ") ?? REFERENCE_DASH,
        },
        resolve,
        "reference",
        { referenceId: p.reference.id },
      ),
    );
    if (!p.labelDrawn) continue;
    pushMark(
      into,
      paintText(
        ctx,
        p.labelX,
        p.labelY,
        p.reference.label,
        {
          fill: REFERENCE_STROKE,
          fontSize: REFERENCE_FONT_SIZE,
          anchor: horizontal ? "end" : "start",
        },
        resolve,
        "reference-label",
        { referenceId: p.reference.id },
      ),
    );
  }
}

export function paintBrush(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  height: number,
  resolve: StyleResolver,
  into: CanvasMark[],
): void {
  const x = Math.min(x0, x1);
  const width = Math.abs(x1 - x0);
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = resolve.color(CURSOR);
  ctx.fillRect(x, 0, width, height);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = resolve.color(CURSOR);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(x, 0, width, height);
  ctx.restore();
  into.push({
    kind: "rect",
    x: String(x),
    y: "0",
    width: String(width),
    height: String(height),
    fill: CURSOR,
    stroke: CURSOR,
    strokeWidth: "1",
    role: "brush",
  });
}

export function paintPointMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  plot: PlotSize,
  resolve: StyleResolver,
  into: CanvasMark[],
): void {
  pushMark(into, paintRing(ctx, cx, cy, { stroke: SURFACE, strokeWidth: 4, radius: 7 }, resolve));
  pushMark(into, paintRing(ctx, cx, cy, { stroke: CURSOR, strokeWidth: 2, radius: 7 }, resolve));
  pushMark(
    into,
    paintLine(ctx, cx, 0, cx, plot.height, { stroke: CURSOR }, resolve, "crosshair-x"),
  );
  pushMark(
    into,
    paintLine(ctx, 0, cy, plot.width, cy, { stroke: CURSOR }, resolve, "crosshair-y"),
  );
}

export function paintEmptyMark(
  ctx: CanvasRenderingContext2D,
  message: string,
  plot: PlotSize,
  resolve: StyleResolver,
  into: CanvasMark[],
): void {
  pushMark(
    into,
    paintText(
      ctx,
      plot.width / 2,
      plot.height / 2,
      message,
      {
        fill: EMPTY_FILL,
        fontSize: EMPTY_FONT,
        anchor: "center",
        baseline: "middle",
      },
      resolve,
      "empty",
    ),
  );
}
