<!-- markdownlint-disable MD013 -->
# @silkplot/charts

Composed charts for [SilkPlot](https://github.com/SilkPlot/sp-graph) —
`LineChart`, `AreaChart`, `BarChart`, `ScatterChart`. All four compose the same
`createCartesianModel` from `@silkplot/solid`, so they cannot disagree about
scales, bounds, or ticks.

> **Alpha.** The API is pre-1.0 and will break. See the
> [repository](https://github.com/SilkPlot/sp-graph) for current status.

## Install

```sh
npm install @silkplot/charts solid-js
```

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
      <LineChart data={series()} title="Daily volume" />
    </div>
  );
}
```

The chart measures its container with `ResizeObserver` and fills it; pass
`width`/`height` to fix the size instead. Replacing the series recomputes the
domains and moves the marks — `data` is read through Solid's props proxy, so
passing `series()` keeps it reactive rather than snapshotting it.

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
