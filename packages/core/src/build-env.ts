/**
 * Build-environment detection, shared by every contract that fails loud in
 * development and honestly in production.
 *
 * It lives in `core` because two layers now need the same answer — the chart
 * semantics contract in the Solid package and the time-scope contract beside
 * this file — and a second copy of "which build is this?" is exactly the
 * silently-disagreeing duplicate the reuse priority exists to prevent. `core` is
 * the lowest layer, so it is the one place both can reach.
 */

/**
 * Declared file-locally rather than pulled in from `@types/node`: this package
 * targets the browser and must not acquire node globals, and a `declare global`
 * would collide with `@types/node` wherever it IS present in the workspace.
 */
declare const process: { env: { NODE_ENV?: string } } | undefined;

/**
 * True in every build that is not an explicit production build.
 *
 * Guarded because `process` does not exist in a browser that received these
 * sources without a bundler substituting `process.env.NODE_ENV`. Failing OPEN
 * (assuming development) is the safe direction: the worst case is a throw in an
 * environment that would rather have warned, which is loud and fixable, whereas
 * failing closed would silently ship the exact broken contract the callers of
 * this function exist to prevent.
 */
export function isDevelopmentBuild(): boolean {
  // Written as the literal `process.env.NODE_ENV` on purpose: that exact
  // expression is what Vite, webpack, and rollup statically substitute at build
  // time. Routing it through `globalThis.process` or optional chaining defeats
  // the substitution, and a browser bundle would then always look like a
  // development build. The `typeof` guard is for the un-substituted case and
  // cannot itself throw.
  return typeof process === "undefined" || process.env.NODE_ENV !== "production";
}
