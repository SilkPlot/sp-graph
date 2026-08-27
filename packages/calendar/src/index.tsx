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

export { buildAgenda } from "./agenda";
export type { AgendaDay, AgendaEventItem, AgendaItem, AgendaSlotItem } from "./agenda";

export { AgendaView } from "./agenda-view";
export type { AgendaViewProps } from "./agenda-view";

export { CalendarWeek } from "./calendar-week";
export type { CalendarWeekProps } from "./calendar-week";
