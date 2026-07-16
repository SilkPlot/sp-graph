/**
 * @silkplot/calendar — booking-calendar primitives.
 *
 * STUB package for SR-001 roadmap Phase 3. The overlap resolver is wired to the
 * (real) deterministic packer in @silkplot/core; the time-grid model is a typed
 * placeholder. Shared temporal foundation with the charts — never d3-force for
 * overlap, never d3-axis for the time ruler.
 */
export { buildTimeGrid } from "./time-grid";
export type { TimeGridConfig, TimeSlot, TimeGrid } from "./time-grid";

export { resolveEventLanes } from "./overlap-resolver";
export type { CalendarEvent } from "./overlap-resolver";
