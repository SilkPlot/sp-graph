# ADR-0006 — Packages ship a compiled build and their source, not source alone

- **Status:** Accepted
- **Date:** 2026-07-18
- **Supersedes:** the emit strategy stated in the
  [package map](../../README.md#package-map) and
  [Install](../../README.md#install) sections, which described `exports`
  pointing at `src` as the whole story.

## Context

Until now every package's `exports` map had exactly one destination: its
TypeScript/TSX source.

```json
"exports": { ".": { "solid": "./src/index.tsx", "default": "./src/index.tsx" } }
```

That was the right call for a library nothing outside this workspace consumed,
and it was not laziness. Solid's JSX is not React's. It does not build an
element tree that a runtime diffs; it compiles to fine-grained reactive DOM
operations — `template`, `setAttribute`, `effect`, `memo` from `solid-js/web` —
wired directly to the signals they read. Compiling that JSX is a *choice with a
target*: `dom`, `ssr`, or `universal`, with or without hydration markers. A
library that pre-compiles picks that target on its consumers' behalf, forever.
The `"solid"` export condition exists precisely so the consumer's own bundler
makes that choice. Serving a Solid consumer pre-compiled output is not a
packaging preference; it is a correctness bug, and it is an *invisible* one —
a chart that renders once and then never follows its data is pixel-identical to
a correct chart in a screenshot.

The cost was that nothing else could consume the packages at all. A bundler
without a Solid plugin resolving `./src/index.tsx` gets TypeScript and JSX it
cannot parse. `tsc -b` compiled `src` into a `dist` that no `exports` entry
referenced — a validation gate producing output nobody read. And the internal
`@silkplot/*` dependencies pinned `"*"`, which resolves to whatever the registry
happens to hold the moment the package leaves this workspace.

So the source-shipping decision was not wrong; it was incomplete. It described
one consumer and the packages had to serve two.

## Decision

**Each package's `exports` serves three audiences from one manifest.**

```json
"exports": {
  ".": {
    "source": "./src/index.tsx",
    "solid":  "./src/index.tsx",
    "types":  "./dist/index.d.ts",
    "default":"./dist/index.js"
  }
}
```

Conditions are ordered most-specific first, and each one answers a different
question:

- **`"solid"` still serves source, unchanged.** This is the load-bearing part of
  the old decision and it does not move. A Solid-aware bundler compiles the same
  TSX it always did, choosing its own target. Nothing about reactivity,
  hydration, or SSR is decided here on a consumer's behalf.
- **`"default"` serves a compiled ESM bundle** for a bundler that knows nothing
  about Solid, with `"types"` serving declarations beside it. That bundle is
  compiled by **Solid's own babel preset** (via `esbuild-plugin-solid`,
  `generate: "dom"`), never by a generic JSX transform — a generic transform
  produces markup that renders once and never updates, which is the failure this
  whole ADR is written around.
- **`"source"` is a workspace-internal condition**, declared in
  `tsconfig.base.json` as `customConditions` and in the Vite/Vitest
  `resolve.conditions`. It exists so that typechecking, the test suites, and the
  playground resolve sibling packages to `src` and never to a build artifact. No
  published consumer passes it. Without it, `tsc` would follow `"types"` into
  `dist` and the workspace could not typecheck until it had built — turning a
  validation gate into a build dependency, backwards.

**`src` ships alongside `dist`,** because the `"solid"` condition points into it
and because the sourcemaps resolve through it.

**Two build outputs, two directories, one producer each.** `dist` is the
publishable tsup build. `tsc -b` now emits to `.tsbuild`, mirroring what the
playground already did. Sharing one directory would make each producer's
leftovers look like the other's product, which is the exact defect this
separation was written to remove: stale output survived a rebuild because each
producer took the other's leavings for its own.

**tsup builds the JavaScript; `tsc` builds the declarations.** tsup's `dts`
option drives the TypeScript compiler through internals TypeScript 7 no longer
exposes and crashes on `useCaseSensitiveFileNames`. Rather than pin an older
compiler for packaging alone, each package carries a `tsconfig.dist.json` that
emits declarations only. The compiler that typechecks this repo is the compiler
that describes it to consumers — one source of truth for types instead of two.
Ordering is encoded in the package script: `tsup && tsc -p tsconfig.dist.json`,
so tsup's `clean` empties `dist` before the declarations land in it.

**Internal `@silkplot/*` dependencies pin the exact version** (`"0.1.0"`), not a
range. These packages are released as one coordinated set and are only ever
tested as one; a caret range would permit an install that mixes versions across
the set, which is the coordination hazard rather than a hedge against it. An
exact pin equal to the local version still resolves through npm workspace
linking, so the workspace is unaffected — verified, not assumed.

## What was rejected

- **Compiling for the `"solid"` condition too** — a single compiled artifact for
  everyone. Simplest possible manifest, and wrong: it locks every Solid consumer
  to this build's target and forecloses SSR and hydration downstream.
- **Emitting a JSX-preserved `dist/source/*.jsx` for the `"solid"` condition**
  (the `tsup-preset-solid` convention) instead of pointing at `src`. Defensible
  — it strips TypeScript and resolves the relative specifiers away — but it
  changes what a Solid consumer receives, and the current arrangement is proven
  to work end to end against a packed tarball. Keeping `"solid"` on `src` leaves
  the locked decision's load-bearing half genuinely untouched. If a consumer
  toolchain is ever found that cannot take TSX from `node_modules`, this is the
  first thing to reach for.
- **Publishing per-file `tsc` output as the compiled entry.** Fine for the
  Solid-free packages, useless for the rest: `tsc` is configured
  `jsx: "preserve"` and emits `.jsx` that no plain bundler can read.
- **Dropping `src` from the tarball.** Would shrink the packages and break the
  `"solid"` condition. Not a trade.

## Consequences

- The test-location invariant is now load-bearing in a second way. `src` ships,
  so a test colocated in `src` would be published to consumers. It was already
  forbidden; it is now verified by an allowlist over the `npm pack` manifest
  rather than by reading a listing.
- `npm run build` (`tsc -b`) remains a **validation gate**. The packaging command
  is `npm run build:dist`, and each package's `prepack` runs it, so a tarball
  cannot be produced from stale output. A deleted source module disappears from
  the next tarball because tsup empties `dist` first — proved by deleting one and
  packing again.
- The build-hygiene gate's stale-output guard now watches `.tsbuild` rather than
  `dist`. Its subject was always the incremental, file-per-source output that
  `tsc -b` never deletes from; `dist` is bundled and rebuilt from empty, so a
  per-source-file check would not describe it.
- Adding a package now means adding a `tsup.config.ts` and a
  `tsconfig.dist.json`, not only a `tsconfig.json`.
- `@types/*` packages are dependencies only where a type actually reaches a
  shipped declaration — `d3-scale` and `d3-shape` in `@silkplot/core`. The rest
  are development dependencies. This is checked against the emitted `.d.ts`
  files, because "it is a type package, so it is dev-only" is wrong exactly when
  a public signature mentions it.
