# ADR-0011 — The legend is a standalone toolbar, and interactive targets have a floor

- **Status:** Accepted
- **Date:** 2026-07-20
- **Extends:** ADR-0005 (accessibility contract) and ADR-0008 §6 (controlled
  visibility). Supersedes neither.

## Context

ADR-0008 §6 settled what visibility *is* — controlled state with an uncontrolled
default, where isolate and show-all are caller operations over one array and the
empty set is a real state. It did not settle what presents that state.

Two questions had to be answered before a legend could be built, and both have
an appealing wrong answer.

**Where the legend lives.** The obvious shape is a `legend` prop on the chart:
smallest surface, best out-of-box experience, nothing for an application to wire
up. It also makes impossible every case §6 gives as the *reason* controlled
visibility exists — state shared across linked charts, persisted, or driven from
a URL. A legend that only ever exists inside one chart cannot drive two.

**How it is reached from a keyboard.** The obvious shape is a list of buttons,
each an ordinary tab stop. That is simplest, most discoverable, and needs no
custom key handling. It also produces twenty-two tab stops between the chart and
the rest of the page at the series count this library states as a requirement —
the precise outcome ADR-0005's single-entry composite exists to avoid.

Separately, the accessibility contract covered colour, contrast, focus, and
motion, and said nothing about **target size**. That gap was found by building
an interactive surface that needed it.

## Decision

### 1. The legend is a standalone primitive

`<Legend>` ships in `@silkplot/solid`, is placed by the application, and takes
the same `visibleSeries` / `onVisibilityChange` pair the charts take. It drives
the STATE, not a chart, so one legend can drive several charts by being wired to
the same signal.

It reads `Series` — the caller's input shape — rather than a normalised model,
so it can be mounted with no chart at all. Identity, order, and palette slot come
from the same rules the marks use (ADR-0008 §1 and §5, ADR-0009).

**No built-in legend on the chart.** Rejected for now rather than forever: a
default that renders a second legend beside the application's own is easy to add
later and hard to remove from published 0.x surface.

### 2. It is a toolbar with a roving `tabindex`

Tab enters the legend once; arrows move between entries; Home/End jump; Space
and Enter toggle; Tab and Shift+Tab always leave. Each entry is a real
`<button>` carrying `aria-pressed`.

A `listbox` was also considered and rejected. "Which series are shown" is
genuinely a multi-select, but a reader announcing *selected* for what the user
experiences as *shown* is worse wording than `aria-pressed` gives for free.

**Tab is not a key this toolbar handles well — it is a key the toolbar never
touches.** A composite that swallowed Tab would trap the page, which is the one
keyboard failure a keyboard-only user cannot recover from.

### 3. A swatch is a line, and never colour alone

Each entry draws its series' colour **and** its dash pattern, as a line rather
than a filled block — a block cannot show a dash. Two series a colour-blind
reader sees as one hue remain separable, which is what ADR-0005 §5 requires
("colour can encode but never uniquely encode"). The label is the third channel
and the one that survives everything.

A hidden entry dims **and** hollows its swatch **and** reports `aria-pressed`.
Opacity alone would encode state by colour, one level up from the failure the
palette's dash channel avoids.

### 4. There is no live region, and that is the announcement decision

A toggle's `aria-pressed` change is already announced by every screen reader.
Adding a live region alongside it announces the same state **twice**, which is
the failure this library has already met once: the chart's `live` and `option`
announcement channels are mutually exclusive by construction for exactly this
reason, because running both narrates every keyboard step in duplicate.

So the legend ships no live region, and a test asserts the absence — otherwise
the next author adds one "for accessibility" and makes it worse.

The entry's accessible NAME also stays constant across a toggle. Relabelling a
button from "Series A" to "Show series A" announces it as a different control,
and a reader that had it in a list finds the list rewritten underneath them. The
state travels on `aria-pressed`, which is what `aria-pressed` is for.

### 5. Interactive targets have a floor: 24 CSS px

`MIN_TARGET_PX = 24`, applied as `min-height`/`min-width` so a long label grows
the target rather than clipping it.

WCAG 2.2 SC 2.5.8 (Target Size, Minimum, AA) is where the number comes from.
**This is stated as an engineering floor honoured by construction, not as a
conformance claim** — the library makes no WCAG conformance claim at any level,
because no assistive technology has been tested against it.

## Alternatives

- **A `legend` prop on the chart** — rejected. See Context; it forecloses the
  linked-chart case that motivates controlled visibility in the first place.
- **Standalone plus a built-in default** — deferred rather than rejected. It is
  the best out-of-box experience and roughly doubles the surface of this
  decision; the data alternative already sets the precedent for a chart
  rendering its own companion, so this stays available.
- **One tab stop per entry** — rejected on the series count this library
  commits to. Reconsider if a future legend is capped at a handful of entries.
- **`listbox` with `aria-multiselectable`** — rejected on announcement wording.
- **44 px targets (SC 2.5.5, AAA)** — rejected as a default. It is the stronger
  bar and it makes a dense legend enormous; an application wanting it can set it
  through the entry's own styling.

## Consequences

- `series-style` moved from `@silkplot/charts` to `@silkplot/core`, because
  `solid` cannot import from `charts` and a second copy of the palette rule is
  what silently diverges. The public names re-export from `charts` unchanged, so
  nothing published breaks (ADR-0008 §12).
- **A legend that disagrees with its own marks is now structurally impossible
  rather than merely tested for** — both resolve from one function. Note the
  testing consequence, which is counter-intuitive: mutating that shared function
  moves the swatch and the mark *together*, so they stay equal and the seam test
  stays green. That is correct. The standing probe therefore breaks one
  consumer, not the source they share.
- The legend scrolls rather than clipping when capped. A clipped legend hides
  the control for a series the chart is still drawing, with nothing on screen to
  say the control exists.
- The legend is captured as its own visual surface (5 cases × 4 theme
  combinations, plus a focused state), not as a fifth chart family.

Up: [Decisions](index.md)
