/**
 * Calendar heatmap binning — onto landed `buildTimeGrid` days and slots.
 *
 * Clock keys and civil dates come from Temporal fields on the grid, never from
 * the runtime timezone, so CI's TZ=America/New_York cannot rewrite identity.
 */
import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import {
  assignTimeGridCell,
  binOntoTimeGrid,
  clockKey,
  timeGridColumns,
  timeGridRows,
} from "../src/calendar-heatmap-bin";
import { buildTimeGrid, type TimeGrid } from "../src/time-grid";

const NY = "America/New_York";
const WEEK_START = { year: 2026, month: 3, day: 2 } as const;

function zoned(
  civil: { year: number; month: number; day: number },
  hour: number,
  minute = 0,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from({ ...civil, timeZone: NY, hour, minute });
}

function clinicGrid(): TimeGrid {
  const start = zoned(WEEK_START, 0);
  return buildTimeGrid({
    start: start.toInstant(),
    end: start.add({ days: 7 }).toInstant(),
    slotMinutes: 60,
    axisLength: 400,
    timeZone: NY,
    weekStart: 1,
  });
}

describe("time-grid keys", () => {
  it("takes columns from grid.days and rows from unique slot clocks", () => {
    const grid = clinicGrid();
    expect(timeGridColumns(grid)).toEqual(grid.days.map((day) => day.date.toString()));
    expect(timeGridRows(grid)[0]).toBe(clockKey(grid.slots[0]!.start));
    expect(timeGridRows(grid)).toContain("09:00");
  });

  it("clockKey is hour:minute from the zoned slot, not the host locale", () => {
    const slot = zoned(WEEK_START, 9);
    expect(clockKey(slot)).toBe("09:00");
    expect(clockKey(zoned(WEEK_START, 0, 30))).toBe("00:30");
  });
});

describe("assignTimeGridCell", () => {
  it("places an instant on the day and slot that contain it", () => {
    const grid = clinicGrid();
    const at = zoned({ year: 2026, month: 3, day: 3 }, 9);
    const cell = assignTimeGridCell(grid, at.epochMilliseconds);
    expect(cell).toEqual({ column: "2026-03-03", row: "09:00" });
  });

  it("drops an instant outside the grid", () => {
    const grid = clinicGrid();
    const before = zoned({ year: 2026, month: 3, day: 1 }, 12);
    const after = zoned({ year: 2026, month: 3, day: 10 }, 12);
    expect(assignTimeGridCell(grid, before.epochMilliseconds)).toBeUndefined();
    expect(assignTimeGridCell(grid, after.epochMilliseconds)).toBeUndefined();
  });
});

describe("binOntoTimeGrid", () => {
  it("aggregates onto the same complete day × clock grid", () => {
    const grid = clinicGrid();
    const packed = binOntoTimeGrid(grid, [
      { time: zoned(WEEK_START, 9).epochMilliseconds, value: 2 },
      { time: zoned(WEEK_START, 9, 15).epochMilliseconds, value: 3 },
      { time: zoned({ year: 2026, month: 3, day: 3 }, 9).epochMilliseconds },
    ]);
    expect(packed.columns).toEqual(timeGridColumns(grid));
    expect(packed.rows).toEqual(timeGridRows(grid));
    const mondayNine = packed.bins.find((bin) => bin.column === "2026-03-02" && bin.row === "09:00");
    const tuesdayNine = packed.bins.find((bin) => bin.column === "2026-03-03" && bin.row === "09:00");
    expect(mondayNine?.value).toBe(5);
    expect(tuesdayNine?.value).toBe(1);
    expect(packed.bins.some((bin) => bin.value === 0)).toBe(true);
  });

  it("skips a non-finite instant", () => {
    const grid = clinicGrid();
    const packed = binOntoTimeGrid(grid, [{ time: Number.NaN, value: 4 }]);
    expect(packed.bins.every((bin) => bin.value === 0)).toBe(true);
  });
});
