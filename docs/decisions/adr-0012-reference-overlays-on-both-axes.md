# ADR-0012 — Reference overlays on both axes, and their precedence against a dashboard scope

- **Status:** Accepted
- **Date:** 2026-07-20
- **Extends:** [ADR-0008 §10](adr-0008-series-and-state-contract.md), whose
  `ReferenceValue` shape it widens
- **Interacts with:** [ADR-0007 §3](adr-0007-layered-time-selection.md), whose
  precedence order it defers to

## Context

ADR-0008 §10 settled that reference overlays participate in the domain by
default, and declared the shape:

```ts
{ id: "sla", value: 95, label: "SLA floor", includeInDomain: true }
```

That was enough to decide the domain question, which was the question §10 was
asked. Building the overlay surfaced two things it did not decide, and both are
published 0.x prop surface or a public visual default — the class of decision a
registry does not let anyone quietly correct later.

**First, §10's shape describes a horizontal, numeric reference only.** The
operational workload it exists to serve is not only thresholds: the same
dashboard marks deployments, incidents, and maintenance windows, which are
instants on the x axis rather than values on the y. Every one of them is the
same object — an id, a label, a position, a style, a domain question — differing
only in which axis it is positioned on.

**Second, §10's default collides with ADR-0007.** `includeInDomain` defaults to
`true`, so the axis expands to contain the line. On the time axis, the visible
interval is not the chart's to expand: ADR-0007 §3 states a total precedence
order over it — global range, then section override, then latest. §10 was written
before that interaction existed on any axis but y, and does not mention it.

## Decision

### 1. A reference is a union over the axis it sits on

```ts
type ReferenceValue =
  & {
      id: string;
      label: string;
      includeInDomain?: boolean;
      style?: Pick<SeriesStyle, "stroke" | "strokeWidth" | "dash">;
    }
  & ({ value: number } | { time: Date });
```

`value` is a number on the y axis and draws horizontally; `time` is an instant
on the x axis and draws vertically.

**The discriminator is the field name, not a separate `kind`.** A
`kind: "horizontal"` beside `value: number` would be a second place stating one
fact, and therefore a second place for it to be wrong — a record claiming
`kind: "vertical"` while carrying a `value` has no correct interpretation.

**One array, not two props.** Rejected: `references` for numeric and
`timeReferences` for temporal. Three things have to consider both axes together
— the label collision solver, the paint order, and the accessible list — and
two arrays give each of those an undefined ordering between them. It would also
give `includeInDomain` two meanings depending on which array it was written in,
which is exactly the ambiguity §2 rejected for series input.

The existing numeric examples are unaffected: `{ id, value, label }` matches the
numeric member unchanged, which is why the substitution in
[`docs/examples/series-contract.ts`](../examples/series-contract.ts) left Part 2
byte-identical.

### 2. On the time axis, a dashboard scope beats a reference

`includeInDomain` governs the **standalone** domain — the one taken from the
data's own extent. Inside a `<Dashboard>`, the resolved effective domain wins,
and a reference outside it is clipped rather than widening it.

ADR-0007 §3's precedence is a **total** order, and a reference overlay is not a
scope. If it could widen the interval, a tile would show a range its own
dashboard's control says it is not showing, with nothing on screen marking it as
different — the failure ADR-0007 §4 names, and the one `narrow()` already
refuses for data. A chart quietly disagreeing with the control above it is worse
than a threshold the user has to widen the range to see, because only one of the
two is visible as a problem.

The cost is real and is accepted: §10's stated reason for the `true` default —
that a line drawn nowhere is a silent failure — is not honoured on the time axis
under a scope. It is mitigated rather than dismissed: an out-of-scope reference
is still listed in the chart's accessible reference list, so it is absent from
the picture but not from the chart.

Rejected: **references widen the scope**, honouring §10 uniformly. It buys
consistency between the two axes and loses consistency between two charts in one
dashboard, which is the more visible and more damaging of the two.

### 3. References paint above the marks, and never over the axes

Paint order is gridlines → marks → references. Above the marks, because a
threshold is read *against* the data and the workload §10 names is
twenty-two series: under them, the line is occluded exactly where it matters
most. The cost is a hairline of data covered per reference, which is why the
default stroke is 1px.

**"Never over the axes" is achieved by clipping, not by ordering**, and the
distinction matters because it is what makes the guarantee stable. The frame
paints its axes before its children, so a mark already paints above an axis and
no ordering of children could have put references below one. Every line and
label is instead confined to the inner plot rect, which the axes sit outside —
so the guarantee holds whatever the frame does next.

### 4. A reference's meaning never lives only in its drawn label

Every reference is an entry in an unconditional, always-exposed list rendered
beside the chart, worded by the caller's **axis** formatters (ADR-0010) rather
than a third formatter prop that could disagree with the axis the line is drawn
against.

This is what makes the collision fallback defensible. When two labels collide
they are stacked into lanes; when no lane fits inside the plot the label is
**dropped** — not truncated, not shrunk, and never spilled over an axis, whose
information the accessibility contract treats as required. A dropped label costs
a sighted reader a glance at the list. A label drawn over an axis costs every
reader the axis.

It is also the only route by which a screen-reader user learns a threshold
exists at all: SVG `<text>` inside a `role="img"` graphic is not explorable, so
a reference absent from the description and the list is absent entirely.

### 5. The reference colour is a neutral, and that is forced

`--sp-color-reference` joins the four scheme × contrast palettes. It is a
neutral rather than a hue because the categorical palette is Okabe-Ito and
already spends orange, blue, green, yellow, vermillion, purple and a grey — any
hue chosen here would collide with a series on some chart.

A reference is therefore separated from the marks by **weight**, and from the
other neutral chrome by two non-colour channels: it is dashed where the crosshair
is solid, and it always carries a text label where the crosshair never does
(ADR-0005 §5 — colour may encode, never uniquely encode).

## Consequences

- ADR-0008 §10's `ReferenceValue` shape is superseded by §1 above. Its domain
  DEFAULT is unchanged, and its reasoning for that default still stands on the
  value axis.
- A reference is normalised by `normalizeReferences` in `core`, beside the
  series model and deliberately not through it. A reference routed through
  `normalizeSeries` would acquire a legend entry, rows in the derived table, and
  a vote in the visible-series domain — three surfaces asserting a measurement
  nobody took.
- The posture on bad input follows §1 and §4 rather than inventing a second one:
  a duplicate id is structural (development throws, production keeps the first
  and diagnoses), and a non-finite position is data (dropped, diagnosed, and
  never coerced to zero).
- Reference issues report on the SAME `onIssue` channel as series issues. A
  caller who wired one hook to their logger must not have to wire a second to
  hear that a threshold was dropped.
- The time-axis exception in §2 means `includeInDomain` is not uniform across
  the two axes. That asymmetry is deliberate and is the thing most likely to be
  "fixed" for consistency; it is recorded on `referenceDomainOf` as well as here.

## Examples

`referencesOnBothAxes` in
[`docs/examples/series-contract.ts`](../examples/series-contract.ts) exercises
the widened shape: a threshold on the y axis and an event on the x, in one
array, with per-record domain participation and a non-colour style override.

It exists because byte-identity could not have proved this half. The existing
`denseOperational` example compiled **unchanged** against the new type, which
establishes that no example HAD to be edited — a real result and a narrow one,
since every reference it names is numeric, so the `{ time: Date }` member could
have been unusable and that check would still have passed. Widening a declared
shape is the one substitution byte-identity cannot fully witness, and this is the
weaker-but-necessary second half of the evidence.

Up: [Decisions](index.md)
