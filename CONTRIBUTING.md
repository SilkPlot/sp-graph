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
  `@silkplot/theme`, where the palettes are. Each manifest declares exactly the modules its
  package imports — verified, not assumed — so a new `d3-*` import means adding a real
  dependency rather than finding it already permitted.
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

### Running the browser suites

**Run one Vitest project at a time and pin its port.** Vitest's browser mode auto-probes for
a port, so two concurrent runs collide — and the collision does not report as a collision. It
reports a connect timeout, executes **zero** tests, and finishes in about a second, which
reads exactly like a fast pass. The visual harness is a separate Playwright process and
counts as a second runner, so never run it alongside a Vitest browser project.

```sh
npx vitest run --project core                                   # node
npx vitest run --project solid --browser.api.port=63710         # chromium
npx playwright test -c playwright.visual.config.ts              # not concurrently
```

Read `$?` directly rather than through a pipe — piping a run to `tail` masks the exit code, so
a crashed suite reads as success.

## What CI enforces

Beyond lint, typecheck, build, and the suites, CI runs gates that fail for reasons a passing
test run cannot show you. Each is runnable locally, and each exists because the thing it
checks has gone wrong before:

| Command | What it fails on |
|---|---|
| `npm run gate:accessibility` | An accessibility suite has gone missing, been emptied, or become unreachable. A suite-wide green cannot tell you the accessibility files were among the ones that ran, and deleting a failing test is the cheapest way to stop it failing |
| `npm run gate:build-hygiene` | A generated config shadows the TypeScript source, or a package `dist` holds output whose source no longer exists |
| `npm run gate:duplication-scope` | A test file is missing from one of the Codacy scoped exclusion lists (duplication, metric, **and lizard**). Those must be literal paths — globs silently do not match there, so the list rots invisibly as tests are added |
| `npm run gate:visual-baselines` | A pinned screenshot changed without a recorded rationale. Re-pinning is a decision about what "correct" means, not a fix |
| `npm run release:verify` | The packed tarballs fail outside the workspace: a manifest carrying tests or stale files, an internal dependency off the coordinated version, or an export condition pointing at source |
| `npm run test:coverage` | Per-package coverage floors, chosen from observed runs rather than a round number |
| `npm run gate:stated-facts` | **A documented number disagrees with its source.** Probe count, baseline total, and Vitest project count are checked against the code that defines them; the test count is banned from undated prose, because it changes on almost every commit and no sentence re-runs the suite to notice |
| `npm run gate:typecheck-coverage` | **A TypeScript file is in no tsconfig project**, so `npm run typecheck` never reads it. The project list is parsed out of `package.json` rather than restated, and files that are deliberately unchecked (build configs, the release-consumer fixture) are an allowlist with a reason attached to each. `test/visual/` was unchecked this way until 2026-07-20 |
| `npm run gate:probe-residue` | **A detection-probe mutation is live in your working tree.** `try/finally` does not survive a SIGKILL, so a killed probe run can leave a plausible one-line change behind. Runs as a pre-commit hook; `-- --restore` puts the file back from the bytes the probe recorded |
| `npm run probe:detection` | **The test suites have stopped detecting.** It applies forty known defects, asserts each one is caught, and restores. A refactor that guts a suite still reports green everywhere else — this is what notices |

`probe:detection` runs several full suites and is deliberately not on the per-push path. Run
it after any substantial refactor of tests or the code they cover.

### Running Codacy locally

CI reports Codacy findings on every pull request, but waiting for a dashboard to tell you
about a complexity or security finding is a slow way to learn it. The Codacy CLI runs a
subset of the same tools on your machine:

```sh
codacy-cli install          # once, installs the pinned runtimes and tools
codacy-cli analyze          # whole repository
codacy-cli analyze --tool lizard path/to/file.ts
```

Install it from the project's [releases](https://github.com/codacy/codacy-cli-v2/releases) —
download the archive for your platform, **verify it against the published `checksums.txt`**,
and put the binary on your `PATH`. Do not pipe an install script from the network into a
shell. The binary is not vendored here.

`.codacy/codacy.yaml` pins the tool versions so a local run and a CI run compare like for
like. It is deliberately a **subset** of what Codacy runs server-side, and the relationship
only holds one way: every tool configured locally is also enabled on Codacy, so a local
finding is a real finding — but Codacy additionally runs Biome, Stylelint, markdownlint and
others that this CLI cannot execute. **A clean local run means "nothing found by these
tools", never "nothing found."** CI stays authoritative.

ESLint is deliberately absent. It is disabled for this repository on Codacy — it runs as
base ESLint rather than the TypeScript-aware configuration, so its findings here were all on
type signatures. Running it locally would produce findings CI ignores, which teaches people
to dismiss output.

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
