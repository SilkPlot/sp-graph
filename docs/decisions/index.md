# Decisions

Architecture Decision Records for SilkPlot: short, numbered files capturing a
decision, why it was made, what was rejected, and what it costs.

Two rules make them useful:

- **An accepted ADR is never edited.** Supersede it with a new one that links
  back. The value is the trail, including the decisions that turned out wrong —
  a record quietly rewritten to match the present cannot tell you the reasoning
  was ever different.
- **The rationale is self-contained.** An ADR explains itself to a reader who
  has only this repository.

They live here rather than in [`architecture.md`](../architecture.md) because
that file states the rules as they stand now; these say how each rule was
arrived at.

## Records

- [ADR-0001 — The theming contract](adr-0001-theming-contract.md): the `--sp-`
  namespace and its fixed name mapping, when to read the token object versus the
  custom property, why primitives never depend on `@silkplot/theme`, the
  fallback rule for an unthemed consumer, and why colour scheme can be forced
  while contrast and motion cannot.
- [ADR-0002 — `Crosshair` and `TooltipAnchor` contracts](adr-0002-crosshair-and-tooltip-anchor.md):
  why the cursor and tooltip are told where to draw rather than resolving the
  pointer themselves, why the tooltip is HTML beside the SVG rather than inside
  it, the single-active-point keyboard model and the live region that announces
  it, and what the hover path may and may not do inside a frame.
- [ADR-0003 — The cartesian model's reactive data input](adr-0003-reactive-data-input.md):
  why `CartesianModelSpec.data` is an accessor rather than an array, why a
  spec-literal getter was rejected despite being cheaper, what a captured array
  did to a mounted chart's y axis, and why immutable replacement is the only
  supported contract.
- [ADR-0004 — Colour scheme and contrast resolve as combinations](adr-0004-scheme-contrast-combinations.md):
  why there are four palettes not three, how each high-contrast block mirrors a
  scheme block so the increased-contrast preference survives every dark path
  without a specificity war, the new dark-high-contrast palette and its
  legibility ladder, and why the contract is now verified on computed styles in
  a real browser. Extends ADR-0001.
- [ADR-0005 — The accessibility contract](adr-0005-accessibility-contract.md):
  informative-vs-decorative posture with no silent downgrade, required name and
  a forwarded description channel, an always-shipped overview plus data
  alternative, the single-entry composite keyboard model (not `role="application"`,
  and roving tabindex does *not* mean one stop per mark), committed throttled
  polite announcements, colour/contrast/focus/motion rules, substrate parity, and
  the library/application boundary.

- [ADR-0006 — Packages ship a compiled build and their source, not source alone](adr-0006-publishable-dist-builds.md):
  why the `"solid"` condition still serves source and always will, why the
  compiled entry beside it is built by Solid's own babel preset rather than a
  generic JSX transform, the workspace-internal `"source"` condition that keeps
  typechecking off the build output, why `tsc -b` moved to `.tsbuild` and emits
  the declarations tsup cannot, and why internal `@silkplot/*` dependencies pin
  an exact version. Supersedes the source-only emit strategy.

- [ADR-0007 — The layered time selection model](adr-0007-layered-time-selection.md):
  the three time scopes a dashboard composes, why the effective domain is the
  only value a component may read, the total precedence table and what "isolated
  section" actually isolates from, why an empty intersection never falls back
  outward, why latest-value is type-distinct from a zero-width range, why an
  inverted range is a caller bug rather than something to normalise, and why the
  model never reads the clock.

- [ADR-0008 — The multi-series and composition state contract](adr-0008-series-and-state-contract.md):
  why a series is identified by a caller-supplied `id` and never by array index
  or label, why series-oriented input is the one public shape and row-oriented
  input crosses an adapter seam, the generic metadata channel that is never
  plotted, why a declared `null` and a broken non-finite value are different
  things and neither becomes zero, why null policy is per series rather than per
  chart, controlled-with-uncontrolled-default visibility and the empty visible
  set that means empty, why hidden series do not shape the axis, why reference
  overlays participate in the domain by default, and where this contract stops
  so the viewport contract can begin.

- [ADR-0009 — Default series colour follows array position](adr-0009-default-series-colour.md):
  why a series' default palette slot is its array index while everything
  ADR-0008 calls identity stays keyed on `id`, why hiding a series never
  recolours the others but re-sorting does, why a hash of the id was rejected
  for collisions and a retained first-seen map for forfeiting the model's
  purity, and how a caller pins a colour without losing the dash channel.
  Clarifies ADR-0008 §1 and §5 rather than superseding them.

- [ADR-0010 — Formatter props are named by surface, not by value kind](adr-0010-formatter-props-by-surface.md):
  why `xTickFormat`, `yTickFormat`, `tableTimeFormat` and `tableValueFormat`
  replace the `formatTick`/`formatValue` pair ADR-0008 §9 declared, why a `Date`
  reaching an axis tick and a read-aloud table cell cannot share one formatter,
  why a value formatter receives its series' label, why the return type is
  `string | number` and what that means for the CSV export, and why a gap never
  reaches a formatter. Supersedes §9's prop shape only — §9's principle stands,
  and `formatTooltip` stays declared and unbuilt.

- [ADR-0011 — The legend is a standalone toolbar, and interactive targets have a floor](adr-0011-legend-toolbar-and-target-size.md):
  why the legend ships as a primitive the application places rather than a prop
  on the chart, why it is a roving-tabindex toolbar rather than one tab stop per
  entry or a multi-select listbox, why a swatch is a line carrying a dash and not
  a coloured block, why a hidden entry dims and hollows and reports
  `aria-pressed` rather than relying on opacity, and where the 24px target floor
  comes from — stated as an engineering floor, not a conformance claim. Extends
  ADR-0005 and ADR-0008 §6.

- [ADR-0012 — Reference overlays on both axes, and their precedence against a dashboard scope](adr-0012-reference-overlays-on-both-axes.md):
  why a reference is one union discriminated by the axis it sits on rather than
  two props or a `kind` field, why a dashboard's resolved interval beats a
  reference's domain participation on the time axis while the value axis keeps
  ADR-0008 §10's default, why references paint above the marks but are kept off
  the axes by clipping rather than by ordering, why a threshold's meaning always
  also lives in an unconditional accessible list — which is what makes dropping
  an unplaceable label defensible — and why the reference colour has to be a
  neutral. Extends ADR-0008 §10; defers to ADR-0007 §3.
- [ADR-0013 — Ranked categorical bars: input shape, orientation-stable formatters, and the activation seam](adr-0013-ranked-categorical-bars.md):
  why `categories` arrives alongside `data` rather than replacing a surface
  already on npm, and why the legacy shape is ADAPTED into the ranked one so
  there is a single render path; why the formatters are named for the category
  and value axes rather than for x and y — on a chart that can rotate, an axis
  letter is not a surface, because flipping `orientation` would silently swap
  which formatter applied; why `formatValue` is superseded on the same reasoning
  ADR-0010 used for the time series; why `onActivate` hands back the caller's own
  object, which is what makes it safe to ship ahead of Sprint 007's general
  pointer contract; why Enter/Space activation belongs to the keyboard composite
  rather than the chart; why bars become keyboard-reachable on BOTH input shapes;
  and why axis labels truncate by character count rather than measured width.
  Extends ADR-0010; supersedes the `RankedBarsProps` declaration.

- [ADR-0014 — The interaction and viewport contract](adr-0014-interaction-and-viewport-contract.md):
  the one active-datum record every input writes and every surface reads, why it
  carries the caller's own `sourceIndex` and metadata and the per-instant values
  a shared cursor needs; the per-family lookup — a bisector for a time series, the
  Delaunay index for a scatter, a band for bars — and the deterministic tie,
  duplicate-time, hidden, missing, empty, and out-of-plot answers; the
  controlled/uncontrolled visible-domain state, why its authority is a data
  interval and never a pixel transform, and why nothing widens past the full
  extent or, in a dashboard, past the resolved effective domain; why a plain drag
  brushes rather than pans and why zoom is `Ctrl`/`Cmd`+wheel; why nothing
  captures the page's scroll unless the caller asks; the per-event budget,
  per-frame coalescing, cause-labelled callbacks, and cleanup; and why fetching a
  moved range stays entirely the application's. Fills the boundary ADR-0008 §8
  left open; navigates within ADR-0007's effective domain; keeps ADR-0002's and
  ADR-0005's interaction rules.

- [ADR-0015 — The active-point record is generic over its datum](adr-0015-active-point-record-generalization.md):
  why the one active-point record is generic over its datum type rather than
  fixed to `SeriesDatum` — a scatter's datum is a numeric point and a ranked
  bar's is a category, neither a `SeriesDatum` — why the position union gains a
  numeric `value` member for the scatter, why the type parameter is the datum and
  the tooltip metadata rides inside it, and why one generic record beats both a
  per-family result type and a datum union. Supersedes ADR-0014 §1's record shape
  only; its one-record invariant stands.

## Migrations

An ADR states the decision; a migration states what a consumer has to change.

- [Chart semantics (0.x, breaking)](../migrations/chart-semantics-0.x.md):
  upgrading to the ADR-0005 chart surface — naming every informative chart,
  opting decorative charts out explicitly, the description and data-alternative
  props, and what a missing name does in a development versus a production
  build.
- [Interaction and viewport (0.x, additive)](../migrations/interaction-and-viewport-0.x.md):
  adopting the ADR-0014 surface — the active-datum record and `onActivate`, the
  controlled and uncontrolled visible domain and its cause-labelled callback, the
  opt-in gestures and why zoom takes a modifier, the viewport commands, and the
  application-owned fetch boundary — none of which changes an existing chart that
  adds nothing.
