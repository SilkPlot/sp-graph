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

The published packages (`0.2.0-next.1`, 2026-07-19) predate the interaction
surface above — closing that gap is the current line.

## 0.3.0-next

The publish-and-show line, in progress now:

- Publish everything under **Shipped** as `0.3.0-next.0` on the `next`
  dist-tag (a minor bump: the time props moved from epoch-ms to `Date`, a
  breaking 0.x change recorded in
  [the migration note](docs/migrations/time-interval-date-0.x.md)).
- Relaunch the documentation site around live, operable examples of the
  interaction surface — rendered from the same source the repository builds,
  so the site provably shows current code.
- This roadmap, the feature-request channel, Discussions, and milestones —
  the mechanism you are reading.
- Continuous deployment of the site from CI, after every gate passes.

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

- Calendar and agenda views — the time-grid layout is an honest stub today,
  and the time-semantics decision (display zones, DST geometry) comes before
  any implementation, so the hard part is not accidentally decided by code.
- Grouped and stacked bars.
- A Canvas density layer — selected by measurement, never by taste.
- Heatmaps and virtualization for dense boards.
- Pie/donut and hierarchy/force layouts, when real consumers justify them.

## Non-goals

- **PDF and image export.** The table and CSV are further displays of work a
  chart has already done; a rendering-export module is a different product.
- **WebGL**, until a measured workload exists that Canvas cannot meet.
- **A second roadmap.** The site page and the milestones derive from this
  file; nothing else is authoritative.
