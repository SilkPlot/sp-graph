#!/usr/bin/env node
// Two guards over the build's own output. Both exist because a green test suite
// says nothing about either failure: the tests run against `src`, and both of
// these defects live in what the build *emits*.
//
//   1. config-shadow — a generated `vite.config.js` beside `vite.config.ts`
//      wins Vite's config search, so the build silently runs generated state the
//      source no longer represents. This guard asks Vite itself which file it
//      resolved rather than guessing from filenames, because Vite's resolution
//      order is the thing under test.
//
//   2. stale-output — a file in a package's `dist` whose source no longer
//      exists. `tsc -b` is incremental and never deletes, so a deleted module
//      survives in `dist` indefinitely; `packages/charts/dist` carried a
//      `Placeholder` module long after its source was removed.
//
// Run after a build. Exits non-zero naming the offending files.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

// ---------------------------------------------------------------------------
// Guard 1 — the config Vite resolves is the TypeScript source, and nothing else
// ---------------------------------------------------------------------------

/** Config roots where a source config must not be shadowed by generated output. */
const configRoots = [
  { root: "playground", expected: "playground/vite.config.ts" },
];

for (const { root, expected } of configRoots) {
  const absRoot = join(repoRoot, root);
  let resolvedPath = null;
  try {
    // No `configFile` argument: this is the same search Vite performs when the
    // build runs, so whatever wins here is what the build would have used.
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "production" },
      undefined,
      absRoot,
      "silent",
    );
    resolvedPath = loaded?.path ?? null;
  } catch (error) {
    failures.push(
      `config-shadow: Vite failed to load a config under ${root}/: ${error.message}`,
    );
    continue;
  }

  if (resolvedPath === null) {
    failures.push(`config-shadow: Vite resolved no config file under ${root}/.`);
    continue;
  }

  const actual = relative(repoRoot, resolvedPath).split("\\").join("/");
  if (actual !== expected) {
    failures.push(
      `config-shadow: Vite resolved ${actual}, not ${expected}. ` +
        "A generated config is shadowing the TypeScript source — " +
        "run `npm run clean` and check what emitted it.",
    );
  }
}

// ---------------------------------------------------------------------------
// Guard 2 — every emitted file traces back to a source file that still exists
// ---------------------------------------------------------------------------

/** Emitted extensions, longest first so `.d.ts.map` is not read as `.map`. */
const emittedSuffixes = [".d.ts.map", ".d.ts", ".jsx.map", ".js.map", ".jsx", ".js"];
/** Extensions a source file may carry for a given emitted base name. */
const sourceExtensions = [".ts", ".tsx"];

const filesUnder = (dir, base = dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(abs, base));
    else out.push(relative(base, abs).split("\\").join("/"));
  }
  return out;
};

const packagesDir = join(repoRoot, "packages");
for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!pkg.isDirectory()) continue;
  const distDir = join(packagesDir, pkg.name, "dist");
  const srcDir = join(packagesDir, pkg.name, "src");
  if (!existsSync(distDir)) continue;

  for (const emitted of filesUnder(distDir)) {
    const suffix = emittedSuffixes.find((s) => emitted.endsWith(s));
    if (suffix === undefined) {
      failures.push(
        `stale-output: packages/${pkg.name}/dist/${emitted} is not a recognised ` +
          "build artifact. Nothing in the build declares it.",
      );
      continue;
    }
    const stem = emitted.slice(0, -suffix.length);
    const hasSource = sourceExtensions.some((ext) => existsSync(join(srcDir, stem + ext)));
    if (!hasSource) {
      failures.push(
        `stale-output: packages/${pkg.name}/dist/${emitted} has no source — ` +
          `packages/${pkg.name}/src/${stem}{${sourceExtensions.join(",")}} does not exist. ` +
          "Deleted source survived the build; `npm run build` must start from `npm run clean`.",
      );
    }
  }
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`Build hygiene gate FAILED — ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error("");
  process.exit(1);
}

console.log("Build hygiene gate passed:");
console.log("  ✓ config-shadow — Vite resolves playground/vite.config.ts and nothing else");
console.log("  ✓ stale-output  — every package dist artifact traces to existing source");
