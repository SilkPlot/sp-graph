/**
 * Week-grid view — Solid renders day columns, slot lines, and event blocks.
 *
 * Geometry is consumed, never computed. A thin host calls `buildTimeGrid` and
 * `resolveEventLanes` and passes the results in. Vertical placement is
 * `TimeGrid.positionOf` on each rect's start/end, origin-shifted by the
 * service-day the resolver already named. Horizontal placement is
 * `EventRect.x` / `EventRect.width` as fractions of the day column.
 *
 * This file does not call the packer, invent lanes, or rebuild day bounds.
 */
import { For, createMemo, type Component } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { cssVar, FOCUS_CLASS, seriesChannel, tokens } from "@silkplot/theme";
import type { TimeGrid, TimeGridDay, TimeSlot } from "./time-grid";
import type { EventRect } from "./overlap-resolver";

export interface WeekGridProps {
  /** Zoned civil-time geometry from {@link buildTimeGrid}. */
  grid: TimeGrid;
  /** Packed rectangles from {@link resolveEventLanes}. */
  rects: readonly EventRect[];
  /** Pixel width of the week (all day columns). */
  width: number;
  /** Accessible name for the graphic. */
  title?: string;
  /** Longer accessible description. */
  desc?: string;
  class?: string;
}

const HEADER_HEIGHT =
  Number.parseFloat(tokens.fontSize.lg) + Number.parseFloat(tokens.space.lg);

function epochMs(value: { epochMilliseconds: number }): number {
  return value.epochMilliseconds;
}

function atDate(ms: number): Date {
  return new Date(ms);
}

/** Pixel position of a service-day start on the time axis. */
function dayOrigin(grid: TimeGrid, day: TimeGridDay): number {
  return grid.positionOf(atDate(epochMs(day.start)));
}

/** Vertical placement: `positionOf` on the instant, origin-shifted to the day. */
function yOf(grid: TimeGrid, day: TimeGridDay, ms: number): number {
  return grid.positionOf(atDate(ms)) - dayOrigin(grid, day);
}

function dayOf(grid: TimeGrid, date: EventRect["day"]): TimeGridDay | undefined {
  return grid.days.find((day) => Temporal.PlainDate.compare(day.date, date) === 0);
}

function slotsOn(day: TimeGridDay, slots: readonly TimeSlot[]): TimeSlot[] {
  const start = epochMs(day.start);
  const end = epochMs(day.end);
  return slots.filter((slot) => {
    const at = epochMs(slot.start);
    return at >= start && at < end;
  });
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

function dayLabel(day: TimeGridDay): string {
  const head = `${weekdayName(day.date)} ${day.date.toString()}`;
  return day.elapsedHours === 24 ? head : `${head}, ${day.elapsedHours} elapsed hours`;
}

function eventName(rect: EventRect, timeZone: string, withOffset: boolean): string {
  const start = formatClock(rect.start, timeZone, withOffset);
  const end = formatClock(rect.end, timeZone, withOffset);
  return `${rect.event.title}, ${start} to ${end} in ${timeZone}`;
}

function channelIndex(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 1)) % 8;
  return n;
}

/**
 * Week view of a `TimeGrid`. Columns are `grid.days`. Slot lines and event
 * blocks read positions from the grid and the resolver — they do not invent them.
 */
export const WeekGrid: Component<WeekGridProps> = (props) => {
  const days = () => props.grid.days;
  const columnWidth = () => {
    const count = days().length;
    return count === 0 ? props.width : props.width / count;
  };
  const bodyHeight = createMemo(() => {
    let max = 0;
    for (const day of days()) {
      const extent = yOf(props.grid, day, epochMs(day.end));
      if (extent > max) max = extent;
    }
    return max;
  });
  const svgHeight = () => HEADER_HEIGHT + bodyHeight();
  const timeZone = () => props.grid.config.timeZone;

  const rectsByDay = createMemo(() => {
    const map = new Map<string, EventRect[]>();
    for (const day of days()) map.set(day.date.toString(), []);
    for (const rect of props.rects) {
      const list = map.get(rect.day.toString());
      if (list) list.push(rect);
    }
    return map;
  });

  const titleId = "sp-cal-week-title";
  const descId = "sp-cal-week-desc";

  return (
    <svg
      width={props.width}
      height={svgHeight()}
      viewBox={`0 0 ${props.width} ${svgHeight()}`}
      role="img"
      aria-labelledby={titleId}
      aria-describedby={props.desc ? descId : undefined}
      class={props.class}
      data-silkplot-week-grid=""
      style={{ display: "block" }}
    >
      <title id={titleId}>{props.title ?? "Week view"}</title>
      {props.desc ? <desc id={descId}>{props.desc}</desc> : null}
      <For each={days()}>
        {(day, index) => (
          <DayColumn
            grid={props.grid}
            day={day}
            x={index() * columnWidth()}
            width={columnWidth()}
            headerHeight={HEADER_HEIGHT}
            slots={slotsOn(day, props.grid.slots)}
            rects={rectsByDay().get(day.date.toString()) ?? []}
            timeZone={timeZone()}
          />
        )}
      </For>
    </svg>
  );
};

interface DayColumnProps {
  grid: TimeGrid;
  day: TimeGridDay;
  x: number;
  width: number;
  headerHeight: number;
  slots: readonly TimeSlot[];
  rects: readonly EventRect[];
  timeZone: string;
}

const DayColumn: Component<DayColumnProps> = (props) => {
  const extent = () => yOf(props.grid, props.day, epochMs(props.day.end));
  const dst = () => props.day.elapsedHours !== 24;
  const iso = () => props.day.date.toString();

  return (
    <g
      data-silkplot-day={iso()}
      data-silkplot-elapsed-hours={props.day.elapsedHours}
      transform={`translate(${props.x},0)`}
    >
      <title>{dayLabel(props.day)}</title>
      <text
        x={Number.parseFloat(tokens.space.sm)}
        y={Number.parseFloat(tokens.fontSize.md) + Number.parseFloat(tokens.space.xs)}
        fill={cssVar("color-text", tokens.color.text)}
        font-size={cssVar("font-sm", tokens.fontSize.sm)}
        font-weight="600"
      >
        {weekdayName(props.day.date)} {iso()}
      </text>
      {dst() ? (
        <text
          x={Number.parseFloat(tokens.space.sm)}
          y={Number.parseFloat(tokens.fontSize.md) + Number.parseFloat(tokens.fontSize.xs) + Number.parseFloat(tokens.space.sm)}
          fill={cssVar("color-muted", tokens.color.muted)}
          font-size={cssVar("font-xs", tokens.fontSize.xs)}
        >
          {props.day.elapsedHours} elapsed hours
        </text>
      ) : null}
      <g transform={`translate(0,${props.headerHeight})`}>
        <rect
          data-silkplot-day-frame=""
          x={0}
          y={0}
          width={props.width}
          height={extent()}
          fill={cssVar("color-surface", tokens.color.surface)}
          stroke={cssVar("color-axis", tokens.color.axis)}
          stroke-width="1"
        />
        <SlotLines
          grid={props.grid}
          day={props.day}
          slots={props.slots}
          width={props.width}
          withOffset={dst()}
        />
        <For each={props.rects}>
          {(rect) => (
            <EventBlock
              grid={props.grid}
              day={dayOf(props.grid, rect.day) ?? props.day}
              rect={rect}
              columnWidth={props.width}
              timeZone={props.timeZone}
              withOffset={dst()}
            />
          )}
        </For>
      </g>
    </g>
  );
};

interface SlotLinesProps {
  grid: TimeGrid;
  day: TimeGridDay;
  slots: readonly TimeSlot[];
  width: number;
  withOffset: boolean;
}

const SlotLines: Component<SlotLinesProps> = (props) => (
  // Decoration that restates the day labels, so it is hidden from assistive
  // tech. A bare <g> has no tabindex.
  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a <g> with no tabindex is not focusable
  <g data-silkplot-slots="" aria-hidden="true">
    <For each={props.slots}>
      {(slot) => {
        const y = () => yOf(props.grid, props.day, epochMs(slot.start));
        return (
          <>
            <line
              data-silkplot-slot=""
              data-silkplot-slot-major={slot.major ? "" : undefined}
              x1={0}
              x2={props.width}
              y1={y()}
              y2={y()}
              stroke={cssVar("color-grid", tokens.color.grid)}
              stroke-width={slot.major ? 1 : 0.5}
            />
            {slot.major ? (
              <text
                x={Number.parseFloat(tokens.space.xs)}
                y={y() + Number.parseFloat(tokens.fontSize.xs)}
                fill={cssVar("color-muted", tokens.color.muted)}
                font-size={cssVar("font-xs", tokens.fontSize.xs)}
              >
                {formatClock(epochMs(slot.start), slot.start.timeZoneId, props.withOffset)}
              </text>
            ) : null}
          </>
        );
      }}
    </For>
  </g>
);

interface EventBlockProps {
  grid: TimeGrid;
  day: TimeGridDay;
  rect: EventRect;
  columnWidth: number;
  timeZone: string;
  withOffset: boolean;
}

const EventBlock: Component<EventBlockProps> = (props) => {
  const x = () => props.rect.x * props.columnWidth;
  const width = () => props.rect.width * props.columnWidth;
  const y = () => yOf(props.grid, props.day, props.rect.start);
  const height = () =>
    props.grid.positionOf(atDate(props.rect.end)) - props.grid.positionOf(atDate(props.rect.start));
  const channel = () => seriesChannel(channelIndex(props.rect.event.id));
  const name = () => eventName(props.rect, props.timeZone, props.withOffset);
  const showLabel = () => height() >= Number.parseFloat(tokens.fontSize.md);

  return (
    <g data-silkplot-event-group="">
      <rect
        data-silkplot-event={props.rect.event.id}
        data-silkplot-event-day={props.rect.day.toString()}
        class={FOCUS_CLASS}
        tabindex="0"
        aria-label={name()}
        x={x()}
        y={y()}
        width={width()}
        height={Math.max(height(), 0)}
        rx={Number.parseFloat(tokens.radius.sm)}
        fill={channel().color}
        stroke={cssVar("color-surface", tokens.color.surface)}
        stroke-width="1"
        stroke-dasharray={channel().dash}
      />
      {showLabel() ? (
        <text
          x={x() + Number.parseFloat(tokens.space.xs)}
          y={y() + Number.parseFloat(tokens.fontSize.xs) + Number.parseFloat(tokens.space.xs)}
          fill={cssVar("color-surface", tokens.color.surface)}
          font-size={cssVar("font-xs", tokens.fontSize.xs)}
          pointer-events="none"
        >
          {props.rect.event.title}
        </text>
      ) : null}
    </g>
  );
};
