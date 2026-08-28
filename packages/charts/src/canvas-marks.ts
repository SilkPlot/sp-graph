/**
 * The descriptors a Canvas plot records after each paint — the test surface
 * for geometry that used to live on SVG attributes.
 *
 * Production paint writes the same numbers it stroked, so a helper that reads
 * these is reading the Canvas surface. Cartesian charts paint marks, axes,
 * grid, and plot chrome (references, brush, active point) onto one bitmap;
 * `role` tells those channels apart. A WeakMap, not a data-attribute: a dense
 * path `d` can be large, and the live element is the natural key.
 */

export type MarkRole = "mark" | "cursor";
export type LineRole =
  | "grid"
  | "axis-tick"
  | "axis-domain"
  | "reference"
  | "crosshair-x"
  | "crosshair-y";
export type TextRole = "axis-label" | "reference-label" | "empty";
export type RectRole = "mark" | "brush";
export type AxisSide = "left" | "bottom" | "top" | "right";

export interface PathMark {
  kind: "path";
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: string;
  dash: string | undefined;
  fillOpacity: string | undefined;
}

export interface CircleMark {
  kind: "circle";
  cx: string;
  cy: string;
  r: string;
  fill: string;
  fillOpacity: string;
  stroke?: string;
  strokeWidth?: string;
  role?: MarkRole;
}

export interface RectMark {
  kind: "rect";
  x: string;
  y: string;
  width: string;
  height: string;
  fill: string;
  stroke: string;
  strokeWidth: string;
  role?: RectRole;
  /** Hatch density recorded for the non-colour heatmap channel. */
  hatch?: string;
}

export interface LineMark {
  kind: "line";
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  stroke: string;
  strokeWidth: string;
  dash: string | undefined;
  role: LineRole;
  axis?: AxisSide | "x" | "y";
  referenceId?: string;
}

export interface TextMark {
  kind: "text";
  x: string;
  y: string;
  text: string;
  fill: string;
  anchor: string;
  role: TextRole;
  axis?: AxisSide;
  referenceId?: string;
  rotation?: string;
}

export type CanvasMark = PathMark | CircleMark | RectMark | LineMark | TextMark;

const recorded = new WeakMap<HTMLCanvasElement, readonly CanvasMark[]>();

/** Remember the marks just painted onto this canvas. */
export function rememberCanvasMarks(
  canvas: HTMLCanvasElement,
  marks: readonly CanvasMark[],
): void {
  recorded.set(canvas, marks);
}

/** The marks last painted onto this canvas, or an empty list. */
export function marksOnCanvas(canvas: HTMLCanvasElement): readonly CanvasMark[] {
  return recorded.get(canvas) ?? [];
}

/** Every Canvas plot in a container, in document order. */
export function canvasPlotsOf(container: ParentNode): HTMLCanvasElement[] {
  return Array.from(container.querySelectorAll<HTMLCanvasElement>("[data-silkplot-canvas-plot]"));
}

/** Concatenate the recorded marks of every Canvas plot in the container. */
export function canvasMarksOf(container: ParentNode): CanvasMark[] {
  const out: CanvasMark[] = [];
  for (const canvas of canvasPlotsOf(container)) {
    out.push(...marksOnCanvas(canvas));
  }
  return out;
}
