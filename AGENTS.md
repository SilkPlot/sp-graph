# sp-graph — agent entry point

SilkPlot's library monorepo: the `@silkplot/*` npm workspaces, the docs site,
and the gates that protect both. **This repository is public.** Everything
below applies to any agent or editor working here; read it before changing
anything. [`CONTRIBUTING.md`](CONTRIBUTING.md) is the long form.

## The one rule

**D3 computes. Solid renders.** D3 modules are used compute-only, inside pure
functions and Solid memos; Solid owns every DOM element, all component state,
and the update schedule. Composed charts paint through Canvas 2D inside Solid
effects. In the render path you may **never** import `d3-selection`,
`d3-transition`, or `d3-axis`. Compute ticks from a scale and render them with
`<For>`; drive animation from Solid reactivity and `requestAnimationFrame`.
The permitted compute modules and the rules as they stand are in
[`docs/architecture.md`](docs/architecture.md).

## Where things live

- `packages/*/src` ships to npm and is compiled by `tsc -b`. **Tests live in
  each package's `test/` directory, never in `src/`**; a colocated test would
  be both published and emitted into `dist`.
- Decisions are ADRs in [`docs/decisions/`](docs/decisions/index.md). An
  accepted ADR is superseded by a new one, not edited; only a dated, bounded
  correction that leaves the decision unchanged is allowed in place.
- [`ROADMAP.md`](ROADMAP.md) is the **only** public statement of direction.
  The site renders that exact file; do not create a second copy anywhere.
- Maintainer evidence that is not API guidance sits in `docs/internal/`.

## Testing

- Anything that renders Solid runs in **real Chromium** through the Vitest
  browser projects, never jsdom: jsdom has no `ResizeObserver` and reports
  `clientWidth` as 0, so a fake DOM passes while proving nothing. `core` and
  `theme` are pure and run in node.
- Deterministic only: fixed UTC dates, no `Math.random`, no `Date.now`. Poll
  with `vi.waitFor` / `expect.poll` for observer-driven work.
- Never assert d3's exact output; assert structure and invariants.
- Do not stub to manufacture coverage. Leave an unreachable branch uncovered
  and say so.

## Before you open a pull request

Run these locally; CI runs them again and a red gate is a declined PR:

```sh
npm run lint                 # biome, warnings are failures
npm run typecheck            # tsc -b plus every test/ tsconfig
npm test                     # node for core and theme, Chromium otherwise
npm run gate:stated-facts    # prose numbers must match source or be dated
npm run gate:public-surface  # no private identifiers, no rotten links
npm run release:verify       # package manifests and a consumer install
```

`gate:probe-residue` runs in the pre-commit hook and refuses a commit while a
detection-probe mutation is live. Never commit `node_modules/`, `dist/`, or
`*.tsbuildinfo`.

## Public surface

This repository is developed alongside private ones. Do not name a private
repository, a research record, a planning identifier, or an internal runtime
record anywhere in a tracked file; `gate:public-surface` enforces it. State a
decision's reasoning here, in an ADR, rather than pointing at something a
reader outside cannot open. Do not write an undated test count or other
volatile number in prose; `gate:stated-facts` enforces that.

## Releases and packaging

- Publishing is only ever the manual **Publish to npm** workflow, with a dry
  run first. Never run `npm publish` locally. See
  [`docs/release-checklist.md`](docs/release-checklist.md).
- Internal `@silkplot/*` pins are exact versions, never `*` or a range.
- The `source` and `solid` export conditions serve TypeScript source on
  purpose so a Solid-aware bundler compiles the JSX; `default` serves compiled
  output. Do not "simplify" the conditions (ADR-0006).
- Primitives read `var(--sp-…)` tokens with fallbacks and never import
  `@silkplot/theme` (ADR-0001).
