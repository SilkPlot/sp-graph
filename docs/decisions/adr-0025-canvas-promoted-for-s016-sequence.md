# ADR-0025 — Canvas promoted for the S016 sequence

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

[ADR-0023](adr-0023-density-decimation-and-inspection.md) decision 1 recorded
that density recovery is decimation over corrected SVG and that **Canvas is
not promoted**. That decision remains the general substrate rule outside this
sprint.

On 2026-08-28 Adam signed in chat an override of that one decision, for
Sprint 016 only: Canvas is the named renderer. New S016 work does not use
SVG. WebGL stays excluded. S007-P09 is not this override and stays parked.

This record writes the signed override so implementers do not re-ask and do
not reopen ADR-0023 decisions 2–4. This file is the decision, not the
implementation.

## Decision

1. **For S016 only, Canvas is the named renderer.** ADR-0023 decision 1 is
   overridden for this sprint. New S016 work does not use SVG.

2. **What moves off SVG onto Canvas.** Cartesian charts — line, area, bar,
   scatter, including the S012-P03 plot-area `clipPath` work — plus heatmap
   and calendar-heatmap. Interactive and dynamic: hover, selection, and data
   updates. Canvas is a renderer, not a static picture.

3. **WebGL is excluded.** This override does not promote WebGL.

4. **P09 is not this override.** The quiet-host density protocol stays
   parked. This ADR does not start P09 and does not treat P09 as the
   promotion evidence for S016.

5. **No implementation in this ADR.** Feature work is later, sequenced in
   planning. Accepting this file does not change `src`.

6. **Overturn** is a later signed ADR. Do not silently revert to SVG.

## Alternatives

- **Keep ADR-0023 decision 1 for S016.** Rejected: Adam signed the override
  on 2026-08-28.
- **Name no renderer.** Rejected: Canvas is the named renderer for this
  sequence.
- **Promote WebGL.** Rejected: WebGL stays excluded.
- **Use P09 as the promotion gate for this sequence.** Rejected: P09 stays
  parked; this signed override is the S016 promotion.

## Consequences

- ADR-0023 decisions 2–4 (min/max decimation, explicit opt-in, raw-series
  inspection) are not reopened.
- Outside S016, ADR-0023 decision 1 remains the recorded general rule until
  a later signed ADR says otherwise.
- New S016 Cartesian, heatmap, and calendar-heatmap work is Canvas, not SVG.
- Calendar virtualization leftover in S016 sits on the Canvas stack, not an
  SVG `WeekGrid` path.
- S007-P09 remains parked.
