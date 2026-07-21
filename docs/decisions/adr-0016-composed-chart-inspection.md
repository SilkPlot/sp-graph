# ADR-0016 — Composed chart inspection: the tooltip render-prop and default hover

- **Status:** Accepted
- **Date:** 2026-07-21

## Context

[ADR-0002](adr-0002-crosshair-and-tooltip-anchor.md) settled that `Crosshair` and
`TooltipAnchor` are told where to draw and that a separate **pointer model**
resolves a pixel into an active datum — and deliberately did not settle that
model's public API, nor how a chart exposes tooltip content. ADR-0014/ADR-0015
then settled the active-datum record and the lookup families. What remains, and
what this ADR settles, is the last public surface before the charts are wired:
**how a caller supplies tooltip content, and when pointer inspection is active.**

[ADR-0008 §9](adr-0008-series-and-state-contract.md) declared a `formatTooltip`
string prop and parked it explicitly — "stays declared and unbuilt until the
many-series active-datum model is decided." That model is now decided, so the
park is over and the declaration is resolved here.

The compute half exists (`active-point.ts`) and is composed by nothing; the only
working pointer composition lives in the playground, wired to the older Delaunay
index directly. Interaction today is single-series only and inconsistent across
the four charts. This ADR fixes the public contract so the wiring that follows is
one shared seam rather than four copies of a pattern.

## Decision

### 1. Tooltip content is a render-prop returning JSX, not a string formatter

```ts
tooltip?: (active: ActivePoint<D>) => JSX.Element;
```

The caller receives the whole active-datum record — the datum with its metadata
in the caller's own type `D`, the shared-time values across visible series
(`atTime`), the domain position (`at`), and the pixel `position` — and returns
whatever they want drawn. `TooltipAnchor` positions and confines it; the content
is the caller's, exactly as ADR-0002 §3 requires ("the primitive owns the
geometry, never the content").

**This supersedes ADR-0008 §9's declared `formatTooltip` string.** A string prop
is strictly less than JSX and forces the library to render a card — a default
content style — which is the black box ADR-0002 exists to avoid: the first caller
who wants two lines, a colour swatch per series, or a link is back to composing
their own, and now around a library card instead of a primitive. Handing back
JSX means a shared-time tooltip over twenty-two series is the caller's table, not
a format string the library invented. The metadata generic that ADR-0015 threads
through the record is the whole point: `active.datum.meta` is the caller's type,
and a `(active) => string` throws that away at the one surface it exists for.

The tooltip *card* is therefore opt-in **content**: absent a `tooltip` prop, no
tooltip renders. That is separate from whether hover is active (§2).

### 2. Pointer hover is active by default for an informative chart

An informative chart inspects on hover out of the box: moving the pointer resolves
an active datum and drives the crosshair, the active-mark emphasis, and the
committed announcement — the same single active-datum state the keyboard writes,
never a second one. A `pointer?: boolean` prop overrides it, defaulting to true
for an informative chart and forced off for a decorative one, mirroring the
existing `keyboard?` prop.

This is the parallel of ADR-0005's keyboard-on-by-default, and it is chosen for
the same reason: a chart that *looks* interactive but inspects nothing until the
application wires an event handler is the "optional feature ships as absent
feature" failure, one surface over. Hover is the expected way a sighted user
reads an exact value off a dense chart, and making every application re-derive the
rect-caching, rAF-coalescing, margin-subtracting pointer loop — which is subtle,
and which the playground got right once — is the re-derivation this library exists
to prevent.

The cost is real and bounded, and ADR-0002 §5 already sized it: per pointer event,
convert the coordinate, query the index, write the signal if it changed; per
frame, at most one update; never rebuild the index or read layout. Only one chart
is under the pointer at a time, so a dashboard of many charts pays for one hover
loop, not many. A chart that genuinely wants to pay nothing sets `pointer={false}`.

**The tooltip does not appear merely because hover is on.** Hover with no
`tooltip` prop still moves the crosshair and announces — inspection a caller gets
for free — and renders a card only when the caller supplies its content (§1).

### 3. One active-datum state, one inspection seam, every input

There is exactly one active-datum state per chart (ADR-0002 §1, §4; ADR-0008 §8),
and pointer, touch, and keyboard all write it. The wiring — the active-datum
holder, the keyboard composite, the rAF-coalesced pointer handler with its cached
rect, and the derived active record — is **one composable** the four charts share,
built over the family-appropriate `active-point.ts` index each chart supplies in a
memo (`createTimeSeriesIndex` for line and area, `createScatterIndex` for scatter,
`createBandIndex` for bar). The charts differ in the index they build and the
marks they draw; they do not each re-derive resolution, coordinate maths, or
announcement. Sharing the computation is what makes the crosshair, the tooltip,
the emphasis, and the announcement unable to disagree about which datum is active.

This extends the active-datum model to the **multi-series** path and to Area and
Scatter, which had no active-datum before. `MultiSeriesBody` deferred it as "a
separate decision"; ADR-0014/0015 made that decision, so the shared-time cursor
over many series is wired here on the same seam.

### 4. Controlled activation, replacement, and clearing

Active-datum follows ADR-0008 §8's controlled/uncontrolled pattern. **The
uncontrolled default and the `onActivePointChange` notification ship here:** the
chart owns one active-datum state, pointer and keyboard write it, and
`onActivePointChange` hands back the record on every change — a keyboard step, a
snapped hover, a clear (`undefined`) — with the caller's `D`. It is named for the
`*Change` convention `onVisibilityChange` and the viewport's
`onVisibleDomainChange` already use.

A **controlled** `activePoint` *input* — an application driving which datum is
active from outside the chart — is the §8-shaped extension and is deliberately not
built here. Driving active state across a chart boundary is the shared-selection
problem the dashboard owns, and resolving a caller-supplied record back to a
per-family ordinal is a reverse lookup the index does not carry; both belong with
the dashboard-linked selection work, not this integration. The notification half
that a linked application needs to *observe* activation ships now; the input half
follows there.

**This is distinct from ADR-0013's `onActivate`**, which is a drill-down *commit*
(Enter, Space, or a click that acts on the active datum), not a change
notification. That callback stays exactly as ADR-0013 shipped it on the ranked
surface, and may be offered on the other charts on the same terms; the two never
share a name because they are two events — the cursor moving, and the user acting.

Clearing is one model on documented paths: pointer-leave clears, `Escape` clears,
and a data replacement re-clamps or clears rather than leaving a stale index — the
`createActiveDatum` holder already clamps on read, so a shorter replacement cannot
point past the end. A gap, a hidden series, and empty data are no-hits (ADR-0014
§2), so hovering them clears rather than snapping to a datum that is not drawn.

## Consequences

- The four charts gain a `tooltip` render-prop, a `pointer?` override, and a
  controlled `activePoint`/`onActivate` pair; a chart that adds none behaves as it
  does today except that an informative chart now inspects on hover. Additive at
  0.x; the hover default is a behaviour change, not a breaking type change.
- ADR-0008 §9 gains a supersession note: its principle (caller owns wording)
  stands, its `formatTooltip` *string shape* is replaced by the `tooltip`
  render-prop. The axis and table formatters ADR-0010 already reshaped are
  unaffected.
- The multi-series path, Area, and Scatter gain active-datum for the first time,
  on the shared seam, so the four charts converge on one inspection model rather
  than the two-and-a-half keyboard variants that exist now.
- Scatter finally composes the interaction ADR-0002 was written for, via
  `createScatterIndex`.
- The playground reference composition is superseded by the library wiring: what
  it proved by hand becomes a primitive, and its ad-hoc use of the Delaunay index
  is replaced by the per-family `active-point.ts` model.
- Hover is behaviour, proven by browser assertions rather than pixels; the visual
  harness stays one-chart-per-page and gains no interaction baseline.

## Alternatives

- **A string `formatTooltip`** (ADR-0008 §9 as declared) — rejected per §1: it
  re-imposes a library card and discards the metadata generic at the one surface
  built to carry it.
- **Both a formatter and a render-prop** — rejected: two content paths to test and
  document, and the formatter still owns a default card. The render-prop covers the
  simple case in one line (`tooltip={(a) => <span>{a.datum.y}</span>}`).
- **Hover opt-in** (enabled only when a handler is supplied) — considered and
  rejected as the default. It is the more literal reading of ADR-0002's "composed,
  not inherited", but it makes the common case — read a value off a chart by
  pointing at it — the one every application must wire by hand, re-deriving the
  subtle pointer loop. `pointer={false}` remains for the caller who wants nothing.
- **A per-chart pointer model** — rejected per §3: four copies of the resolution,
  coordinate, and announcement logic drift, and the drift is silent.

Up: [Decisions](index.md)
