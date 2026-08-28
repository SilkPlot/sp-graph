# ADR-0025 — Canvas promoted for the S016 sequence

- **Status:** Accepted 2026-08-28 (Adam signed in chat; this file is the durable record)
- **Date:** 2026-08-28

## Context

[ADR-0023](adr-0023-density-decimation-and-inspection.md) decision 1
recorded that **the density recovery is decimation over corrected SVG**
and that **Canvas is not promoted**. Accepted ADRs are never edited.
This file is the superseding record for one scoped override.

On 2026-08-28 Adam signed in chat: override ADR-0023 and promote Canvas
for the S016 wanted-implement sequence. Canvas is the named renderer.
WebGL stays excluded. Quiet-host density measurement stays parked.

This file is the durable record so implementers do not re-ask. It is
the decision, not the implementation. No `src` change lands with this
ADR.

## Decision

1. **Override ADR-0023 decision 1 for the S016 wanted-implement
   sequence only.** Canvas is promoted as the renderer. “Canvas is
   not promoted” and “decimation over corrected SVG” do not bind this
   sequence.

2. **Scope.** Shipped cartesian (line / area / bar / scatter,
   including the landed plot-area clip) and S016 heatmap /
   calendar-heatmap / any S016 view that would otherwise be SVG.
   Interactive and dynamic (hover, selection, data updates). No SVG
   anywhere in new S016 work.

3. **WebGL remains excluded.**

4. **Quiet-host density measurement stays parked.** This override is a
   product renderer decision, not a density-exit run.

5. **This ADR ships no implementation.** Feature work is sequenced in
   planning. Accepting this file does not change `src`.

6. **Overturn** is a later signed ADR.

## Alternatives

- **Keep ADR-0023 decision 1 for S016.** Rejected: Adam signed the
  override on 2026-08-28.
- **Leave the renderer unnamed.** Rejected: Canvas is the named
  renderer for this sequence.
- **Promote WebGL.** Rejected: WebGL remains excluded.
- **Treat this as a density-exit run.** Rejected: quiet-host density
  measurement stays parked; this is a product renderer decision.

## Consequences

- ADR-0023 is not edited. Decisions 2–4 (min/max decimation, explicit
  opt-in, raw-series inspection) are not reopened.
- Outside this sequence, ADR-0023 decision 1 remains the recorded
  general rule until a later signed ADR says otherwise.
- New S016 cartesian, heatmap, calendar-heatmap, and any other S016
  view that would otherwise be SVG is Canvas.
- Calendar virtualization leftover in S016 sits on the Canvas
  cartesian/calendar stack. The SVG `WeekGrid` path stays stopped.
- Quiet-host density measurement remains parked.
- WebGL remains excluded.
