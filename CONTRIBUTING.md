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
npm run lint        # biome — warnings are failures, same as CI
npm run build       # tsc -b across all packages
npm run typecheck   # tsc -b, plus the test/ directories via tsconfig.test.json
npm test            # vitest — node for core/theme, real chromium for solid/charts
npm run dev         # launches the playground (Vite + Solid)
npm run perf:hover  # frame-budget measurement; needs `npm run dev` running
```

`npm test` downloads a Chromium via Playwright on first run. `tsc -b` is incremental — run
`npm run clean` first if you need to trust a build from scratch.

> Do not commit `node_modules/`, `dist/`, or `*.tsbuildinfo`.

## Conventions

- **TypeScript strict.** No `any` in public surfaces. Prefer precise, exported types.
- **SSR-safe.** No `window`, `document`, `ResizeObserver`, or canvas context at module top
  level. All DOM work goes in `onMount` / `createEffect` / directives.
- **Peer vs dep.** `solid-js` is a **peer dependency** of any package that exports Solid
  components. The chosen `d3-*` modules are **regular dependencies** of the package that
  imports them — mostly `@silkplot/core`, but `d3-scale-chromatic` belongs to
  `@silkplot/theme`, where the palettes are. Existing pre-publication manifests
  are intentionally broader until release cleanup narrows them to actual imports.
- **Tokens, not imports.** A primitive reads `var(--sp-…)` with a fallback and never
  imports `@silkplot/theme`. See [ADR-0001](docs/decisions/adr-0001-theming-contract.md).
- **ESM-first.** Coarse subpath `exports`; no umbrella `d3` import.
- **Keep it small.** Prefer a headless primitive over a finished chart. Stubs must be typed
  and carry a `TODO` mapped to the relevant roadmap capability.

## Testing

Tests live in each package's **`test/` directory, never colocated in `src/`**. Packages ship
`src` to npm and `tsc -b` compiles it, so a colocated test would be both published to
consumers and emitted into `dist`.

`core` and `theme` run in node (pure math and CSS-string emission — no DOM). `solid` and
`charts` run in a **real headless Chromium**, not jsdom — `createResize` depends on `ResizeObserver` and `el.clientWidth`, and
jsdom implements neither (`clientWidth` is always `0`). A fake DOM would let that path pass
while proving nothing.

- **Never assert d3's exact output.** Tick counts are hints, and default formatters and path
  strings are version-sensitive. Assert structure and invariants, or compare two computed
  outputs to each other. Cross-check rendered ticks against `computeTicks` / `computeBandTicks`
  called in the test rather than hardcoding a number.
- **Deterministic only.** No `Math.random`, no `Date.now`, no bare `new Date()` — use fixed
  UTC dates. Prefer `toBeCloseTo` for pixel math.
- **Async work must poll.** Use `vi.waitFor` / `expect.poll` for anything driven by
  `ResizeObserver`; a bare `setTimeout` race is a flaky test, which is worse than no test.
- **Don't stub to manufacture coverage.** If a branch can't be exercised honestly in a real
  browser, leave it uncovered and say so. Testing a stub proves nothing about real behaviour.
- **Assert no `NaN` reaches rendered geometry.** Empty and single-point series are the usual
  culprits — `extentOf` returns `[0, 1]` for empty input.

Two traps worth knowing before you lose an hour to either:

- `createResize()` must be called **inside a rendered component**. Called bare in a test body,
  `onMount` never runs and you silently read back `{ width: 0, height: 0 }`.
- **A d3 scale is itself a function.** Storing one in a signal and calling `setScale(next)`
  hits Solid's updater overload, so the scale is invoked as `(prev) => next` instead of
  stored. Wrap it: `setScale(() => next)`. It fails silently at the call site.

## Pull requests

1. Branch from `main`.
2. Keep the change focused; update the relevant `docs/` pointer if behaviour changes.
3. Ensure `npm run lint`, `npm run build`, `npm run typecheck`, and `npm test` pass.
   Lint runs with `--error-on-warnings`, so a warning fails CI — plain `biome lint`
   exits 0 on warnings, which is exactly how six of them once accumulated under a
   green build.
4. Cover new behaviour with a test that fails without your change.
5. Describe *why*, not just *what*.

By contributing you agree your contributions are licensed under Apache-2.0.
