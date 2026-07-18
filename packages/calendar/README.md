<!-- markdownlint-disable MD013 -->
# @silkplot/calendar

Booking-calendar primitives for [SilkPlot](https://github.com/SilkPlot/sp-graph).

> **STUB — not part of the alpha release set, and deliberately not published.**
> `buildTimeGrid` is a typed placeholder that **throws**. A package whose public
> entry point advertises an implementation that throws would be a broken install,
> so this one is held back rather than shipped with a caveat in the README.

The calendar is a first-class consumer of the same temporal foundation as the
charts: one time scale can feed a time-series chart, a day/week grid, or a
scrolling timeline. What exists today:

| Export | State |
|---|---|
| `resolveEventLanes` | **real** — a thin wrapper over `packOverlaps` in `@silkplot/core`, which is done and unit-tested. Event `id` is the packer's tie-break key, so two events sharing an exact interval get a stable lane assignment keyed on identity rather than array position |
| `buildTimeGrid` | **throws** — slot generation, the `now` indicator, snap sizes, and visible-range virtualisation are roadmap work |

Event placement is a deterministic interval-packing problem, not a physics
problem: `d3-force` is never the answer here. Time zones and DST need explicit
product-level rules beyond what D3's time helpers give you on top of `Date`, and
that decision is not made yet.

## Licence

Apache-2.0. Copyright 2026 SilkPlot.
