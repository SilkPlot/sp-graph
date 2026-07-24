# ADR-0023 — Density recovery: explicit min/max decimation, and inspection that resolves against the raw series

- **Status:** Accepted
- **Date:** 2026-07-24

## Context

Profiling on named reference hardware established two density facts about the
time charts. First, rendering a day of one-second samples (86,400 points) raw
is not viable: hover drops 70 % of frames and a zoom produced a multi-second
freeze — a failure, not a stutter. Second, after the two commit-path
corrections that profiling attributed — the data alternative decoupled from
the viewport ([ADR-0022](adr-0022-data-alternative-scope.md)), and series rows
keyed on stable series identity so a viewport commit updates geometry in place
instead of tearing down and recreating every row — the remaining per-commit
cost is intrinsic: regenerating each series' path and hit geometry is O(points
drawn), and no memoisation can make redrawing 86,400 points cheap. Recovering
the frame budget at density means drawing fewer points.

Drawing fewer points honestly is a studied problem with an unresolved tension:
**envelope truth versus perceived shape**. M4 (Jugel et al., PVLDB 2014)
proves that keeping min, max, first, and last per pixel column reproduces the
exact line raster — but only at aggregation aligned to the rendered width with
a four-per-column budget; off that width its guarantee is void and, at a fixed
budget, it spends the budget four ways and draws the worst truthful picture.
LTTB (Steinarsson, 2013) optimises perceived shape with no extrema guarantee.
Rather than trust either publication's claims at our scale, all candidates
were implemented and measured first-hand against a frozen 86,400-point fixture
with planted one-second spikes, each implementation first verified against a
property its own publication states (M4's pixel-identity theorem reproduced
exactly; LTTB matched its author's reference implementation point-for-point).
`npm run perf:decimation` reproduces every number in this record — pure
computation, byte-identical across machines.

At a 2,000-point budget over 86,400 points: min/max-per-bucket and LTTB are
near-tied on the picture (22.4 % versus 21.7 % pixel mismatch against the raw
raster) and both kept all planted spikes and both extremes — min/max
structurally (an excursion IS an extreme, so it cannot be dropped), LTTB only
empirically on this fixture. M4 at the fixed budget is the worst truthful
picture (38.4 %). A naive every-nth sampler wins both scalar error averages
while deleting every spike and both extremes — scalar error is the wrong
scoring function for a picture, and that candidate exists in the scorer only
as the labelled sanity check.

The same measurement quantified a second, quieter hazard: **a decimated chart
can answer an inspection with the wrong datum.** Resolving the pointer against
drawn points attributes a spike's value to an instant one second away — a
divergence of ±180 units on this fixture, at exactly the positions a reader
inspects because something visibly happened there. The published field is
normatively silent on decimated-inspection semantics, and shipping libraries
disagree.

## Decision

1. **The density recovery is decimation over corrected SVG. Canvas is not
   promoted.** The substrate policy's ladder stands: a Canvas data layer is
   promoted only if measured evidence shows corrected SVG plus this decimation
   still missing the budget on named hardware. WebGL remains excluded.

2. **The decimation is min/max per bucket, selected on the envelope
   criterion:** what a reader can see in a dense chart's pixel column is its
   vertical extent, and min/max preserves exactly that extent *structurally* —
   an excursion cannot vanish, at any budget, on any dataset, because an
   excursion is an extreme. LTTB's near-tie on picture quality is an empirical
   property of one fixture family; min/max's spike survival is a property of
   the algorithm. Within a bucket the two survivors are emitted in occurrence
   order, so the line never zig-zags against time; a bucket containing a
   declared gap keeps a gap datum, so a gap policy still has a gap to honour
   and decimation can never silently connect across missing data.

3. **Decimation is explicit, per series, and off by default:** a `decimation`
   prop on the time charts naming the maximum drawn points per series. No
   chart decimates silently — changing what a chart draws is the caller's
   decision, stated in the caller's code. Only painting is affected: the
   decimated set feeds the path and its marks, nothing else.

4. **Inspection resolves against the raw series, always.** The hit index, the
   keyboard cursor, announcements, tooltips, the active-point callback, the
   data table, and the CSV all read the un-decimated data. Pointing at an
   instant answers with the value that was measured at the resolved instant —
   never the nearest surviving drawn point. This makes the drawn-versus-
   inspected split explicit contract: **the path is the envelope; the active
   point is the truth.** The measured ±180 attribution hazard vanishes for
   every candidate under this rule, which is what let the picture criterion
   decide the selection in isolation.

## Alternatives

- **LTTB.** The survey-preferred shape optimiser, near-tied on this fixture's
  picture. Rejected because its extrema survival is empirical, not
  structural: its own author concedes one-sample outliers lose sharpness, and
  the stability literature's rankings invert by dataset. Adopted instead if a
  perceived-shape objective ever replaces the envelope criterion.
- **M4.** Its pixel-exactness requires width-aligned aggregation at four
  points per column — a budget 2.2× the target here, and the guarantee does
  not degrade gracefully off its width. Its per-column first/last tuples cap
  the drawn-nearest inspection divergence at a tenth of the alternatives',
  which would be decisive **if** inspection resolved against drawn points;
  under decision 4 that advantage is moot. Re-scored first if decision 4 is
  ever overturned.
- **Resolve inspection against drawn points.** Cheaper (the index gets ~2,000
  points instead of 86,400) and it is what several shipping libraries do.
  Rejected on the measurement: it answers an inspection beside an excursion
  with a value from a different instant, and the error is largest exactly
  where the reader's attention is. The index cost of the raw rule is a
  bisection over more points — logarithmic, and not the measured bottleneck.
- **Decimate by default above a threshold.** Rejected: silently changing what
  a chart draws is not this library's call to make, and a default that
  engages at a data size makes rendering behaviour a function of payload —
  the class of surprise the explicit prop exists to prevent.
- **A Canvas data layer now.** Premature by the substrate policy's own rule:
  promotion requires measured evidence that corrected SVG plus decimation
  cannot meet the gate, and that evidence does not exist.

## Consequences

- **The active point can sit off the drawn path.** Zoomed out, an inspected
  raw datum may lie between two surviving drawn points; the cursor mark and
  tooltip then describe a value the envelope contains but the path does not
  pass through. This is the honest rendering of decision 4 and is documented
  rather than smoothed over — the alternative was answering with a
  neighbouring instant's value.
- **Present points are bounded; gap markers ride along.** The budget bounds
  drawn present points; a pathological gap-dense series can draw more markers
  than the budget. Gaps are data a reader must see; hiding them to honour a
  budget number would connect the line across missing data.
- **Zooming re-decimates.** The budget applies to the viewport-narrowed set,
  so navigation progressively reveals raw detail and a window at or below the
  budget draws raw. Re-decimation is a linear scan per commit — measured as
  negligible beside path regeneration.
- **Below the budget, decimation is the identity** — same array, same
  reference, no copied data.
- **The keyboard cursor steps the raw series** (decision 4), so stepping
  through a dense chart point-by-point is slow going; Page Up/Down and
  Home/End remain the long-range keys. A stepped-summary keyboard mode would
  be its own decision.
- The performance workloads engage the prop at their densities, so the frame
  gates measure the recovery this record decides rather than a raw
  configuration already established as non-viable.

## Overturn conditions

Recorded so the choice is revisited against evidence rather than re-argued:
drawn-point resolution is ever adopted (M4's endpoint mechanism becomes
decisive — re-score it and a raised budget); a perceived-shape objective
replaces envelope truth (LTTB's measured edge fits); zoom-time re-decimation
is measured as a real cost (the field's precomputed-hierarchy methods, OM3 and
MinMaxLTTB's preselection, are the alternatives); or a rougher fixture family
diverges from this one — the stability literature inverts by dataset, and the
single fixture family is this evidence's named limit.
