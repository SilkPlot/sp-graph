# ADR-0002 — `Crosshair` and `TooltipAnchor` contracts

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

`ScatterChart` renders marks and nothing else. Hovering a point surfaces no
value, because the primitives that would show one — a cursor and a tooltip — do
not exist. The nearest-point index they need (`createHitIndex`) is built and
tested, and wired to nothing.

The temptation is to fix this inside `ScatterChart`, which is how chart
libraries acquire a tooltip that only works on one chart, cannot be restyled,
and cannot be reused by the calendar. SilkPlot is primitives-first: the cursor
and the tooltip are their own components, and every chart composes them. That
requires their contracts to be settled before any chart reaches for them —
otherwise the first caller sets the precedent by accident.

This ADR settles those contracts. It does not implement them.

## Decision

### 1. The primitives do not resolve the pointer. They are told where to draw

`Crosshair` and `TooltipAnchor` take a **position in inner coordinates** and
render there. Neither listens for pointer events, reads a hit index, or knows
what a datum is.

Resolving "pointer is at (px, py)" into "datum 47 is active" is a **separate
concern** — a pointer model, arriving with the interaction wiring. The reasons
to split it:

- **The resolution strategy is per-chart, and already known to differ.**
  `createHitIndex` is Delaunay-backed, which is right for a 2-D point cloud. For
  a monotonic time series it is the wrong tool — the points are sorted along one
  axis, so a bisector answers the same question far more cheaply. A quadtree may
  win for very large clouds. A cursor that depended on any one of them would have
  to be rewritten for the next.
- **The two primitives would otherwise duplicate the resolution**, and a cursor
  and a tooltip disagreeing about which point is active is a defect a test will
  not catch and a user sees instantly.
- **Keyboard produces the same state with no pointer at all** (decision 4). If
  the cursor resolved pointer events itself, the keyboard path would need a
  parallel implementation of everything downstream.

So: one active-point state, written by pointer or keyboard, read by both
primitives. The index kinds are named here as planned inputs; their APIs are
settled where they are built, not here.

### 2. `Crosshair` draws rules at a position; it does not snap

Props are `x?: number` and `y?: number`, in inner coordinates — the same space
`Gridlines` and marks use. Given `x`, it draws a vertical rule down the plot;
given `y`, a horizontal one; given both, both. Given neither, nothing renders,
which is the no-active-point state.

**Snapping is not the cursor's job.** "Snap to the nearest datum" *is* the
resolution step from decision 1: the pointer model hands over the datum's
position, so a snapped cursor is one drawn at a snapped position. Building snap
into `Crosshair` would put a second, conflicting answer next to the first, and
would leave a free-tracking cursor unable to reuse it.

It is SVG, inside the plot, and hidden from assistive tech — it restates what
the announcement in decision 4 already carries, and it is drawn in the same
space as the marks so it cannot drift from them.

### 3. `TooltipAnchor` is HTML positioned over the chart, not SVG inside it

It renders an absolutely-positioned element in the `ChartRoot` container,
**beside `SvgLayer`, not within it**, and its children are the caller's — the
primitive owns the geometry, never the content.

- **HTML, because tooltips are text.** Wrapping, selection, links, and CSS
  layout all work in HTML and are painful or impossible in SVG text.
  `<foreignObject>` would buy back HTML at the price of the substrate's
  inconsistencies, for nothing gained.
- **It works because `ChartRoot` is already `position: relative`.** The overlay
  anchors to the container without new structure.
- **Coordinates are converted, not assumed.** The caller passes inner
  coordinates, consistent with every other primitive; the anchor adds the
  margins to reach container space. Callers must not do this conversion
  themselves — a tooltip and a cursor drawn from the same point must land on the
  same pixel, and they only do if exactly one of them owns the offset.
- **It clamps to the container.** A tooltip near the right edge that renders
  half-offscreen is a bug on every dashboard, and the fix cannot be the
  consumer's each time. Clamping is the anchor's job precisely because it is the
  thing that knows the geometry.

### 4. Accessibility: one announcement, one active point, no pointer required

The accessibility contract applies to interaction primitives, not just static
ones. Concretely:

- **The tooltip is not announced. A live region is.** The visible tooltip is
  marked `aria-hidden`, and a single visually-hidden `aria-live="polite"` region
  carries the active datum's text. A tooltip that is itself live would fire on
  every pointer move and reduce a screen reader to noise; `polite` lets the
  reader finish its sentence.
- **The chart surface is focusable, and the keyboard moves the active point.**
  Arrow keys step between data points, `Escape` clears the active point. This is
  the **single-active-point model**, not a roving tabindex: a roving tabindex
  over a scatter of ten thousand marks produces ten thousand tab stops, which is
  a worse experience than no keyboard support. One focus stop, arrow keys within.
- **Keyboard and pointer write the same state.** Not a parallel path — the same
  one. Otherwise they drift, and only one of them gets tested.
- **The keyboard path is not the whole answer.** Where a chart is dense enough
  that stepping through points is not a usable way to read it, the accessible
  surface is a data table exposing the same values, not more arrow keys. Exactly
  where that line falls is a genuine open question, to be settled by testing with
  real data rather than asserted here.
- **Reduced motion.** No interpolated movement of the cursor or tooltip under
  `prefers-reduced-motion: reduce`. The distinction that matters: a cursor
  *tracking* a pointer is not animation — it is the pointer's own motion, and
  suppressing it would break the feature. What is suppressed is any easing,
  tweening, or fade we add on top.

### 5. Frame budget: what may happen per event, and what may not

Interaction holds a **16.7 ms frame budget (60 fps)** on the low-end reference
target, and the hover path is the easiest place in the library to lose it,
because `pointermove` fires faster than frames render.

**Per pointer event, only:** convert the coordinate, query the index, and write
the active-point signal if it changed. That is one lookup and one comparison.

**Per frame, at most one update.** Pointer events are coalesced into a single
`requestAnimationFrame` write. Rendering three cursor positions between two
paints is three renders the user cannot see.

**Never, per event:**

- **Rebuild the index.** It is derived from data and scales, so it belongs in a
  memo and rebuilds when those change. Rebuilding a Delaunay triangulation on
  pointermove would be the single most expensive thing in the library.
- **Read layout.** `getBoundingClientRect()` on every event forces a synchronous
  layout mid-scroll. The container rect is cached and invalidated on resize and
  scroll — `ChartRoot` already observes its own size, so the invalidation has a
  home.
- **Format or scan the whole series.** Only the active datum's label is
  computed. Formatting is per-active-point, not per-frame and never per-series.

**No number here is a measurement.** These are budgets and rules, stated to be
tested against. Whether the implementation holds 60 fps is a claim only a
profile on the reference target can make, and it belongs to the phase that
builds it — not to this one.

## Consequences

- `Crosshair` and `TooltipAnchor` are testable without a pointer: give them a
  position, assert what renders. The interaction path is tested where it lives,
  in the pointer model.
- A chart with no interaction pays for none of this. The primitives are
  composed, not inherited.
- The calendar reuses both unchanged. Neither knows what a chart is.
- The pointer model is now on the critical path for any interactive chart, and
  its API is not settled by this ADR.
- Any index the pointer model uses must answer in pixel space, since that is
  what a pointer produces and what `createHitIndex` already assumes.

## Alternatives considered

- **A single `<Tooltip>` that owns pointer handling, hit-testing, the cursor and
  the content.** Rejected: it is the black-box component this library exists to
  avoid. It would work until the first chart wanted a cursor without a tooltip,
  a tooltip without a cursor, or a different resolution strategy — that is, at
  the second chart.
- **`Crosshair` takes the data and the index and resolves the active point
  itself.** Rejected per decision 1: it binds the cursor to one index kind and
  forces the tooltip to resolve it a second time.
- **Tooltip inside the SVG via `<foreignObject>`.** Rejected: it inherits
  `foreignObject`'s inconsistencies to gain what an ordinary absolutely
  positioned element already does, over a container that is already
  `position: relative`.
- **Tooltip as SVG `<text>`.** Rejected: no wrapping, no layout, no selection.
  Every real tooltip becomes a manual line-breaking exercise.
- **Roving tabindex over marks.** Rejected per decision 4: it does not survive
  contact with dense data.
- **Announce the tooltip element itself with `aria-live`.** Rejected: it fires on
  every pointer move. The live region exists so the announcement can be
  throttled and phrased independently of the visual.
- **Let each chart position its own tooltip.** Rejected: margin conversion and
  edge clamping would be re-derived per chart, and the cursor and tooltip would
  eventually disagree about where the point is.
