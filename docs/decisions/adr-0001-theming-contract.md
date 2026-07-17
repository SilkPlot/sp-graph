# ADR-0001 — The theming contract

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

`@silkplot/theme` ships design tokens two ways: as a typed object (`tokens`) and
as a stylesheet of CSS custom properties (`tokensToCss()`). Both already worked.
Neither was ever specified.

That gap matters more than it looks. The moment a consumer's stylesheet contains
`--sp-color-grid`, that name is public API, and renaming it is a breaking change
whether or not we ever meant to promise it. SilkPlot stays on `0.x` until its
contracts stabilise, so the theming surface has to be decided deliberately rather
than settled by whichever component happened to be written first.

At the time of writing, three primitives are queued that are all specified to
style themselves "from theme tokens" — gridlines, a legend, and a calendar week
grid. Without a decision, each would answer these questions independently and
arrive somewhere slightly different.

## Decision

### 1. The namespace is `--sp-`, and the name mapping is fixed

Custom properties are namespaced `--sp-` (`CSS_PREFIX`). The mapping from token
object to property name is **not** mechanical, and both halves are contract:

| Token | Custom property |
|---|---|
| `tokens.space.md` | `--sp-space-md` |
| `tokens.radius.pill` | `--sp-radius-pill` |
| `tokens.fontSize.sm` | `--sp-font-sm` |
| `tokens.motion.base` | `--sp-motion-base` |
| `tokens.color.surface` | `--sp-color-surface` |
| `tokens.color.focusRing` | `--sp-color-focus-ring` |
| `tokens.categorical[i]` | `--sp-cat-0`, `--sp-cat-1`, … |

Two of these do not follow from the object path: `fontSize` becomes `font`, and
`categorical` becomes `cat` with an index suffix. `camelCase` keys become
`kebab-case`. Because the rule cannot be derived, the tests pin each name by
hand rather than recomputing it with the same helper the source uses — a test
that recomputes the name asserts only that the code agrees with itself, and
passes just as happily if every name changes at once.

### 2. Two exposures, with a rule for which to use

- **The CSS custom properties are the styling surface.** Anything that ends up
  as a rendered attribute or CSS value reads a custom property. This is what
  lets a consumer restyle SilkPlot without rebuilding it, and what lets a single
  document hold two differently-themed charts.
- **The `tokens` object is the computation surface.** Use it where a value must
  exist in JavaScript — a colour handed to a Canvas 2D context, which has no
  cascade to read from; a motion duration fed to an interpolator.

When both would work, prefer the custom property: it keeps the value overridable
at runtime, and an object read bakes the default in at build time.

### 3. A primitive reaches a token through the property, not through a dependency

Primitives in `@silkplot/solid` emit `var(--sp-…)` directly. They do **not**
import `@silkplot/theme`.

This is deliberate. `cssVar()` is a string-building helper, and importing it
would make `@silkplot/theme` — and transitively `d3-scale-chromatic` — a
dependency of every consumer of any primitive, to save composing a short string.
Bundle size is a budget, and a package the architecture lists as *optional*
cannot become mandatory as a side effect of a convenience import.

The custom property name is the seam, and this ADR is what makes that safe: the
names are contract, so depending on them from another package is depending on a
published interface, not reaching into an implementation.

### 4. Every token read by a primitive carries a fallback

`@silkplot/theme` is optional, so a chart may render with no token stylesheet
loaded at all. A `var()` naming an undefined property is *invalid at
computed-value time* — and for an inherited property like `stroke` that resolves
to the parent's value rather than to nothing. The failure is therefore not a
visibly missing grid; it is a grid that silently inherits some unrelated colour,
which is hard to notice and harder to attribute.

So: any primitive reading a token supplies a fallback —
`var(--sp-color-grid, currentColor)` — and the library renders sensibly unthemed.
`cssVar(name, fallback?)` takes an optional second argument for consumers doing
the same.

### 5. Overriding is ordinary CSS

A consumer redefines the property in their own stylesheet, at `:root` or on any
ancestor. Nothing else is required, and there is no registration API. Scoping to
a subtree works because the cascade already works.

### 6. Colour scheme is selectable; contrast and motion are not

Dark follows `prefers-color-scheme` by default. A consumer may force it:

```html
<div data-sp-theme="dark">…</div>   <!-- force dark, any element -->
<html data-sp-theme="light">        <!-- force light, ignore the media query -->
```

This exists because an application with its own light/dark toggle must be able
to make charts follow it. The only alternative would be for every such consumer
to restate our entire dark palette in their own stylesheet — copying values that
would then drift from ours with nothing to catch it.

**Contrast and reduced motion get no equivalent opt-in, on purpose.** They are
accessibility preferences that belong to the user, not product decisions that
belong to the app. An application forcing `prefers-reduced-motion` off would be
reintroducing motion for someone who explicitly asked for less of it. These
follow the user agent, and nothing else can set them.

Both dark selectors are emitted from one declaration, so the automatic and
forced variants cannot disagree.

### 7. What is deliberately not themable

Geometry is not a token. Margins, tick sizes, and mark radii are component props
— they are per-chart layout decisions, not a visual language, and routing them
through a global cascade would make one chart's layout change another's.

## Consequences

- The property names above are frozen for `0.x` and can only change with a
  superseding ADR. This is the point of writing them down.
- `@silkplot/solid` stays free of a `@silkplot/theme` dependency, and `theme`
  stays optional.
- `tokensToCss()` emits the dark palette in two selectors. They are generated
  from one source, and a test asserts they are identical.
- A consumer that loads no theme stylesheet gets a working, legible chart rather
  than an invisible or mis-inherited one.
- Adding a token now means adding a name to a contract, not just a value to an
  object.

## Alternatives considered

- **Ship only the `tokens` object and let consumers wire their own CSS.**
  Rejected: it makes runtime re-theming impossible without a re-render and hands
  every consumer the same integration problem to solve differently.
- **Have primitives import `cssVar` from `@silkplot/theme`.** Rejected on bundle
  cost and on optionality, per decision 3. The string it builds is short; the
  dependency it drags is not.
- **A JS theming API (a provider, a `setTheme()`).** Rejected: it reimplements
  the cascade in JavaScript, and the cascade already handles scoping, overriding
  and inheritance correctly.
- **No fallbacks; require the stylesheet.** Rejected: it makes an optional
  package mandatory in practice, and its failure mode is silent inheritance
  rather than an error.
- **`data-sp-contrast` / `data-sp-motion` for symmetry with `data-sp-theme`.**
  Rejected per decision 6. Symmetry is not a reason to let an app overrule a
  user's accessibility preference.
