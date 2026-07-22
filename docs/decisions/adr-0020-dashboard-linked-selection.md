# ADR-0020 — Dashboard-linked drag selection

- **Status:** Accepted
- **Date:** 2026-07-22

## Context

A dashboard shares one time scope across its charts. [ADR-0007](adr-0007-layered-time-selection.md)
defined three scopes with a total precedence — **section > dynamic > global** —
and named the *dynamic selection* as "the range a drag on one chart produces",
but the dashboard model shipped in Sprint 009 wired only global and section. The
dynamic selection was left for this sprint, because it needs gesture capture
([ADR-0018](adr-0018-viewport-gesture-bindings.md)) and a controlled visible
domain ([ADR-0014](adr-0014-interaction-and-viewport-contract.md)), both built in
Sprint 007. This ADR wires it: a drag — or a keypress — on one chart sets the
shared dynamic selection, and every member the precedence rule says should follow,
does.

## Decision

### 1. The dynamic selection is dashboard-owned state

`DashboardTime` gains a `dynamic` accessor and a `setDynamic(interval | undefined)`
setter. It is dashboard state, not a prop: a drag is a transient view choice,
distinct from the global range an application persists and controls. `resolve`
now passes `dynamic` to the model, whose precedence and clamping are already
unit-tested — the selection is clamped to the global range by the resolver, not
by a second copy of the clamp here.

Setting a new **global range clears the dynamic selection**: the old drag lived
inside the previous range and would otherwise clamp to a stale sliver of the new
one. That is also the recovery route — returning to the whole global range without
a reload.

### 2. Inside a dashboard, a member's gestures drive the shared selection

A standalone chart's gestures drive its own viewport. **An unsectioned dashboard
member's gestures drive the shared dynamic selection instead** — the same brush,
the same keyboard pan/zoom, now committing out through `setDynamic`. So input
parity is free: every outcome a drag reaches, the keyboard reaches, because both
drive one viewport.

This is implemented as a **separate, dashboard-linked viewport** the scope hands
to the gestures: controlled by the member's effective domain, bounded by the
global range, with every commit routed to `setDynamic`. The chart's DISPLAY still
comes from the scope's effective-domain path (unchanged since P04b) — this
viewport exists to route input, not to draw, which is what keeps the change from
disturbing what every existing dashboard renders.

A **sectioned member is isolated**: a section's scope is declared by the
application, not dragged, so a member inside a section drives its own viewport and
the section keeps its scope regardless of the shared selection (precedence:
section > dynamic). This is the P04b deferral discharged for the unsectioned case;
the sectioned-viewport-within-a-dashboard remains its own future concern.

### 3. A click is not a selection, and the announcement is once, on settle

A press and release without moving past the brush's min-travel threshold
([ADR-0018](adr-0018-viewport-gesture-bindings.md) §3) commits nothing — a click
on a chart is not a request for a zero-width selection. The settled selection is
announced **once**, through a polite live region on the dashboard, because
`setDynamic` fires once per settle — a brush on release, a keyboard step on the
press — not per pointer move. The wording is the application's (defaulting to an
ISO range); the dashboard cannot know whether its axis is bookings or degrees.

## Alternatives

- **Route only the brush to `setDynamic`, and offer the keyboard through a
  separate `RangeControl`** — rejected. It splits one interaction across two
  mechanisms and makes keyboard parity a control the application must remember to
  place, where driving one viewport gives the parity for free.
- **Make the drag write the global RANGE** — rejected. The global range is
  application-persisted state; a transient drag must not overwrite it, and doing
  so would move sectioned members too (a section intersects the global range),
  breaking the isolation the precedence rule exists to provide.
- **Reset the dynamic selection on every data change** — rejected. Only a global
  RANGE change clears it; a data replacement inside the same range leaves the
  reader's selection where they put it.
- **Announce during the drag** — rejected. It floods the live region; the settle
  is the event worth speaking.

## Consequences

- The dynamic selection completes ADR-0007's three-scope model in the reactive
  layer; the precedence and clamping stay the resolver's, tested once.
- A dashboard member now has a purpose for its gestures that P04b left it without:
  driving the shared selection rather than a per-chart viewport that a dashboard
  did not apply.
- The display path is untouched, so every existing dashboard renders exactly as
  before; only input gains an effect.
- Autoscale-to-y is a standalone-only effect: inside a dashboard the display y
  follows the effective-domain data, and the `a` key's snapshot on the linked
  viewport is not read by the display. A dashboard member does not autoscale y.
- Sectioned-member navigation, cross-dashboard linking, and y-axis or axis-strip
  selection remain out of scope, recorded here so they are not "corrected" later.

Up: [Decisions](index.md)
