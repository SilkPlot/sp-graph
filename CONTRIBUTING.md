# Contributing to SilkPlot

Thanks for helping build SilkPlot. This is a small, focused, Apache-2.0 library, and the
bar is high on one thing above all: **the architecture rule**.

## The one rule you cannot break

> **D3 computes. Solid renders.**

D3 modules are used **compute-only**. In the render path you may **never** use:

- `d3-selection`
- `d3-transition`
- `d3-axis`

These take ownership of the DOM and fight Solid's fine-grained renderer. Compute ticks from
a scale and render them with a Solid `<For>`; interpolate with `d3-interpolate` and drive the
frame yourself; animate through Solid reactivity + `requestAnimationFrame`, never
`d3-transition`. Any PR that imports a banned module in the render path will be declined.

## Setup

```sh
npm install
npm run build       # tsc -b across all packages
npm run typecheck
npm run dev         # launches the playground (Vite + Solid)
```

> Do not commit `node_modules/`, `dist/`, or `*.tsbuildinfo`.

## Conventions

- **TypeScript strict.** No `any` in public surfaces. Prefer precise, exported types.
- **SSR-safe.** No `window`, `document`, `ResizeObserver`, or canvas context at module top
  level. All DOM work goes in `onMount` / `createEffect` / directives.
- **Peer vs dep.** `solid-js` is a **peer dependency** of any package that exports Solid
  components. The chosen `d3-*` modules are **regular dependencies** of `@silkplot/core`.
- **ESM-first.** Coarse subpath `exports`; no umbrella `d3` import.
- **Keep it small.** Prefer a headless primitive over a finished chart. Stubs must be typed
  and carry a `TODO` mapped to the roadmap phase.

## Pull requests

1. Branch from `main`.
2. Keep the change focused; update the relevant `docs/` pointer if behaviour changes.
3. Ensure `npm run build` and `npm run typecheck` pass.
4. Describe *why*, not just *what*.

By contributing you agree your contributions are licensed under Apache-2.0.
