# Plot-area clip — capability boundary

This is an internal note, not a numbered ADR and not part of the public site.

## What each layer owns

**Viewport** (`createViewport` in `@silkplot/solid`, the ADR-0014 command
surface, the interval math in `@silkplot/core`) is interval arithmetic. It
answers which time window is in force. It does not decide how paint is clipped.

**Plot-area clip** is a paint capability of `CartesianFrame`. One SVG `clipPath`
whose rect is the inner plot bounds. Line, area, multi-series marks, and
reference overlays are children of that frame, so they share the clip. Axes and
gridlines sit outside it.

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

The same clip semantics apply when a Canvas substrate exists. Canvas is not
built. This note does not implement it and does not describe a second clip.

## What this is not

Not a numbered ADR. Not a member of `docs/decisions/`. Not LIMITATIONS, ROADMAP,
README, or site copy. Public wording, if any is needed, is a separate authorship
pass.
