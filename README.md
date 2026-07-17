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
- **Home:** [silkplot.com](https://silkplot.com)
- **Status:** early but real. `LineChart`, `AreaChart`, `BarChart`, and `ScatterChart`
  render end to end, over a unit-tested core. The calendar layer, gridlines, and
  tooltip/cursor remain honest, typed stubs with roadmap-mapped TODOs.

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

| Package | Published | Responsibility |
|---|---|---|
| [`@silkplot/core`](packages/core) | yes | Pure math — no Solid, no DOM. Scales, ticks, shape paths, overlap packing, hit-testing. |
| [`@silkplot/solid`](packages/solid) | yes | Solid primitives — `ChartRoot`, `SvgLayer`, `Axis` (continuous **and** band scales), `createResize`. `solid-js` is a peer dep. |
| [`@silkplot/charts`](packages/charts) | yes | Composed charts — `LineChart`, `AreaChart`, `BarChart`, `ScatterChart` (marks; hit-test interaction is Phase 2). |
| [`@silkplot/calendar`](packages/calendar) | yes | Booking-calendar primitives — time-grid + overlap-resolver (stubs; the overlap packer itself lives in `core` and is done). |
| [`@silkplot/theme`](packages/theme) | yes | Design tokens — CSS custom properties, palette ramps, motion/contrast-aware. |
| `playground` | no | Vite + Solid app that proves the architecture end to end. |

> Packages ship **TypeScript/TSX source** with a `"solid"` export condition. The consumer's
> `vite-plugin-solid` compiles the JSX. Per-package publishable `dist` builds are a
> documented follow-up, not required to use SilkPlot in a Solid + Vite app today.

---

## Install

```sh
npm install @silkplot/charts @silkplot/solid @silkplot/core solid-js
```

Your app must use [`vite-plugin-solid`](https://github.com/solidjs/vite-plugin-solid) so
the shipped `.tsx` source is compiled with the correct JSX transform.

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

Four phases, ordered by real product need.
✅ done · 🚧 partial · ⬜ not started.

- **Phase 1 — Foundations (in progress).** ✅ `ChartRoot` + responsive container ·
  ✅ cartesian/time scales · ✅ custom `Axis` primitive (continuous + band) ·
  ✅ line/area/bar · ⬜ gridlines · ⬜ tooltip/cursor · ⬜ shared canvas layer.
- **Phase 2 — Interaction.** 🚧 scatter (marks render; hit-test wiring pending) ·
  🚧 hit-testing helpers (`createHitIndex` built and tested in `core`, not yet wired into a
  chart; quadtree variant pending) · ⬜ grouped/stacked bars · ⬜ legends · ⬜ brush/zoom
  controllers. **The test harness landed early** — see [Testing](#testing).
- **Phase 3 — Calendar & density.** 🚧 deterministic event overlap packing (`packOverlaps`
  done and tested in `core`; the calendar package's `buildTimeGrid` and resolver are still
  stubs) · ⬜ heatmap / calendar-heatmap · ⬜ agenda / list views · ⬜ drag-resize.
- **Phase 4 — Extras.** ⬜ Pie / donut and optional hierarchy / force layouts if real
  consumers demand them.

Substrate policy: **SVG-first** for dashboards, a **Canvas** data layer where density warrants,
**WebGL** kept off the initial roadmap.

---

## Testing

```sh
npm test              # all projects
npm test -- --project core   # just the pure-math project
```

Vitest runs three projects, split by what each package actually needs:

| Project | Environment | Why |
|---|---|---|
| `core` | node | Pure math — no DOM, so node is fastest and sufficient. |
| `solid` | real chromium | `createResize` uses `ResizeObserver` and `el.clientWidth`; jsdom implements neither (`clientWidth` is always `0`), so the measurement path can only be exercised honestly in a real browser. |
| `charts` | real chromium | Composed charts render Solid components. |

Tests live in each package's `test/` directory, never colocated in `src/` — packages ship
`src` to npm and `tsc -b` compiles it, so a colocated test would be both published and
emitted into `dist`.

## Documentation

The load-bearing architecture rules are documented in [`docs/architecture.md`](docs/architecture.md).
Decisions — what was chosen, what was rejected, and why — are recorded as ADRs in
[`docs/decisions/`](docs/decisions/index.md). Start with
[ADR-0001](docs/decisions/adr-0001-theming-contract.md) if you are theming SilkPlot.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). SilkPlot is Apache-2.0 and welcomes issues and PRs.

## License

[Apache-2.0](LICENSE) © 2026 SilkPlot.
