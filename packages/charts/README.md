<!-- markdownlint-disable MD013 -->
# @silkplot/charts

Composed charts for [SilkPlot](https://github.com/SilkPlot/sp-graph) —
line, area, bar, scatter, heatmap, pie/donut, tree/treemap/pack, bubble, and
histogram. The cartesian families compose the same model and Canvas frame, so
they cannot drift on bounds, ticks, interaction, or semantic alternatives.

> **Alpha.** The API is pre-1.0 and will break. `main` is ahead of the current
> registry prerelease; see the
> [roadmap](https://github.com/SilkPlot/sp-graph/blob/main/ROADMAP.md) for the
> exact published/source split.

## Install

```sh
npm install @silkplot/charts@next solid-js
```
Published under the `next` dist-tag. **Use `@next` explicitly and pin an exact
version** — npm assigned `latest` to this package's first-ever publish because no
earlier version existed, so a bare install resolves here today and will resolve
somewhere else once a stable release exists.

`solid-js` is a **peer dependency**. `@silkplot/core` and `@silkplot/solid` are
regular dependencies pinned to the exact coordinated version: these packages are
released as one set and are only ever tested as one.

## Usage

```tsx
import { createSignal } from "solid-js";
import { LineChart } from "@silkplot/charts";

export default function App() {
  const [series, setSeries] = createSignal([
    { t: new Date("2026-01-01"), y: 12 },
    { t: new Date("2026-01-02"), y: 18 },
    { t: new Date("2026-01-03"), y: 9 },
  ]);

  return (
    <div style={{ width: "640px", height: "320px" }}>
      <LineChart
        data={series()}
        title="Daily volume"
        desc="Three daily volume readings, 1–3 January 2026, values 9 to 18."
      />
    </div>
  );
}
```

The chart measures its container with `ResizeObserver` and fills it; pass
`width`/`height` to fix the size instead. Replacing the series recomputes the
domains and moves the marks — `data` is read through Solid's props proxy, so
passing `series()` keeps it reactive rather than snapshotting it.

Composed marks, axes, grid, references, and interaction chrome paint on Canvas
2D. Solid owns the Canvas element, reactive update schedule, semantic shell,
keyboard surface, announcements, table, and other DOM; D3 remains compute-only.
ADR-0025 authorizes that substrate for cartesian and heatmap, but not for the
current pie/donut, hierarchy, bubble, or histogram implementations. Those
source-only families require a later signed renderer ADR or a substrate
correction before publication; their current paint path is not policy precedent.

An informative chart must be named. "Informative and unnamed" is not
representable in `ChartSemanticsProps`, so omitting both `title` and
`labelledBy` is a type error rather than a silently unlabelled graphic. Pass
`decorative` explicitly if the chart genuinely carries no information (ADR-0005).

## Y-domain policy differs per chart, deliberately

| Chart | Policy | Domain |
|---|---|---|
| `LineChart` | `zero-floor` | `[min(0, lo), hi]` |
| `AreaChart` | `zero-baseline` | `[min(0, lo), max(0, hi)]` |
| `BarChart` | `zero-baseline` | `[min(0, lo), max(0, hi)]` |
| `ScatterChart` | `extent` | `[lo, hi]` |

A mark drawn *from* a baseline must contain zero; a point cloud must not, or it
gets squashed into a corner. An all-negative series is the only input where the
first two visibly differ, which is what makes collapsing them look harmless.

## Exports

Dual-condition, same as `@silkplot/solid`: `"solid"` serves TSX source so your
bundler compiles it for your own target, `"default"` serves a compiled ESM
bundle with declarations beside it. See ADR-0006.

## Licence

Apache-2.0. Copyright 2026 SilkPlot.
