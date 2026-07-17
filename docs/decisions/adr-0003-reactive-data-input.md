# ADR-0003 — The cartesian model's reactive data input

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

`createCartesianModel` resolves the bounds and scales a cartesian chart
composes. Its y scale is a memo over the series:

```ts
const y = createMemo(() =>
  linearScale({
    domain: applyYDomainPolicy(extentOf(spec.data, spec.y.accessor), policy),
    range: [bounds().innerHeight, 0],
  }),
);
```

That reads `spec.data` inside a memo, so it looks tracked. It was not, and the
reason is at the call sites rather than here. Every chart built its spec as an
object literal:

```ts
const model = createCartesianModel({
  data: props.data,          // <- evaluated once, in the component body
  x: (range) => timeScale({ ... }),
  y: { accessor: (d) => d.y, domain: "zero-floor" },
});
```

A Solid component body is not a tracking scope. `data: props.data` invokes the
props getter exactly once, during render, and stores the resulting array as an
ordinary property on a plain object. By the time the memo runs there is no
getter left to re-read and no signal to subscribe to. The memo's only registered
dependency was `bounds()`.

`spec.x` never had the problem, because it is a **thunk**. It gets re-invoked
inside the memo, so whatever it reads — including `props.data` — is read in a
tracking scope. The spec had one field that varied as a thunk and one that
varied as a value, and that asymmetry was the whole defect.

The symptom is worth stating precisely, because it is not "the chart fails to
update". Marks read `props.data` live inside their own memos. So when a mounted
chart's data was replaced from `[1, 2]` to `[100, 200]`:

- the y memo did not re-run; the domain stayed `[0, 2]`;
- the y axis went on rendering ticks labelled 0 … 2;
- the path memo *did* re-run and mapped the new values through the stale scale,
  putting `y(100)` at roughly -13132 in a 268px plot;
- the x axis rescaled correctly, because `x` is a thunk.

The chart still rendered. It simply drew a series and an axis that disagreed
about which data they described, with the marks thousands of pixels off-canvas.
A resize did not heal it: the memo re-ran on `bounds()` and recomputed the
extent from the same frozen array.

Note the trap this leaves for anyone testing the fix: **the x axis was never
broken**, so a regression that asserts "the axis updates" passes against the
defect and proves nothing. Only y is diagnostic.

## Decision

`CartesianModelSpec.data` is an **accessor**, not an array:

```ts
export interface CartesianModelSpec<T, X extends AxisScale> {
  data: Accessor<readonly T[]>;
  x: (range: [number, number]) => X;
  y: { accessor: (d: T) => number; domain?: YDomainPolicy };
}
```

Call sites pass `data: () => props.data`. The model calls `spec.data()` inside
the y memo, so replacing the series recomputes the domain.

The supported contract is **immutable replacement**: hand the model a new array.
In-place mutation of the existing array is not supported and cannot be, because
Solid has nothing to track in it.

`y.accessor` is likewise invoked inside the memo, so a signal read within that
closure is tracked like any other. A chart can switch which field it plots
without remounting.

## Alternatives

**A getter on the spec literal** — `get data() { return props.data; }` — was
rejected. It works, it is the idiom Solid's own `mergeProps`/`splitProps` use,
it costs one line per call site, and it would have left the published type
unchanged at `readonly T[]`.

It was rejected because it makes the contract *implicit*. `CartesianModelSpec`
is exported. A consumer writing the obvious thing —

```ts
createCartesianModel({ data: myArray, ... })
```

— would compile cleanly and silently reproduce this exact bug, in their code,
with no diagnostic. The failure would look like a rendering glitch and would be
traced back here only with difficulty. With an accessor, that same line is a
type error at the call site:

> `Type 'Point[]' is not assignable to type 'Accessor<readonly Point[]>'`

That trade is the whole point: a documented convention that a compiler cannot
enforce is a convention that will be broken by someone reading the type
signature and nothing else. The accessor also makes the spec internally
consistent — `x` was always a thunk, and `data` is now one too.

**Sorting the problem out inside the charts** — having each chart pass a
pre-computed domain — was rejected for the reason the model exists at all: four
charts hand-rolling the same derivation is what `createCartesianModel` was
created to remove.

## Consequences

- **This is a breaking change to a 0.x API**, and deliberately so. Migration is
  mechanical and the compiler finds every site: `data: props.data` becomes
  `data: () => props.data`. There is no silent-failure path — code that is not
  migrated does not build.
- Replacing data recomputes the y domain in one reactive update, and ticks,
  gridlines and marks resolve from the same scale snapshot because they all read
  the same memo.
- The per-chart y-domain policies still apply on every recomputation, so a
  replacement re-derives the policy rather than reusing the first result. This
  matters for an all-negative series, the only input where `zero-floor` and
  `zero-baseline` visibly differ.
- The model still cannot protect a caller who passes a **stale closure** — an
  accessor that reads nothing reactive. The type enforces "this is a function",
  not "this function reads live state". That residue is accepted: it is the same
  residue every reactive API has.

## The type is the guard, so no reactivity linter is adopted

A lint rule that catches this bug class exists: `eslint-plugin-solid`'s
`solid/reactivity`. It was trialled against this exact shape and it does fire on
`data: props.data` while staying silent on `data: () => props.data`, so it
distinguishes the bug from the fix rather than flagging the pattern generally.
It is still declined, for two independent reasons.

**It cannot run on this toolchain.** The repo is pinned to TypeScript 7, and
`@typescript-eslint/parser` declares `typescript: ">=4.8.4 <6.1.0"` — including
on its canary line. ESLint does not degrade here, it crashes on module load
(`TypeError: Cannot read properties of undefined (reading 'Cjs')`), with or
without type-aware linting configured. Note the trap for anyone re-checking
this: `eslint-plugin-solid` advertises an open-ended `typescript: ">=4.8.4"`, so
its own manifest looks compatible; the cap lives in its transitive
`@typescript-eslint` dependencies and only `npm ls typescript` reveals it.

**More importantly, it would be the weaker guard.** The accessor type makes the
old shape a compile error on the pinned compiler:

> `error TS2322: Type 'readonly Point[]' is not assignable to type 'Accessor<readonly Point[]>'.`

That already runs in `typecheck` and therefore in CI; it is an error rather than
a heuristic warning; it fires in the editor as the line is typed; and it cannot
be waved through with a disable comment. Adding a second linter to a repo that
deliberately runs one (Biome) would buy a weaker check than the type gives.
Biome itself has no Solid reactivity-loss rule today — `noSolidDestructuredProps`
covers destructuring only, and this bug is a *property access*, which is the very
thing that rule tells you to prefer.

The behavioural net is the replacement regressions: the model-level cases plus
chart-level cases for all four families, each mutation-proved against the
captured-data path.

Revisit if any of these change: `@typescript-eslint/parser` publishes a peer
range admitting TypeScript 7; Biome ships a Solid reactivity-loss rule (it
already ships the Vue equivalent); or this library grows reactive inputs the
type system cannot express — which is where the stale-closure residue above
would finally need a linter rather than a signature.

Up: [Decisions](index.md)
