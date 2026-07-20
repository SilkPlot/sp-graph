# ADR-0013 — Ranked categorical bars: input shape, orientation-stable formatters, and the activation seam

- **Status:** Accepted
- **Date:** 2026-07-20
- **Extends:** [ADR-0010](adr-0010-formatter-props-by-surface.md), whose
  surface-naming principle it applies to an orientable chart
- **Supersedes:** the `RankedBarsProps` declaration in
  `docs/examples/series-contract.ts`, specifically its `formatValue` field
- **Interacts with:** [ADR-0008 §1, §3, §4](adr-0008-series-and-state-contract.md)
  (identity, metadata, broken values) and
  [ADR-0005](adr-0005-accessibility-contract.md) (keyboard reachability)

## Context

`BarChart` shipped in `0.2.0-next.1` taking `data: readonly CategoryPoint[]`,
where `CategoryPoint` is `{ label: string; y: number }`. It has no identity, no
orientation, no formatting, and no way for a caller to learn that a reader
selected a bar.

The ranked contract had already been DECLARED, under ADR-0008's standing
obligation that a declaration becomes an import when its implementation lands and
must compile unchanged:

```ts
export interface RankedBarsProps {
  categories: readonly RankedCategory[];       // { id, label, value }
  orientation?: "vertical" | "horizontal";
  formatValue?: (value: number) => string;
  onActivate?: (category: RankedCategory) => void;
}
```

Every field diverges from what shipped. Three of those divergences are published
0.x surface that a registry does not let anyone quietly correct, so all three
were decided before any code was written.

## Decision

### 1. `categories` arrives ALONGSIDE `data`, not instead of it

Both are accepted and are mutually exclusive — `data?: never` on one member,
`categories?: never` on the other, with `assertOneInput` as the runtime backstop
for untyped callers. This is the shape the multi-series line and area surface
already established, reused rather than re-invented.

Adding an optional mutually-exclusive prop is additive; removing `data` is
breaking. 0.x permits breaking changes, but the alpha is published with a stated
install path and a README aimed at real users, and removing `data` buys only
tidiness. The cost of keeping it is one dispatcher the other two charts already
carry.

**There is ONE render path.** `data` is adapted into `categories` on the way in —
the label becomes the id, which is exactly what the old surface's identity
already was, since the band domain was built from labels. A second path would
drift; an adapter cannot. The evidence that the adaptation is behaviour-neutral
is that all 320 pre-existing chart tests passed against it unchanged.

One behaviour does change for a legacy caller with duplicate labels: they were
already getting one band for two rows, silently, and now get a `duplicate-id`
diagnostic saying so. That is strictly more information than before.

### 2. Formatters are named for the CATEGORY and VALUE axes, not for x and y

`RankedFormatProps` carries `categoryTickFormat`, `valueTickFormat` and
`tableValueFormat`. The declared `formatValue` is superseded.

ADR-0010 rejected a single `formatValue` on the time-series surface because one
value reaches surfaces with incompatible constraints: an axis tick with no room,
and a read-aloud surface that needs the full figure. **That argument is about the
surface, not the chart, and it transfers to ranked bars intact.** The declared
example is the case where it bites hardest — ZAR at 1.28 million, where the axis
wants `R1.28m` and an auditor reading the table wants `R1 284 500,00`.

The naming is a REFINEMENT of ADR-0010 rather than a copy of it, and the
refinement is the part worth inheriting. ADR-0010 could name its formatters
`xTickFormat` and `yTickFormat` because a time-series chart's axes do not move.
A ranked chart's do: `xTickFormat` would mean the categories in one orientation
and the values in the other, so a caller flipping `orientation` would silently
swap which formatter applied to which text. **The category axis and the value
axis are stable under orientation; x and y are not.** Naming by axis letter is
only surface-naming on a chart that cannot rotate.

### 3. `onActivate` hands back the caller's own `RankedCategory`

This is the library's first caller-facing activation callback. Sprint 007 owns
the general pointer-to-datum model, and shipping a narrower seam ahead of it
risks a signature that later has to widen on a published surface.

It is shipped anyway, because the declared signature is the most future-proof one
available: it returns the caller's OWN object, rebuilt from the normalised
record, and commits to nothing about the library's internal datum model. Sprint
007 can widen around it. The alternative — deferring — would have meant
superseding a second field of a four-field declaration in the phase meant to
honour it, which is a signal the declaration was wrong. It was not.

**Enter and Space activation lives in `createChartKeyboard`, not in the chart.**
Committing the active option is what a `listbox` does; a chart reimplementing it
would be a second opinion about a standard interaction. With no handler supplied
the keys are NOT claimed — the composite returns false and Space still scrolls
the page, because a surface that swallowed a key without acting on it would break
the page for no benefit.

### 4. Bars become keyboard-reachable, on both input shapes

`onActivate` reachable only by pointer would be a mouse-only feature, which
ADR-0005 does not permit. The keyboard composite is therefore offered on every
informative bar chart — including the legacy `data` shape.

Applying it to both shapes rather than only the ranked one is deliberate: a chart
that is keyboard-reachable only when the caller happens to use the newer prop is
the same inconsistency §2 rejects for formatters. It is additive (a new tab
stop), it matches `LineChart`, and it is an accessibility improvement rather than
a regression.

`FOCUSABLE.bar` in the visual acceptance set flips from `false` to `true`, and
the guard that enforced it fired exactly as its own comment predicted it would.

### 5. Long labels truncate on the axis, at a character count

Axis labels truncate at 20 characters with an ellipsis. `categoryTickFormat` is
the override, so no second prop was added — a truncation knob beside a formatter
that can already do the job is two ways to say one thing.

Truncation is by CHARACTER COUNT rather than measured text width. Measuring is
more precise and would make every visual baseline depend on font metrics resolved
at run time, which is how a deterministic baseline stops being one.

This is only defensible because the full label always survives elsewhere: in the
derived data table, in the CSV export, and in the accessible option text the
keyboard composite announces. It is the same position the accessibility contract
takes on hiding axes — permissible precisely because the information is
recoverable somewhere else.

### 6. Nothing sorts

`normalizeCategories` preserves the caller's order, and there is no sort prop. A
ranked chart is the surface where sorting is most tempting and most wrong to do
in the library: the caller ranked the data to get the ordering they want, and a
re-sort would make the picture disagree with the table, the export, and the array
that was passed in. `toCsv` already records the same position.

## Alternatives considered

- **Replace `data` with `categories`** — rejected. Breaking a published surface
  for tidiness, with no compensating benefit and no way to correct it after 72
  hours on npm.
- **A separate `RankedBars` component** — rejected, but it was the live fallback.
  It would have won if orientation had proved infeasible inside `BarChart`;
  `createCartesianModel` hardcodes a linear, inverted y, and three charts compose
  it. Resolved instead by adding a SIBLING model, `createRankedModel`, leaving
  the shared one untouched. Solid and charts test counts were unchanged across
  that work, which is the evidence the risk did not materialise.
- **Ship `formatValue` as declared** — rejected. It would preserve the
  obligation's byte-identity property perfectly, which has real evidentiary
  value, at the cost of two contradictory formatter idioms in one published
  library decided six weeks apart. ADR-0010 already paid for the knowledge that
  the single-formatter shape does not work.
- **Defer `onActivate` to Sprint 007** — rejected, and coherent. It would keep
  the whole activation surface landing at once. It would also leave ranked bars
  analytically complete but non-interactive for a sprint, and unwrite half the
  declared contract in the phase meant to implement it.
- **Measured-width label truncation** — rejected on determinism, as above.
- **`orientation` on the legacy `data` shape** — rejected. `data` stays exactly
  what it was; the `never` fields say so at compile time rather than accepting a
  prop and ignoring it.

## Consequences

- `RankedCategory`, `RankedOrientation` and `RankedFormatProps` are declared in
  `@silkplot/core` and re-exported, for the reason ADR-0010 put
  `MultiSeriesFormatProps` there: the contract examples typecheck under a
  deliberately DOM-free `lib`, and importing from `charts` pulls the Solid and
  DOM chain in behind pure types.
- The `RankedBarsProps` declaration is now an import. **Its example was edited,
  under this supersession** — which is the sanctioned path ("edit the
  implementation, or supersede the ADR"), and is the third time it has been
  taken, after ADR-0010 for §9 and ADR-0012 for §10. It was not bent to fit code
  that drifted.
- `SeriesIssue` gains an optional `categoryId`. The ranked model reports through
  the SAME diagnostic channel as the series model, so a caller wires one
  `onIssue` hook and hears about a dropped series, a dropped reference, and a
  dropped category through it.
- `assertOneInput` gains an `inputName` parameter. Its message hardcoded the word
  "series", which on a bar chart would have sent a caller looking for a prop that
  does not exist there.
- Grouped and stacked bars remain out of scope and behind their own backlog item.

Up: [Decisions](index.md)
