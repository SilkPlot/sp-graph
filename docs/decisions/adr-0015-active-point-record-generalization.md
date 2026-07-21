# ADR-0015 — The active-point record is generic over its datum

- **Status:** Accepted
- **Date:** 2026-07-21

## Context

[ADR-0014](adr-0014-interaction-and-viewport-contract.md) §1 fixed one
active-datum record, `ActivePoint`, written by every input path and read by every
surface. It typed the record's `datum` field as `SeriesDatum` — the time-series
`{ t, y, meta }` datum — and its domain position `at` as
`{ time } | { category }`.

Building the lookups that produce the record showed that shape is time-series
only, and the library ships two families whose datum is not a `SeriesDatum`:

- **`ScatterChart` plots `{ x: number; y: number }`** — a numeric point, not an
  instant-and-value, and its x is not a time. `SeriesDatum` cannot hold it, and
  the `at` union has no member for a numeric point.
- **The ranked categorical surface plots `{ id, label, value }`** — a category,
  not a `SeriesDatum`. Its `at` is a category, which §1 covers, but its datum is
  not the type the record declared.

ADR-0014 §2 requires all three families to *"produce the same public active-datum
record."* As §1 wrote it, they cannot: a single record with a `SeriesDatum` datum
and no numeric-point position is not producible for a scatter, and the typed
example that declared it could never become an import that compiles for one. This
ADR corrects the record shape and nothing else about ADR-0014.

## Decision

**The record is generic over its datum type**, and the position union gains the
numeric-point member the scatter needs. Only these two things change; every other
part of ADR-0014 §1 — one record per chart, written by every input, read by every
surface, carrying the caller's own `sourceIndex` and the per-instant values a
shared cursor needs — stands unchanged.

```ts
interface ActivePoint<D = unknown> {
  seriesId: string;
  sourceIndex: number;
  /** The datum itself, in the caller's own shape for this chart family. */
  datum: D;
  position: { x: number; y: number };
  at:
    | { kind: "time"; time: Date }
    | { kind: "value"; x: number; y: number }
    | { kind: "category"; category: string };
  atTime?: readonly { seriesId: string; datum: D }[];
}
```

Each family instantiates `D` with the datum it actually holds:

- a time chart produces `ActivePoint<SeriesDatum<M>>`, `at.kind === "time"`, and
  populates `atTime` across visible series;
- a scatter produces `ActivePoint<XYPoint>`, `at.kind === "value"`, no `atTime`;
- a ranked chart produces `ActivePoint<RankedCategory>`, `at.kind === "category"`,
  no `atTime`.

**The type parameter is the DATUM, not the metadata.** ADR-0014 wrote
`ActivePoint<M>` where `M` was the tooltip-metadata generic; the metadata now
rides inside `D` for the one family that has it (`D = SeriesDatum<M>`), because a
scatter point and a ranked category have no `meta` channel and a parameter naming
one for them would be a field that is always absent. `unknown` remains the
default, so a consumer that does not name the family cannot read a field off the
datum by accident — the same reason ADR-0008 §3 defaulted its own generic to
`unknown`.

This keeps ADR-0014's load-bearing property: **one record shape, one lookup
interface, every surface reads the same value.** Generalising the datum is the
smallest change that lets the three families share it; the alternative — a
per-family result type — is rejected below.

## Consequences

- ADR-0014 §1 gains a supersession note pointing here, in the shape ADR-0008 §9
  and §10 use. The DEFAULT and the invariant it stated stand; only the datum's
  type parameter and the `at` union are superseded.
- The typed examples and the 0.x migration are updated under this supersession —
  a decision changing, not an example bent to fit drifted code. They now exercise
  all three families rather than the time series alone, which is stronger evidence
  than the single-family declaration was.
- The lookup builders each instantiate `D` and share one `ActivePointIndex<D>`
  interface. The bisector, the Delaunay index, and the band lookup stay separate
  implementations because they change independently — the shared thing is the
  record and the interface, not the resolution. This is the seam, not the surface.
- Nothing that shipped changes: no `ActivePoint` was published, so this is a
  correction to unbuilt surface, additive at 0.x with the rest of ADR-0014.

## Alternatives

- **Keep `ActivePoint` time-series only; give scatter and bar their own result
  types.** Rejected. It abandons ADR-0014's and ADR-0002's single-record promise,
  multiplies the shapes the cursor, tooltip, and announcer must each handle, and
  reopens exactly the "two surfaces disagree about what is active" defect the
  single record exists to prevent. Three families that must all feed one cursor
  are one contract with three implementations, not three contracts.
- **A datum union `SeriesDatum<M> | XYPoint | RankedCategory` on a non-generic
  record.** Rejected. Every reader would narrow the union at every use, and a
  time-series consumer would get a datum typed as possibly a category. The generic
  gives each family its exact datum type with no narrowing, which is what a caller
  handing a datum back to their own code needs.
- **Constrain `ScatterChart` to time-on-x so the original `at` holds.** Rejected.
  The chart is published with a numeric x/y datum; narrowing it to time to fit a
  record shape is a breaking change to a shipped chart for no consumer benefit.

Up: [Decisions](index.md)
