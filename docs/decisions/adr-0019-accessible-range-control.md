# ADR-0019 — The accessible range control

- **Status:** Accepted
- **Date:** 2026-07-22

## Context

The viewport can be navigated by keyboard, wheel, and drag
([ADR-0018](adr-0018-viewport-gesture-bindings.md)), but a gesture's *current
extent is invisible* — a reader cannot see how much of the data they are looking
at, and a touch user has no visible affordance to grab. The MVP workload needs a
visible, touch-usable range control alongside the gestures. This ADR fixes the
shape of that control: what it exposes to assistive technology, how its keys
work, and how it connects to the viewport it drives.

The viewport model already exists ([ADR-0014](adr-0014-interaction-and-viewport-contract.md)
§3) and is controllable from outside. The control must be a **view and input
adapter over that domain, never a second authority** — it reads the visible
domain and the full extent, and writes the visible domain, and holds no state of
its own.

## Decision

### 1. Two sliders and a window — the dual-thumb pattern

The control exposes **three `role="slider"` elements** on one horizontal track
whose full width is the data's full time extent:

- a **start handle** (`aria-valuenow` = the window's start instant),
- an **end handle** (the window's end instant),
- a **window body** between them (`aria-valuenow` = the window's start), which
  moves the whole window.

Each is a real slider — `aria-orientation="horizontal"`, `aria-valuemin` /
`aria-valuemax` bounding where that thumb may go, `aria-valuenow` the instant in
epoch ms, and `aria-valuetext` the human-readable time the application supplies.
The three are tab stops in order **window → start → end**, wrapped in a labelled
group.

The dual-thumb pattern is the established accessible range control — a screen
reader announces each thumb's value as it moves, with no custom mode a reader has
to learn. A single slider whose value is the window and whose *resize* hides
behind a modifier was rejected: a reader is told the value changed but not that
they resized, and resize is the control's primary job.

### 2. The keyboard

Each handle is a standard slider:

| Key | Start / end handle | Window body |
|---|---|---|
| `ArrowLeft` / `ArrowRight` | move this edge by a fine step | pan by a fine step |
| `PageUp` / `PageDown` | move this edge by a coarse step | pan by a coarse step |
| `Home` / `End` | to this edge's own limit | window flush left / right |
| `0` | — | reset to the full extent |

A handle cannot cross the other past the **minimum span** (ADR-0014 §3): the start
handle's max is `end − minSpan`, the end handle's min is `start + minSpan`. The
window body pans at a fixed span, sliding flush against an extent edge rather than
widening past it. The fine step is 1% of the full extent and the coarse step 10% —
engineering policy, not researched constants, sized so a fine press makes a
visible move and a coarse press crosses the overview in ten. `Escape` is left
alone; the control traps no key it does not claim, so Tab always leaves.

### 3. Controlled props — one authority

The control takes the viewport as **controlled props**, the same surface a chart
takes ([ADR-0014](adr-0014-interaction-and-viewport-contract.md) §3): `fullExtent`
and `visibleDomain` in, `onVisibleDomainChange(domain, "range-control")` out,
plus `minSpan`. An application owns the visible-domain state and wires **both** the
chart and the control to it, so there is exactly one viewport authority and the
two surfaces cannot drift. The control creates no `createViewport` of its own — it
computes each move with `@silkplot/core`'s interval arithmetic
(`clampInterval`, `slideIntoBound`, `applyMinSpan`) and emits the result.

Auto-wiring through a shared context was rejected for P06: it would put the
control inside the chart's own reactive subtree and make the coupling implicit,
where the controlled-props form keeps the single authority visible in the
application's own code.

### 4. Target size, focus, motion, and the optional density drawing

Handles and the window body are **≥24 CSS px** hit targets
([ADR-0011](adr-0011-legend-toolbar-and-target-size.md), WCAG 2.2 SC 2.5.8),
honoured by construction even when a handle is drawn as a thin bar. Focus is a
token-driven `:focus-visible` ring, not `outline: none`
([ADR-0005](adr-0005-accessibility-contract.md) §5). A `aria-valuetext` change is
the announcement — the slider role speaks it natively, so no second live region
doubles it.

A **miniature density drawing of the data is optional and off by default**: the
control is a slot the application may fill, and it is `aria-hidden` because the
data alternative already carries the values (ADR-0005). The control is fully
usable — sized, labelled, operable — with the track empty.

### 5. Per-event and per-frame budget

The control obeys [ADR-0014](adr-0014-interaction-and-viewport-contract.md) §7:
one commit per `requestAnimationFrame` during a drag, one settle callback on
release or cancel, a cached track rect invalidated on resize and scroll, pointer
capture released and listeners removed on unmount, and nothing touched at module
load so a server render reaches none of it.

## Alternatives

- **A single window slider with modified-key resize** — rejected (§1): resize is
  the control's main job and must be a first-class, announced action.
- **Auto-wiring via a shared viewport context** — rejected for now (§3): it hides
  the single authority inside the chart's subtree; the controlled-props form keeps
  it explicit. A context convenience can be added later without changing this.
- **A required density minimap** — rejected (§4): it is decorative duplication of
  the data alternative and must never be load-bearing for operability.
- **44 px targets (SC 2.5.5, AAA)** — rejected as the default, consistent with
  ADR-0011; 24 px is the AA floor honoured here.

## Consequences

- The control is a pure view+input adapter: it holds no viewport state, so it
  cannot drift from the chart, and both are driven by one application-owned domain.
- Three sliders is more tab stops than a single control, which is the cost of the
  standard dual-thumb semantics a reader already knows.
- The interval arithmetic is `@silkplot/core`'s, shared with the viewport model,
  so a handle drag clamps and floors exactly as a gesture does.
- Fetching, date pickers, and application query controls stay the application's
  ([ADR-0014](adr-0014-interaction-and-viewport-contract.md) §8); this control
  moves the visible window and nothing else.

Up: [Decisions](index.md)
