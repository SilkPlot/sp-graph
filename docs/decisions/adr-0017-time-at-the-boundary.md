# ADR-0017 — Time at the boundary: `Date` public, epoch-ms canonical

- **Status:** Accepted
- **Date:** 2026-07-21

## Context

[ADR-0014 §3](adr-0014-interaction-and-viewport-contract.md) introduces a
controlled visible time domain typed as `{ start: Date; end: Date }`, and the
shipped active-point record ([ADR-0015](adr-0015-active-point-record-generalization.md))
already carries its active instant as `at.time: Date`. Series data has spoken
`Date` since [ADR-0008](adr-0008-series-and-state-contract.md): a `SeriesDatum`'s
`t` is a `Date`, and `fromRows` also accepts an ISO string. So the public surface
a caller touches — the data they pass, the active instant they read — is `Date`.

The engine underneath is not. [ADR-0007](adr-0007-layered-time-selection.md)'s
`time-scope` model states, in as many words, that "instants are epoch
milliseconds throughout," and every interval it computes — the global range, a
dynamic selection, a section window, the resolved effective domain — is a pair of
`number`s. That is the right representation to compute with: a number is
immutable, comparable, subtractable, and serializable, where a `Date` is mutable
(a shared `Date` someone calls `.setHours()` on is a bug that renders) and forces
a `.getTime()` at every arithmetic step.

One published type contradicts this split. `@silkplot/solid` exports
`TimeInterval = { start: number; end: number }` — the dashboard's range prop
(`<Dashboard range defaultRange onRangeChange>`), shipped in `0.2.0-next.1`. It is
a **public API that exposes the internal representation**: a caller hands
`<Dashboard>` epoch milliseconds while handing every other SilkPlot surface
`Date`s. It also collides by name with ADR-0014's `Date`-based `TimeInterval`:
two public types, one library, same name, different units — the footgun this
estate refuses everywhere else.

The controlled viewport work forces the question, because the viewport must
clamp against `resolveEffectiveDomain` (epoch-ms) while presenting a controlled
prop the ADR-0014 examples type as `Date`. Settling the representation once, now,
before P05/P06/P11 build more surface on the viewport type, is cheaper than
settling it after — and it is still alpha (`next`), so a correction costs nothing
a stable release has to carry.

## Decision

### 1. The rule: parse at the boundary, compute on one canonical type

**The public time surface speaks `Date`. The internal engine speaks epoch-ms
`number`. Conversion happens once, at the seam, and never leaks in either
direction.** This is the ordinary ports-and-adapters discipline applied to time,
and it is what the estate already does three-quarters of: series `t`, `fromRows`,
and `ActivePoint.at.time` are the public `Date` boundary; `time-scope` is the
epoch-ms core.

`Date` is the public boundary because it is the D3 idiom a "Solid + D3" library's
callers expect — `d3.scaleTime().domain([a, b])` takes `Date`s — and because it
is already every other SilkPlot surface's currency, so a caller hands the viewport
the same `Date`s they hand the series. Epoch-ms is the canonical internal type
because interval arithmetic — clamp, translate, scale-around-anchor, span-floor,
intersect — is plain number arithmetic on it, and because it is immutable where a
`Date` is not.

### 2. One public `TimeInterval`, `Date`-based, defined in `@silkplot/core`

```ts
export interface TimeInterval {
  start: Date;
  end: Date;
}
```

There is exactly one `TimeInterval` type in the public API, and it is this one. It
is defined in `@silkplot/core` beside the other pure public types, and both the
viewport (ADR-0014 §3) and the dashboard range prop use it. `core` already exports
`Date` on its public surface (`ActivePoint.at.time`), so the boundary type living
there is consistent rather than novel.

The internal epoch-ms interval remains a `{ start: number; end: number }` shape,
unexported or exported only where a computation genuinely needs the raw pair. The
public type never carries `number` instants and the internal math never carries
`Date`s.

### 3. The dashboard range prop is corrected to `Date` (breaking, 0.x)

`@silkplot/solid`'s `TimeInterval = { start: number; end: number }` is replaced by
the `Date`-based type above. `<Dashboard>`'s `range`, `defaultRange`, and
`onRangeChange`, and `DashboardTime.setRange`, now take and emit `Date` intervals.
`<DashboardSection>`'s `window` (a pair of instants) and `now` (an instant) become
`Date`s for the same reason; `last` stays a `number`, because it is a **duration**
in milliseconds, not an instant, and a duration is not a date. The conversion to
epoch-ms happens inside `createDashboardTime` and at the section's scope memo,
where they feed `resolveEffectiveDomain`; `DashboardTimeControl` continues to
compute drafts in epoch-ms (its `datetime-local` inputs are epoch-ms by nature)
and converts to `Date` only at the `setRange` call.

**This is a breaking change to a published prop**, and it is made deliberately
rather than worked around, on the same grounds as [ADR-0003](adr-0003-reactive-data-input.md)'s
accessor change: it corrects a published 0.x surface a registry cannot quietly
fix, it is mechanical for a caller (`{ start: new Date(a), end: new Date(b) }`
instead of `{ start: a, end: b }`), and deferring it means every downstream
interaction phase inherits two `TimeInterval`s with different units. The
[migration](../migrations/time-interval-date-0.x.md) states exactly what a caller
changes.

### 4. The viewport model is epoch-ms; the boundary is at the reactive holder

The pure viewport computations (`@silkplot/core`) operate on epoch-ms
intervals, so they compose with `resolveEffectiveDomain` and the effective-domain
clamp bound with zero conversion. The reactive holder in `@silkplot/solid` is the
seam: it accepts the controlled `Date` `TimeInterval`, converts in, drives the
epoch-ms model, and converts the epoch-ms result back to a `Date` `TimeInterval`
for `onVisibleDomainChange`. A caller never sees a `number` instant; the model
never sees a `Date`.

### 5. This is not zoned civil time

Every interval here is a pair of absolute instants, exactly as ADR-0007 and
ADR-0014 leave it. A `Date` at the boundary is an instant, not a civil
date-in-a-zone; anything that looks like a time-zone answer is an instant answer
that resembles one. Zoned civil time remains the calendar work's problem, and a
display zone remains the application's, as `DashboardTimeControl` already records
for its `datetime-local` inputs.

## Alternatives

- **Two differently-named public interval types** — a `Date` viewport
  `TimeInterval` and the existing epoch-ms dashboard interval under another name.
  Rejected: it keeps the representation-leaking prop, doubles the interval
  vocabulary, and asks a caller composing a dashboard with an interactive chart to
  hold two interval types in different units. One correction removes both problems.
- **Unify everything on epoch-ms** — make the viewport prop, and the whole public
  surface, `number`-based. Rejected: it contradicts the already-shipped
  `Date`-based series data and `ActivePoint.at.time`, it forces an edit to
  ADR-0014's typed examples (which are contractually required to compile
  *unchanged* once imported — an edit would signal the implementation diverged
  from the decision, which is not what happened here), and it exposes the internal
  representation on the public API rather than hiding it.
- **Accept `Date | number | string` at the boundary and normalize** — the maximally
  ergonomic parse-at-the-boundary form, and what `fromRows` does for series input.
  Rejected *for the interval type* only: the ADR-0014 examples type the interval as
  strict `Date`, and a union would not compile them unchanged. A convenience
  overload can be added later without changing the canonical type; it is additive.
- **Leave the dashboard prop as epoch-ms and never converge** — rejected. It is the
  representation-leak this ADR exists to close, and it is only cheap to close while
  it is still alpha.

## Consequences

- One `TimeInterval` in the public API, `Date`-based, in `@silkplot/core`; the
  whole public time surface (series `t`, `ActivePoint.at.time`, dashboard range,
  visible viewport) now speaks one language, and the whole internal engine speaks
  epoch-ms.
- `<Dashboard>` callers pass `Date` intervals; the prior epoch-ms form is a
  one-line change per call site, documented in the migration. The visible surface
  of the break is small because the dashboard is young.
- The viewport model stays pure epoch-ms and clamps against the effective domain
  with no conversion; the only conversion in the whole time path is at the solid
  reactive holder and at `createDashboardTime`.
- `DashboardTimeControl` is unaffected in behaviour: it already works in epoch-ms
  and only gains a `new Date(...)` at the single `setRange` call.
- The obligation on ADR-0014's typed examples is preserved: when the viewport
  surface ships, the `TimeInterval` and `ViewportCause` declarations become imports
  and compile unchanged, because this decision fixes their shape to exactly what
  the examples declare.

## Migration

[Time interval → `Date` (0.x, breaking)](../migrations/time-interval-date-0.x.md)
— what a `<Dashboard>` caller changes, and why the break is deliberate.

Up: [Decisions](index.md)
