<!-- markdownlint-disable MD013 -->
# @silkplot/solid

Headless [Solid](https://www.solidjs.com/) primitives for
[SilkPlot](https://github.com/SilkPlot/sp-graph). D3 computes the geometry;
every element here is a Solid element with fine-grained updates. No second
renderer fights Solid for ownership of the DOM.

> **Alpha.** The API is pre-1.0 and will break. See the
> [repository](https://github.com/SilkPlot/sp-graph) for current status.

## Install

```sh
npm install @silkplot/solid solid-js
```

`solid-js` is a **peer dependency** — your application owns the one copy.

## What is here

| Export | What it is |
|---|---|
| `ChartRoot`, `SvgLayer` | the measured container and the SVG surface |
| `Axis`, `Gridlines` | ticks computed from the scale and rendered with a `<For>`, sharing one tick computation so they cannot disagree |
| `Crosshair`, `TooltipAnchor` | the interaction primitives (ADR-0002) |
| `ChartAnnouncer`, `ChartDataAlternative`, `ChartKeyboardSurface` | the accessibility surface (ADR-0005) |
| `createCartesianModel` | the reactive scale/bounds model every chart composes |
| `createResize`, `createChartKeyboard`, `createActiveDatum` | primitives for measurement, keyboard navigation, and shared active-datum state |

`Axis` takes a continuous **or** a band scale and discriminates on the absence of
`ticks()`. `d3-axis` is treated as a reference implementation of axis semantics,
never as a runtime primitive.

## Exports — two resolution paths

```json
"exports": {
  ".": {
    "source": "./src/index.tsx",
    "solid":  "./src/index.tsx",
    "types":  "./dist/index.d.ts",
    "default":"./dist/index.js"
  }
}
```

The `"solid"` condition serving **source** is load-bearing, not an oversight.
Solid's JSX compiles to fine-grained reactive DOM operations against a chosen
target (`dom`, `ssr`, or `universal`, with or without hydration markers). A
library that pre-compiles picks that target on its consumers' behalf forever, so
a Solid-aware bundler gets the TSX and makes the choice itself. `"default"`
serves a compiled ESM bundle for a bundler that knows nothing about Solid — one
built by Solid's own babel preset, never a generic JSX transform. See ADR-0006.

If you use `vite-plugin-solid` (or any Solid-aware bundler), you get the source
path automatically and nothing further is required.

## Licence

Apache-2.0. Copyright 2026 SilkPlot.
