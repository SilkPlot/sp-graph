/**
 * The mark descriptors a Canvas plot records after each paint — the test
 * surface for geometry that used to live on SVG `path` / `circle` / `rect`
 * attributes. Production paint writes the same numbers it stroked, so a
 * helper that reads these is reading the Canvas surface, not a parallel SVG
 * that no longer exists.
 *
 * A WeakMap, not a data-attribute: a dense path `d` can be large, and the
 * live element is the natural key. Tests reach this through `support.ts`.
 */

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
}

export type CanvasMark = PathMark | CircleMark | RectMark;

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
