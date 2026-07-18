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

## Migrations

An ADR states the decision; a migration states what a consumer has to change.

- [Chart semantics (0.x, breaking)](../migrations/chart-semantics-0.x.md):
  upgrading to the ADR-0005 chart surface — naming every informative chart,
  opting decorative charts out explicitly, the description and data-alternative
  props, and what a missing name does in a development versus a production
  build.
