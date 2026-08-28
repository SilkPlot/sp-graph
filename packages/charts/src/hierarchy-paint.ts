/**
 * Canvas paint for hierarchy nodes: categorical fill, a fill pattern, and
 * a label. Colour is never the only channel — a monochrome copy still
 * separates nodes by pattern and by the id sitting on each one.
 *
 * Geometry is computed in `@silkplot/core`. This file fills, clips the
 * pattern into the mark, and strokes the active outline.
 */
import {
  seriesColorToken,
  type PackNode,
  type TreeLayout,
  type TreeLink,
  type TreeNode,
  type TreemapNode,
} from "@silkplot/core";
import { paintCategoricalPattern } from "./canvas-pattern";
import { paintLine, paintText } from "./canvas-paint";
import type { CanvasMark, CircleMark, RectMark } from "./canvas-marks";
import type { StyleResolver } from "./canvas-style";

const LABEL_FILL = "var(--sp-color-text, #16181d)";
const ACTIVE_STROKE = "var(--sp-color-cursor, currentColor)";
const ACTIVE_WIDTH = 2;
const LABEL_SIZE = "11px";
const LINK_STROKE = "var(--sp-color-border, #8b909a)";
const TAU = Math.PI * 2;

/** Painted tree-node radius, in inner-plot pixels. */
export const TREE_NODE_RADIUS = 8;

export function hierarchyFill(pattern: number): string {
  return seriesColorToken(pattern);
}

export interface HierarchyNodeSpec {
  active?: boolean;
}

function paintClippedPattern(
  ctx: CanvasRenderingContext2D,
  radius: number,
  pattern: number,
  resolve: StyleResolver,
): void {
  ctx.save();
  paintCategoricalPattern(ctx, radius, pattern, resolve);
  ctx.restore();
}

function paintTreeCircle(
  ctx: CanvasRenderingContext2D,
  node: TreeNode,
  spec: HierarchyNodeSpec,
  resolve: StyleResolver,
): CircleMark {
  const fill = hierarchyFill(node.pattern);
  const r = TREE_NODE_RADIUS;
  const active = spec.active === true;
  ctx.save();
  ctx.translate(node.x, node.y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = resolve.color(fill);
  ctx.fill();
  ctx.save();
  ctx.clip();
  paintClippedPattern(ctx, r, node.pattern, resolve);
  ctx.restore();
  if (active) {
    ctx.strokeStyle = resolve.color(ACTIVE_STROKE);
    ctx.lineWidth = ACTIVE_WIDTH;
    ctx.stroke();
  }
  ctx.restore();
  return {
    kind: "circle",
    cx: String(node.x),
    cy: String(node.y),
    r: String(r),
    fill,
    fillOpacity: "1",
    stroke: active ? ACTIVE_STROKE : "none",
    strokeWidth: active ? String(ACTIVE_WIDTH) : "0",
    pattern: String(node.pattern),
  };
}

function paintPackCircle(
  ctx: CanvasRenderingContext2D,
  node: PackNode,
  spec: HierarchyNodeSpec,
  resolve: StyleResolver,
): CircleMark {
  const fill = hierarchyFill(node.pattern);
  const active = spec.active === true;
  ctx.save();
  ctx.translate(node.x, node.y);
  ctx.beginPath();
  ctx.arc(0, 0, node.r, 0, TAU);
  ctx.fillStyle = resolve.color(fill);
  ctx.fill();
  ctx.save();
  ctx.clip();
  paintClippedPattern(ctx, node.r, node.pattern, resolve);
  ctx.restore();
  if (active) {
    ctx.strokeStyle = resolve.color(ACTIVE_STROKE);
    ctx.lineWidth = ACTIVE_WIDTH;
    ctx.stroke();
  }
  ctx.restore();
  return {
    kind: "circle",
    cx: String(node.x),
    cy: String(node.y),
    r: String(node.r),
    fill,
    fillOpacity: "1",
    stroke: active ? ACTIVE_STROKE : "none",
    strokeWidth: active ? String(ACTIVE_WIDTH) : "0",
    pattern: String(node.pattern),
  };
}

function paintTreemapRect(
  ctx: CanvasRenderingContext2D,
  node: TreemapNode,
  spec: HierarchyNodeSpec,
  resolve: StyleResolver,
): RectMark {
  const fill = hierarchyFill(node.pattern);
  const active = spec.active === true;
  ctx.save();
  ctx.beginPath();
  ctx.rect(node.x, node.y, node.width, node.height);
  ctx.fillStyle = resolve.color(fill);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.translate(node.x + node.width / 2, node.y + node.height / 2);
  paintClippedPattern(ctx, Math.hypot(node.width, node.height) / 2, node.pattern, resolve);
  ctx.restore();
  if (active) {
    ctx.strokeStyle = resolve.color(ACTIVE_STROKE);
    ctx.lineWidth = ACTIVE_WIDTH;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    ctx.strokeRect(node.x, node.y, node.width, node.height);
  }
  ctx.restore();
  return {
    kind: "rect",
    x: String(node.x),
    y: String(node.y),
    width: String(node.width),
    height: String(node.height),
    fill,
    stroke: active ? ACTIVE_STROKE : "none",
    strokeWidth: active ? String(ACTIVE_WIDTH) : "0",
    pattern: String(node.pattern),
  };
}

function paintNodeLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  resolve: StyleResolver,
  anchor: CanvasTextAlign = "center",
): CanvasMark {
  return paintText(
    ctx,
    x,
    y,
    text,
    { fill: LABEL_FILL, fontSize: LABEL_SIZE, anchor, baseline: "middle" },
    resolve,
    "node-label",
  );
}

function isActiveNode(currentSource: number | undefined, sourceIndex: number): boolean {
  return currentSource === sourceIndex;
}

function paintLink(
  ctx: CanvasRenderingContext2D,
  link: TreeLink,
  resolve: StyleResolver,
): CanvasMark {
  return paintLine(
    ctx,
    link.x1,
    link.y1,
    link.x2,
    link.y2,
    { stroke: LINK_STROKE, strokeWidth: 1 },
    resolve,
    "link",
  );
}

/** Links first, then nodes and labels, so a disk covers its incident edges. */
export function paintTreeLayout(
  ctx: CanvasRenderingContext2D,
  layout: TreeLayout,
  currentSource: number | undefined,
  resolve: StyleResolver,
): CanvasMark[] {
  const painted: CanvasMark[] = [];
  for (const link of layout.links) {
    painted.push(paintLink(ctx, link, resolve));
  }
  for (const node of layout.nodes) {
    painted.push(
      paintTreeCircle(ctx, node, { active: isActiveNode(currentSource, node.sourceIndex) }, resolve),
    );
    painted.push(
      paintNodeLabel(ctx, node.x + TREE_NODE_RADIUS + 4, node.y, node.id, resolve, "left"),
    );
  }
  return painted;
}

export function paintTreemapLayout(
  ctx: CanvasRenderingContext2D,
  nodes: readonly TreemapNode[],
  currentSource: number | undefined,
  resolve: StyleResolver,
): CanvasMark[] {
  const painted: CanvasMark[] = [];
  for (const node of nodes) {
    painted.push(
      paintTreemapRect(ctx, node, { active: isActiveNode(currentSource, node.sourceIndex) }, resolve),
    );
    painted.push(paintNodeLabel(ctx, node.x + node.width / 2, node.y + node.height / 2, node.id, resolve));
  }
  return painted;
}

export function paintPackLayout(
  ctx: CanvasRenderingContext2D,
  nodes: readonly PackNode[],
  currentSource: number | undefined,
  resolve: StyleResolver,
): CanvasMark[] {
  const painted: CanvasMark[] = [];
  for (const node of nodes) {
    painted.push(
      paintPackCircle(ctx, node, { active: isActiveNode(currentSource, node.sourceIndex) }, resolve),
    );
    painted.push(paintNodeLabel(ctx, node.x, node.y, node.id, resolve));
  }
  return painted;
}
