<!-- markdownlint-disable MD013 -->
# Accessibility

This is the author's guide to shipping an accessible chart with SilkPlot. It
covers what the library guarantees, what your application must supply and why,
and — in [Tested limitations](#tested-limitations) — exactly what has and has not
been verified.

The contract itself is [ADR-0005](decisions/adr-0005-accessibility-contract.md);
the mechanical upgrade path for existing code is
[the chart-semantics migration](migrations/chart-semantics-0.x.md). This file is
the one to read if you are writing a chart today.

Read [Tested limitations](#tested-limitations) before you quote anything here in
a procurement document. **No assistive technology has been tested against this
library.** That is stated up front rather than buried, because the rest of this
guide would be easy to mistake for a conformance claim, and it is not one.

---

## The division of labour

The library owns the mechanics that can be made universal. Your application owns
the domain meaning, because the library cannot know it honestly.

| Owned by SilkPlot | Owned by your application |
|---|---|
| A guaranteed programmatic entry point on every informative chart | The chart's actual **title** — the subject, in your product's words |
| The single-entry keyboard composite and its arrow contract | The **units**, and the wording of every value |
| A visible `:focus-visible` indicator that clears 3:1 on every supported surface | What counts as the **important trend**, and which points are notable |
| Contrast-safe tokens across scheme × contrast | Whether an **adjacent heading already names** the chart |
| Reduced-motion token collapse | Whether a "booking" is a booking, an appointment, or a reservation |
| Live-region plumbing, throttled and de-duplicated | Business rules worth mentioning — capacity, blackout periods, provisional data |
| The rendered `<table>` structure and its ARIA relationships | The column headers, the row formatting, and the caption |

This split is not a way of pushing work onto you. It is the only honest place to
draw the line. A library that generated a title from a prop name would produce
`"data"`; one that generated a summary from the numbers would state a trend it
cannot know is meaningful, in units it cannot know. Both would read as
accessibility while communicating nothing — the exact failure the contract
exists to prevent.

So the API takes direct values, and it also takes `aria-labelledby` /
`aria-describedby` references, rather than pretending it can infer page context.

---

## Informative or decorative — the first decision

Every chart is one or the other, and you decide which.

- **Informative** — it carries data a non-visual user needs. This is the
  default.
- **Decorative** — the same information is *fully* available elsewhere on the
  page. A sparkline beside the number it summarises. This is an **explicit
  opt-out**, and it is the only route there.

### A complete informative chart

```tsx
import { LineChart } from "@silkplot/charts";

<LineChart
  data={bookings}
  width={640}
  height={320}
  title="Weekly bookings by clinic"
  desc="Bookings per week from January to March 2026, in appointments. Rises from 120 in week 1 to a peak of 340 in week 7, then falls to 210. Week 5 is missing — the clinic was closed."
  summary="Bookings roughly doubled over the quarter, peaking in week 7 before easing back."
  table={{ columns: ["Week", "Bookings"] }}
  pointLabel={(d) => `Bookings, ${formatWeek(d.t)}, ${d.y} appointments`}
  onSemanticsIssue={(issue) => reportToMonitoring(issue.code, issue.message)}
/>
```

That chart exposes a name, a description, a narrative overview, a real HTML
table, a single-entry keyboard composite, a polite announcement channel with
your wording in it, and a diagnostic hook. Nothing else is required.

If a heading already names the chart, reference it instead of duplicating text
you then have to keep in sync:

```tsx
<h2 id="bookings-heading">Weekly bookings by clinic</h2>
<LineChart data={bookings} width={640} height={320} labelledBy="bookings-heading" desc="…" />
```

`title` and `labelledBy` are alternatives — supplying either satisfies the type.

### A complete decorative chart

```tsx
<p>
  <strong>1,284</strong> bookings this quarter, up 12%.
  <LineChart data={trend} width={80} height={24} decorative />
</p>
```

`decorative` removes the graphic from the accessibility tree
(`role="presentation"`, `aria-hidden="true"`) and does not give it a tab stop.
Passing `title`, `desc`, `summary`, or `table` alongside it is a type error:
either the chart is informative, or those values are dead weight that will never
be announced.

Use it only when the claim is true. "The trend is visible in the chart" is not
the same as "the same information is available elsewhere".

### The three-part failure mode

Getting it wrong is never answered with silence.

| Build | Missing name | Missing description channel |
|---|---|---|
| **Development** | **throws** | `console.warn` + `onSemanticsIssue` |
| **Production** | renders the fallback name `"Unnamed chart"` + `onSemanticsIssue` | `onSemanticsIssue` |
| **Decorative** | not applicable — an explicit opt-out, never implicit | not applicable |

The development throw is deliberately loud. A warning that scrolls past in a
busy console is how an unnamed chart reaches production, and an `<svg
role="img">` with no accessible name does not reach a screen-reader user as
"a slightly worse chart" — it reaches them as a generic "graphic", "object", or
nothing at all. They cannot tell a chart is present.

A production build renders an honest fallback name **and** reports the issue. It
never downgrades an unnamed informative chart to decorative semantics. That
would hide the failure by erasing the information, which is worse than the bug.

The type system carries the first line of defence: `title`/`labelledBy` and
`decorative` are arms of a discriminated union, so an unnamed informative chart
is not a representable state. `resolveChartSemantics` is the runtime backstop for
callers without types — plain JS, an `any`, a props object that arrived over the
network.

---

## Descriptions and the data alternative

An informative chart ships **both** an overview and the detail. Not one or the
other.

| Prop | Renders as | Carries |
|---|---|---|
| `title` | SVG `<title>` + `aria-labelledby` | the short identifying name |
| `desc` | SVG `<desc>` + `aria-describedby` | domain, range, units, series, span, trend, extrema, caveats |
| `summary` | an HTML `<p>` + `aria-describedby` | the narrative overview |
| `table` | a real HTML `<table>` + `aria-details` | the exact values, for lookup and verification |
| `describedBy` | an `aria-describedby` reference | prose your application already renders |

Supply at least one of `desc`, `summary`, `table`, or `describedBy`. With none of
them the chart raises a `missing-description` diagnostic.

**Both ship because both are needed.** A table serves exact lookup and
verification; a summary serves overview and trend. There is no size threshold at
which one replaces the other, and any number that claims to be one is an
engineering heuristic rather than an evidence-backed standard. Point-by-point
keyboard exploration is an *additional* surface on top of these two, not a
substitute for either.

### Why the axes being hidden is only just defensible

SilkPlot marks its visual axes and ticks `aria-hidden`. Read on their own, they
produce a stream of disconnected numbers with no structure — genuinely worse
than nothing.

That is only defensible because their information survives somewhere else. The
domain, the range, and above all the **units** have to be in your `desc` or in
your `table`, or hiding the axes has simply deleted them. This is the single
easiest thing to get wrong, and it is why a chart with no description channel at
all raises a diagnostic instead of passing quietly.

### The table

```tsx
// Rows derived from the chart's own data — the table and the picture cannot
// disagree, and both follow a data replacement together.
table={{ columns: ["Week", "Bookings"] }}

// Rows you format yourself — your date format, your rounding, your units.
table={{
  columns: ["Week", "Bookings"],
  rows: bookings.map((d) => [formatWeek(d.t), `${d.y} appointments`]),
  caption: "Weekly bookings, Q1 2026",
}}
```

`columns` has no default: the headers carry units and domain wording the library
cannot invent. `rows` is optional — omit it and rows are derived from the same
`data` the marks are drawn from. Derived timestamps go out as ISO 8601, which is
unambiguous and locale-independent; anything friendlier is domain wording, so
pass `rows` for it.

The table renders **visible by default**, as a following sibling of the chart's
measured box in normal document flow. That is deliberate. Sighted users
frequently prefer rows and columns, and a screen-reader-only table is a
last-resort progressive enhancement rather than the ideal. Position it with your
own CSS; find it at `[data-silkplot-alternative]`. `tableHidden` clips it to
assistive technology only — reach for that last.

---

## Keyboard behaviour

A chart is **one tab stop**, not one per mark.

| Key | Effect |
|---|---|
| <kbd>Tab</kbd> | enters the chart — once |
| <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> | step between points |
| <kbd>Home</kbd> / <kbd>End</kbd> | jump to the first / last point |
| <kbd>Page Up</kbd> / <kbd>Page Down</kbd> | move by `pageSize` points (default 10) |
| <kbd>Esc</kbd> | clear the selection, without moving focus |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | always leave — forward and backward |

Selection stops at the boundaries rather than wrapping, so arrowing does not
silently loop a user around a series they thought they were walking off the end
of. A modified arrow (<kbd>Ctrl</kbd>, <kbd>Alt</kbd>, <kbd>⌘</kbd>) is left
alone — it belongs to the browser or the screen reader. Escape with nothing
selected is left to the page, so it can still close your dialog.

The surface is a `listbox` composite with a roving active option. This is on by
default for an informative chart and always off for a decorative one — a
decorative chart is out of the accessibility tree, so a tab stop on it would
announce nothing. Turn it off with `keyboard={false}` if your application
provides its own model.

### `role="application"` is deliberately not used

An earlier reference implementation in this repository used
`role="application"` with `outline: none` and only left/right arrows. That was
replaced, not merely improved on.

`role="application"` tells the screen reader to hand its own browse-mode arrow
keys to the page. It is not a reliable win — a documented JAWS issue left the
virtual cursor active under it anyway — and it is not necessary: a proper widget
role (`grid`, `listbox`, `tree`) already performs the mode switch, and shipping
chart libraries use single-tab-stop composites precisely to avoid a
ten-thousand-stop tab order without capturing the page.

Fully tabbable marks are rejected for the same reason: they scale badly and put
the entire burden on sequential focus traversal.

`pageSize` defaults to 10 points. **That number is an engineering policy, not a
standard.** See [Tested limitations](#tested-limitations).

### Announcements

A keyboard step is a state change the user committed to, so it is announced. A
hover sample is not, so it is not — a cursor tracking a pointer must never flood
speech.

Two channels, mutually exclusive by construction, because running both announces
every step twice:

- `announce="live"` (default) — a polite `role="status"` live region.
- `announce="option"` — `aria-activedescendant` moves to the rendered option.
  This is the APG mechanism for a listbox and avoids depending on live-region
  behaviour, which varies by reader and version.

Announcements are throttled and de-duplicated: the first message of a burst is
written immediately, a burst coalesces to at most two writes per window (default
150 ms), the last message of a burst is never lost, and an unchanged message is
not re-announced.

Supply `pointLabel`. The default is honest but poor — the chart's own name, an
ISO timestamp, and the raw value — because the library knows neither your units
nor how your product writes a date:

```tsx
pointLabel={(d) => `Bookings, ${formatWeek(d.t)}, ${d.y} appointments`}
// → "Bookings, Tuesday 4 March, 42 appointments", not a bare "42".
```

Repeat series and axis context when a selection crosses into a new series or
domain. Keep the full trend narrative in `desc` or `summary` — it does not belong
in the announcement stream.

---

## Theme, contrast, and motion

### Contrast

**Non-text contrast is 3:1** for anything whose perception is required to use or
understand the chart: focus indicators, cursor lines, selection outlines, active
handles, and meaningful marks.

Gridlines are conditional. Decorative scaffolding may stay light; gridlines
required to *read values* are meaningful graphics and take the 3:1 — which is
why the high-contrast theme promotes the gridline token to a line the eye can
actually follow.

### The four combinations

`prefers-color-scheme` and `prefers-contrast` are orthogonal axes, resolved by
composing tokens rather than by a specificity war
([ADR-0004](decisions/adr-0004-scheme-contrast-combinations.md)). All four cells
are first-class, and each is reachable through the OS media query, an explicit
`data-sp-theme` attribute, and a themed subtree:

|  | normal | `prefers-contrast: more` |
|---|---|---|
| **light** | base `:root` palette | light high-contrast palette |
| **dark** | dark palette | dark high-contrast palette |

The fourth cell is not a formality. A single high-contrast palette on `:root`
either discards the contrast request on a dark surface or paints light
high-contrast values onto it — `#000000` text on `#14161a` measures 1.16:1, so
"more contrast" produced an invisible page. That defect is the reason the
combination is modelled explicitly.

Colour scheme is selectable two ways, because it is a product decision as much
as a user preference. Contrast and motion deliberately are **not**: they are
preferences the user agent owns, and an application overriding
`prefers-reduced-motion` would reintroduce motion for somebody who asked for
less.

### Focus

Removing the user-agent outline before a proven `:focus-visible` replacement is
active is not acceptable, and the library does not do it. The treatment is an
outline plus a surface-coloured halo: `outline-offset` alone leaves the ring
sitting on gridlines and series strokes, against which no ratio is guaranteed,
and the halo is what makes the measured surface ratio the ratio a user actually
experiences.

Put `FOCUS_CLASS` from `@silkplot/theme` on your own focusable elements to opt
into the same treatment. The indicator does not animate — a focus ring has
nothing to gain from easing, and an eased `outline-color` starts at
`currentColor`, so for the first frames the ring is painted in the *text* colour
rather than the focus colour.

### Colour is never the only channel

Colour may encode; it must never *uniquely* encode. Meaning is carried
redundantly — direct labels, marker shape, stroke pattern, or distinct
luminance alongside colour. Category encoding should be redundant rather than
monochrome: some users still prefer colour graphics, so removing colour is not
the answer.

### Motion

The distinction is between the user's motion and ours.

- **User-controlled motion is allowed** under `prefers-reduced-motion`. A cursor
  following the pointer one-to-one is the user moving their own hand.
- **Authored motion reduces or stops** — easing, springs, animated line-drawing,
  inertial panning, auto-scroll transitions.
- If pointer tracking itself adds smoothing or lag, that smoothing is authored
  motion and reduces too.

Under `prefers-reduced-motion: reduce` the motion tokens collapse to `0ms`.

---

## Tested limitations

State these, unedited, wherever this library's accessibility is described. They
are the difference between an honest account and a conformance claim.

### No assistive technology has been tested

**No assistive-technology testing has been performed against SilkPlot. None.**
There has been no NVDA, JAWS, VoiceOver, Orca, Narrator, or TalkBack run — not a
partial one, not an informal one. Nothing in this guide, in ADR-0005, or in this
repository should be read as saying otherwise, and no claim of screen-reader
compatibility is made or implied.

Consequently SilkPlot makes **no claim of WCAG conformance**, at any level, and
no claim of certification or procurement readiness. Where a specific measured
value appears — "this token pair measures 5.67:1 against the dark surface" —
that is a measurement of a computed style, and it is exactly as much as it says.
It is not a statement that the library conforms to a success criterion.

The assistive-technology matrix is recorded as an explicitly pending item in
[the release checklist](release-checklist.md). It is unchecked because it has
not been run.

### Four open evidence gaps

These are open questions, not settled ones, and the library's own behaviour is
built to survive them being answered either way.

1. **No universal keyboard point-count threshold exists.** There is no published,
   dependable number of points at which per-point stepping should give way to
   grouped or hierarchical navigation. `pageSize`'s default of 10 is an
   engineering heuristic and is labelled as one everywhere it appears. Treat any
   switch-over number you see — here or elsewhere — as a policy someone chose,
   not a standard someone measured.
2. **Announcement wording is guided by principle, not strong empirical
   testing.** "Include series, x-value, y-value, and units" is a well-reasoned
   principle drawn from how the information is structured, not a conclusion from
   usability studies with screen-reader users. It is why `pointLabel` is yours
   to supply rather than something the library dictates.
3. **Calendar overlap-announcement wording is explicitly untested.** The
   forward-looking model for conveying overlapping events as a text relationship
   ("Overlaps with two other events from 10:30 to 11:00") needs usability
   testing, not standards-reading. The calendar is not built; this gap is
   recorded so the deferred work does not inherit the wording as though it were
   settled.
4. **Live-region behaviour is version-inconsistent across assistive
   technology.** Screen readers queue, coalesce, and drop rapid updates
   differently by reader and by version. SilkPlot therefore promises **modest,
   de-duplicated, throttleable announcements** — it does not and cannot promise
   deterministic per-update speech. `announce="option"` exists precisely because
   `aria-activedescendant` does not depend on that behaviour.

### What *is* verified

The honesty above is not a disclaimer standing in for work. The following are
deterministic automated checks, run in real headless Chromium — never jsdom —
and gated in CI:

- **Semantics.** A missing name throws in a development build and produces a
  fallback name plus a diagnostic in a production one; an unnamed informative
  chart is never downgraded to decorative; decorative charts carry no name,
  description, or relationship attributes while still rendering their marks;
  every ARIA relationship (`aria-labelledby`, `aria-describedby`,
  `aria-details`) resolves to that chart's own nodes with several charts on one
  page. Asserted on the computed accessibility properties, per chart family.
- **The data alternative.** A real HTML `<table>` renders, with `scope="col"` /
  `scope="row"` headers and a caption, derived from the same data the marks are
  drawn from and updated by the same data replacement that moves them.
- **Contrast.** Every token pair and every categorical palette entry is
  recomputed against its surface with the WCAG relative-luminance formula, in
  all four scheme × contrast combinations — so a wrong hex fails on the number
  rather than on a stale comment.
- **Focus.** The ring is read from `getComputedStyle` on an element focused by a
  real <kbd>Tab</kbd> press (Chromium only matches `:focus-visible` for keyboard
  focus, so a programmatic `.focus()` would test the wrong pseudo-class), across
  eight scheme/contrast/forced-theme combinations, asserting the outline style,
  a width of at least 2px, a ratio of at least 3:1 against the resolved surface,
  and that the colour is the focus **token** rather than an inherited default.
- **Keyboard.** One tab stop and a `listbox` role rather than `role="application"`;
  arrows, Home/End, and Page keys move within; Tab and Shift+Tab always leave;
  Escape clears without moving focus; selection clamps at both boundaries and
  re-clamps when the data shrinks under it.
- **Announcements.** The live region stays polite while throttling; a burst
  coalesces; the last message of a burst survives; an unchanged message is not
  repeated; the live region and `aria-activedescendant` never run at once.

Several of these checks carry deliberate **controls** — an assertion that the
check can fail — because a browser that crashes and a browser that renders an
invisible focus ring produce the same empty output. The focus suite focuses a
probe reproducing the original `outline: none` defect and asserts that it *has*
no ring; the announcer suite asserts its observer sees every individual write.
Without those, a green run would prove considerably less than it appears to.

---

## Reporting a problem

Accessibility defects are ordinary defects here, not a separate category. Open an
issue at [github.com/SilkPlot/sp-graph](https://github.com/SilkPlot/sp-graph/issues).
Reports from real assistive-technology use are especially wanted — given the
limitation above, they are evidence this project does not currently have.

Up: [Documentation](../README.md#documentation)
