<!-- markdownlint-disable MD013 MD033 -->
# SilkPlot

> **Fast, fluid, first-hand data visualization for [Solid](https://www.solidjs.com/).**
> D3 computes. Solid renders.

SilkPlot is an open-source graphing and visualization library built the idiomatic
Solid way: D3's battle-tested math and geometry modules are used **compute-only**,
and every pixel is rendered by Solid's fine-grained reactivity. No second renderer
fights Solid for ownership of the DOM.

- **License:** Apache-2.0
- **npm scope:** [`@silkplot/*`](https://www.npmjs.com/org/silkplot)
- **Home:** [github.com/SilkPlot/sp-graph](https://github.com/SilkPlot/sp-graph)
- **Status:** early but real, and **not yet on npm** — see [Install](#install).
  `LineChart`, `AreaChart`, `BarChart` and `ScatterChart` render end to end over a
  unit-tested core, with gridlines and the interaction primitives built. The
  calendar layer remains an honest, typed stub with roadmap-mapped TODOs.

---

## The philosophy: D3 computes, Solid renders

D3 ships two kinds of modules. Some **operate on data** (scales, shapes, arrays,
time, formatting, interpolation, color ramps, spatial indexes). Some **manipulate the
DOM** (`d3-selection`, `d3-transition`, `d3-axis`). SilkPlot uses only the first kind.

- **D3 is the math layer.** Scales, path strings, tick positions, color ramps, overlap
  packing, and hit-test indexes are all computed by D3 modules inside pure functions and
  Solid memos.
- **Solid owns the tree.** Every `<svg>`, `<g>`, `<path>`, `<line>`, and `<text>` is a
  Solid element. Updates are targeted and fine-grained — no enter/update/exit joins, no
  `selection.call(axis)`.

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
| [`@silkplot/charts`](packages/charts) | yes | Composed charts — `LineChart`, `AreaChart`, `BarChart`, `ScatterChart`, all composing `createCartesianModel` (marks; composed hit-test interaction remains roadmap work). |
| [`@silkplot/calendar`](packages/calendar) | yes | Booking-calendar primitives — time-grid + overlap-resolver (stubs; the overlap packer itself lives in `core` and is done). |
| [`@silkplot/theme`](packages/theme) | yes | Design tokens — CSS custom properties, palette ramps, motion/contrast-aware. |
| `playground` | no | Vite + Solid app that proves the architecture end to end. |

> **"Publish target" means intended, not done — nothing is on npm yet.** Packages
> ship **TypeScript/TSX source** with a `"solid"` export condition, so `exports`
> still point at `src` and cross-package deps pin `"*"`. Both have to change
> before a tarball would work outside this workspace. Pre-publication manifests
> also list permitted D3 modules that the package does not yet import; release
> cleanup will trim each package to its actual dependencies.

---

## Install

**SilkPlot is not published to npm yet.** `npm install @silkplot/charts` will not
work, and saying otherwise would waste your afternoon. The packages are wired for
a workspace, not for a registry: `exports` point at `src`, and the
`@silkplot/*` cross-dependencies pin `"*"`, which resolves to anything once it
leaves this repo. Making them publishable is real work and it is on the roadmap.

To try it today, clone and run the playground:

```sh
git clone https://github.com/SilkPlot/sp-graph.git
cd sp-graph
npm install
npm run dev
```

When it is published, your app will need
[`vite-plugin-solid`](https://github.com/solidjs/vite-plugin-solid) so the shipped
`.tsx` source is compiled with the correct JSX transform.

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
      <LineChart data={series} />
    </div>
  );
}
```

`LineChart` measures its container with `ResizeObserver`, computes a time scale, a linear
scale, a line path, and tick labels via `@silkplot/core`, and renders the SVG line and both
axes with Solid — no `d3-axis` anywhere.

---

## Roadmap

These four capability families communicate direction; they are not a strict
release train. The first Cartesian dashboard MVP combines the completed
foundation with operational composition, dynamic interaction, accessibility,
packaging, consumer proof, and a measured density policy. Calendar work remains
a later product slice.

- **Phase 1 — Foundations.** `ChartRoot`, responsive measurement,
  Cartesian/time scales, continuous and band axes, line/area/bar/scatter marks,
  gridlines, presentation primitives, theming, and the current test harness are
  built. The composed charts do not yet expose the demonstrated interaction
  primitives.
- **Phase 2 — Operational Cartesian MVP and interaction.** Multi-series
  line/area composition, controlled legends, reference overlays, ranked bars,
  public hit-testing, shared tooltip/cursor state, pan, zoom, visible-range
  control, reset, responsive recovery, accessibility, installable packages,
  and representative workload qualification. Grouped and stacked bars remain a
  later evidence-gated extension.
- **Phase 3 — Deferred calendar and dense views.** The deterministic overlap
  packer is built in `core`; the calendar time grid and rectangle resolver remain
  honest stubs. Week/agenda views, drag-resize, heatmaps, and virtualization wait
  for validated demand and time-semantics evidence. Canvas is selected only when
  representative profiling shows SVG cannot meet the agreed budget.
- **Phase 4 — Extras.** Pie/donut and optional hierarchy or force layouts only
  when real consumers justify them.

Substrate policy: **SVG-first** for dashboards, a **Canvas** data layer where density warrants,
**WebGL** kept off the initial roadmap.

---

## Testing

```sh
npm test              # all projects
npm test -- --project core   # just the pure-math project
```

Vitest runs five projects, split by what each package actually needs:

| Project | Environment | Why |
|---|---|---|
| `core` | node | Pure math — no DOM, so node is fastest and sufficient. |
| `theme` | node | Emits CSS as strings and reads no DOM — same reasoning as `core`. |
| `solid` | real chromium | `createResize` uses `ResizeObserver` and `el.clientWidth`; jsdom implements neither (`clientWidth` is always `0`), so the measurement path can only be exercised honestly in a real browser. |
| `charts` | real chromium | Composed charts render Solid components. |
| `playground` | real chromium | The reference composition is where the visible-focus contract is proven end to end. A focus ring is a computed style resolved under `:focus-visible`, a media query, and a custom-property cascade — none of which node resolves. |

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
