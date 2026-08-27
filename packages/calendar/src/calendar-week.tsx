/**
 * Week host — the named "Agenda view" control plus the secondary spatial grid.
 *
 * Agenda items are real HTML. `WeekGrid` stays the SVG week; this file does
 * not draw a second one. Geometry for the grid is still consumed (`rects`),
 * never computed here.
 */
import { Show, createSignal, type Component } from "solid-js";
import { cssVar, FOCUS_CLASS, tokens } from "@silkplot/theme";
import { AgendaView } from "./agenda-view";
import type { CalendarEvent, EventRect } from "./overlap-resolver";
import type { TimeGrid } from "./time-grid";
import { WeekGrid } from "./week-grid";

export interface CalendarWeekProps {
  /** Zoned civil-time geometry from {@link buildTimeGrid}. */
  grid: TimeGrid;
  /** Booking events. Passed to the agenda; the grid reads `rects` instead. */
  events: readonly CalendarEvent[];
  /** Packed rectangles from {@link resolveEventLanes}. */
  rects: readonly EventRect[];
  /** Pixel width of the week grid. */
  width: number;
  title?: string;
  desc?: string;
  class?: string;
}

/**
 * Adjacent "Agenda view" / "Week view" controls. The agenda is HTML
 * (`AgendaView`); the week is the existing `WeekGrid` SVG.
 */
export const CalendarWeek: Component<CalendarWeekProps> = (props) => {
  const [view, setView] = createSignal<"week" | "agenda">("week");

  return (
    <div
      class={props.class}
      data-silkplot-calendar-week=""
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        background: cssVar("color-surface", tokens.color.surface),
      }}
    >
      <div style={{ "margin-bottom": cssVar("space-sm", tokens.space.sm) }}>
        <button
          type="button"
          class={FOCUS_CLASS}
          data-silkplot-agenda-toggle=""
          aria-pressed={view() === "agenda"}
          onClick={() => setView("agenda")}
        >
          Agenda view
        </button>
        <button
          type="button"
          class={FOCUS_CLASS}
          data-silkplot-week-toggle=""
          aria-pressed={view() === "week"}
          onClick={() => setView("week")}
        >
          Week view
        </button>
      </div>
      <Show when={view() === "agenda"}>
        <AgendaView grid={props.grid} events={props.events} title={props.title} desc={props.desc} />
      </Show>
      <Show when={view() === "week"}>
        <WeekGrid
          grid={props.grid}
          rects={props.rects}
          width={props.width}
          title={props.title}
          desc={props.desc}
        />
      </Show>
    </div>
  );
};
