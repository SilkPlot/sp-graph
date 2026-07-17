# SilkPlot architecture

> **This file is the load-bearing architecture reference.** It states the rules contributors
> working in this repo need close at hand.
>
> It states the rules **as they stand**. How each was arrived at — the context, the
> alternatives, and what it costs — lives in [decisions/](decisions/index.md) as ADRs.
> An accepted ADR is never edited; it is superseded.

## The rule: D3 computes, Solid renders

D3 ships two kinds of modules — those that **operate on data** and those that **manipulate
the DOM**. SilkPlot uses only the data ones, inside pure functions and Solid memos. Solid
owns every rendered element and updates it with fine-grained reactivity.

### Compute-only D3 modules SilkPlot permits

`d3-scale` · `d3-shape` · `d3-array` · `d3-path` · `d3-time` · `d3-time-format` ·
`d3-format` · `d3-interpolate` · `d3-scale-chromatic` · `d3-delaunay` ·
`d3-hierarchy` / `d3-force` for specific layout problems only.

That is the **permitted** set, not the used set. Today the source actually imports
`d3-scale`, `d3-shape`, `d3-format`, `d3-time-format` and `d3-delaunay` in
`@silkplot/core`, and `d3-scale-chromatic` in `@silkplot/theme`. The rest are
allowed when a real need arrives.

These are ordinary dependencies of the package that imports them — never peer
dependencies — so consumers do not manage a `d3-*` peer set. Note that
`d3-scale-chromatic` belongs to `@silkplot/theme`, not to `core`: palettes are a
theming concern, and `core` should not drag a colour ramp into a consumer that
only wanted a scale. This is the publication target; the pre-publication
manifests still declare a broader permitted set and must be narrowed to actual
imports before release.

### Banned modules (never in the render path)

`d3-selection` · `d3-transition` · `d3-axis`

They install a second renderer with conflicting DOM ownership. In particular, `d3-axis` is
treated as a *reference implementation of axis semantics*: SilkPlot computes ticks from the
scale (`scale.ticks()` + `d3-format` / `d3-time-format`) and renders tick groups with a Solid
`<For>`. The canonical example is `@silkplot/solid`'s `Axis`.

`Axis` also draws categorical axes. A band scale has no `ticks()` — that absence is how the
component discriminates — so `core`'s `computeBandTicks` returns one tick per domain entry,
centred on its band. There is no count to negotiate and no formatter to choose.

Behaviour modules (`d3-zoom`, `d3-brush`, `d3-drag`) are permitted **only** as narrow
directive/effect adapters that write into signals — never as owners of structure. (Not yet
implemented; retained in the dynamic-interaction roadmap.)

## Layered package model

| Layer | Package | Responsibility |
|---|---|---|
| Core model | `@silkplot/core` | Pure math: scales, extents, ticks, shape paths, overlap packing, hit-test indexes. No Solid, no DOM. |
| Solid primitives | `@silkplot/solid` | `ChartRoot`, `SvgLayer`, `Axis`, `Gridlines`, `Crosshair`, `TooltipAnchor`, `ChartAnnouncer`, `createCartesianModel`, `resolveTicks`, `createResize`, bounds context. |
| Composed charts | `@silkplot/charts` | `LineChart`, `AreaChart`, `BarChart`, `ScatterChart`, each composing `createCartesianModel` (marks; hit-test interaction pending). |
| Domain layout | `@silkplot/calendar` | Time-grid engine + deterministic overlap resolver (stubs; `packOverlaps` itself lives in `core` and is done). |
| Preset / theme | `@silkplot/theme` | Tokens as objects + CSS custom properties; palette ramps; motion/contrast-aware. |

## Substrate policy

- **SVG-first** for ordinary dashboards — semantic, accessible, inspectable.
- **Canvas** data layer where mark or calendar density warrants it.
- **WebGL** kept off the initial roadmap — reserve tier only.

## SSR safety

No `window`, `document`, `ResizeObserver`, or canvas context at module top level. All
DOM-dependent work belongs in `onMount`, `createEffect`, or a directive, so the library is
safe to import in SSR environments.

## Theming

Tokens are exposed twice: as a typed object for values that must exist in
JavaScript, and as `--sp-` CSS custom properties for anything that becomes a
rendered value. **A primitive reads the custom property with a fallback —
`var(--sp-color-grid, currentColor)` — and never imports `@silkplot/theme`.**
Importing it to build a short string would make an optional package mandatory and
drag `d3-scale-chromatic` into every consumer.

The property names are contract, and the mapping is not mechanical
(`tokens.fontSize.sm` → `--sp-font-sm`). Both are fixed in
[ADR-0001](decisions/adr-0001-theming-contract.md).

## Interaction

`Crosshair` and `TooltipAnchor` are **told a position** in inner coordinates.
Neither resolves the pointer, holds a hit index, or snaps — a snapped cursor is
one drawn at a snapped position, and the resolution belongs to a pointer model so
that a time series can use a cheap bisector where a point cloud needs Delaunay.
The tooltip is `aria-hidden`; a polite live region announces the value.
Contract and frame-budget rules:
[ADR-0002](decisions/adr-0002-crosshair-and-tooltip-anchor.md).

## Engineering priorities

Speed · fluidity · performance · first-hand experience · reuse and composition.
