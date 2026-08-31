# ADR-0025 — Canvas promoted for an enumerated renderer program

- **Status:** Accepted 2026-08-28 (Adam signed in chat; this file is the durable record)
- **Date:** 2026-08-28
- **Public-surface correction:** 2026-08-31 — private sequencing labels were
  removed and the existing boundary was restated entirely in public terms; the
  renderer decision is unchanged.

## Context

[ADR-0023](adr-0023-density-decimation-and-inspection.md) decision 1
recorded that **the density recovery is decimation over corrected SVG**
and that **Canvas is not promoted**. Accepted ADRs are normally superseded,
not edited; the dated correction above is a bounded public-surface repair that
does not change this decision.
This file is the superseding record for one scoped override.

On 2026-08-28 Adam signed in chat: override ADR-0023 for the renderer program
defined below and promote Canvas. Canvas is the named renderer. WebGL stays
excluded. This ADR neither performs nor authorizes a density-exit measurement.

This file is the durable record so implementers do not re-ask. It is
the decision, not the implementation. No `src` change lands with this
ADR.

## Decision

1. **Override ADR-0023 decision 1 only for the renderer program in item 2.**
   Canvas is promoted as the renderer. “Canvas is
   not promoted” and “decimation over corrected SVG” do not bind this
   program.

2. **Scope.** The program consists of shipped cartesian (line / area / bar /
   scatter, including the landed plot-area clip), heatmap, calendar-heatmap, and
   the Canvas calendar-week / week-virtualization stack. It includes interactive
   and dynamic states (hover, selection, data updates). No SVG is added for
   those families and calendar views. A different chart family requires a later
   signed ADR; an unnamed planning sequence does not silently extend this scope.

3. **WebGL remains excluded.**

4. **This is not a density-exit measurement.** This override is a product
   renderer decision and grants no authority to run or close a performance exit.

5. **This ADR ships no implementation.** Feature work is sequenced in
   planning. Accepting this file does not change `src`.

6. **Overturn** is a later signed ADR.

## Alternatives

- **Keep ADR-0023 decision 1 for the program above.** Rejected: Adam signed the
  override on 2026-08-28.
- **Leave the renderer unnamed.** Rejected: Canvas is the named
  renderer for this program.
- **Promote WebGL.** Rejected: WebGL remains excluded.
- **Treat this as a density-exit run.** Rejected: this is a product renderer
  decision and carries no performance evidence or run authority.

## Consequences

- ADR-0023 is not edited. Decisions 2–4 (min/max decimation, explicit
  opt-in, raw-series inspection) are not reopened.
- Outside this enumerated program, ADR-0023 decision 1 remains the recorded
  general rule until a later signed ADR says otherwise.
- Cartesian, heatmap, calendar-heatmap, and calendar-week virtualization work
  in this program uses Canvas. The SVG `WeekGrid` path stays stopped.
- Density-exit measurement state remains owned by its live protocol and planning
  records, not by this renderer decision.
- WebGL remains excluded.
