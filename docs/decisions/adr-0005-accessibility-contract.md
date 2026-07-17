# ADR-0005 — The accessibility contract

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

SilkPlot exports chart primitives that applications compose. Accessibility for a
data visualisation is not a finishing pass — an unlabelled chart is not merely
"less accessible", it reaches a screen-reader user as a generic "graphic",
"object", or effectively nothing, so the user cannot tell a chart is present at
all. That makes accessibility part of the primitive contract, and a contract has
to be stated before components reach for it, or the first caller sets the
precedent by accident.

This ADR settles that contract at the library boundary. It was informed by a
review of accessibility research and shipping-library practice, and one of its
conclusions overturns an assumption the library previously held — see the
keyboard section. The reasoning is restated here in full so this record stands on
its own.

## Decision

### 1. Every informative chart can be named and described, and cannot silently become decorative

A view is **informative** (it carries data a non-visual user needs) or
**decorative** (the same information is fully available elsewhere). Informative is
the default; decorative is an **explicit opt-out prop**, never an implicit
fallback.

An informative chart requires an **accessible name** and exposes a **description
channel** and a **semantic data alternative**. The name is short and identifying
("Weekly bookings by clinic"); the description carries what the axes and shape
give a sighted reader — domain, range, units, series, span, trend, extrema,
notable points. Because visual axes are hidden from assistive technology, their
information must live in the description or the data alternative; hiding them is
only defensible once it does.

The failure mode for a missing required input is **not silence**:

- **Development** builds throw on a missing name and warn on a missing
  description or data alternative.
- **Production** may render an honest fallback name **only if** it also surfaces
  a warning/diagnostic hook. It must never downgrade an informative chart to
  decorative semantics silently.

This is stricter than common practice on purpose: optional accessibility ships,
repeatedly, as absent accessibility.

### 2. Always ship both an overview and a data alternative

There is no reliable size threshold at which a table replaces exploration. Tables
serve exact lookup; a summary serves overview and trend; users want both. So an
informative chart ships a **concise narrative summary** *and* a **semantic data
alternative** (a real HTML table; an agenda for the calendar). Point-by-point
exploration is an additional surface, not the only one. Any numeric switch-over
between per-point and grouped navigation is an engineering heuristic, labelled as
such, not an evidence-backed standard. Prefer an adjacent, everyone-visible "Data
table" control over a screen-reader-only hidden table.

### 3. Keyboard: a single-entry composite, not an application capture layer

A roving `tabindex` does **not** create one tab stop per mark. Roving tabindex and
grid composites keep a **single** tab stop and move focus internally with the
arrow keys — which is how shipping chart libraries avoid a ten-thousand-stop tab
order. (This library previously assumed the opposite; that assumption was wrong.)

The default interactive model is a **single-entry composite**: Tab enters once;
arrows, Home/End, and Page keys move inside; Tab and Shift+Tab always exit; Escape
cancels a submode or clears selection. A widget role — `grid`, `listbox`, or
`tree` — defines the internal contract. **`role="application"` is not the
default**: it competes with the screen reader's own browse-mode keys, is not a
reliable win, and a proper widget role already does the mode switch.

A **single-active-point** model (one stop, arrows step points, Escape clears) is
correct for **sparse, directly inspectable series**; it stops being sufficient as
the *only* model once overview matters more than stepping, well before thousands
of points. A **hierarchical tree** (overview → axes/legends → points) is the
runner-up for structurally rich charts. **Fully tabbable marks are rejected** —
they scale badly.

### 4. Announcements are committed, polite, and throttled

Announce state changes a user commits to — a keyboard step, a snapped cursor, a
committed range, a series toggle — not every hover sample. Use a **polite** live
region; reserve **assertive** for urgent or destructive outcomes. Live-region
behaviour varies across screen-reader and browser versions, so the primitive
promises **modest, de-duplicated, throttleable** announcements rather than
deterministic per-update speech, and the application supplies the wording. A
committed announcement carries at least series, x, y, and units ("Bookings,
Tuesday 4 March, 42 appointments"). The full trend narrative belongs in the
description, not the announcement stream. A cursor tracking a pointer must not
flood speech.

### 5. Colour, contrast, focus, motion

- **Colour never uniquely encodes.** Meaning is redundant across direct label,
  marker shape, stroke pattern, or luminance as well as colour.
- **Non-text contrast is 3:1** for focus indicators, cursor lines, selection
  outlines, active handles, and marks required to understand the chart.
  Gridlines are conditional: decorative scaffolding may stay light; gridlines
  needed to read values are meaningful and take the 3:1 (the high-contrast theme
  promotes them — see ADR-0004).
- **Focus is visible.** Removing the user-agent outline before a proven
  `:focus-visible` replacement is active, on light, dark, and high-contrast
  backgrounds, is not acceptable.
- **`prefers-contrast` drives a distinct token set** and composes with
  `prefers-color-scheme` as orthogonal axes (ADR-0004), not a specificity war.
- **Motion:** a cursor following the pointer one-to-one is user-controlled motion
  and is allowed under `prefers-reduced-motion`; authored easing, springs,
  animated draw-in, and inertial panning reduce or stop.

### 6. Substrate parity and the library/application boundary

Canvas exposes no per-mark semantics, so a Canvas view must ship a **parallel
semantic DOM layer** that produces the same accessible result — name,
description, keyboard model, and data alternative come from that layer, not the
pixels.

The **library** owns the universal mechanics: the programmatic entry point, the
keyboard composite, visible focus, contrast-safe tokens, reduced-motion hooks,
live-region plumbing, surface semantics, and the semantic table/agenda renderer.
The **application** owns domain meaning the library cannot know: the actual
title, units, and wording, what counts as the important trend, whether a
surrounding heading already names the chart. The API accepts direct values and
`aria-labelledby` / `aria-describedby` references rather than inferring page
context.

## Alternatives

- **Name/description optional, warn-only** — rejected as the default: it is how
  the ecosystem ends up with unnamed graphics in production. Warn-only survives
  only as a migration path with loud dev-time diagnostics.
- **`role="application"` capture surface** (the earlier reference approach) —
  rejected as a default for the reasons in §3.
- **A single size threshold that swaps exploration for a table** — rejected: no
  such threshold is evidence-backed; both surfaces ship, and any switch-over is a
  labelled heuristic.

## Consequences

- Composed charts gain a required name, a forwarded description channel, and a
  data-alternative surface; a missing name is a development-time error.
- The keyboard model becomes library behaviour (a composite widget role), not a
  per-application reference; the existing `role="application"` playground
  demonstration is a reference to be replaced, not the shipped model.
- The live-region primitive is integrated into charts with throttling, rather
  than left standalone.
- These are 0.x contract changes and are introduced deliberately. Several are
  currently unmet by the composed-chart layer and are staged as remediation
  rather than shipped at once; this ADR is the contract they implement against.
- Some questions remain honestly open — no universal keyboard point-count
  threshold, thin evidence on announcement and overlap wording, version-variable
  live-region behaviour. Public guidance states tested limitations and does not
  claim conformance for untested assistive-technology combinations.

Up: [Decisions](index.md)
