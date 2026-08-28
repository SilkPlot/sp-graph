/**
 * Recorded descriptors for a Canvas week paint pass. Same idea as the
 * cartesian mark surface: production paint writes the numbers it drew, so a
 * test that reads these is reading the Canvas, not a parallel model.
 */
export type CanvasWeekMarkRole = "day-frame" | "slot" | "event" | "label";

export interface CanvasWeekRectMark {
  kind: "rect";
  role: "day-frame" | "event";
  x: number;
  y: number;
  width: number;
  height: number;
  eventId?: string;
  day?: string;
}

export interface CanvasWeekLineMark {
  kind: "line";
  role: "slot";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
}

export interface CanvasWeekTextMark {
  kind: "text";
  role: "label";
  x: number;
  y: number;
  text: string;
}

export type CanvasWeekMark = CanvasWeekRectMark | CanvasWeekLineMark | CanvasWeekTextMark;

const recorded = new WeakMap<HTMLCanvasElement, readonly CanvasWeekMark[]>();

export function rememberCanvasWeekMarks(
  canvas: HTMLCanvasElement,
  marks: readonly CanvasWeekMark[],
): void {
  recorded.set(canvas, marks);
}

export function marksOnCanvasWeek(canvas: HTMLCanvasElement): readonly CanvasWeekMark[] {
  return recorded.get(canvas) ?? [];
}

export function canvasWeekPlotsOf(container: ParentNode): HTMLCanvasElement[] {
  return Array.from(container.querySelectorAll<HTMLCanvasElement>("[data-silkplot-canvas-week-plot]"));
}
