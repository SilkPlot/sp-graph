<!-- markdownlint-disable MD013 -->
# @silkplot/core

Pure math for [SilkPlot](https://github.com/SilkPlot/sp-graph). No Solid, no DOM,
no rendering — scales, extents, ticks, shape paths, overlap packing, and
hit-test indexes, computed by D3's data modules inside plain functions.

> **Alpha.** The API is pre-1.0 and will break. See the
> [repository](https://github.com/SilkPlot/sp-graph) for current status.

## Install

```sh
npm install @silkplot/core@next
```
Published under the `next` dist-tag. **Use `@next` explicitly and pin an exact
version** — npm assigned `latest` to this package's first-ever publish because no
earlier version existed, so a bare install resolves here today and will resolve
somewhere else once a stable release exists.

## What is here

| Export | What it computes |
|---|---|
| `linearScale`, `timeScale`, `bandScale` | d3-scale factories with SilkPlot's domain/range conventions |
| `extentOf` | a data extent that filters non-finite values, so a stray `null` cannot floor an axis at zero |
| `computeTicks`, `computeBandTicks` | tick positions and labels, overloaded per scale kind, with an optional formatter |
| `linePath`, `areaPath` | d3-shape path strings |
| `packOverlaps` | deterministic interval lane packing with an identity `key` |
| `createHitIndex` | spatial index for pointer-to-datum resolution |

Nothing in this package touches `d3-selection`, `d3-transition`, or `d3-axis`.
D3 computes; Solid renders — and this is the computing half.

## Exports

The package serves two consumers from one manifest: `"solid"`-aware bundlers and
everything else resolve the same way here, because there is no JSX to compile.

- `default` → `./dist/index.js` (compiled ESM), with `types` → `./dist/index.d.ts`
- `source` → `./src/index.ts` (workspace-internal condition)

## Licence

Apache-2.0. Copyright 2026 SilkPlot.
