# ADR-0024 — Zoned civil time for calendar grids

- **Status:** Proposed
- **Date:** 2026-08-25

## Context

Cartesian time in this library is already settled: the public surface speaks
`Date`, the engine speaks epoch-ms, and conversion happens at the seam
([ADR-0017](adr-0017-time-at-the-boundary.md)). ADR-0017 is explicit that this
is a pair of **absolute instants**, not zoned civil time, and that a display
zone remains the application's problem for those surfaces.

A booking grid is a different surface. "09:00 at the venue" is a wall-clock
commitment in a named zone. ECMAScript `Date` cannot represent an arbitrary
IANA zone; it exposes UTC and the host local zone only. D3 time scales
understand local and UTC, not a chosen venue zone. If calendar layout is
implemented against `Date` and host-local days, the implementation *is* the
time-semantics decision: every day looks like 24 hours, DST gaps coerce, folds
collapse, and the viewer's laptop zone silently becomes the booking axis.

This decision records the library contract for a future calendar grid **before
any grid is built**. It does not change Cartesian charts, dashboards, or
viewport types. It does not ship a calendar package.

## Decision

### 1. The grid is zoned civil time, one IANA display zone per view

A booking grid is parameterised by one explicit **IANA time zone** (normally
the venue). Civil date/time in that zone is the semantic truth. UTC instants
are derived from it, not the other way around.

The runner-up — UTC instants plus a separate display-zone setting — is for
products that already store authoritative instants (telemetry, cross-zone
meetings). A venue booking calendar is the opposite: the wall-clock promise
is the product.

Cartesian surfaces stay on ADR-0017. This ADR does not reopen `TimeInterval`,
series `t`, or dashboard range.

### 2. DST days render elapsed time, not a decorative 24-row table

In the display zone:

- a spring-forward day is **23 elapsed hours**. The missing local hour is not
  a selectable slot.
- a fall-back day is **25 elapsed hours**. The repeated hour appears twice,
  ordered by instant, and the two occurrences are labelled by offset or zone
  (for example `01:30 BST` and `01:30 GMT`).

A uniform 24-row wall-clock grid is rejected as the default booking axis.
A 24-row drawing may be used only for a read-only overview that cannot
create, resize, or otherwise target a booking on that axis. Any view that
creates or resizes on the axis must use elapsed-time geometry.

Creation defaults: **reject a civil time that falls in a gap**; **do not pick
a fold silently**. If the pointer or keyboard target already identifies the
earlier or later occurrence, emit that instant. If it does not, surface the
ambiguity. Compatible/coerce behaviour is a documented adapter, not the
default.

### 3. Temporal at the calendar boundary; `Date` only at the D3 seam

The calendar contract requires Temporal-compatible types
(`Instant`, `PlainDateTime`, `ZonedDateTime`, and Temporal's
`earlier` / `later` / `compatible` / `reject` disambiguation) when the
package is implemented. Native Temporal or a polyfill is acceptable.
Conversion to `Date` or numeric timestamps will happen only where D3 must
consume a scale domain.

New booking-grid semantics will not be designed around raw `Date`. Waiting
for every browser to ship native Temporal is not a reason to delay the
*model*. The package is a stub today; this section is the contract, not a
description of shipped code.

### 4. The library owns grid meaning; the application owns booking validity

Once the caller supplies a display zone, a week-start rule, an optional
service-day anchor, and either exact instants or explicit wall-clock values
plus a disambiguation policy, the **contract requires** deterministic
coordinates and honest gap/fold signalling. That is the implementation
obligation. It is not a claim that unbuilt code already meets it.

A **service-day anchor** is an application-supplied rule that a civil
interval crossing midnight still belongs to the starting civil day (for
example Friday 17:00–Saturday 02:15 counted as Friday night). The default
is calendar midnight in the display zone. A crossing service-day is an
application opt-in, not a hidden calendar law.

The library does **not** own venue rules, buffers, opening hours, whether a
fold is bookable, or backend confirmation. It will emit precise suggestions,
not authority. Accepting this ADR does not flip live LIMITATIONS, the
package-matrix Stub row, or the public calendar stub claim.

Week start is an explicit input (or a locale adapter outside the core). The
maths layer will not silently read the runtime locale. Offset-less ISO
date-time strings are not a primary public API for timed bookings.

### 5. This ADR ships no implementation

Accepting this ADR does not publish `@silkplot/calendar`, `buildTimeGrid`, or
a week view. The calendar package remains a stub until a later, separately
signed phase implements against this contract.

When that implementation lands, CI must include at least one non-UTC zone
so the contract is verified off the author's laptop. That one-zone matrix
is a **floor only**. It does not, by itself, verify spring-forward or
fall-back geometry. Transition-day cases (23h gap, 25h fold) are a separate
implement-time requirement and must not be quoted as already evidenced by
the floor matrix.

## Alternatives

- **Host-local `Date` + D3 local time as the grid.** Rejected: the viewer's
  device zone becomes the booking axis; DST days are 24 equal hours by
  accident; named venue zones are unrepresentable.
- **UTC instants only, format at the edge.** Rejected for venue booking: a
  later tzdb or DST rule change would move "09:00 local" when the product
  meant a civil time.
- **Uniform 24-row days for visual regularity.** Rejected as the default
  booking axis. Duration comparisons become false on transition days, and
  creation targeting in a gap or fold becomes a silent coerce.
- **Wait for native Temporal everywhere before deciding.** Rejected: the
  model and the runtime path are different questions. The model is decided
  now; a polyfill is an acceptable runtime until Baseline coverage exists.
- **Library embeds booking rules.** Rejected: this remains a visualisation
  library. Validity stays with the application and its backend.

## Consequences

- A future calendar grid has a written contract: named display zone, truthful
  DST geometry, Temporal at the boundary, `Date` at D3 only, no silent
  locale or offset-less parse.
- ADR-0017 remains the Cartesian rule. Callers of charts and dashboards see
  no change.
- Implementation, week view, and any public calendar API are later work.
  This file is the decision, not the code.
