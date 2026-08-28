# Hierarchy force-directed frame budget

This is an internal note, not a numbered ADR and not part of the public site.

## Question

Does a representative hierarchy/network laid out with `d3-force` hold the
16.7 ms frame budget (ADR-0002) so force-directed can ship on Canvas in
S017-P01 item 3? Tree, treemap, and pack are not this question. Sunburst,
icicle, and sankey stay unknown on the ingested map and are not replacements.

## Protocol

- **Hardware (2026-08-28):** Linux 6.12.94 x86_64 KVM, Intel Xeon, 4 cores,
  15 GiB RAM. Node.js v24.20.0. `d3-force` 3.0.0. No document: ticks are
  `simulation.stop()` then `simulation.tick()`, the compute-only path.
- **Range:** 800×600 plot. Cool-down is 300 ticks (d3-force's default alpha
  decay reaches rest on that order). 5 warmup passes, 30 timed passes. p95 of
  the timed distribution is the decision number.
- **Density:** five-level org, branching factor 4 (341 nodes, 340 tree links)
  plus a deterministic extra edge every 10th node (offset 7) for 35 cross
  links, 375 links total. No `Math.random`.
- **Forces:** `forceLink` distance 24, `forceManyBody` −40, `forceCenter` at
  the plot midpoint, `forceCollide` radius 8.
- **Budget:** 16.7 ms. Acceptance 17.7 ms (1 ms timer tolerance, declared
  before measuring). Two costs: one tick, and a synchronous 300-tick cool-down
  (what a layout memo would pay on data replacement if force shipped as the
  tree/treemap/pack views do).

## Result

A single tick held the budget (p95 2.02 ms on this hardware). A synchronous
cool-down did not (p95 288.46 ms). Force-directed is therefore **unbuilt**.
Item 3 allows that outcome: record the protocol and leave force unbuilt; do
not invent replacement types.

A per-frame animation loop (one tick per rAF) would be a second interaction
contract, not the single-tab-stop listbox the named views already share, and
is out of this item.

Recorded in `packages/core/test/force-budget.ts` as `FORCE_BUDGET_RECORD`.

## What this is not

Not a numbered ADR. Not LIMITATIONS, ROADMAP, README, or site copy. Not
sunburst, icicle, or sankey. Not WebGL. Not a second series model. Tree,
treemap, and pack on Canvas are a separate, shipped outcome of the same item.
