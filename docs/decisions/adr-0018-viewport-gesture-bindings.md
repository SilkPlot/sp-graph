# ADR-0018 — The viewport gesture and keyboard bindings

- **Status:** Accepted
- **Date:** 2026-07-22

## Context

[ADR-0014](adr-0014-interaction-and-viewport-contract.md) settled the viewport
*vocabulary* — a drag brushes an interval, `Ctrl`/`Cmd`+wheel zooms about the
pointer, two-finger pinch zooms, the keyboard reaches every viewport action, and
nothing captures wheel or gesture input unless the caller opts in (§5, §6). It
deliberately did **not** fix the concrete surface a gesture layer has to commit
to before it can be built: *which* keys drive pan and zoom, *what* a caller writes
to opt in, and *what a brush looks like* while it is being dragged.

The viewport model ([ADR-0014](adr-0014-interaction-and-viewport-contract.md) §3)
and its wiring into the chart scope both exist; the x scale, marks, hit index, and
table already follow one visible interval, controllable through props and command
functions. *(Amended by [ADR-0022](adr-0022-data-alternative-scope.md): the
table drops out of that list — a data alternative follows the data scope, never
the viewport. The bindings this ADR fixes are unaffected.)* What is missing is the adapters that turn a pointer, a wheel, a pinch,
and a keypress into those command calls. This ADR fixes the bindings those
adapters implement, so the first adapter does not set the surface by accident.

Everything here is **additive at 0.x** — every capture prop defaults to off, and a
chart that opts into nothing behaves exactly as it does today.

## Decision

### 1. The keyboard bindings

The datum-stepping composite ([ADR-0005](adr-0005-accessibility-contract.md) §3)
already owns the arrow keys, `Home`/`End`, `PageUp`/`PageDown`, `Enter`/`Space`,
and `Escape`. The viewport keys must not collide with any of them, so they are:

| Action | Key |
|---|---|
| Zoom in | `+` (and `=`, its unshifted twin) |
| Zoom out | `-` |
| Pan earlier | `Shift`+`ArrowLeft` |
| Pan later | `Shift`+`ArrowRight` |
| Autoscale y | `a` |
| Reset viewport | `0` |

`Escape` keeps its [ADR-0002](adr-0002-crosshair-and-tooltip-anchor.md) meaning —
it clears the active point — and never doubles as a viewport reset, so a reader
dismissing a cursor does not also lose their zoom ([ADR-0014](adr-0014-interaction-and-viewport-contract.md)
§5).

`+`/`-`/`=` are the near-universal map-zoom idiom; `0` mirrors the browser's own
"reset zoom to 100%" (`Ctrl`+`0`); `a` is a mnemonic for autoscale. **Pan is
`Shift`+arrow rather than a plain arrow** because the plain arrow steps the active
datum, and rather than an `Alt`+arrow because `Alt`+arrow is the browser's
back/forward in more than one engine — a binding that fights the browser is worse
than one that needs a shift.

**The viewport key handler runs BEFORE the datum handler.** The datum composite
does not guard `shiftKey` on its arrow cases, so `Shift`+`ArrowLeft` would step a
datum if the datum handler saw it first. Composing the viewport handler ahead of
it, and letting it claim `Shift`+arrow, keeps the two from colliding without
touching the datum composite's own contract.

### 2. The capture opt-in

Four boolean props, every one defaulting to the safe value — nothing captures the
page's scroll, touch, or focus unless the caller asks
([ADR-0014](adr-0014-interaction-and-viewport-contract.md) §6):

| Prop | Enables | Default |
|---|---|---|
| `wheelZoom` | `Ctrl`/`Cmd`+wheel zoom (and, via `ctrlKey`, trackpad pinch) | off |
| `pinchZoom` | two-pointer touch pinch zoom | off |
| `brushSelect` | drag-to-brush | off |
| `capturePlainWheel` | let PLAIN wheel zoom, for a single full-bleed chart | off |

`capturePlainWheel` is the one escape hatch of §6: even with `wheelZoom` on, plain
vertical scrolling still moves the page, and only the modified wheel zooms — the
default that has to be safe on a tall dashboard of many charts. A caller who
genuinely owns the whole viewport says so explicitly; it is never inferred.

### 3. The brush renders a live selection, and `Escape` cancels it

A drag with `brushSelect` on draws a **live shaded rectangle** that follows the
pointer, and commits its interval to the viewport on release. `Escape` during the
drag cancels it with no commit; the viewport does not move. A right-to-left drag
is normalised at the gesture boundary (the model's `normalizeInterval`), so the
committed interval is always `start ≤ end`.

The live rectangle is drawn rather than left invisible until release because a
brush with no feedback is a gesture a reader cannot see themselves making — the
selection is the whole point of the interaction, and showing it is what makes the
drag discoverable. The rectangle is clipped to the plot area and carries a
non-colour edge so it survives a monochrome rendering
([ADR-0005](adr-0005-accessibility-contract.md) §5).

### 4. Autoscale now moves y

[ADR-0014](adr-0014-interaction-and-viewport-contract.md) §3 makes autoscale an
explicit y recomputation over the visible interval, and the viewport model
already snapshots it. This ADR wires that snapshot into what a chart draws: when
`autoscale` has been invoked, the chart's y domain is the snapshot (under the
chart's own y-domain policy) instead of the full-data extent, until the next
`autoscale` or `reset`. A plain zoom or pan still leaves y pinned — autoscale is
the only thing that moves it, and it is always a deliberate command.

### 5. The per-event and per-frame budget is ADR-0014 §7, unchanged

Every adapter converts a coordinate against a cached rect, at most; coalesces to
one `requestAnimationFrame` commit per frame; releases pointer capture, removes
listeners, and cancels any pending frame on unmount and on cancellation; and
touches no `window` or `document` at module load. A wheel listener is registered
`{ passive: false }` because a captured zoom must call `preventDefault`, and only
that listener does.

## Alternatives

- **An all-letter keyboard map** (`h`/`l` to pan) — rejected. `Shift`+arrow reads
  as directional movement to a user who has not learned a vim convention, and the
  chart is not a text editor.
- **`Alt`+arrow to pan** — rejected. It is browser back/forward in more than one
  engine; a viewport binding must not fight the browser's own navigation.
- **A brush with no live rectangle, committing only on release** — rejected. The
  selection is the interaction; a drag whose extent is invisible until it ends
  gives the reader nothing to aim, and reads as an unresponsive chart.
- **Plain wheel zooms when `wheelZoom` is on** — rejected as the default
  (restating ADR-0014): it traps page scroll over every chart on a dashboard. It
  survives only as the explicit `capturePlainWheel` opt-out for one full-bleed
  chart.
- **A viewport `Escape` that also resets the zoom** — rejected. `Escape` clears
  the active point; overloading it would make dismissing a cursor throw away a
  reader's navigation.

## Consequences

- The gesture adapters compose onto the one interaction surface the inspection
  layer already owns, sharing its cached rect and its active-datum state, so a
  gesture and a hover cannot describe different points.
- The viewport keyboard handler is checked before the datum handler, which is the
  one ordering that keeps `Shift`+arrow (pan) from stepping a datum.
- A chart that opts into no capture prop is byte-identical to today: no wheel
  trap, no touch trap, no brush, plain page scroll and Tab focus intact.
- Autoscale becoming visible completes the y-domain story ADR-0014 §3 began; a
  chart now has three y modes — pinned (default), autoscaled (a command), and the
  dashboard-narrowed follow that predates the viewport.
- The discoverability of `Ctrl`/`Cmd`+wheel remains a hint an application supplies;
  the library commits to the binding, not to teaching it.

Up: [Decisions](index.md)
