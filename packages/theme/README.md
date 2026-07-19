<!-- markdownlint-disable MD013 -->
# @silkplot/theme

Design tokens for [SilkPlot](https://github.com/SilkPlot/sp-graph) — plain objects
and the CSS custom properties they emit. Scheme (light/dark) and contrast
(standard/more) resolve as four first-class combinations, not a specificity war.

> **Alpha.** The API is pre-1.0 and will break. See the
> [repository](https://github.com/SilkPlot/sp-graph) for current status.

## Install

```sh
npm install @silkplot/theme@next
```
Published under the `next` dist-tag. **Use `@next` explicitly and pin an exact
version** — npm assigned `latest` to this package's first-ever publish because no
earlier version existed, so a bare install resolves here today and will resolve
somewhere else once a stable release exists.

## The contract

SilkPlot primitives read tokens as `var(--sp-…)` with a literal fallback and
**never import this package**. That is deliberate: a chart renders correctly with
no theme installed, and installing a theme is a pure CSS-cascade operation with
no JavaScript coupling. See ADR-0001 and ADR-0004 in the repository.

```ts
import { tokensToCss } from "@silkplot/theme";

const sheet = new CSSStyleSheet();
sheet.replaceSync(tokensToCss());
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
```

`tokensToCss()` emits every combination in one stylesheet: light as the base,
dark reached three ways (user-agent preference, an explicit `data-sp-theme`
root, and a themed subtree), each crossed with `prefers-contrast: more`. One
source object generates them all, so automatic and forced can never disagree.

Every token pair and palette entry is contrast-checked against the surface it is
drawn on, in all four scheme × contrast combinations.

## Exports

- `default` → `./dist/index.js` (compiled ESM), with `types` → `./dist/index.d.ts`
- `source` → `./src/index.ts` (workspace-internal condition)

## Licence

Apache-2.0. Copyright 2026 SilkPlot.
