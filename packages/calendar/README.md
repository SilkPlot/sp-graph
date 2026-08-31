<!-- markdownlint-disable MD013 -->
# @silkplot/calendar

Booking-calendar primitives for [SilkPlot](https://github.com/SilkPlot/sp-graph).

> **Implemented on `main`, not part of the current alpha publish set.** The
> package does not throw or advertise a stub, but it is deliberately absent
> from the current registry prerelease. See the repository
> [roadmap](https://github.com/SilkPlot/sp-graph/blob/main/ROADMAP.md).

The calendar is a first-class consumer of the same temporal foundation as the
charts: one time scale can feed a time-series chart, a day/week grid, or a
scrolling timeline. What exists today:

| Surface | State |
|---|---|
| Zoned geometry | `buildTimeGrid`, civil-time resolution, deterministic overlap lanes, and DST-aware week placement |
| Calendar views | Virtualized Canvas week, composed `CalendarWeek`, and ordered HTML `AgendaView` over the same events and empty slots |
| Density view | Binned, Canvas-rendered `CalendarHeatmap` with retained mark evidence |
| Pure seams | Exported paint, geometry, visibility, and mark-query helpers covered without a browser where possible |

Event placement is a deterministic interval-packing problem, not a physics
problem: `d3-force` is never the answer here. One IANA display zone and explicit
civil-time disambiguation govern the grid; Temporal stays at the calendar
boundary and `Date` is limited to the scale seam.

## Licence

Apache-2.0. Copyright 2026 SilkPlot.
