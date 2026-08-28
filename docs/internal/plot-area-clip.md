# Plot-area clip — capability boundary

This is an internal note, not a numbered ADR and not part of the public site.

## What each layer owns

**Viewport** (`createViewport` in `@silkplot/solid`, the ADR-0014 command
surface, the interval math in `@silkplot/core`) is interval arithmetic. It
answers which time window is in force. It does not decide how paint is clipped.

**Plot-area clip** is a paint capability of `CartesianFrame`. Cartesian marks
clip via Canvas (`ctx.clip` on a bitmap sized to the inner plot). Overlay SVG
(references, brush, active point) still uses one `clipPath` whose rect is
those same inner bounds. Axes and gridlines sit outside both.

The two are composed, not fused. A viewport change does not grow a one-off clip
flag, and the clip does not move the interval.

## Neighbour inclusion

A mark path for a narrowed interval includes every datum inside the interval and
one neighbour past each edge, when one exists. The neighbour is what lets a
segment enter or leave the plot; the clip hides the overflow so the painted
stroke runs to both plot edges instead of stopping short on the first and last
inside points.

That inclusion is paint-side (`marksForPlotInterval` / `dataWithinInterval`).
Inspection still windows the raw data-scope set. The table is unchanged
(ADR-0022).

## Canvas

The same clip semantics apply on the Canvas substrate cartesian marks use.
Neighbour inclusion is unchanged (`marksForPlotInterval`). The clip itself is
`ctx.clip` on the plot bitmap (or the bitmap's own bounds — equivalent), not
an SVG `clipPath`. Overlay SVG (references, the active point, the brush)
still uses the frame's plot-area `clipPath` so a threshold cannot paint over
an axis.

## What this is not

Not a numbered ADR. Not a member of `docs/decisions/`. Not LIMITATIONS, ROADMAP,
README, or site copy. Public wording, if any is needed, is a separate authorship
pass.
