# SilkPlot — agent entrypoint

SilkPlot is an open-source Solid + D3 visualization library.

Follow the architecture in [`docs/architecture.md`](docs/architecture.md), and the
decisions in [`docs/decisions/`](docs/decisions/index.md). An accepted ADR is never
edited — supersede it.

## The rules that never bend

- **D3 computes, Solid renders.** D3 modules are used compute-only.
- **Never use `d3-selection`, `d3-transition`, or `d3-axis` in the render path.** Compute
  ticks from scales and render them with Solid.
- **SSR-safe.** No `window` / `document` / DOM work at module top level.
- `solid-js` is a **peer dependency** of Solid-exporting packages. Runtime
  `d3-*` use belongs in the importing package's regular dependencies
  (`d3-scale-chromatic` belongs to `@silkplot/theme`). Each manifest declares
  exactly what its package imports — verified, not assumed — so a new `d3-*`
  import means adding a real dependency, not finding it already permitted.
- **Primitives read theme tokens as `var(--sp-…)` with a fallback, and never import
  `@silkplot/theme`.** See [ADR-0001](docs/decisions/adr-0001-theming-contract.md).

## Package map

`@silkplot/core` (pure math) · `@silkplot/solid` (primitives) · `@silkplot/charts` (charts) ·
`@silkplot/calendar` (scheduler primitives) · `@silkplot/theme` (tokens) · `playground` (demo).

Engineering priorities: **speed, fluidity, performance, first-hand experience.**
