<!-- markdownlint-disable MD013 MD024 -->
# Changelog

All notable changes to the `@silkplot/*` packages.

The packages share one coordinated version and are released together. A chart
composed of four packages at four different versions is a support problem nobody
needs, so `core`, `theme`, `solid`, and `charts` always carry the same number and
their internal dependencies are pinned to it exactly — never `"*"`, and never a
caret range that lets a consumer resolve a mixed pair off the registry.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning is [semver](https://semver.org/), with the 0.x caveat stated in full
under Unreleased: **a minor bump may contain breaking changes.**

## [Unreleased]

### Added

- **Multi-series line and area charts.** `LineChart` and `AreaChart` accept a
  `series` array alongside the single-series `data` prop, as a discriminated
  pair — passing both is a compile error. One path per visible series,
  per-series gap policy, a y domain over the union of visible series, and a data
  alternative with one column per visible series. Public ADR-0008 settles the
  contract; ADR-0009 settles default series colour.
- **Caller formatters on the multi-series surface** — `xTickFormat`,
  `yTickFormat`, `tableTimeFormat`, `tableValueFormat`, named for the surface
  each reaches. Public ADR-0010.
- **`<Legend>` in `@silkplot/solid`** — a standalone primitive over controlled
  visibility, as a roving-tabindex toolbar: one tab stop whatever the series
  count, arrows to move, Space/Enter to toggle, Tab always leaves. Swatches
  carry a dash pattern as well as a colour, so series stay distinguishable
  without hue. Public ADR-0011, which also sets a 24px interactive target floor.

  **This supersedes the "One series per chart" known limitation recorded under
  `0.2.0-next.1` below.** That entry is left as the accurate record of what
  shipped in that release; multi-series and the legend are unreleased until the
  next publish.

### Changed

- **`seriesColorToken`, `seriesDashToken` and `SERIES_PALETTE_SIZE` moved from
  `@silkplot/charts` to `@silkplot/core`**, so the legend in `@silkplot/solid`
  and the marks in `@silkplot/charts` resolve a series' presentation from one
  function. **The names are re-exported from `@silkplot/charts` unchanged**, so
  no import breaks.

- **The documentation site is now <https://silkplot.com>.** `homepage` in all
  six manifests, the README, and the screen-reader protocol point there. The
  `*.pages.dev` URL still resolves and earlier entries in this file that name it
  are left alone — they record what was true when they were written, and
  rewriting a shipped entry to look tidier is not a changelog.

## [0.2.0-next.1] — 2026-07-19

No library code changed. This release exists for two reasons, both of which
needed a version number to carry them.

### Changed

- **Every package README now shows `@next` on the install line.** The npm page is
  where most people meet a package, and all four were showing a bare
  `npm install @silkplot/…`. That resolves here today only because npm assigned
  `latest` to the first-ever publish, and it will quietly mean something else the
  moment a stable release exists. The READMEs now say to use the tag explicitly
  and to pin, and say why.

### Infrastructure

- **Published by trusted publishing (OIDC) rather than a long-lived token.** The
  credential that published `0.2.0-next.0` was a classic npm Automation token —
  the only kind that bypasses 2FA, and therefore account-wide write with no
  expiry. npm exchanges a short-lived OIDC token minted for the workflow run
  instead, so no standing publish secret exists anywhere. npm is also restricting
  2FA-bypassing tokens for direct publishing in January 2027, so the previous
  path had an expiry date regardless. This release is the proof that the new one
  works: it is the first published without a token.

## [0.2.0-next.0] — unreleased candidate

The first publicly installable SilkPlot, published under the **`next`**
dist-tag. `latest` is deliberately left unpublished: `npm install @silkplot/charts`
must not silently hand an alpha to somebody who did not ask for one.

### Why 0.2.0-next.0 and not 0.1.0-alpha.0

`v0.1.0` already exists as a source tag. `0.1.0-alpha.0` sorts *below* `0.1.0`
under semver, so publishing it would put the newer code at a lower version than
the tag it supersedes — the kind of ordering mistake that cannot be corrected
once a registry has it.

### Added

- **Four composed charts** — `LineChart`, `AreaChart`, `BarChart`, `ScatterChart`,
  each composing the same Cartesian model the primitives expose.
- **Primitives** — `ChartRoot`, `SvgLayer`, `Axis`, `Gridlines`, `Crosshair`,
  `TooltipAnchor`, `ChartAnnouncer`, `createCartesianModel`, `createResize`,
  and the keyboard/active-datum surface, for composing a chart no preset covers.
- **A core of pure functions** over D3's math modules — scales, extents, ticks,
  path shapes, overlap packing, and hit indexes. No Solid, no DOM.
- **A theme** whose scheme and contrast resolve as four first-class combinations,
  including a dark high-contrast palette, with a token-driven `:focus-visible`
  treatment.
- **An accessibility contract that the type system enforces.** Informative is the
  default and decorative is an explicit opt-out, so an informative chart cannot
  reach the accessibility tree unnamed — that is a compile error, not a runtime
  warning. Every informative chart ships a real HTML data table derived from the
  same data its marks draw, related by `aria-details`.
- **One tab stop per chart**, using `aria-activedescendant`; pointer and keyboard
  write one shared active-datum state so the crosshair and the announcement
  cannot disagree.
- **Public documentation** at <https://silkplot.pages.dev>.

### Known limitations

Stated here as well as on the site, because a changelog is what a consumer reads
when deciding whether to upgrade:

- **No assistive technology has been tested.** Not one screen reader, not even
  partially. Every accessibility claim rests on deterministic automated evidence
  — computed styles, accessibility-tree assertions, and keyboard and announcement
  behaviour in real headless Chromium. **No WCAG conformance is claimed at any
  level.**
- **0.x: a minor bump may contain breaking changes.** Pin an exact version.
- **Pointer hover is not built into the chart components.** The crosshair,
  tooltip anchor, and hit index exist and are exported; the reusable
  pointer-to-datum model does not, so hover is composed rather than configured.
- **One series per chart.** Multi-series, legends, grouped/stacked bars, and
  brush/zoom are not implemented.
- **SVG only.** No Canvas or WebGL substrate, so density beyond a few thousand
  marks is untested.
- **`@silkplot/calendar` is not published.** It is a typed stub whose entry point
  throws, and shipping it would advertise an implementation that does not exist.

### Supported

Solid `^1.9` as a peer dependency, Node `>=22.12` to build, ESM only, and a
Solid-aware bundler — the `"solid"` export condition serves TSX source so your
bundler compiles the JSX itself, which is what keeps fine-grained reactivity
intact through to your application.

[Unreleased]: https://github.com/SilkPlot/sp-graph/compare/v0.2.0-next.1...HEAD
[0.2.0-next.1]: https://github.com/SilkPlot/sp-graph/compare/v0.2.0-next.0...v0.2.0-next.1
[0.2.0-next.0]: https://github.com/SilkPlot/sp-graph/compare/v0.1.0...v0.2.0-next.0
