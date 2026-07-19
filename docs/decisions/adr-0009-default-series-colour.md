# ADR-0009 — Default series colour follows array position

- **Status:** Accepted
- **Date:** 2026-07-19
- **Clarifies:** ADR-0008 §1 and §5. Does not supersede them.

## Context

ADR-0008 §1 establishes that a series is identified by a caller-supplied `id`
and never by its position in an array, and the reason it gives is worth quoting
because this record exists to stop it being over-applied:

> **Array index** breaks on reorder. A dashboard that sorts series by current
> value — which is exactly what a ranked operational view does — reassigns every
> colour, every legend toggle, and every visibility flag on the next tick, and
> nothing throws.

Read quickly, that says colour must follow identity. It does not: it says
*identity* must not be positional, and lists colour among the things that break
when identity is positional. Those are different claims, and the multi-series
implementation had to answer the narrower one — which palette slot does a series
get when the caller supplies no `stroke`? — that ADR-0008 left open.

Left unrecorded, a later author reads ADR-0008 §1, sees colour reassigned by a
sort, and "fixes" a deliberate behaviour.

## Decision

**A series' default palette slot is its index in the caller's `series` array.**
Everything ADR-0008 calls identity — data association, visibility, legend
toggles, table columns, lookups — remains keyed on `id` and is unaffected.

Three consequences, stated so none of them is a surprise:

1. **Hiding a series never recolours the others.** Visibility filtering does not
   renumber, because the slot comes from the position in the caller's own array
   rather than among the visible subset. This is the common operational case —
   an operator hides a spiking series to read the rest — and it is covered by a
   test and a standing detection probe.
2. **Reordering the array does change colours.** A caller who sorts series by
   current value gets a different colour assignment on each sort.
3. **A caller who needs a colour pinned sets `style.stroke`.** The per-property
   override means doing so keeps the dash channel, so pinning a colour does not
   silently discard the non-colour channel that ADR-0005 §5 requires.

## Why position rather than identity

- **Distinctness is guaranteed where it matters.** Sequential assignment gives
  every series a different colour up to the palette size. A hash of the id does
  not: two of four series can collide onto one slot, and a chart with two
  identically-coloured lines is a worse everyday outcome than a chart whose
  colours move when deliberately re-sorted.
- **It is what the ecosystem does**, so it is what a caller expects. A library
  that assigned colours by hash would surprise every user who has used another
  charting library, for a benefit most of them never need.
- **The failure is visible and recoverable.** A colour that moves when you sort
  is immediately apparent and has a one-line fix. A silent collision is neither.
- **Purity is preserved.** The considered third option — remember each id's slot
  from first render — survives reorder and avoids collisions, but requires the
  model to retain state. That would forfeit the property that makes stale
  identity structurally impossible in ADR-0008's normalisation: it is a pure
  function of its input, so nothing can survive that the input does not contain.
  Trading that for colour stability under sorting is a bad exchange.

## Alternatives

- **Hash of the series id** — rejected. Collisions within a small series count,
  arbitrary-looking assignment, and it solves a problem callers can already
  solve with `style.stroke`.
- **First-seen order, retained per chart** — rejected. It is the best behaviour
  on the merits and the worst on the architecture: the retained map is exactly
  the kind of state that goes stale, and it would be the only such state in the
  model.
- **Requiring an explicit colour per series** — rejected. It makes the simplest
  possible multi-series chart verbose, and a caller who has not thought about
  colour gets a worse default than the palette would have given them.

## Consequences

- Sorting a `series` array is a presentation change with a visible effect on
  colour. Applications that sort for ranking and also want stable colours should
  pin `style.stroke` per series, which is one line and explicit.
- The palette wraps, so beyond the palette size colours repeat regardless of this
  decision; dash pattern and the caller's own labels are what continue to
  separate series at that point.
- If a future engagement shows sorting-with-stable-colour to be a routine need
  rather than an occasional one, the first-seen map becomes worth its cost — and
  that is a new ADR superseding this one, not an edit to it.

Up: [Decisions](index.md)
