# Decisions

Architecture Decision Records for SilkPlot: short, numbered files capturing a
decision, why it was made, what was rejected, and what it costs.

Two rules make them useful:

- **An accepted ADR is never edited.** Supersede it with a new one that links
  back. The value is the trail, including the decisions that turned out wrong —
  a record quietly rewritten to match the present cannot tell you the reasoning
  was ever different.
- **The rationale is self-contained.** An ADR explains itself to a reader who
  has only this repository.

They live here rather than in [`architecture.md`](../architecture.md) because
that file states the rules as they stand now; these say how each rule was
arrived at.

## Records

- [ADR-0001 — The theming contract](adr-0001-theming-contract.md): the `--sp-`
  namespace and its fixed name mapping, when to read the token object versus the
  custom property, why primitives never depend on `@silkplot/theme`, the
  fallback rule for an unthemed consumer, and why colour scheme can be forced
  while contrast and motion cannot.
