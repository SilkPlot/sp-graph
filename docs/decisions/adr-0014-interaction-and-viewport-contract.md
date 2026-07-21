# ADR-0014 — The interaction and viewport contract

- **Status:** Accepted
- **Date:** 2026-07-21

## Context

The composed charts draw a static picture and let a keyboard step through it.
They cannot yet be inspected with a pointer, and they cannot be navigated through
time: there is no hover, no tooltip wired to data, no way to zoom into an
interval, pan across it, or reset. The operational dashboards this library exists
to serve need all of that, and they need it to hold together — a single active
datum shared by cursor, tooltip, emphasis, and announcement, and a single visible
interval shared by axes, gridlines, marks, references, the hit index, and a range
control — or the surfaces drift and disagree in front of the user.

Two earlier decisions deliberately stopped at this boundary and pointed here.
[ADR-0002](adr-0002-crosshair-and-tooltip-anchor.md) settled that the cursor and
tooltip are *told where to draw* and named a separate "pointer model" that
resolves a pointer into an active datum — without settling that model's API.
[ADR-0008 §8](adr-0008-series-and-state-contract.md) fixed that there is exactly
one active-datum state per chart and then said, in as many words, that it decides
nothing about the visible time domain, because "pan, zoom, reset, brush, wheel
capture, and their focus and touch behaviour are a separate contract." This is
that contract. It also inherits [ADR-0007](adr-0007-layered-time-selection.md)'s
resolved effective domain as the interval navigation moves *within*, and
[ADR-0005](adr-0005-accessibility-contract.md)'s keyboard, announcement, focus,
and motion rules as binding.

Settling it now, ahead of the controllers, is the same posture ADR-0007 and
ADR-0008 took: state the contract as computation and public surface first, then
build against it, so the first controller does not set the precedent by accident.
Everything here is **additive at 0.x** — no published prop changes meaning.

## Decision

### 1. One active-datum record, written by every input, read by every surface

There is one active-datum state per chart. Pointer, touch, and keyboard write the
**same** state — not parallel paths that drift and get tested once each. Every
surface that reacts to "what is active" — the cursor, the tooltip, series
emphasis, the committed announcement — reads that one value. This is the
invariant ADR-0002 and ADR-0008 §8 exist to protect, restated as the shape they
left unspecified.

The record a lookup produces, and every reader consumes:

```ts
interface ActivePoint<M = unknown> {
  /** The series the active datum belongs to (ADR-0008 §1 identity). */
  seriesId: string;
  /** Index into that series' data as the caller passed it. */
  sourceIndex: number;
  /** The datum itself, including its untouched `meta`. */
  datum: SeriesDatum<M>;
  /** Where the marks put it, in inner coordinates — the space the cursor and
   *  tooltip draw in, so all three cannot disagree about the pixel. */
  position: { x: number; y: number };
  /** The active position along the domain axis: an instant for a time series,
   *  the band's key for a categorical chart. */
  at: { kind: "time"; time: Date } | { kind: "category"; category: string };
  /** For a time chart, every VISIBLE series' value at `at` — what a shared
   *  cursor and a multi-series tooltip read. Empty for a scatter or a bar. */
  atTime?: readonly { seriesId: string; datum: SeriesDatum<M> }[];
}
```

Three fields earn their place against an obvious cheaper version:

- **`sourceIndex` is into the caller's array, not into a filtered or sorted
  copy.** A reader handing the datum back — an `onActivate`, a fetch keyed on the
  row — needs the caller's own index or it is describing a different array than
  the one the caller holds. This is ADR-0008 §5's order rule reaching activation.
- **`datum` carries `meta` verbatim.** The generic `M` threads from the series
  input through this record and out through activation and the tooltip, so a
  caller who supplied a serial number gets it back with its own type and no cast
  — the join ADR-0008 §3 exists to avoid re-performing on every hover.
- **`atTime` is the multi-series answer, and it is per record rather than a
  second lookup.** A cursor on a twenty-two-series chart shows every series'
  reading at the hovered instant; computing that once, where the active instant
  is already known, is cheaper and cannot disagree with a tooltip that recomputed
  it. It holds only **visible** series (§2), because a hidden series contributes
  to no surface.

**No active point is `undefined`, not a sentinel record.** Clearing sets the
state to `undefined`; a reader shows nothing. A record with `sourceIndex: -1`
would be a second spelling of "nothing active" that every reader would have to
special-case, and one of them would forget.

The record is a **computation-package** type, produced by the lookup indexes
(§2) that already answer in pixel space per ADR-0002. The reactive holder that
stores it, exposes controlled and uncontrolled forms, and offers the keyboard
step operations stays in the Solid layer, where it already is. Splitting it this
way keeps the record walkable by node tests and the holder tested where reactive
state lives.

### 2. Lookup is per chart family, and every family returns the same record

The resolution strategy differs by chart, exactly as ADR-0002 anticipated. Each
strategy is an index built from data, visibility, geometry, and the current
visible domain — held in a memo, rebuilt only when those change, and **never
constructed in a pointer handler**.

- **Time series — a bisector, not the Delaunay index.** The points are sorted
  along the time axis, so a bisector answers "nearest time to this x" far more
  cheaply than a triangulation, and it is the one the existing 2-D index leaves
  as a stated gap. Two result modes: **nearest-time** (the single closest datum
  in a chosen series) and **shared-time** (the instant, plus `atTime` across
  every visible series) — a shared cursor is the second, a single-series probe
  the first.
- **Scatter — the Delaunay index that exists.** A 2-D point cloud has no sorted
  axis; nearest-in-the-plane is the honest question and Delaunay is its answer.
- **Categorical bars — a band lookup.** The active band is the one the pointer's
  position falls in; there is no "nearest", a pointer is either over a band or
  between bands.

The cases with an appealing wrong answer, settled once so three indexes cannot
answer them differently:

- **Duplicate timestamps resolve to the lowest `sourceIndex`.** Two readings at
  one instant are a real input; picking deterministically by array order means a
  keyboard step and a pointer land on the same one, and the choice matches the
  order the table and export already use.
- **An exact tie between two candidates resolves to the lower `sourceIndex`**,
  for the same reason and never by floating-point luck.
- **Hidden series are not lookup targets and are absent from `atTime`.** A cursor
  cannot land on a series a reader has switched off, and the axis has already
  rescaled without it (ADR-0008 §7).
- **A `null` or non-finite datum is never an active target.** It has no position;
  a lookup skips it. On a series that is entirely absent over the visible range,
  the result is a no-hit, not a snap to a gap.
- **A pointer outside the plot is a no-hit and clears.** Leaving the plot is the
  ordinary way to dismiss the cursor, and a clamped-to-edge phantom active point
  is worse than none.
- **Empty data is a no-hit for every input**, including a keyboard step, which
  has nothing to step onto.

Keyboard traversal reads the **same ordered lookup state**: next, previous,
first, last, and clear, over the visible data in array order. It is the
single-entry composite ADR-0005 §3 requires — one tab stop, arrows within — and
it writes the record above, so a keyboard user and a pointer user reach an
identical active state by different means.

### 3. The visible time domain is controlled-capable state the chart owns

The viewport follows ADR-0008 §6's controlled/uncontrolled pattern, the same one
visibility and activation use:

```ts
/** Absent → uncontrolled; the chart owns its viewport, defaulting to the full
 *  extent. Present → controlled; the caller owns it and drives every change. */
visibleDomain?: TimeInterval;
defaultVisibleDomain?: TimeInterval;
onVisibleDomainChange?: (domain: TimeInterval, cause: ViewportCause) => void;
```

Uncontrolled is the default so a chart pans and zooms out of the box; controlled
exists because a dashboard routinely needs the viewport to live above the chart —
shared across linked charts, reflected in a URL, or driven by an application
range control that also changes a query (§8). Handing `undefined` back reverts to
uncontrolled, exactly as it does for visibility; it is not "show everything".

The rules that make every state defined:

- **The full extent is the outer bound, and nothing widens past it.** The
  viewport is always an interval within the data's full time extent; a pan or
  zoom that would reach past it is clamped, not honoured beyond it. This is
  ADR-0007 §3's "nothing widens", applied to a single chart's own navigation.
- **Inside a `<Dashboard>`, the outer bound is the resolved effective domain, not
  the raw data extent.** ADR-0007's precedence over the visible interval is
  total, so a member's viewport is a further narrowing *within* what the
  dashboard already resolved, and a reset returns to that — never to data the
  dashboard's own control excluded. A member cannot navigate its way out of the
  range the user selected for the page.
- **A minimum span floors the zoom.** Zooming in has a limit — a caller-set
  `minSpan`, defaulting to a small non-zero interval — so a viewport cannot
  collapse to zero width and leave the axis with no domain to draw. A zero-width
  request is clamped up to it, not rejected.
- **Autoscale is an explicit y-domain recomputation**, over the data currently
  within the visible x-interval, under the chart's visible-series policy. It
  changes no source data and no x-viewport; it is the "fit the visible values"
  command, distinct from panning or zooming x.
- **Reset restores the declared domain** — the `defaultVisibleDomain` if given,
  else the current full extent (the dashboard's effective domain when composed).
  It is one command, not a sequence of pans that happen to land home.

The viewport authority is a **data interval**, never a stored pixel transform. A
pixel offset is meaningless after a resize; a time interval survives it. This is
what lets the same interval reappear correctly at a new size or after a hidden
container is revealed.

### 4. Data and layout events preserve the interval, or reset it, by a stated rule

Every event that can move the ground under a viewport has one defined response,
so no controller invents its own:

| Event | Viewport response |
|---|---|
| Immutable replacement (same source, new data) | keep the interval; clamp it into the new extent; if now disjoint, reset |
| Progressive growth (more points, same source) | keep the interval unchanged — new data past the right edge is offscreen until navigated to, not auto-followed |
| Source change (a different dataset) | reset to the new full extent; the old interval describes an array that no longer exists |
| Visibility change | keep the x interval; recompute y if autoscaling |
| Resize | keep the interval; only the pixel mapping changes |
| Hidden → revealed container | keep the interval; measure and draw it at the now-real size |

Two of these are the ones a reasonable author gets wrong. **Progressive growth
does not auto-scroll**: a chart that jumps to the newest data every time a page
loads yanks the interval out from under a reader who was examining an earlier one
— following the live edge is a deliberate act, not a default. And **a source
change resets** rather than preserving an interval that indexed different data,
because a preserved-looking window over unrelated data is the plausible-wrong
outcome this estate refuses everywhere.

### 5. The gesture vocabulary

- **A horizontal drag across the plot brushes an interval.** On release it
  becomes the viewport (zoom to the selection) on a standalone chart, and the
  shared dynamic selection on a dashboard member — the same intent, "focus on
  this interval", scoped to one chart or to the linked set with no mode switch.
  This is ADR-0007's dynamic selection produced by "dragging on one chart", and
  it is the discoverable first gesture on a chart that opens at full extent,
  where panning would do nothing until something had already been zoomed.
- **Panning is available, and is not the primary drag.** A viewport already
  narrower than the full extent is panned by the accessible range control, by the
  keyboard, and by a modified drag. Reassigning the plain drag to selection is a
  deliberate departure from the map idiom, made because a brush is the more
  useful default on a chart whose common first action is to narrow, not to slide.
- **Zoom is `Ctrl`/`Cmd` + wheel, anchored under the pointer.** Plain wheel is
  left to the page (§6). The modifier is not friction for its own sake: a
  browser reports a trackpad pinch as a wheel event carrying `ctrlKey`, so a
  zoom bound to `Ctrl`+wheel makes trackpad pinch-to-zoom resolve through the
  same path with nothing extra. Two-finger pinch on a touch screen zooms the same
  way, anchored on the gesture's midpoint.
- **The keyboard reaches every viewport action**, with commands distinct from the
  datum-stepping arrows so the two never collide: pan, zoom in and out, autoscale,
  and reset each have a key, with defined entry, focus, and exit. `Escape` keeps
  its ADR-0002 meaning — it clears the active point — and never doubles as a
  viewport reset; a reader dismissing a cursor must not also lose their zoom.
- **Explicit command functions back all of it.** Zoom-in, zoom-out, autoscale,
  and reset are exposed as callable commands, so an application renders its own
  toolbar without reaching into private state — the same reason visibility and
  the range are controllable from outside.

Navigation and inspection share one clearing model. During a gesture the active
point is cleared or preserved deliberately, and after the gesture settles it is
recomputed from the new viewport rather than left pointing at an instant that has
scrolled away.

### 6. Wheel and gesture capture are opt-in, and the default never steals the page

**Nothing captures wheel or gesture input unless the caller asks for it.** The
default is that a wheel event over a chart scrolls the page, a touch-drag scrolls
the page, and focus enters and leaves by Tab as on any widget. A library that
trapped scroll by default would make a tall dashboard of many charts unscrollable
the moment the pointer crossed the first one — the reader would be stranded on it.

When a caller opts in, the choice above is why zoom is `Ctrl`/`Cmd`+wheel and not
plain wheel: even *enabled*, plain vertical scrolling still moves the page, and
only the modified wheel zooms. A caller who genuinely wants a single, full-bleed
chart to capture plain wheel says so with an explicit prop; it is never the
default, because the default has to be safe on the dense dashboard, not on the
one-chart page.

The public contract states, for every capture mode, how focus enters, how it
exits, what `Escape` does, and that ordinary page scroll and keyboard navigation
remain available — a gesture layer that can trap focus or scroll without saying
so is a trap.

### 7. What may happen per event, and what may not

This extends ADR-0002 §5 from the hover path to every input, because pan, wheel,
and pinch all fire faster than frames render.

**Per input event, at most:** convert the coordinate against a cached container
rect, query the relevant index, and write a signal if the value changed. One
lookup, one comparison.

**Per frame, at most one commit.** Pointer, wheel, and pinch updates coalesce
into a single `requestAnimationFrame` write to the active point or the viewport.
Three viewport positions computed between two paints are two the user never sees.

**Never, per event:** rebuild an index (it is a memo over data, scales, and
viewport), read layout with `getBoundingClientRect` (the rect is cached and
invalidated on resize and scroll, and the container already observes its own
size), or format or scan the whole series (only the active datum's surfaces are
computed).

**Settle callbacks fire on settle, not on every raw event.** A continuous gesture
emits its `onVisibleDomainChange` per coalesced frame during the drag if the
caller is driving controlled state, and a single settle notification when the
gesture ends or cancels — so an application need not debounce a fetch itself.

**Cleanup is total and the boundaries are honoured.** Pointer capture is released,
listeners are removed, and any pending frame is cancelled on unmount and on
gesture cancellation — a pointer lost mid-drag, a changed touch count, a
disappearing element. Nothing touches `window` or `document` at module load; the
adapters are effects that run in a rendered component, so a server render reaches
none of them.

### 8. Fetch on a domain change is the application's, and the library promises nothing about it

`onVisibleDomainChange` exists so an application can fetch more or coarser data
when the visible interval moves — but the library does not fetch, does not
aggregate, does not poll, and does not stream, and it does not implement infinite
scroll. This is ADR-0007 §7 and ADR-0008 §11's boundary, restated for the
viewport: the model decides **what a mounted chart displays**, and an application
is free to drive both a request and the viewport from one control, but the two
are separate concerns and only the callback crosses between them.

A viewport reaching the edge of the loaded data is not a request for more data.
It is the edge of the loaded data, and it renders as such; whether that should
trigger a fetch is a decision the library cannot make and does not pretend to.

### 9. Compatibility and semver

Every surface here is **new optional surface**, additive at 0.x. `visibleDomain`,
`defaultVisibleDomain`, `onVisibleDomainChange`, the viewport command functions,
the capture opt-in props, and the `ActivePoint` record are additions; a chart
that passes none of them behaves exactly as it does today, drawing its full
extent with no navigation. Nothing published changes meaning, and no existing
consumer has to change a line. Each delta lands with the phase that implements it
and is proven then; this ADR is the contract those phases implement against.

## Alternatives

- **A pixel transform as the viewport authority** — rejected. It is cheaper to
  apply and wrong after the first resize, at which point the stored offset
  describes a layout that no longer exists. A data interval is the only authority
  that survives a size change, which §3 requires.
- **Plain wheel zooms when zoom is enabled** — rejected as the default. It traps
  vertical page scroll while the pointer is over any chart, which breaks the
  scrollable multi-chart dashboard that is the primary workload. It survives only
  as an explicit per-chart opt-out for a single full-bleed chart.
- **Drag pans; a modifier selects** — rejected as the default. Panning does
  nothing on a chart that opens at full extent, so the first gesture a reader
  makes would be the modified one; making the *common* first action — narrowing
  to an interval — the plain gesture fits the workload better. Pan remains fully
  reachable, just not on the unmodified drag.
- **Auto-follow the live edge on progressive growth** — rejected as the default.
  It yanks the interval away from a reader examining older data every time a page
  arrives. Following the edge is a deliberate act an application requests, not a
  behaviour the chart imposes.
- **A separate active state for keyboard and pointer** — rejected, per ADR-0002:
  two states drift, and only one gets tested. One record, every writer.
- **A sentinel `ActivePoint` for "nothing active"** — rejected. `undefined` is
  the one no-active-point value; a record with an out-of-range index is a second
  spelling every reader would have to special-case.
- **Merge the viewport into the series-and-state contract** — rejected, and by
  ADR-0008 §8's own terms: which series and which datum is one contract, which
  interval is another, and a component needing both composes two rather than
  collapsing them.

## Consequences

- The lookup indexes — bisector, Delaunay, and band — ship in the computation
  package producing one record, walkable by node tests, and the reactive holder
  and gesture adapters compose them in the Solid layer without re-deriving
  identity, visibility, or resolution.
- The viewport is one data interval read by axes, gridlines, marks, references,
  the hit index, the tooltip lookup, and the range control, so none can drift
  into a different window than the others.
- A dashboard member's navigation is bounded by ADR-0007's effective domain, so
  the layered time model and the per-chart viewport compose rather than fight,
  and a reset lands on the resolved scope rather than on excluded data.
- Zoom bound to `Ctrl`/`Cmd`+wheel gives trackpad pinch for free and keeps plain
  scroll on the page, at the cost of a discoverability hint an application
  supplies.
- The plain drag is a brush, not a pan, which is a deliberate departure from the
  map idiom recorded here so it is not "corrected" later; pan moves to the range
  control, the keyboard, and a modified drag.
- Every controlled callback carries a cause and settles once, so a caller driving
  the viewport can identify why it moved and does not loop when it feeds the same
  interval back.
- Fetching stays entirely on the application's side of one callback; the library
  gains no request, spinner, or stream.
- Zoned civil time remains unaddressed, exactly as ADR-0007 and ADR-0008 leave
  it: every interval here is absolute instants, and anything that looks like a
  time-zone answer is an instant answer that resembles one.

## Examples

Typed examples of every shape this contract introduces — the `ActivePoint`
record with its metadata generic, the controlled and uncontrolled viewport props,
the `ViewportCause` records, the viewport command surface, the capture opt-in,
and an application driving a query range from `onVisibleDomainChange` — are in
[`docs/examples/interaction-contract.ts`](../examples/interaction-contract.ts),
included in the documentation typecheck.

They **declare** the contract rather than import it, because this decision is
settled ahead of the components that consume it and there is nothing yet to
import — the same posture ADR-0008's examples began in. That proves the shapes
are expressible and that the metadata generic flows through the record and the
callbacks without a cast. When the implementation ships, each declaration becomes
an import and every example must compile **unchanged**; if one has to be edited,
the implementation diverged from this decision, and that is where it surfaces.

Up: [Decisions](index.md)
