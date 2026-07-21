# Migration — interaction and viewport (0.x, additive)

**This change breaks nothing.** Every prop and type it introduces is new and
optional. A chart that passes none of them behaves exactly as it does today: it
draws its full time extent, a keyboard steps through it, and no pointer, wheel,
or gesture is captured. There is no code you *have* to change.

It implements [ADR-0014](../decisions/adr-0014-interaction-and-viewport-contract.md).
Read that for the reasoning; this file is how you adopt the surface, and what
each default does if you leave it alone.

> **This is the adoption guide for a contract, written as the contract is
> settled and ahead of the components that ship it.** The props and imports below
> are the surface those components land, in stages; each becomes available with
> the phase that builds it, exactly as the contract's typed examples are declared
> now and imported when built. Until then, treat the code blocks as the shape you
> are adopting toward, not as imports that already resolve.

## What is new, in one sentence

A chart can now be inspected with a pointer and navigated through time — one
active-datum record shared by cursor, tooltip, and announcement, and one visible
interval shared by axes, marks, references, and a range control — all behind
opt-in props whose defaults never touch the page's scroll or focus.

## The defaults, if you add nothing

| Surface | Default behaviour |
|---|---|
| Pointer hover | an informative chart inspects on hover ([ADR-0016](../decisions/adr-0016-composed-chart-inspection.md)) — crosshair, active mark, and announcement; a tooltip **card** renders only if you pass `tooltip`. `pointer={false}` opts out |
| Wheel over the chart | scrolls the **page** — never zooms unless you opt in |
| Touch drag | scrolls the **page** |
| Visible interval | the full data extent; no zoom or pan state |
| Keyboard | steps the active datum, exactly as today |

Opting in is additive at every step. You never lose the safe default by
accident; you ask for each capability by name.

## Inspecting: the active-datum record

One record is written by pointer, touch, and keyboard alike, and read by every
surface that reacts to what is active:

```ts
import type { ActivePoint } from "@silkplot/core";
```

It is generic over its **datum** ([ADR-0015](../decisions/adr-0015-active-point-record-generalization.md)),
so it serves every family from one shape: a time chart yields
`ActivePoint<SeriesDatum<M>>` with `at.kind: "time"`, a scatter yields
`ActivePoint<XYPoint>` with `at.kind: "value"`, a ranked bar yields
`ActivePoint<RankedCategory>` with `at.kind: "category"`. It carries the series
id, the caller's own `sourceIndex`, the datum in that family's own shape, the
inner-coordinate `position` the cursor and tooltip draw at, the active
instant/point/category, and — for a time chart — every visible series' value at
that instant. Your metadata type flows through the time family's datum:

```tsx
<LineChart
  series={series}
  title="Inlet temperature"
  // A render-prop for the tooltip card (ADR-0016 §1): you own the content, the
  // library owns the geometry and confinement. Omit it and hover still moves the
  // crosshair and announces.
  tooltip={(active) => <b>{active.datum.meta?.serial}: {active.datum.y}</b>}
  onActivePointChange={(active) => {
    if (active === undefined) return;            // clearing is `undefined`
    const serial = active.datum.meta?.serial;    // your type, no cast
  }}
/>
```

`onActivePointChange` fires on a committed change — a keyboard step, a snapped
hover — not on every raw pointer sample, per
[ADR-0005](../decisions/adr-0005-accessibility-contract.md) §4. Clearing the
active point passes `undefined`; there is no sentinel record to special-case. It
is distinct from a drill-down **commit** (`onActivate`, Enter/Space/click), which
is the user acting rather than the cursor moving.

## Navigating: the controlled viewport

The visible time interval follows the same controlled/uncontrolled pattern
visibility already uses ([ADR-0008](../decisions/adr-0008-series-and-state-contract.md)
§6). Leave it out and the chart owns it:

```tsx
// Uncontrolled — the chart navigates itself, starting at the full extent.
<LineChart series={series} title="…" wheelZoom brushSelect />
```

Lift it out when a dashboard, a URL, or a shared control needs to own it:

```tsx
<LineChart
  series={series}
  title="…"
  visibleDomain={domain()}
  defaultVisibleDomain={fullRange}
  minSpan={60_000}                               // never zoom below one minute
  onVisibleDomainChange={(next, cause) => {
    if (cause === "resize" || cause === "clamp") return; // ignore non-navigation
    setDomain(next);
  }}
/>
```

Three things worth knowing before you wire it:

- **Handing `undefined` back to `visibleDomain` reverts to uncontrolled.** It is
  not "show everything" — the same rule as `visibleSeries`.
- **The `cause` is there so you do not loop.** A controlled caller that feeds the
  same interval back would otherwise chase its own echo; read the cause and
  ignore the ones you did not initiate.
- **Inside a `<Dashboard>`, the viewport is bounded by the resolved effective
  domain**, not the raw data extent — a member cannot navigate out of the range
  the dashboard selected, and `reset` returns to that scope.

## The gestures, and why zoom needs a modifier

Once enabled:

- **Drag** across the plot brushes an interval; on release it zooms the chart, or
  sets the dashboard's shared selection when composed.
- **`Ctrl`/`Cmd` + wheel** zooms, anchored under the pointer. Plain wheel is left
  to the page. Choosing the modifier is also what makes **trackpad pinch-to-zoom
  work for free** — a browser reports it as a wheel event carrying `ctrlKey`.
- **Pinch** on a touch screen zooms on the gesture's midpoint.
- **The keyboard** reaches pan, zoom, autoscale, and reset through keys distinct
  from the datum-stepping arrows. `Escape` still clears the active point and
  never doubles as a viewport reset.

If you genuinely want a single full-bleed chart to capture **plain** wheel, say
so explicitly — it is the one place this trades page scroll for zoom, and it is
never the default, because the default has to stay safe on a scrollable dashboard
of many charts.

## Rendering your own controls

Zoom-in, zoom-out, autoscale, and reset are exposed as callable commands, so an
application renders its own toolbar without reaching into private state — the
same way visibility and the range are controllable from outside.

## Fetching is still yours

`onVisibleDomainChange` is where you fetch more or coarser data when the interval
moves. The library does not fetch, aggregate, poll, or stream, and there is no
infinite scroll — a viewport reaching the edge of the loaded data renders as the
edge of the loaded data. Driving both a request and the viewport from one control
is fine; they remain separate concerns, and only the callback crosses between
them ([ADR-0007](../decisions/adr-0007-layered-time-selection.md) §7).

## Types

```ts
import type {
  ActivePoint,
  TimeInterval,
  ViewportCause,
} from "@silkplot/core";
```

The controlled viewport, capture opt-in, activation props, and command surface
are added to each interactive chart's props as new optional members. A wrapper
typed against the current props keeps compiling; it simply does not yet forward
the new ones.

Up: [Decisions](../decisions/index.md)
