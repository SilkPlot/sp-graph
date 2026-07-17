# ADR-0004 — Colour scheme and contrast resolve as combinations

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

[ADR-0001](adr-0001-theming-contract.md) settled the theming contract: the
`--sp-` custom-property names, when to read the token object versus the CSS
variable, the fallback rule, and — crucially for this decision — that colour
scheme is consumer-forceable (an app with its own light/dark toggle can make
charts follow it) while contrast and motion are not, because they are
accessibility preferences the user agent owns.

That ADR treated contrast as a single un-schemed axis. `tokensToCss()`
consequently emitted one high-contrast block on `:root`, carrying a palette
whose text was `#000000`. That palette is correct on a light surface (21:1) and
catastrophic on the dark surface `#14161a` (1.16:1 — invisible). Because scheme
and contrast are independent user preferences that can both be active, the
single block produced two different wrong results depending on how dark was
selected:

- **Under an operating-system dark preference,** the dark block's selector
  `:root:not([data-sp-theme="light"])` (specificity 0-2-0) out-specified the
  high-contrast `:root` block (0-1-0), so the increased-contrast overrides were
  **silently discarded**. A user who asked for more contrast received none — and
  the result passes a contrast check, because the dark text is legible; it is
  the *preference* that was dropped, invisibly.
- **Under an explicit `[data-sp-theme="dark"]` opt-in,** the two blocks tied on
  specificity and source order handed the win to high-contrast, painting
  `#000000` text on the `#14161a` surface: the 1.16:1 case.

The root cause is not the specificity numbers. It is that **a high-contrast
palette has to know which scheme it is contrasting.** There is no single "more
contrast" palette that is correct on both a white and a near-black surface. The
fix is to stop treating scheme and contrast as one axis.

## Decision

**Scheme and contrast resolve as first-class combinations. There are four
palettes, not three:** light-normal (the base), dark-normal, light-high-contrast,
and **dark-high-contrast** (new). The light high-contrast palette must never
apply on a dark surface, and vice versa.

The cascade expresses this without a specificity war. **Each high-contrast block
mirrors a colour-scheme block** — the identical selector, plus
`and (prefers-contrast: more)` — and every high-contrast block is emitted after
every scheme block. Because a high-contrast block has the same selector as its
scheme twin, it has the same specificity and matches exactly the same elements,
so it can only ever apply where that scheme applies, and it wins over its twin
purely on source order when contrast is active. The load-bearing cases then
resolve by construction:

- OS-dark + contrast → the dark-high-contrast block at `:root:not([…="light"])`
  (0-2-0) out-specifies the light-high-contrast `:root` block (0-1-0).
- explicit dark + contrast → among the equal-specificity blocks that match, the
  dark-high-contrast one is emitted last and wins on source order.
- a dark-themed subtree + contrast → only `[data-sp-theme="dark"]` blocks match
  the element, and the dark-high-contrast one is the sole high-contrast match, so
  it resolves through the attribute path with no dependence on the OS media.

Combined `@media (…) and (…)` queries and `:not()` selectors are sanctioned for
this; the browser target is modern.

A **forced-light `[data-sp-theme="light"]` block** (and its high-contrast twin)
is added for symmetry, so a light island inside a dark document restores light
rather than inheriting the surrounding dark. It is generated from the same
`tokens.color` source as every other palette, so automatic and forced values
cannot drift.

The **dark-high-contrast palette** overrides only what must differ from
dark-normal — text, grid, axis, focus ring — and inherits muted, cursor, and
surface through the cascade, so there is one source for each value. Its values
form a descending legibility ladder on `#14161a`: text `#ffffff` (18:1) > muted
`#98a2b3` (7:1, inherited) > axis `#808a9c` (5.2:1) ≈ focus `#4d8dff` (5.7:1) >
grid `#626a7a` (3.3:1). The high-contrast grid is promoted from decorative to a
meaningful line, because `prefers-contrast: more` is a request for more
contrast and a faint gridline defeats it. The dark focus ring `#4d8dff` replaces
`#0033cc`, which was 2.02:1 on dark — below the WCAG 3:1 non-text floor, and
failing precisely under a request for *more* contrast. Light high-contrast keeps
its existing values, which are correct on light.

Carried forward from ADR-0001 unchanged: the `--sp-` name mapping, the read-the-
object-vs-the-property rule, the unthemed-consumer fallback, and that contrast
and motion are media-only and never a `data-sp-*` attribute. This ADR extends
ADR-0001; it does not supersede it.

## Alternatives

**A single high-contrast block with one balanced focus/text value** — pick
colours that clear the thresholds on both a light and a dark surface at once.
This is less code, and a mid-luminance focus ring can be found that clears 3:1 on
both backgrounds. It was rejected because it cannot work for *text*: nothing is
simultaneously high-contrast on white and on near-black, so the increased-
contrast text would be a mediocre compromise on both instead of maximal on each.
The whole point of the mode is maximal separation.

**A specificity-only fix** — raise the high-contrast block's specificity so it
beats the dark block. Rejected because it still carries a light-only palette;
winning the cascade only means painting `#000000` text on dark more reliably.
The defect was never only about which block won.

## Consequences

- `tokensToCss()` emits colour-scheme overrides in three selectors (OS-media,
  explicit-dark, forced-light) and four high-contrast blocks. The invariant that
  the OS-dark and explicit-dark blocks carry identical dark values still holds
  and is asserted.
- **The tests that prove this must read computed styles in a real browser.** The
  previous theme tests ran in Node and asserted only that a CSS block *existed*
  and *contained* a declaration — never which declaration *won*, which is exactly
  why the defect was invisible for so long. The contract is now verified by
  injecting the stylesheet into Chromium, emulating `prefers-color-scheme` and
  `prefers-contrast`, and reading `getComputedStyle` for every cell of the
  matrix plus a subtree. A ladder-invariant test additionally forbids a future
  edit from brightening the grid past the axis, or the axis past secondary text.
- The `Axis` primitive now reads `--sp-color-axis` for its line and ticks (at the
  token's own value, with the previous `stroke-opacity: 0.4` removed — the token
  is already pre-muted, and stacking opacity on top would be two places deciding
  one colour) and `--sp-font-sm` for its tick-label size. Tick *labels* keep
  text-strength colour rather than the muted axis token, which would drop them
  below the text-contrast floor. This makes the advertised `axis` and `font`
  tokens actually change what a consumer sees.

Up: [Decisions](index.md)
