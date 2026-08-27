/**
 * Agenda view — events and empty slots as real HTML, grouped by service day.
 *
 * This is the primary non-visual representation. `WeekGrid` remains the
 * secondary spatial view. Overlap is stated in text from start/end; this file
 * does not read `EventRect` geometry or call `resolveEventLanes`.
 */
import { For, createMemo, createUniqueId, type Component } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { cssVar, tokens } from "@silkplot/theme";
import { buildAgenda, type AgendaDay, type AgendaEventItem, type AgendaItem } from "./agenda";
import type { CalendarEvent } from "./overlap-resolver";
import type { TimeGrid, TimeGridDay } from "./time-grid";

export interface AgendaViewProps {
  /** Zoned civil-time geometry from {@link buildTimeGrid}. */
  grid: TimeGrid;
  /** Booking events. `{ id, title, start, end }` only — no resource, no series. */
  events: readonly CalendarEvent[];
  /** Accessible name; the region stays "Agenda view" when omitted. */
  title?: string;
  /** Longer accessible description. */
  desc?: string;
  class?: string;
}

function epochMs(value: { epochMilliseconds: number }): number {
  return value.epochMilliseconds;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatClock(ms: number, timeZone: string, withOffset: boolean): string {
  const zoned = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(timeZone);
  const clock = `${pad2(zoned.hour)}:${pad2(zoned.minute)}`;
  return withOffset ? `${clock} ${zoned.offset}` : clock;
}

function weekdayName(date: Temporal.PlainDate): string {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
  return names[date.dayOfWeek - 1]!;
}

function dayHeading(day: TimeGridDay): string {
  const head = `${weekdayName(day.date)} ${day.date.toString()}`;
  return day.elapsedHours === 24 ? head : `${head}, ${day.elapsedHours} elapsed hours`;
}

function overlapPhrase(overlaps: readonly CalendarEvent[]): string {
  if (overlaps.length === 0) return "";
  return `overlaps ${overlaps.map((event) => event.title).join(", ")}`;
}

function eventText(item: AgendaEventItem, timeZone: string, withOffset: boolean): string {
  const start = formatClock(item.start, timeZone, withOffset);
  const end = formatClock(item.end, timeZone, withOffset);
  const body = `${item.event.title}, ${start} to ${end} in ${timeZone}`;
  const overlap = overlapPhrase(item.overlaps);
  return overlap === "" ? body : `${body}; ${overlap}`;
}

function slotText(item: Extract<AgendaItem, { kind: "slot" }>, withOffset: boolean): string {
  const clock = formatClock(epochMs(item.slot.start), item.slot.start.timeZoneId, withOffset);
  return `${clock} empty`;
}

function itemText(item: AgendaItem, timeZone: string, withOffset: boolean): string {
  return item.kind === "event" ? eventText(item, timeZone, withOffset) : slotText(item, withOffset);
}

/**
 * Ordered HTML list of a `TimeGrid` week: events and empty slots, grouped by
 * service day. The named control is this region — "Agenda view" — not a second
 * SVG week.
 */
export const AgendaView: Component<AgendaViewProps> = (props) => {
  const groups = createMemo(() => buildAgenda(props.events, props.grid));
  const timeZone = () => props.grid.config.timeZone;
  const headingId = createUniqueId();
  const descId = createUniqueId();

  return (
    <section
      class={props.class}
      data-silkplot-agenda=""
      aria-labelledby={headingId}
      aria-describedby={props.desc ? descId : undefined}
      style={{
        color: cssVar("color-text", tokens.color.text),
        background: cssVar("color-surface", tokens.color.surface),
        "font-size": cssVar("font-md", tokens.fontSize.md),
        "max-width": "100%",
        "max-height": "20rem",
        "overflow-y": "auto",
      }}
    >
      <h2
        id={headingId}
        style={{
          margin: `0 0 ${cssVar("space-sm", tokens.space.sm)}`,
          "font-size": cssVar("font-lg", tokens.fontSize.lg),
        }}
      >
        Agenda view
      </h2>
      {props.title ? (
        <p
          style={{
            margin: `0 0 ${cssVar("space-sm", tokens.space.sm)}`,
            "font-size": cssVar("font-sm", tokens.fontSize.sm),
          }}
        >
          {props.title}
        </p>
      ) : null}
      {props.desc ? (
        <p
          id={descId}
          style={{
            margin: `0 0 ${cssVar("space-md", tokens.space.md)}`,
            color: cssVar("color-muted", tokens.color.muted),
            "font-size": cssVar("font-sm", tokens.fontSize.sm),
          }}
        >
          {props.desc}
        </p>
      ) : null}
      <ol
        data-silkplot-agenda-days=""
        style={{
          margin: 0,
          padding: 0,
          "list-style": "none",
        }}
      >
        <For each={groups()}>{(group) => <AgendaDayBlock group={group} timeZone={timeZone()} />}</For>
      </ol>
    </section>
  );
};

interface AgendaDayBlockProps {
  group: AgendaDay;
  timeZone: string;
}

const AgendaDayBlock: Component<AgendaDayBlockProps> = (props) => {
  const iso = () => props.group.day.date.toString();
  const dst = () => props.group.day.elapsedHours !== 24;

  return (
    <li
      data-silkplot-agenda-day={iso()}
      data-silkplot-elapsed-hours={props.group.day.elapsedHours}
      style={{ "margin-bottom": cssVar("space-lg", tokens.space.lg) }}
    >
      <h3
        style={{
          margin: `0 0 ${cssVar("space-xs", tokens.space.xs)}`,
          "font-size": cssVar("font-sm", tokens.fontSize.sm),
        }}
      >
        {dayHeading(props.group.day)}
      </h3>
      <ol
        data-silkplot-agenda-items=""
        style={{
          margin: 0,
          padding: `0 0 0 ${cssVar("space-lg", tokens.space.lg)}`,
        }}
      >
        <For each={props.group.items}>
          {(item) => (
            <li
              data-silkplot-agenda-item={item.kind}
              data-silkplot-agenda-event={item.kind === "event" ? item.event.id : undefined}
              data-silkplot-agenda-slot={
                item.kind === "slot" ? item.slot.start.toString() : undefined
              }
              style={{
                color:
                  item.kind === "slot"
                    ? cssVar("color-muted", tokens.color.muted)
                    : cssVar("color-text", tokens.color.text),
              }}
            >
              {itemText(item, props.timeZone, dst())}
            </li>
          )}
        </For>
      </ol>
    </li>
  );
};
