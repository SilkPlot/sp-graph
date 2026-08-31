<!-- markdownlint-disable MD013 MD033 -->
# SilkPlot

[![Codacy code quality](https://app.codacy.com/project/badge/Grade/ee37880a80cc4de98b0ba5f5dc68e5d2)](https://app.codacy.com/gh/SilkPlot/sp-graph/dashboard)
[![Codacy coverage](https://app.codacy.com/project/badge/Coverage/ee37880a80cc4de98b0ba5f5dc68e5d2)](https://app.codacy.com/gh/SilkPlot/sp-graph/dashboard)

> **Fast, fluid, first-hand data visualization for [Solid](https://www.solidjs.com/).**
> D3 computes. Solid renders.

SilkPlot is an open-source graphing and visualization library built the idiomatic
Solid way: D3's battle-tested math and geometry modules are used **compute-only**,
while Solid owns component state, DOM structure, and the reactive schedule that
drives SVG primitives or Canvas 2D paint. No D3 DOM renderer fights Solid for
ownership.

- **License:** Apache-2.0
- **npm scope:** [`@silkplot/*`](https://www.npmjs.com/org/silkplot)
- **Docs & live examples:** **[silkplot.com](https://silkplot.com)** —
  the quickstart, four live charts with their real source, theming, and what this
  alpha deliberately does not do
- **Source:** [github.com/SilkPlot/sp-graph](https://github.com/SilkPlot/sp-graph)
- **Status:** alpha. The latest registry release is **published under the
  `next` tag** — see [Install](#install). `main` is ahead of that release: its
  unpublished source includes Canvas-rendered cartesian, heatmap, pie/donut,
  hierarchy, bubble, and histogram families plus implemented calendar week,
  agenda, and heatmap surfaces. [ROADMAP.md](ROADMAP.md) separates registry
  claims from source that has not yet been published.

---

## The philosophy: D3 computes, Solid renders

D3 ships two kinds of modules. Some **operate on data** (scales, shapes, arrays,
time, formatting, interpolation, color ramps, spatial indexes). Some **manipulate the
DOM** (`d3-selection`, `d3-transition`, `d3-axis`). SilkPlot uses only the first kind.

- **D3 is the math layer.** Scales, path strings, tick positions, color ramps, overlap
  packing, and hit-test indexes are all computed by D3 modules inside pure functions and
  Solid memos.
- **Solid owns the surface lifecycle.** Solid creates the semantic DOM and
  Canvas elements, tracks their inputs, and schedules paint. Canvas 2D routines
  receive computed marks; SVG primitives remain Solid elements. There are no
  enter/update/exit joins and no `selection.call(axis)`.

### Banned in the render path (non-negotiable)

`d3-selection` · `d3-transition` · `d3-axis`

These create a **second renderer** with conflicting element ownership. `d3-axis` in
particular is treated as a *reference implementation of axis semantics*, not a runtime
primitive: SilkPlot computes ticks from the scale and renders them with a Solid `<For>`.
See [`@silkplot/solid`'s `Axis`](packages/solid/src/Axis.tsx) for the canonical pattern.

---

## Engineering priorities

1. **Speed** — minimal work per frame; D3 math in memos, recomputed only when inputs change.
2. **Fluidity** — Solid's fine-grained updates keep interactions smooth on low-end devices.
3. **Performance** — SSR-safe, tree-shakeable ESM subpaths, no umbrella `d3` dependency.
4. **First-hand experience** — headless primitives you compose directly. When a chart does
   not fit a preset, you drop to the model and render exactly the graph you want.

---

## Package map

| Package | Publish target | Responsibility |
|---|---|---|
| [`@silkplot/core`](packages/core) | yes | Pure math — no Solid, no DOM. Scales, extents, ticks, shape paths, overlap packing, hit-testing. |
| [`@silkplot/solid`](packages/solid) | yes | Solid primitives — `ChartRoot`, `SvgLayer`, `Axis` (continuous **and** band scales), `Gridlines`, `Crosshair`, `TooltipAnchor`, `ChartAnnouncer`, `createCartesianModel`, `createResize`. `solid-js` is a peer dep. |
| [`@silkplot/charts`](packages/charts) | yes | Composed Canvas charts — line, area, bar, scatter, heatmap, pie/donut, tree/treemap/pack, bubble, and histogram — with interaction, semantic alternatives, and shared model composition. |
| [`@silkplot/calendar`](packages/calendar) | held back | Implemented zoned time-grid geometry, overlap resolution, Canvas week/calendar-heatmap surfaces, agenda view, and virtualization helpers. Present on `main`, not in the current alpha publish set. |
| [`@silkplot/theme`](packages/theme) | yes | Design tokens — CSS custom properties, palette ramps, motion/contrast-aware. |
| `playground` | no | Vite + Solid app that proves the architecture end to end. |

> **Published, as an alpha prerelease.** Each package serves two consumers from one
> `exports` map: `source`/`solid` point at TypeScript source, so a Solid-aware
> bundler compiles the JSX itself and fine-grained reactivity survives into your
> app, while `default` serves compiled output with declarations alongside
> (ADR-0006). Internal `@silkplot/*` dependencies are pinned to the exact
> coordinated version, never a range — the release workflow refuses to publish if
> any is off the candidate version. See **Install** below.

---

## Install

SilkPlot is on npm under the **`next`** dist-tag:

```sh
npm install @silkplot/charts@next @silkplot/solid@next @silkplot/core@next @silkplot/theme@next solid-js
```

**Use the `@next` tag explicitly, and pin an exact version.** npm assigns
`latest` on a package's first-ever publish whatever tag you ask for, so a bare
`npm install @silkplot/charts` currently resolves to this same prerelease — but
that stops being true the moment a stable version exists, and a lockfile written
today would then mean something different. This is 0.x: a minor bump may contain
breaking changes.

Your app needs a Solid-aware bundler — with Vite, that is
[`vite-plugin-solid`](https://github.com/solidjs/vite-plugin-solid). The `"solid"`
export condition serves the shipped `.tsx` source so your bundler applies the JSX
transform itself, which is what keeps Solid's fine-grained reactivity intact
through to your application. A pre-compiled bundle cannot do that, which is why
the condition exists.

Every published package carries
[npm provenance](https://docs.npmjs.com/generating-provenance-statements): the
tarball on the registry is signed with the commit and workflow run that built it.

To run the examples locally instead:

```sh
git clone https://github.com/SilkPlot/sp-graph.git
cd sp-graph
npm install
npm run dev
```

## Usage — a LineChart

```tsx
import { LineChart } from "@silkplot/charts";

const series = [
  { t: new Date("2026-01-01"), y: 12 },
  { t: new Date("2026-01-02"), y: 18 },
  { t: new Date("2026-01-03"), y: 9 },
  { t: new Date("2026-01-04"), y: 22 },
  { t: new Date("2026-01-05"), y: 27 },
];

export default function App() {
  return (
    <div style={{ width: "640px", height: "320px" }}>
      <LineChart
        data={series}
        title="Daily readings"
        desc="Five daily readings, 1–5 January 2026, values 9 to 27."
      />
    </div>
  );
}
```

`LineChart` measures its container with `ResizeObserver`, computes scales, line
geometry, and tick labels via `@silkplot/core`, then schedules its Canvas 2D
plot through Solid — no `d3-axis` or D3-owned DOM anywhere.

---

## Roadmap

Direction lives in one place: **[ROADMAP.md](ROADMAP.md)**. The documentation
site renders that exact file and the repository's milestones mirror its
version-line headings, so none of the three can drift apart. It replaced the
capability-phase narrative that used to live in this section, which had gone
stale — several items it listed as outstanding (pan, zoom, hit-testing, the
visible-range control, ranked bars) have long since shipped.

Current substrate policy is [ADR-0025](docs/decisions/adr-0025-enumerated-canvas-renderer-program.md):
**Canvas** for its enumerated cartesian, heatmap, calendar-heatmap, and
calendar-week virtualization program; SVG primitives remain available outside
that program; **WebGL** remains excluded.

Pie/donut, hierarchy, bubble, and histogram also paint on Canvas in the current
source tree, but that is an implementation fact, not an extension of ADR-0025.
Those families need a later signed ADR or a renderer correction before their
Canvas substrate can be treated as authorized product policy.

---

## Testing

```sh
npm test              # all projects
npm test -- --project core   # just the pure-math project
```

Vitest runs nine projects, split by what each package actually needs:

| Project | Environment | Why |
|---|---|---|
| `core` | node | Pure math — no DOM, so node is fastest and sufficient. |
| `theme` | node | Emits CSS as strings and reads no DOM — same reasoning as `core`. |
| `calendar` | node | Zoned civil-time geometry — Temporal, no DOM. |
| `calendar-browser` | real chromium | Week-grid Solid layout. Rendered block positions are measured against the same `buildTimeGrid` / `resolveEventLanes` / `positionOf` calls; jsdom cannot measure SVG. |
| `solid` | real chromium | `createResize` uses `ResizeObserver` and `el.clientWidth`; jsdom implements neither (`clientWidth` is always `0`), so the measurement path can only be exercised honestly in a real browser. |
| `charts` | real chromium | Composed charts render Solid components. |
| `playground` | real chromium | The reference composition is where the visible-focus contract is proven end to end. A focus ring is a computed style resolved under `:focus-visible`, a media query, and a custom-property cascade — none of which node resolves. |
| `site` | real chromium | The documentation site. Its layout claims are about computed geometry — `scrollWidth` against `clientWidth` at a real viewport — and no fake DOM lays out. |
| `perf-harness` | real chromium | The performance harness's own pointer-scope instrument. It measures the browser's dispatch order, and its suite must drive **trusted** input — a synthetic `dispatchEvent` interleaves no microtask checkpoint and passes against the defect this project exists to keep out. |

The accessibility suites also run as their own CI gate:

```sh
npm run gate:accessibility   # the suites are present, non-empty, and reachable
npm run test:accessibility   # run exactly those suites
```

Tests live in each package's `test/` directory, never colocated in `src/` — packages ship
`src` to npm and `tsc -b` compiles it, so a colocated test would be both published and
emitted into `dist`.

## Documentation

The load-bearing architecture rules are documented in [`docs/architecture.md`](docs/architecture.md).
Decisions — what was chosen, what was rejected, and why — are recorded as ADRs in
[`docs/decisions/`](docs/decisions/index.md). Start with
[ADR-0001](docs/decisions/adr-0001-theming-contract.md) if you are theming SilkPlot.

- [**Accessibility**](docs/accessibility.md) — author responsibilities, informative vs
  decorative, descriptions and the data alternative, keyboard behaviour, theme and motion,
  and **what has and has not been tested**. Read it before you name a chart; every
  informative chart requires one.
- [Release checklist](docs/release-checklist.md) — the manual checks CI cannot make,
  including the assistive-technology matrix that has **not** been run.
- [Visual regression](docs/visual-regression.md) — what the screenshot baselines cover,
  how pixel determinism is engineered, and the review workflow a baseline change must go
  through. Read it before running `--update-snapshots`; re-pinning a baseline is a decision
  to change what "correct" means, not a way to clear a red run.
- [Maintainer evidence](docs/internal/README.md) — dated performance notes and
  review captures that support implementation history but are not regression baselines.

> **On accessibility claims.** No assistive-technology testing has been performed
> against SilkPlot — no NVDA, JAWS, VoiceOver, Orca, Narrator, or TalkBack run.
> SilkPlot claims no WCAG conformance and no screen-reader compatibility. What it
> does have is a stated contract ([ADR-0005](docs/decisions/adr-0005-accessibility-contract.md))
> and deterministic checks gating CI against it. The difference matters; see
> [Tested limitations](docs/accessibility.md#tested-limitations).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). SilkPlot is Apache-2.0 and welcomes issues and PRs.

## License

[Apache-2.0](LICENSE) © 2026 SilkPlot.
