/**
 * @silkplot/calendar — booking-calendar primitives.
 *
 * The overlap resolver is wired to the deterministic packer in @silkplot/core.
 * The time-grid model is zoned civil-time geometry: one IANA display zone,
 * elapsed-time DST days, Temporal at the boundary, Date only at `positionOf`.
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
export type { CalendarEvent } from "./overlap-resolver";
