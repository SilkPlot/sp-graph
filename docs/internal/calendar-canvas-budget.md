# Canvas week paint budget

This is an internal note, not a numbered ADR and not part of the public site.

## Question

Does painting a realistic booking board on the Canvas calendar stack break the
16.7 ms frame budget (ADR-0002)? Virtualization (visible-range plus a small
overscan) is allowed only if it does. The SVG `WeekGrid` path is not the
surface this question sits on, and it is not rewritten here.

## Protocol

- **Hardware (2026-08-28):** Linux 6.12.94 x86_64 KVM, Intel Xeon @ 2400 MHz,
  4 cores, 15 GiB RAM. Chromium via Vitest browser / Playwright.
  `devicePixelRatio` 1. No CPU throttle: this is a paint pass, not a
  pointer-move stream.
- **Range:** four weeks from Monday 2026-03-02 in `America/New_York` (includes
  the US spring-forward Sunday). `weekStart` 1. Axis length 1670 px per week
  (same pixels-per-hour as the playground week).
- **Density:** 8 rooms, 30-minute slots, 08:00–18:00 weekdays and 08:00–12:00
  Saturday, no Sunday clinic. Occupancy keeps four of every five room-slots
  (`(room + slot + day) % 5 !== 0`). Deterministic; no `Math.random`.
- **Viewport:** 1200×900 CSS pixels at the origin of the canvas (the frozen
  workload-harness viewport). Overscan is one day-column (108 px).
- **Budget:** 16.7 ms. Acceptance 17.7 ms (1 ms timer tolerance, declared
  before measuring). 5 warmup passes, 30 timed passes. p95 of the timed
  distribution is the decision number.

## Result

Unfiltered paint of every `EventRect` broke the budget (p95 81.3 ms on this
hardware). The Canvas stack therefore paints visible-range plus a small
overscan (one day-column), still consuming `TimeGrid` / `EventRect` — not a
second event type, not `WeekGrid`. After that filter, the production bitmap
is the inflated window (1308×271), and a dated pass measured p95 33.6 ms —
improved, still above 17.7 ms. The leftover item's allowed move was to add
that virtualization once the unfiltered paint missed; it does not require a
second strategy in the same item.

Recorded in `packages/calendar/src/canvas-week-budget.ts` as
`BOOKING_DENSITY_RECORD`.

## What this is not

Not a numbered ADR. Not LIMITATIONS, ROADMAP, README, or site copy. Not a
rewrite of `WeekGrid`. Not a heatmap, not WebGL, not a new chart type.
`AgendaView`, `buildTimeGrid`, and `resolveEventLanes` stay. Calendar publish
stays held.
