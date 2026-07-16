# SilkPlot architecture

> **This file is the load-bearing architecture reference.** It states the rules contributors
> working in this repo need close at hand.

## The rule: D3 computes, Solid renders

D3 ships two kinds of modules — those that **operate on data** and those that **manipulate
the DOM**. SilkPlot uses only the data ones, inside pure functions and Solid memos. Solid
owns every rendered element and updates it with fine-grained reactivity.

### Compute-only D3 modules SilkPlot uses

`d3-scale` · `d3-shape` · `d3-array` · `d3-path` · `d3-time` · `d3-time-format` ·
`d3-format` · `d3-interpolate` · `d3-scale-chromatic` · `d3-delaunay`

These live in `@silkplot/core`. They are ordinary dependencies of that package — never
peer dependencies — so consumers do not manage a `d3-*` peer set.

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
implemented; roadmap Phase 2.)

## Layered package model

| Layer | Package | Responsibility |
|---|---|---|
| Core model | `@silkplot/core` | Pure math: scales, ticks, shape paths, overlap packing, hit-test indexes. No Solid, no DOM. |
| Solid primitives | `@silkplot/solid` | `ChartRoot`, `SvgLayer`, `Axis`, `createResize`, bounds context. |
| Composed charts | `@silkplot/charts` | `LineChart`, `AreaChart`, `BarChart`, `ScatterChart` (marks; hit-test interaction pending). |
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

## Engineering priorities

Speed · fluidity · performance · first-hand experience.
