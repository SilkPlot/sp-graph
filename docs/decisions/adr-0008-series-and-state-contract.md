# ADR-0008 — The multi-series and composition state contract

- **Status:** Accepted
- **Date:** 2026-07-19

## Context

Every chart SilkPlot ships today draws one series. That was enough to prove the
rendering model, and it is not enough for the operational dashboards this
library exists to serve: a single telemetry chart may carry twenty-two series
plus three labelled reference lines, an environmental view carries one to four
same-unit series with tooltip metadata that is never plotted, and an analytical
view ranks long human labels by a signed currency value.

Going from one series to many is not a matter of accepting an array. It forces
six questions that every component built on top will otherwise answer for
itself, differently, and only visibly when two of those answers meet:

- What identifies a series across a data replacement?
- What is a missing value, and how does it differ from a broken one?
- Who owns the fact that a series is hidden — the library or the application?
- Does a hidden series still shape the axis?
- Who decides how a value is worded?
- Which of this is the library's job at all?

Each is cheap to settle now and expensive to settle later, because each becomes
a published prop the moment a component ships. This ADR settles all six before
the components that consume them, in the same posture as ADR-0007: state the
contract as computation first, then build against it.

It does **not** decide pointer, touch, or keyboard inspection, and it does not
decide the visible-domain viewport. Those are a separate contract, and §8 states
exactly where this one stops so the two cannot collide.

## Decision

### 1. A series is identified by a caller-supplied `id`, and by nothing else

```ts
interface Series<M = unknown> {
  /** Stable across replacement. The caller's, not the library's. */
  id: string;
  /** Display text. May duplicate, may be localized, may change freely. */
  label: string;
  data: readonly SeriesDatum<M>[];
  /** Per-series null policy — see §4. */
  nullPolicy?: "break" | "connect";
  style?: SeriesStyle;
}
```

Identity is an explicit `id` because the two alternatives both fail silently:

- **Array index** breaks on reorder. A dashboard that sorts series by current
  value — which is exactly what a ranked operational view does — reassigns every
  colour, every legend toggle, and every visibility flag on the next tick, and
  nothing throws. The chart just quietly becomes about different things.
- **`label`** breaks on localization and on duplicates. Two sensors legitimately
  named "Inlet" are two series; the same sensor rendered in a second language is
  one. A label cannot tell those apart because a label is display text, and
  display text is the application's to change.

**A duplicate `id` is a contract violation, not an input to reconcile.**
Development builds throw; production keeps the first occurrence, drops the rest,
and emits a diagnostic. This is the posture ADR-0005 established for a missing
accessible name and ADR-0007 for an inverted range, and it is the behaviour the
overlap packer already has for a duplicate identity key. Silently merging two
series into one would render a picture with fewer lines than the caller passed
and no indication of which was lost.

### 2. Series-oriented input is the one public shape

The public prop takes an array of series, each owning its own points:

```ts
series={[
  { id: "inlet",  label: "Inlet",  data: [{ t, y }, …] },
  { id: "outlet", label: "Outlet", data: [{ t, y }, …] },
]}
```

Row-oriented ("wide") input — one row per timestamp with a column per series —
is supported, but it crosses an **explicit adapter seam** rather than being a
second meaning for the same prop:

```ts
series={fromRows(rows, { t: "time", values: ["inlet", "outlet"] })}
```

Two reasons, in order of weight. First, the per-series contract below —
`nullPolicy`, `style`, and the metadata channel in §3 — attaches naturally to a
series and awkwardly to a column, so a row-oriented public shape would need a
parallel side-table keyed by column name, which is series-oriented input wearing
a disguise. Second, a wide response of 86,400 timestamps must be pivoted before
any domain can be computed, and putting that pivot inside the render path hides
a per-frame cost in a prop.

Rejected: **accepting both natively**, discriminated at runtime. It is more
convenient at exactly one call site and permanently doubles the normalisation
paths, the fixtures, and the failure modes — and the discriminator is ambiguous
on the empty array, which is the input every application passes first.

### 3. A datum carries a value and, optionally, whatever else the caller needs

```ts
interface SeriesDatum<M = unknown> {
  t: Date;
  /** `null` means "known to be absent". See §4. */
  y: number | null;
  /** Never plotted, never interpreted. Returned verbatim to the caller. */
  meta?: M;
}
```

`meta` is generic and the library never reads it. It exists because a tooltip
routinely needs to show something that is not on the axes — a sensor's serial
number, a deployment marker, the raw response the reading came from — and the
alternative is that every application keeps a parallel map from timestamp to
metadata and re-joins it on every hover. That join is the library's to avoid,
not to perform: it already holds the datum.

`M` defaults to `unknown` rather than `any` so a caller who supplies no
metadata cannot accidentally read a field off it, and one who does gets their
own type back through the activation and tooltip surfaces rather than a cast.

### 4. Missing and invalid are different things, and neither becomes zero

- **`null` is a declared absence.** The sensor was offline; the month had no
  reading. It is governed by the series' own `nullPolicy`:
  - `"break"` (default) — the path stops and resumes, drawing the gap.
  - `"connect"` — the path is drawn straight across, treating the absence as
    unobserved rather than as a discontinuity.

  Both are required, per series rather than per chart, because one chart
  legitimately carries both: a cumulative total connects across a missed poll,
  and an instantaneous rate must not.

- **A non-finite number is a broken value, not a missing one.** `NaN`,
  `Infinity`, and `-Infinity` never reach the geometry, are always a gap
  whatever `nullPolicy` says, and raise a diagnostic. `nullPolicy` deliberately
  has no authority here: `"connect"` means "I know nothing was measured", and
  drawing confidently through a value that arrived corrupt is a different and
  worse claim.

**Neither is ever coerced to zero.** On a chart drawn from a zero baseline, a
missing reading rendered as zero is indistinguishable from a real measurement of
zero, and on an availability or temperature series it inverts the meaning of the
picture. This is the single most common defect in charting libraries and it is
excluded by contract.

The existing finite-value guard in the mark layer and the existing non-finite
filter in the extent computation are the two halves of this rule; this ADR names
them as one policy so a future author cannot remove either as redundant.

### 5. Order is the caller's, and the library does not tidy it

Marks follow the caller's array order. Domains come from the data's **extent**,
not from its first and last element. The library does not sort.

This is already the contract for the derived data table and its serialisation,
and extending it here keeps one rule rather than two. The cost is honest: an
unsorted series draws a zigzag, because that is what the array says. The
alternative — sorting on the way in — is the only super-linear operation in the
render path, and it would make the picture disagree with the table, the export,
and the array the caller passed.

Series order in the array is legend order and paint order. Later series paint
over earlier ones.

### 6. Visibility is controlled state, with an uncontrolled default

```ts
/** Absent → the chart owns visibility internally, all series visible. */
visibleSeries?: readonly string[];
onVisibilityChange?: (visible: readonly string[]) => void;
```

Supplying `visibleSeries` makes it controlled; omitting it leaves the chart to
manage its own state so that a legend works out of the box. This is the ordinary
controlled/uncontrolled convention and it is chosen because dashboards routinely
need visibility to live above the chart — shared across linked charts,
persisted, or driven from a URL — and a chart that owns it privately makes all
three impossible.

Four cases are stated because each has an appealing wrong answer:

- **Isolate** (show only this one) is `visibleSeries` becoming `[id]`. It is a
  caller operation over the same array, not a separate mode.
- **Show all** is `visibleSeries` becoming every id. Not `undefined` — passing
  `undefined` reverts the chart to uncontrolled, silently handing state back to
  the library mid-session.
- **The empty set is a real state and renders an empty chart.** It does *not*
  mean "no filter, show everything". That reading is the classic filter bug, and
  it means a user who deselects the last series sees every series reappear.
- **An id in `visibleSeries` that no series has is ignored, not an error.** Data
  and visibility arrive from different places and are momentarily out of step
  during every replacement. Throwing here would make an ordinary render sequence
  a crash.

### 7. Hidden series do not shape the axis

The automatic y domain is computed from **visible series only**. Hiding a series
rescales the axis to what remains.

This follows the rule the time-scope work already established, where the y
domain follows the narrowed visible data on the stated grounds that an axis
describing values no visible mark reaches is an axis lying about its own
picture. Applying a different rule to visibility than to time scoping would mean
two ways to remove data from a chart with opposite effects on the axis, and
nothing on screen to tell them apart.

It also serves the reason operators hide a series at all: one series spikes to
1000 while the rest live under 12, and hiding it is how you read the rest. A
pinned axis leaves them flat against the baseline and defeats the gesture.

**The cost is real and is accepted:** the axis moves when you toggle, so two
visibility states are not directly comparable by eye. Rejected as the default —
**retaining hidden series in the domain** — buys that comparability and loses
the expansion above, which is the more frequent need. A future opt-in may pin
the domain; it is deliberately not shipped now, because a knob added before
either behaviour has a user is a knob chosen without evidence.

### 8. Activation is controlled-capable; the viewport is not decided here

Active-datum state follows §6's pattern: uncontrolled by default, with an
optional controlled pair. There remains exactly one active-datum state per
chart, written by every input path — the invariant ADR-0002 exists to protect,
and this ADR does not weaken it.

**This ADR decides nothing about the visible time domain.** Pan, zoom, reset,
brush, wheel capture, and their focus and touch behaviour are a separate
contract. The boundary is stated here so that neither contract has to guess:
this one governs *which series and which datum*, that one governs *which
interval*. A component needing both composes two contracts and does not merge
them.

### 9. Formatting is the caller's, and the library's defaults stay generic

> **The PRINCIPLE below stands. The PROP SHAPE this section's example declared
> is superseded by [ADR-0010](adr-0010-formatter-props-by-surface.md).** Props
> are named for the surface they reach — `xTickFormat`, `yTickFormat`,
> `tableTimeFormat`, `tableValueFormat` — rather than for the value kind they
> receive. Building the surface showed a `Date` reaches two surfaces with
> incompatible constraints (an axis tick has a few characters; a table cell is
> read aloud), which the declared `formatTick`/`formatValue` pair could not
> express. `formatTooltip` is NOT superseded: it stays declared and unbuilt
> until the many-series active-datum model is decided.

Tick text, tooltip wording, units, locale, and display time zone are supplied by
the caller. Library defaults remain deliberately generic and
locale-independent — ISO 8601 instants, unadorned numbers, and headings like
"Time" and "Value".

The library knows an axis carries instants and that another carries a number. It
does not know they are appointments, or rands, or degrees, and a default that
guessed would produce a chart that is confidently wrong in a second language.
Generic-and-honest beats specific-and-invented; the application supplies the
domain wording because it is the only party that has it.

Time values are absolute instants. Zoned civil time is not addressed here, for
the same reason ADR-0007 does not address it: it is a genuinely separate problem
and anything here that appears to answer a time-zone question is answering an
instant question that resembles one.

### 10. Reference overlays participate in the domain by default

```ts
references={[
  { id: "sla", value: 95, label: "SLA floor", includeInDomain: true },
]}
```

`includeInDomain` defaults to **`true`**. A reference line outside the computed
domain has nowhere to be drawn, so the default is the one where the caller sees
what they asked for. A line silently absent from the chart is the failure this
library refuses everywhere else — it looks exactly like a working chart.

`includeInDomain: false` is the explicit opt-out for the case the default costs:
a target far outside the data compresses the series into a band. That trade is
the caller's to make, because only the caller knows whether the target or the
detail is the point.

Reference values are dynamic, and their labels and styles are the caller's on
the same terms as §9.

### 11. What the application owns

The **library** owns: series normalisation and identity, domains, scales,
geometry, presentation, the accessible alternative, visibility resolution, and
active-datum state.

The **application** owns: fetching, aggregation and decimation policy, query
presets and range controls that change a request, route navigation, loading
state, and error state.

SilkPlot does not fetch, does not poll, and renders no spinner and no error
panel. A chart with no data renders its empty state, which is a statement about
data and not about a request — the distinction matters because "loading",
"failed", and "genuinely empty" look identical to a renderer and completely
different to a user, and only the application can tell them apart.

### 12. Compatibility and semver

All of this is **additive at 0.x**. Nothing published breaks.

- The existing single-series `data` prop remains supported, as exact sugar for a
  one-element `series` array with a generated id. It is not deprecated in this
  release: a single-series chart is a legitimate permanent use, not a
  transitional one.
- `series`, `visibleSeries`, `onVisibilityChange`, `references`, `nullPolicy`,
  and the `meta` channel are new optional surface.
- `y: number | null` widens an existing type and accepts input previously
  rejected, which is additive for callers and breaking for nobody.

Passing both `data` and `series` is a contract violation, on §1's terms:
development throws, production prefers `series` and diagnoses. Silently merging
them would produce a chart with a phantom extra series.

## Alternatives

- **Index-based identity, with `id` optional** — rejected. It works until the
  first sort and then fails without an error, which is the failure profile this
  estate treats as worst: wrong, plausible, and silent.
- **A single chart-wide `nullPolicy`** — rejected. One chart carries a
  cumulative total and an instantaneous rate, and they need opposite policies. A
  chart-wide setting forces the caller to split one picture into two.
- **Treating `null` and `NaN` identically** — rejected. They arrive from
  different causes: one is a measurement that was not taken, the other is a
  computation that went wrong. Collapsing them means a corrupt upstream value is
  rendered with the same confidence as a known gap.
- **Visibility owned privately by the legend** — rejected. It makes linked
  charts, persistence, and URL-driven state impossible, and each of those is an
  ordinary dashboard requirement rather than an exotic one.
- **Hidden series retained in the domain** — rejected as the default; see §7.
- **Deprecating the single-series `data` prop immediately** — rejected. It
  churns every existing consumer and example to no benefit, for a use case that
  never goes away.

## Consequences

- Series normalisation — identity, duplicate detection, null and invalid
  classification, visibility filtering, and domain contribution — is pure
  computation in the computation package, walkable exhaustively by node tests
  rather than sampled through a rendered tree.
- The legend, the multi-series marks, the reference overlays, and the ranked
  categorical surface all consume that one normalisation. None re-derives
  identity or visibility, so none can disagree about them.
- Charts gain a controlled/uncontrolled pair for visibility and activation, and
  the accompanying obligation: every uncontrolled default must be provably
  equivalent to the controlled path, or the two drift.
- The axis moves when a series is toggled. That is a deliberate, documented
  behaviour and not a defect report.
- The metadata channel is generic all the way through activation and the tooltip
  surface, so the type a caller supplies is the type they get back.
- Zoned civil time and the visible-domain viewport remain undecided, and this
  ADR is careful not to have implied answers to either.

## Examples

Typed examples covering the shapes this contract must support are in
[`docs/examples/series-contract.ts`](../examples/series-contract.ts): one
series, four series, twenty-two series, nullable values with both policies,
tooltip metadata, hidden series, the empty visible set, a stale visibility id,
row-oriented input, signed domains, reference values, and long categorical
labels.

**They typecheck the contract, not the implementation, and the distinction is
deliberate.** This decision was settled before the components that consume it,
so at the time of writing there is nothing to import: the file declares the
shapes and exercises them. That is enough to prove the contract is expressible,
that the metadata generic flows through the tooltip and activation surfaces
without a cast, and that every state named above is representable. It is not
evidence that any component behaves this way, and it does not pretend to be.

The file is included in `npm run typecheck`, so an example that stops compiling
fails the build rather than sitting stale in prose. When the implementation
ships, the declarations are replaced by imports and every example below them
must continue to compile **unchanged** — if one has to change, the
implementation diverged from this decision, and that is where it surfaces.

Up: [Decisions](index.md)
