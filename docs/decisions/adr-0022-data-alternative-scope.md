# ADR-0022 — The scope a data alternative follows

- **Status:** Accepted
- **Date:** 2026-07-24

## Context

[ADR-0007](adr-0007-layered-time-selection.md) layers time selection into
scopes that answer **what data** a chart shows — the global range, a section's
window, the dashboard's dynamic selection — and
[ADR-0014](adr-0014-interaction-and-viewport-contract.md) §3 adds the
viewport, which answers a different question: **what part of that data is on
screen right now**. [ADR-0005](adr-0005-accessibility-contract.md) requires
every informative chart to ship a semantic data alternative — a real HTML
table, with a CSV download serialised from it — as the alternative
representation of the chart.

When the viewport was wired into the chart scope, the visible interval was made
to drive the x scale, the marks, the hit index, **and the derived table**
([ADR-0018](adr-0018-viewport-gesture-bindings.md) records the resulting state
in its context). The first three belong to the drawn surface. The fourth was
never surfaced as its own decision — it rode inside the wiring, on the local
reasoning that a table should describe the rows the picture draws.

Profiling on named reference hardware then measured that coupling as the
single largest interaction cost in the library. The table is a real DOM row
per instant, so every viewport commit rebuilds it: on a 20,000-point series it
turns pan from a pass into a 66.7 ms miss and multiplies zoom, brush, and
range-drag frame times by 6.5–9.5×. Nothing else measured has an effect that
size. The estate is also already inconsistent: the scatter chart's table reads
the full data and never followed a viewport.

The performance number is what exposed the question, but the question is
architectural: **which scope does a data alternative follow?**

## Decision

**A data alternative follows the data scope. The viewport never narrows it.**

1. **Standalone, the table describes the chart's data** — the full extent, or
   whatever data the application's own scope has handed the chart. Navigating
   the viewport (zoom, pan, brush, range drag, keyboard) changes what part of
   that data is framed; it does not change what the chart is *about*, so it
   does not change the table or the CSV serialised from it.
2. **Inside a dashboard, the table follows the resolved effective domain** —
   exactly the ADR-0007 precedence (section, else dynamic, else global). A
   dashboard drag that commits the **dynamic selection** therefore still moves
   the table, and correctly so: that gesture changes a *data scope*, not a
   viewport.
3. **The equivalence claim pins at data-scope level.** The table is the
   alternative representation of the dataset the chart's data scope selects,
   not of the pixels currently framed. A sighted user mid-zoom and a
   screen-reader user reading the table hold the same dataset; the viewport is
   a lens over it, available to both through the same commands.
4. **Nothing else reverts.** The dirty-flag engage model, the viewport driving
   the x scale, marks, and hit index, and every ADR-0018 binding all stand.
   Only the table's data source changes.

This amends the context statement of
[ADR-0018](adr-0018-viewport-gesture-bindings.md): the table drops out of "the
x scale, marks, hit index, and table already follow one visible interval".
ADR-0014 §3 is unaffected — it describes the drawn surface, which keeps its
behaviour.

## Alternatives

- **Keep the coupling and optimise the table** (memoise, virtualise, defer).
  Rejected: it optimises a behaviour that is wrong under the ADR-0007 layering,
  and the cost returns with density — a table over 86,400 instants is expensive
  at any refresh discipline.
- **A prop opting the table into viewport-following.** Rejected: permanent
  published 0.x surface for a use case nobody has demonstrated, and the
  layering question has an answer rather than a preference. An application
  that wants a view of exactly the framed interval can render its own table
  from the viewport callback it already receives.
- **Follow the viewport, throttled to gesture settle.** Rejected: same wrong
  layer, plus a table that visibly lags the picture it claims to describe.

## Consequences

- **The largest measured interaction cost is deleted, not tuned.** The
  correctness check for the implementing change is that the workload
  comparison between the derived table and caller-supplied empty rows shows
  the gap **gone**, not reduced.
- **Implementation seams** (the change that executes this decision): the
  single-series time charts' table rows switch from the viewport-narrowed
  accessor to the data-scope accessor (the same effective-domain basis the y
  axis already reads, per ADR-0014 §3); the multi-series scope derives its
  table from the effective-domain-narrowed series rather than the
  viewport-narrowed drawn series. Marks and the hit index keep reading the
  viewport-narrowed data.
- **Behaviour change on a published 0.x surface**: a navigated standalone
  chart's table no longer narrows to the zoomed interval. Breaking-behavioural
  at 0.x. Migration: nothing to change for a chart that is not navigated (the
  default); an application that specifically wants framed-interval rows
  renders its own table from `onVisibleDomainChange`.
- **The public accessibility guide's wording travels with the implementing
  change**, not with this record: "the table and the picture cannot disagree"
  is restated at data level when the behaviour actually changes, so the
  published page never describes unshipped behaviour.
