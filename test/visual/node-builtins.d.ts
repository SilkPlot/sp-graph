/**
 * The three node builtins the visual harness actually uses, declared locally.
 *
 * ## Why not `@types/node`
 *
 * This repository has no `@types/node` and that is deliberate rather than an
 * oversight: `packages/core/src/build-env.ts` declares `process` file-locally
 * with a comment saying why, because the published packages target the browser
 * and must not acquire node globals. Adding the dependency to typecheck two
 * imports in one Playwright spec would put a node type surface in the workspace
 * for every project to reach for — and `types: []` in the package configs
 * protects against it only for as long as nobody removes that line.
 *
 * So this declares the exact surface used and nothing else. It is deliberately
 * narrow: `readdirSync` returning `string[]` is true only without options, and
 * the day someone passes `{ withFileTypes: true }` this file fails to compile
 * rather than silently widening. That is the intended failure direction.
 *
 * ## Why this file exists at all
 *
 * `test/visual/` was in NO tsconfig project until 2026-07-20, so nothing here
 * was ever typechecked. Wiring it up surfaced these imports immediately. The
 * gap itself is recorded in `tsconfig.json` beside this file and is now
 * mechanised by `gate:typecheck-coverage`.
 */

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
