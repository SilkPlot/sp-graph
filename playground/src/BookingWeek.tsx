/**
 * Thin host for the week-grid demo. The playground owns the dataset and calls
 * `buildTimeGrid` + `resolveEventLanes`; `WeekGrid` only consumes the results.
 *
 * Deterministic clinic week in America/New_York: named rooms, overlapping
 * appointments, one overnight lock-in, and the US spring-forward Sunday.
 * No Math.random.
 */
import { createMemo, type Component } from "solid-js";
import { Temporal } from "temporal-polyfill";
import {
  WeekGrid,
  buildTimeGrid,
  resolveEventLanes,
  type CalendarEvent,
} from "@silkplot/calendar";
import { cssVar } from "@silkplot/theme";

const NY = "America/New_York";
const WEEK_START = { year: 2026, month: 3, day: 2 } as const;

function zoned(
  civil: { year: number; month: number; day: number },
  hour: number,
  minute = 0,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from({ ...civil, timeZone: NY, hour, minute });
}

function ev(
  id: string,
  title: string,
  start: Temporal.ZonedDateTime,
  end: Temporal.ZonedDateTime,
): CalendarEvent {
  return { id, title, start: start.epochMilliseconds, end: end.epochMilliseconds };
}

/** Realistic booking week — rooms and practitioners encoded in the title. */
function clinicWeek(): CalendarEvent[] {
  const mon = WEEK_START;
  const tue = { year: 2026, month: 3, day: 3 } as const;
  const wed = { year: 2026, month: 3, day: 4 } as const;
  const thu = { year: 2026, month: 3, day: 5 } as const;
  const fri = { year: 2026, month: 3, day: 6 } as const;
  const sat = { year: 2026, month: 3, day: 7 } as const;
  const sun = { year: 2026, month: 3, day: 8 } as const;

  return [
    ev("mon-chen-consult", "Consult A · Dr. Chen", zoned(mon, 9), zoned(mon, 9, 45)),
    ev("mon-okonkwo-new", "Consult A · Dr. Okonkwo", zoned(mon, 10), zoned(mon, 11)),
    ev("mon-maya-physio", "Treatment 1 · Maya", zoned(mon, 11), zoned(mon, 12)),
    ev("mon-chen-follow", "Consult A · Dr. Chen", zoned(mon, 14), zoned(mon, 14, 30)),
    ev("tue-maya-am", "Treatment 2 · Maya", zoned(tue, 8, 30), zoned(tue, 9, 30)),
    ev("tue-chen-overlap", "Consult A · Dr. Chen", zoned(tue, 9), zoned(tue, 10)),
    ev("tue-okonkwo-overlap", "Consult A · Dr. Okonkwo", zoned(tue, 9, 15), zoned(tue, 10, 15)),
    ev("wed-cluster-a", "Treatment 1 · Maya", zoned(wed, 9), zoned(wed, 11)),
    ev("wed-cluster-b", "Treatment 2 · Dr. Chen", zoned(wed, 9, 30), zoned(wed, 11, 30)),
    ev("wed-cluster-c", "Consult A · Dr. Okonkwo", zoned(wed, 10), zoned(wed, 12)),
    ev("wed-cluster-d", "Consult A · walk-in", zoned(wed, 10, 15), zoned(wed, 11)),
    ev("thu-chen-am", "Consult A · Dr. Chen", zoned(thu, 8), zoned(thu, 9)),
    ev("thu-maya-pm", "Treatment 1 · Maya", zoned(thu, 15), zoned(thu, 16, 30)),
    ev("fri-okonkwo", "Consult A · Dr. Okonkwo", zoned(fri, 11), zoned(fri, 12)),
    ev("overnight-lockin", "Treatment 2 · overnight lock-in", zoned(fri, 22), zoned(sat, 6)),
    ev("sat-maya", "Treatment 1 · Maya", zoned(sat, 10), zoned(sat, 11, 30)),
    ev("sun-post-gap", "Treatment 1 · Maya", zoned(sun, 9), zoned(sun, 10)),
    ev("sun-chen", "Consult A · Dr. Chen", zoned(sun, 11), zoned(sun, 11, 45)),
  ];
}

export const BookingWeek: Component = () => {
  const model = createMemo(() => {
    const start = zoned(WEEK_START, 0);
    const grid = buildTimeGrid({
      start: start.toInstant(),
      end: start.add({ days: 7 }).toInstant(),
      slotMinutes: 60,
      axisLength: 1670,
      timeZone: NY,
      weekStart: 1,
    });
    return { grid, rects: resolveEventLanes(clinicWeek(), grid) };
  });

  return (
    <div
      data-silkplot-booking-week=""
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        background: cssVar("color-surface"),
      }}
    >
      <WeekGrid
        grid={model().grid}
        rects={model().rects}
        width={760}
        title="North clinic, week of 2 March 2026, America/New_York"
        desc="Sunday 8 March is the US spring-forward day: 23 elapsed hours, no 02:00 slot. Wednesday holds a four-appointment overlap cluster. Friday 22:00 to Saturday 06:00 is an overnight lock-in split across two columns."
      />
    </div>
  );
};
