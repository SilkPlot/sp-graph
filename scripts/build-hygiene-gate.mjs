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
//   2. stale-output — a file in a package's `tsc -b` output whose source no
//      longer exists. `tsc -b` is incremental and never deletes, so a deleted
//      module survives indefinitely; `packages/charts` carried a `Placeholder`
//      module long after its source was removed.
//
//      That output is `.tsbuild`, not `dist`. `dist` is now the tsup build,
//      which is bundled (its file names are entry names, not source
//      names) and rebuilt from empty on every run — so it cannot go stale, and
//      a per-source-file check would not describe it. `.tsbuild` is the
//      incremental, file-per-source output this guard was written for.
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
  // `site` was absent here until 2026-07-20 while being a first-class referenced
  // project with its own `vite.config.ts`. A generated `site/vite.config.js`
  // would have shadowed it and changed what the published documentation site is
  // built from, with this gate reporting a clean pass — it only ever looked at
  // the playground.
  { root: "site", expected: "site/vite.config.ts" },
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
/**
 * How many build artifacts this run actually inspected.
 *
 * Counted because the loop below `continue`s past a package with no `.tsbuild`
 * directory, and a run where EVERY package is skipped used to print
 * "every package .tsbuild artifact traces to existing source" over zero
 * artifacts. That is a pass reporting a check that never happened — the exact
 * shape this repository treats as worse than a failure, because it is
 * indistinguishable from a real one.
 *
 * It is not hypothetical: `outDir` is set per package in
 * `packages/*&#47;tsconfig.json`, so moving it off `.tsbuild` would silently
 * exempt all five packages and leave this gate green forever.
 */
let inspected = 0;
let packagesWithOutput = 0;

for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!pkg.isDirectory()) continue;
  const buildDir = join(packagesDir, pkg.name, ".tsbuild");
  const srcDir = join(packagesDir, pkg.name, "src");
  if (!existsSync(buildDir)) continue;
  packagesWithOutput++;

  for (const emitted of filesUnder(buildDir)) {
    inspected++;
    const suffix = emittedSuffixes.find((s) => emitted.endsWith(s));
    if (suffix === undefined) {
      failures.push(
        `stale-output: packages/${pkg.name}/.tsbuild/${emitted} is not a recognised ` +
          "build artifact. Nothing in the build declares it.",
      );
      continue;
    }
    const stem = emitted.slice(0, -suffix.length);
    const hasSource = sourceExtensions.some((ext) => existsSync(join(srcDir, stem + ext)));
    if (!hasSource) {
      failures.push(
        `stale-output: packages/${pkg.name}/.tsbuild/${emitted} has no source — ` +
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
console.log(
  `  ✓ config-shadow — Vite resolves the TypeScript source and nothing else in ` +
    `${configRoots.map((c) => c.root).join(", ")}`,
);
if (inspected === 0) {
  // Reported rather than failed, because "no build output yet" is a legitimate
  // state — a clean checkout, or a run before `npm run build`. What must never
  // happen is this run CLAIMING the stale-output check passed. It did not run.
  console.log(
    "  – stale-output  — SKIPPED: no package .tsbuild output exists. This gate\n" +
      "                    checked nothing here. Run `npm run build` first if you\n" +
      "                    need that claim.",
  );
} else {
  console.log(
    `  ✓ stale-output  — ${inspected} artifact(s) across ${packagesWithOutput} package(s) ` +
      "trace to existing source",
  );
}
