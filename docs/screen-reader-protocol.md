<!-- markdownlint-disable MD013 -->
# Screen reader test protocol

**No screen reader has ever been run against SilkPlot.** Not one, not partially.
Every accessibility claim this project makes rests on automated evidence —
computed styles, accessibility-tree assertions, keyboard and announcement
behaviour in real headless Chromium — and none of it on a person using a reader.

That is the single largest gap in the project, and it is not one the maintainers
can close by writing more tests. This document exists so that someone who
already has a screen reader can close it in about fifteen minutes.

**If you run this, we want the results whether they are good or bad.** A report
saying "step 4 announced nothing" is more valuable to this project than any
number of passing automated tests, and there is no wrong answer to submit.

Report via the
[accessibility issue form](https://github.com/SilkPlot/sp-graph/issues/new/choose).

---

## Before you start

**Test against <https://silkplot.pages.dev>.** It renders all four chart types
with the library's real accessibility surface. You do not need to install
anything or build the project.

Record these, because a result is not interpretable without them:

- Screen reader **and version** (e.g. NVDA 2025.1, not "latest"). Live-region
  behaviour differs between versions, so "latest" makes a report
  unreproducible.
- Browser and version.
- Operating system.

---

## Step 0 — the control test. Do not skip this.

**Before touching a chart**, confirm your reader is working on something that is
known to be fine. Open any ordinary page — a Wikipedia article, your own inbox —
and check that:

- it reads the page heading aloud;
- Tab moves focus and announces what it lands on;
- the browser address bar announces when focused.

**This is the most important step in this document.** A screen reader that is not
working and a chart with no semantics produce **identical** evidence: silence.
The maintainers previously spent a session testing charts with a reader that was
announcing nothing at all — not for the charts, not for menus, not for the
address bar — and very nearly logged a critical finding against code that was
probably correct.

If the control test fails, stop. Nothing after this point means anything.

---

## Step 1 — is the chart named?

Tab through the page until focus reaches the first chart.

- **Expected:** the reader announces a name — something like "Weekly bookings" —
  rather than "graphic", "image", or silence.
- **Record:** exactly what it said, verbatim, or that it said nothing.

An informative chart reaching the accessibility tree unnamed is the failure this
library's type system is specifically built to prevent, so a failure here is a
significant finding.

## Step 2 — is the chart ONE tab stop?

From the chart, press Tab again.

- **Expected:** focus leaves the chart entirely and lands on the next thing on
  the page — the "Show source" button.
- **Not expected:** Tab walking through individual data points. A chart with
  forty points should not be forty tab stops.
- **Record:** how many Tab presses it took to get past the chart.

## Step 3 — do the arrow keys move within the chart?

Tab back into the chart. Press the Right arrow, then Left, then Home, then End.

- **Expected:** each press announces a different data point — a date and a value,
  something like "Tuesday, 42 bookings".
- **Record:** what a single arrow press announces, verbatim. If it announces
  nothing, say so; if it announces something unhelpful like "3, 42", that is
  exactly the kind of finding worth reporting.

## Step 4 — is it flooded or repetitive?

Hold the Right arrow down for a couple of seconds, then release.

- **Expected:** announcements keep up roughly with your movement and settle
  quickly when you stop. You should not still be hearing points you passed
  several seconds ago.
- **Record:** whether it kept pace, lagged badly, or queued up a backlog.

This is the behaviour most likely to differ between readers, and it is the one
the automated tests can least honestly claim to have verified.

## Step 5 — can you reach the data table?

Every informative chart ships a real HTML data table containing the same data the
chart draws, associated with it via `aria-details`.

- **Expected:** your reader offers some way to reach it from the chart. In NVDA
  this is typically a "has details" announcement; in others it may appear as an
  adjacent table in browse mode.
- **Record:** whether you could get to it, and how. **If you could not find it at
  all, that is a valuable finding** — the table existing in the markup and being
  unreachable in practice is precisely the gap automated testing cannot see.

## Step 6 — the scatter chart

Scroll to the scatter chart ("Response time against load"). Its table is visually
hidden but is supposed to remain in the accessibility tree.

- **Expected:** it behaves like the others — named, one tab stop, arrow-navigable,
  table reachable.
- **Record:** any way in which it behaves differently from the earlier charts.

---

## What to send

Copy your recorded answers into the
[accessibility issue form](https://github.com/SilkPlot/sp-graph/issues/new/choose).
Verbatim announcements are far more useful than summaries — "it said 'graphic'"
tells the maintainers something specific; "naming seemed off" does not.

Partial results are welcome. If you get through step 2 and stop, send steps 0–2.

**You do not need to diagnose anything.** Describing what happened is the whole
job; working out why is the maintainers' problem.

---

## What this protocol deliberately does not claim

Passing every step above would **not** make SilkPlot WCAG conformant, and no such
claim will be made on the strength of it. Conformance is a formal assessment
against a specification. This is a functional check with one reader, in one
browser, on one operating system — which is far more than exists today, and far
less than conformance.

See [`accessibility.md`](accessibility.md) for what the library does provide and
what remains the application author's responsibility.
