# ADR-0007 — The layered time selection model

- **Status:** Accepted
- **Date:** 2026-07-19

## Context

A dashboard composes several charts that must agree about time. Three different
things can each want to narrow what a chart shows, and they can all be present at
once:

- the range a user selected for the whole dashboard;
- a transient selection made by dragging on one chart, shared with the others;
- a single section's own window, or its wish to show only the newest reading.

Left unstated, each component invents its own answer to "which of these wins?",
and the answer only becomes visible when two of them disagree — which is exactly
the case nobody builds a fixture for. Worse, the resolution rule has to exist
*before* the gesture layer that produces the transient selection, or the viewport
gets designed once for a single chart and then again for a set of them.

This ADR settles the resolution rule as pure computation, ahead of any component
that reads it. It states what the model resolves, what it refuses to decide, and
what every combination of the three scopes produces.

## Decision

### 1. Three named scopes, and a fourth thing that is not a scope

- **Global range** — the dashboard's outer bound, an explicit interval of
  absolute instants. It is always present: when the application sets none, it
  defaults to the union of its members' data extents. This is what makes the
  precedence table below total rather than merely long.
- **Dynamic selection** — a transient interval produced by interacting with one
  member and shared with the rest. It is a narrowing *within* the global range
  and never survives as state the library persists.
- **Section scope** — a section's own narrowing, in one of two modes: a
  **window** (an interval) or **latest** (see §4).

The **effective domain** is the resolved output, and it is not a fourth scope.
It is what a chart actually draws over, and it is the only value a component is
permitted to read. A component that reaches past it for one of the three inputs
is reimplementing this table.

### 2. The model resolves a visible domain, never a data query

This is the load-bearing boundary. The layered model decides **what a mounted
chart displays**, not what an application fetches, aggregates, or stores.

A dashboard-level range control that changes a server query is application
behaviour that happens to share a vocabulary with this model. The library does
not fetch, does not aggregate, does not persist a selection across reloads, and
does not decide whether a range change should cause either. An application is
free to drive both from one control — but the two are separate concerns, and
conflating them puts data-loading policy inside a rendering library, where it
cannot be tested and cannot be turned off.

### 3. Precedence: narrowing composes, and an explicit section isolates

Every combination of the three resolves, with no combination undefined:

| Global range | Dynamic selection | Section scope | Effective domain |
|---|---|---|---|
| present | none | none | the global range |
| present | none | window | global ∩ window |
| present | none | latest | the latest datum within the global range |
| present | active | none | global ∩ dynamic |
| present | active | window | global ∩ window — **dynamic ignored** |
| present | active | latest | the latest datum within the global range — **dynamic ignored** |

Two rules produce the whole table:

- **Nothing widens.** Every scope narrows within the global range. A dynamic
  selection or a section window extending past the global range is clamped to
  it, not honoured beyond it. The global range is the outer bound by definition,
  so a section that could widen past it would make the dashboard's own control a
  suggestion.
- **A section with its own scope is isolated from the dynamic selection.** This
  is what "isolated section" means, and it is the answer to the three-way
  disagreement in row five: a section that declared its own window did so in
  order to *not* follow the shared cursor, so a drag on another chart must not
  disturb it. A section that declared nothing follows the dynamic selection,
  which is what makes a shared drag useful at all.

**An empty intersection is a defined result, not a fallback.** When global ∩
window is empty, the effective domain resolves to `empty` and the chart renders
its empty state. It must never silently widen to the next scope out — that would
show a reader data they had excluded, in a chart that looks like it is working.

### 4. Latest-value is a distinct result, not a degenerate range

A section in **latest** mode resolves to the most recent datum **within the
effective global range**, and that result is type-distinct from a range. A
consumer must handle it explicitly rather than receive an interval whose ends
happen to be equal and treat it as a very short window.

The bound matters: if the newest datum overall is newer than the global range's
end, it is out of scope and is **not** shown. Nothing on a dashboard displays
data outside the range the user selected — a tile that quietly ignored the global
control would be the one element on the page telling a different story, and no
visual affordance distinguishes it. If no datum falls within the range, the
result is `empty`.

Rejected: an unbounded "live value" mode that always shows the newest reading
regardless of the global range. It is a real product need, but it is a *different
component* — a status tile — not a section of a range-scoped dashboard. It
returns here only if a dashboard is shown to need both behaviours in the same
grid, and then as an explicit per-section opt-out rather than the default.

### 5. Degenerate intervals

- A **zero-width** range (start equals end) is valid. It resolves to a range
  containing at most the data at that instant.
- An **inverted** range (end precedes start) is a contract violation, not an
  input to normalise. Development builds throw; production resolves `empty` and
  surfaces a diagnostic — the same three-part posture ADR-0005 established for
  missing semantics, for the same reason: a silently swapped range shows data
  nobody asked for and looks correct doing it.

  A right-to-left drag is legitimate *user* input, and normalising it is the
  gesture layer's job, done before the interval reaches this model. Placing that
  normalisation here would mean the model cannot tell a user gesture from a
  caller's bug.

### 6. The model never reads the clock

No function in this model reads the current time from the platform. Where a
resolution depends on "now", it takes it as an argument.

This is not purity for its own sake: a model that reads the clock cannot be
tested at a boundary, and its behaviour at a month edge or across a rolling
window becomes reproducible only by waiting. Taking `now` as an argument makes
every time-dependent case a table row.

### 7. The library / application boundary

The **library** owns: the scope types, the precedence resolution, clamping,
the empty and degenerate cases, and the effective-domain value components read.

The **application** owns: fetching and aggregation; persistence of a selection
across reloads; the wording of any range label; and the display time zone. This
model works in **absolute instants only** and says so — zoned civil time, DST
gaps and folds, and week and day boundaries are a genuinely separate problem
that this model does not pretend to have solved.

## Alternatives

- **Innermost scope always wins, unconditionally** — rejected. It makes the
  dynamic selection beat a section's own window, so a drag on one chart silently
  retargets a section that had deliberately opted out of following it.
- **Fall back outward when an intersection is empty** — rejected. It replaces a
  visibly empty chart with a plausible wrong one, which is the worse of the two
  failures by a distance: an empty chart prompts a question, a wrongly-populated
  one does not.
- **Resolve inside the dashboard component** — rejected. It would put the
  hardest logic in this area behind a rendered tree, reachable only through a
  browser suite, when it is pure interval arithmetic that a node test can walk
  exhaustively.
- **Latest-value as a range with equal ends** — rejected. It compiles everywhere
  and is wrong in exactly one place: a consumer that treats it as a window draws
  an axis across a zero-width domain.

## Consequences

- The resolution model ships in the computation package, importing nothing from
  Solid or the DOM, and its precedence table is walked exhaustively by node
  tests rather than sampled.
- The gesture and viewport work that follows consumes this model instead of
  deriving its own, and inherits the normalisation duty stated in §5.
- Sections gain an explicit meaning for "isolated" that is behavioural rather
  than presentational: it is isolation from the dynamic selection, not from the
  global range.
- Zoned time remains unaddressed. Anything in this model that appears to answer
  a time-zone question is answering an instant question that happens to look
  like one.

Up: [Decisions](index.md)
