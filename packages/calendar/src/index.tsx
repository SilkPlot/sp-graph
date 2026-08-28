/**
 * @silkplot/calendar — booking-calendar primitives.
 *
 * The overlap resolver composes the deterministic packer in @silkplot/core
 * with time-grid columns into renderer-agnostic `{ x, width }` rectangles.
 * The time-grid model is zoned civil-time geometry: one IANA display zone,
 * elapsed-time DST days, Temporal at the boundary, Date only at `positionOf`.
 * The week grid consumes that geometry; the agenda lists the same events and
 * empty slots as ordered HTML. Solid owns every element.
 * Never d3-force for overlap, never d3-axis for the time ruler.
 */
export { buildTimeGrid, resolveCivilDateTime } from "./time-grid";
export type {
  TimeGridConfig,
  TimeSlot,
  TimeGrid,
  TimeGridDay,
  TimeGridWeek,
  WeekStart,
  ServiceDayAnchor,
  CivilDisambiguation,
  GridInstant,
} from "./time-grid";

export { resolveEventLanes } from "./overlap-resolver";
export type { CalendarEvent, EventRect } from "./overlap-resolver";

export { WeekGrid } from "./week-grid";
export type { WeekGridProps } from "./week-grid";

export {
  eventBlockBox,
  weekCanvasSize,
  WEEK_HEADER_HEIGHT,
} from "./canvas-week-geometry";
export type { EventBlockBox, WeekCanvasSize } from "./canvas-week-geometry";

export { paintCanvasWeek, syncCanvasWeek } from "./canvas-week-paint";
export type { CanvasWeekPaintArgs } from "./canvas-week-paint";

export {
  marksOnCanvasWeek,
  canvasWeekPlotsOf,
} from "./canvas-week-marks";
export type { CanvasWeekMark, CanvasWeekRectMark } from "./canvas-week-marks";

export { CanvasWeek } from "./canvas-week";
export type { CanvasWeekProps } from "./canvas-week";

export {
  ACCEPTANCE_MS,
  BOOKING_DENSITY,
  BOOKING_DENSITY_RECORD,
  FRAME_BUDGET_MS,
  bookingBoard,
  bookingEvents,
  bookingHours,
  boardCanvasSize,
  boardPaintArgs,
  boardPaintArgsUnfiltered,
  keepBookingSlot,
  paintPassStats,
  timePaintPasses,
  timeSyncPasses,
} from "./canvas-week-budget";
export type { BookingBoard, BookingDensityRecord, PaintPassStats } from "./canvas-week-budget";

export {
  DEFAULT_OVERSCAN_PX,
  inflateViewport,
  visibleEventRects,
  visibleDays,
  boxesIntersect,
} from "./canvas-week-visible";
export type { PixelViewport } from "./canvas-week-visible";

export { buildAgenda } from "./agenda";
export type { AgendaDay, AgendaEventItem, AgendaItem, AgendaSlotItem } from "./agenda";

export { AgendaView } from "./agenda-view";
export type { AgendaViewProps } from "./agenda-view";

export { CalendarWeek } from "./calendar-week";
export type { CalendarWeekProps } from "./calendar-week";

export { binOntoTimeGrid, assignTimeGridCell, timeGridColumns, timeGridRows, clockKey } from "./calendar-heatmap-bin";
export type { TimeGridObservation } from "./calendar-heatmap-bin";

export { CalendarHeatmap } from "./calendar-heatmap";
export type { CalendarHeatmapProps, CalendarHeatmapBaseProps } from "./calendar-heatmap";

export {
  paintCalendarHeatmap,
  paintCalendarHeatmapCell,
  calendarHeatmapFill,
  syncCalendarHeatmap,
  marksOnCalendarHeatmap,
  calendarHeatmapPlotsOf,
} from "./calendar-heatmap-paint";
export type { CalendarHeatmapMark, CalendarHeatmapRectMark } from "./calendar-heatmap-paint";
