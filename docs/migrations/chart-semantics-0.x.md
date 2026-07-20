# Migration — chart semantics (0.x, breaking)

**This is a breaking 0.x contract change.** Every composed chart —
`LineChart`, `AreaChart`, `BarChart`, `ScatterChart` — now requires an explicit
accessibility posture. Code that compiled before this change will not compile
after it, deliberately.

It implements [ADR-0005](../decisions/adr-0005-accessibility-contract.md). Read
that for the reasoning; this file is the mechanical upgrade path.

## What changed, in one sentence

`title` was an optional prop and is now part of a discriminated union in which
an informative chart with no name is **not a representable state**.

## Why the break is worth it

An `<svg role="img">` with no accessible name is not "less accessible" — screen
readers announce it as a generic "graphic", "object", or nothing at all. The
user cannot tell a chart is present. The previous API made that outcome the
*default*, reachable by simply not passing a prop, and three of the four charts
in the playground reached it.

Three further gaps closed at the same time:

- `CartesianFrame` never forwarded `desc`, so although `SvgLayer` supported an
  SVG `<desc>`, **no composed chart could expose a description at all**. The
  chain was broken one level above the primitive.
- There was **no semantic data alternative** anywhere in the library.
- The axes are `aria-hidden`, and their information was relocated nowhere.
  Hiding them is only defensible once the description or the data alternative
  carries their domain, range, and units — which is now checked and reported.

## The upgrade

### 1. Name every informative chart

```tsx
// Before — compiles, and reaches a screen reader as "graphic".
<LineChart data={readings} width={640} height={320} />

// After
<LineChart data={readings} width={640} height={320} title="Weekly bookings by clinic" />
```

The name is short and identifying — the subject, and the chart type only when
the type changes the meaning. It is not a recitation of the data.

If a heading on the page already names the chart, reference it instead of
duplicating text you cannot keep in sync:

```tsx
<h2 id="bookings-heading">Weekly bookings by clinic</h2>
<LineChart data={readings} width={640} height={320} labelledBy="bookings-heading" />
```

`title` and `labelledBy` are alternatives; supplying either satisfies the type.
Supplying neither is a compile error.

### 2. Decide decorative charts explicitly

A chart is decorative only when the same information is **fully available
elsewhere on the page** — a sparkline beside the number it summarises, for
instance.

```tsx
<LineChart data={trend} width={80} height={24} decorative />
```

This removes the graphic from the accessibility tree (`role="presentation"`,
`aria-hidden="true"`). It is the only route there: nothing the library does will
ever downgrade an informative chart to decorative, including a production build
with a missing name.

Passing `title`, `desc`, `summary`, or `table` alongside `decorative` is a type
error. Either the chart is informative, or those values are dead weight that
will never be announced.

### 3. Add a description and a data alternative

An informative chart should ship **both** an overview and detail — the research
behind ADR-0005 is consistent that screen-reader users want both, and there is
no size threshold at which one replaces the other.

```tsx
<LineChart
  data={readings}
  width={640}
  height={320}
  title="Weekly bookings by clinic"
  desc="Bookings per week from January to March 2026, in appointments. Rises from 120 in week 1 to a peak of 340 in week 7, then falls to 210. Week 5 is missing."
  summary="Bookings roughly doubled over the quarter, peaking in week 7 before easing back."
  table={{ columns: ["Week", "Bookings"] }}
/>
```

Each channel does a different job:

| Prop | Renders as | Carries |
|---|---|---|
| `title` | SVG `<title>` + `aria-labelledby` | the short identifying name |
| `desc` | SVG `<desc>` + `aria-describedby` | domain, range, units, series, trend, extrema, caveats |
| `summary` | an HTML `<p>` + `aria-describedby` | the narrative overview |
| `table` | a real HTML `<table>` + `aria-details` | the exact values, for lookup and verification |
| `describedBy` | `aria-describedby` reference | prose your application already renders |

Supply **at least one** of `desc`, `summary`, `table`, or `describedBy`. With
none of them, the chart raises a `missing-description` diagnostic, because the
hidden axes then relocate their information nowhere.

### 4. The data table

`columns` has no default — the headers carry units and domain wording the
library cannot invent honestly. `rows` is optional: omit it and the chart
derives rows from the same `data` its marks are drawn from, so the table and the
picture cannot disagree, and both follow a data replacement together.

```tsx
// Rows derived from the chart's own data.
table={{ columns: ["Week", "Bookings"] }}

// Rows you format yourself — dates rendered your way, values rounded your way.
table={{
  columns: ["Week", "Bookings"],
  rows: readings.map((d) => [formatWeek(d.t), `${d.y} appointments`]),
  caption: "Weekly bookings, Q1 2026",
}}
```

Derived timestamps go out as ISO 8601. It is unambiguous and locale-independent;
anything friendlier is domain wording, so pass `rows` for it.

The table ships **collapsed behind a "Show data table" disclosure**, as a
following sibling of the chart's measured box, in normal document flow, together
with a "Download CSV" control. Both default on; turn them off with
`disclosure={false}` and `exportable={false}`.

Collapsed is not hidden. The table is clipped rather than `display: none`, so it
never leaves the accessibility tree — a screen-reader user reaches the same rows
whether or not the disclosure has been operated. The control is offered to
everyone because sighted users frequently prefer rows and columns too, and a
screen-reader-only table is a last-resort progressive enhancement rather than
the ideal. Position it with your own CSS — the library guarantees the structure
and the relationships, not the layout. Find it at
`[data-silkplot-alternative]`.

`tableHidden` clips it to assistive technology only. Reach for it last.

## What happens when you get it wrong

The failure mode is never silence:

| Build | Missing name | Missing description |
|---|---|---|
| Development | **throws** | `console.warn` + `onSemanticsIssue` |
| Production | fallback name `"Unnamed chart"` + `onSemanticsIssue` | `onSemanticsIssue` |

A production build never hides an unnamed chart to make the problem go away —
that would erase the information instead of reporting the failure. It renders an
honest fallback name and tells you.

Wire the diagnostic hook into whatever you already use for errors:

```tsx
<LineChart
  data={readings}
  title="Weekly bookings"
  onSemanticsIssue={(issue) => reportToMonitoring(issue.code, issue.message)}
/>
```

`issue.code` is `"missing-name"` or `"missing-description"`.

The development throw is intentionally loud. Optional accessibility ships,
repeatedly, as absent accessibility; a warning that scrolls past in a busy
console is how an unnamed chart reaches production.

## Codemod-shaped summary

1. Every `<XChart>` gains `title="…"` (or `labelledBy="…"`), **or** `decorative`.
2. Charts that were relying on `title` for a description move that text to
   `desc` and give `title` a short name instead.
3. Add `table={{ columns: [...] }}` wherever exact values matter — which is most
   places, since the axes are hidden.
4. Style or reposition `[data-silkplot-alternative]` to suit your layout.

## Types

```ts
import type { ChartSemanticsProps, ChartDataTable, ChartSemanticsIssue } from "@silkplot/charts";
```

`LineChartProps` is now `LineChartBaseProps & (SingleSeriesInput |
MultiSeriesInputWithFormat) & ChartSemanticsProps`. The input union is what makes
passing both `data` and `series` a compile error rather than only a runtime one
(ADR-0008 §12); a wrapper typed against the older two-part intersection will not
compile. The base
interface holds the chart's own options (data, size, curve, colours); the
semantics union holds the accessibility posture. Each chart exports both, so a
wrapper component can extend either half.

Up: [Decisions](../decisions/index.md)
