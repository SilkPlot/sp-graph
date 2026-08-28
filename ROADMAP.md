# Roadmap

This file is the single public source of SilkPlot's direction. The
documentation site renders this exact file, and the repository's
[milestones](https://github.com/SilkPlot/sp-graph/milestones) mirror its
version-line headings — there is deliberately no second copy anywhere to
drift. It states direction, not dates: items ship when their evidence gates
pass, and nothing here is a promise.

Want to influence it? A concrete request — a capability you need, described
by the problem it solves — goes to the
[feature-request form](https://github.com/SilkPlot/sp-graph/issues/new/choose);
open-ended ideas go to
[Ideas on Discussions](https://github.com/SilkPlot/sp-graph/discussions/categories/ideas).
How and why the channels split this way is recorded in
[ADR-0021](docs/decisions/adr-0021-community-surface-and-public-roadmap.md).

## Shipped

On `main` today, proven by CI on every push:

- Four Cartesian chart families — line, area, bar (including ranked
  categorical, both orientations), scatter — on the "D3 computes, Solid
  renders" architecture.
- Multi-series composition with per-series gap policy (a declared gap and a
  broken value are different things, and neither becomes zero), controlled
  legends, and labelled reference overlays on either axis.
- The accessibility contract: a chart is named or explicitly decorative
  (unnamed-and-informative is a compile error), a real data-table alternative,
  a single-tab-stop keyboard composite, coalesced announcements. **No
  assistive technology has been verified against it yet** — the
  [accessibility guide](docs/accessibility.md) states this plainly, and the
  claim will not narrow ahead of the evidence.
- The full dynamic interaction surface: a controlled visible-time viewport,
  `Ctrl`/`Cmd`+wheel and pinch zoom, drag-to-brush with keyboard parity for
  every gesture, an accessible range control, responsive and hidden-container
  behaviour with zero library-owned `window` listeners, and dashboards where a
  drag on one chart drives the linked selection of the rest.
- Inspectable data: every informative chart can disclose its own data table
  and export it as CSV.
- Theming: light/dark × standard/high-contrast resolved as four first-class
  combinations, token-driven.

Everything under **Shipped** is on the registry: **`0.3.0-next.0`**,
published 2026-07-22 under the `next` dist-tag with provenance.

## 0.3.0-next

The publish-and-show line — delivered 2026-07-22:

- `0.3.0-next.0` published (a minor bump: the time props moved from epoch-ms
  to `Date`, a breaking 0.x change recorded in
  [the migration note](docs/migrations/time-interval-date-0.x.md)).
- The documentation site relaunched around live, operable examples of the
  interaction surface — rendered from the same source the repository builds,
  so the site provably shows current code.
- This roadmap, the feature-request channel, Discussions, and milestones —
  the mechanism you are reading.
- Continuous deployment of the site from CI, after every gate passes.

What this line deliberately did not claim: performance numbers (still
unmeasured) and assistive-technology verification (still ahead) — both wait
on evidence, under **MVP beta** below.

## MVP beta

The qualification line. A beta claim needs evidence that does not exist yet,
so these are evidence tasks, not feature tasks:

- **Representative performance, measured.** Dense series, many-chart
  dashboards, and high-frequency data run under a frozen protocol on named
  reference hardware. Until that happens, neither this repository nor the
  site claims a performance number.
- **Density disposition.** Where the measurements pass, SVG stays; where they
  do not, only the measured decimation or Canvas recovery needed to pass.
- **Assistive-technology verification**, NVDA on Windows first. The contract
  is implemented and gated in CI; no screen reader has been run against it;
  the beta claim waits for that, not the other way round.
- The composed Cartesian dashboard scope qualified end to end.

## Later, evidence-gated

Explored, deliberately not committed:

- A week-grid view and an agenda view exist in source and are unpublished; time-semantics is decided ([ADR-0024](docs/decisions/adr-0024-zoned-civil-time-for-calendar-grids.md)).
- Grouped and stacked bars exist in source and are unpublished.
- Canvas is the named renderer ([ADR-0025](docs/decisions/adr-0025-canvas-promoted-for-s016-sequence.md)); a density-layer promotion still waits on measurement.
- Heatmaps and calendar virtualization exist in source and are unpublished.
- Pie and donut exist in source and are unpublished.
- Tree, treemap, and pack exist in source and are unpublished.
- Bubble exists in source and is unpublished.
- Histogram exists in source and is unpublished.

## Non-goals

- **PDF and image export.** The table and CSV are further displays of work a
  chart has already done; a rendering-export module is a different product.
- **WebGL**, until a measured workload exists that Canvas cannot meet.
- **A second roadmap.** The site page and the milestones derive from this
  file; nothing else is authoritative.
