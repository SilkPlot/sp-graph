# ADR-0010 — Formatter props are named by surface, not by value kind

- **Status:** Accepted
- **Date:** 2026-07-20
- **Supersedes:** the prop shape declared for ADR-0008 §9. §9's principle —
  formatting is the caller's, library defaults stay generic — is unchanged and
  is restated here rather than replaced.

## Context

ADR-0008 §9 settled the principle: tick text, tooltip wording, units, locale,
and display time zone belong to the caller, and the library's defaults stay
generic and locale-independent. That principle is not in question and is not
superseded.

What §9 also carried, in its typed example, was a prop shape:

```ts
export interface FormatterProps<M = unknown> {
  formatTick?: (value: Date) => string;
  formatValue?: (value: number) => string;
  formatTooltip?: (datum: SeriesDatum<M>, series: Series<M>) => string;
}
```

Those names describe the **value kind** a formatter receives. Building the
multi-series line and area surface showed that the value kind is not the axis a
caller wants to control — and the shape has two gaps that only appear once
something has to consume it.

**A time value reaches two surfaces with incompatible constraints.** The bottom
axis and the data table's instant column both carry a `Date`. An axis tick has a
few characters of room and wants `04 Mar`; a table cell is read aloud, one row
at a time, and wants the year. A single `formatTick` cannot serve both, and the
axis is the one that would win by default — leaving the table with either a
truncated instant or the ISO string it was already stuck with.

**`formatValue` had no reachable definition.** A number appears on the left
axis, in a table cell, and (later) in a tooltip. One prop across all three
either forces the axis' brevity onto the read-aloud surfaces or forces the
table's verbosity onto a 40px axis label. §9 did not say which, because nothing
consumed it yet.

**A value formatter needs to know which series it is formatting.**
`(value: number) => string` cannot: a chart legitimately carries a cumulative
total and an instantaneous rate at once — §5's per-series null policy exists for
exactly that chart — and one formatter serving both must be able to tell them
apart.

## Decision

**Formatter props are named for the SURFACE they reach, not the value kind they
receive**, and each surface gets its own.

```ts
export interface MultiSeriesFormatProps {
  xTickFormat?: (value: Date) => string;
  yTickFormat?: (value: number) => string;
  tableTimeFormat?: (t: Date) => string;
  tableValueFormat?: (y: number, label: string) => string | number;
}
```

Four consequences, stated so none is a surprise:

1. **A caller who wants one wording passes the same function twice.** That is
   explicit and costs a line. The reverse — one prop silently reaching two
   surfaces — is not something a caller can undo.
2. **`tableValueFormat` receives the series' own label**, so one formatter
   serves a chart whose series carry different units.
3. **`tableValueFormat` returns `string | number`.** The CSV export is defined
   as the table serialised, so a returned string reaches the downloaded file and
   a spreadsheet treats it as text. Returning a number formats nothing and keeps
   the export numeric. This is the one place the display/export tension is
   resolvable by the caller, and it is resolved by the return type rather than
   by a second prop.
4. **A gap never reaches `tableValueFormat`.** An empty cell stays empty. This
   is the §4 rule — a declared absence is not a value — applied one layer up:
   formatting "no value" is how a unit gets printed against a measurement nobody
   took.

**`formatTooltip` is NOT superseded and NOT renamed.** It stays declared and
unbuilt in the §9 example, because the multi-series path still exposes no
tooltip and no active datum. The many-series active-datum model is a later
decision, and publishing a formatter for it would pre-empt that decision by
shipping its signature. When that surface is built, its formatter joins
`MultiSeriesFormatProps` and is named for its surface like the rest.

**The single-series path is unaffected**, and passing these props to it is a
compile error rather than a silently ignored prop. It has its own wording
contract in `pointLabel`, wired to a keyboard announcement the multi-series path
does not have. Extending formatters to the single-series axes is legitimate and
is a later phase.

## Alternatives

- **Rename the implementation to §9's declared names** — rejected, and it was
  the default presumption. The standing rule established when this contract was
  settled is that an example never bends to fit the code, so the burden was on
  showing the decision was wrong rather than the implementation inconvenient.
  What showed it is that §9's
  shape has no expressible answer for the table's instant column: conforming
  would have shipped a documented gap into published 0.x surface, which a
  registry does not let anyone quietly correct.
- **One `formatValue` plus an opt-out flag per surface** — rejected. It answers
  the same question with a mode instead of a name, and modes are where a caller
  discovers by experiment which surface a flag reaches.
- **Formatters on a single `format` object prop** — rejected. It reads well and
  breaks Solid's reactivity in the ordinary case: an object literal in JSX is a
  new object every render, so a formatter closing over a signal either re-runs
  the table constantly or is read once and goes stale. Four flat optional props
  track individually.
- **Defer all formatting to a later phase** — rejected. §9 has been an accepted
  promise since Sprint 006 opened, and the surface it describes shipped to npm
  without it.

## Consequences

- ADR-0008 §9's principle is unchanged; only its declared prop shape is
  replaced. §9 carries a pointer to this record.
- The §9 example's `FormatterProps` declaration is now an import for the built
  props, under the obligation the original contract created. **Part 2 compiles unchanged** — verified by
  diff twice, not asserted.

  **Be precise about what that proves here, because it is weaker than it was for
  the series half.** No pre-existing Part 2 example exercised `formatTick` or
  `formatValue` on the time-series surface, so byte-identity establishes that
  nothing had to be edited — necessary, and on its own not sufficient. Two new
  examples (`withFormatting`, `withPerSeriesUnits`) were added AFTER the identity
  check to supply the other half of the evidence, and the docs typecheck was
  mutation-proved rather than trusted for exiting 0: renaming `xTickFormat` back
  to `formatTick` in `core` fails at the example's own line with TS2561,
  restored to zero residual.
- `MultiSeriesFormatProps` is declared in `@silkplot/core` and re-exported from
  `@silkplot/charts`. That looks misplaced and is not: this ADR's own examples
  typecheck under a deliberately DOM-free `lib`, and importing from the `charts`
  barrel pulls the Solid and DOM chain in behind four pure function types. The
  precedent already existed — `SeriesStyle` carries `stroke` and `dash`, and
  `SeriesTableOptions` is half of this interface. Consumers still import from
  `charts`.
- A caller formatting the table commits the CSV to the same text unless they
  return a number. That is one stated rule rather than a table and an export
  that disagree, which would be worse and silent.
- Three standing detection probes cover the wiring: a dropped value formatter, a
  gap reaching the formatter, and the two axis formatters crossed.

Up: [Decisions](index.md)
