# SilkPlot — agent entrypoint

SilkPlot is an open-source Solid + D3 visualization library.

Follow the architecture in [`docs/architecture.md`](docs/architecture.md).

## The rules that never bend

- **D3 computes, Solid renders.** D3 modules are used compute-only.
- **Never use `d3-selection`, `d3-transition`, or `d3-axis` in the render path.** Compute
  ticks from scales and render them with Solid.
- **SSR-safe.** No `window` / `document` / DOM work at module top level.
- `solid-js` is a **peer dependency** of Solid-exporting packages; `d3-*` modules are
  regular dependencies of `@silkplot/core`.

## Package map

`@silkplot/core` (pure math) · `@silkplot/solid` (primitives) · `@silkplot/charts` (charts) ·
`@silkplot/calendar` (scheduler primitives) · `@silkplot/theme` (tokens) · `playground` (demo).

Engineering priorities: **speed, fluidity, performance, first-hand experience.**
