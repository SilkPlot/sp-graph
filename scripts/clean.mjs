#!/usr/bin/env node
// Remove every build-produced artifact in the repository.
//
// `tsc -b --clean` alone is not enough. It removes only what the project
// references currently declare, so anything a *previous* configuration emitted
// — output beside a config file, a package `dist` entry whose source has since
// been deleted, a bundle written by Vite rather than tsc — survives it. That is
// how `packages/charts/dist` kept a `Placeholder` module after its source was
// deleted, and how generated JavaScript came to sit beside
// `playground/vite.config.ts` where it won Vite's config search.
//
// So this covers the whole emitted surface: package `dist`, TypeScript build
// metadata, Vite output, release staging (`npm pack` tarballs), and generated
// config output beside a source config. `npm run build` runs it first, which is
// what makes a build reproducible rather than incremental.

import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Enumerated, never hardcoded: a package added later must be cleaned without
// anyone remembering to edit this list. A missed package is precisely the
// failure this script exists to prevent.
const packageDirs = readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}`);

/** Every workspace root that can hold build metadata or release staging. */
const workspaceDirs = [".", ...packageDirs, "playground"];

/** Directories that are entirely build output. */
const outputDirs = [
  // Each package emits to two places on purpose, for the same reason the
  // playground does: `dist` is the publishable tsup build, `.tsbuild` is the
  // `tsc -b` validation output. One shared directory would let each producer's
  // leftovers look like the other's product.
  ...packageDirs.map((dir) => `${dir}/dist`),
  ...packageDirs.map((dir) => `${dir}/.tsbuild`),
  // The playground emits to two places on purpose: `dist` is the Vite bundle,
  // `.tsbuild` is the `tsc -b` validation output. They used to share `dist`,
  // where each producer's leftovers looked like the other's product.
  "playground/dist",
  "playground/.tsbuild",
];

/**
 * Directories to sweep for build-produced files, with the predicate that
 * identifies them. Deliberately not recursive into `node_modules`.
 */
const sweeps = [
  // TypeScript incremental build metadata, and release staging: `npm pack`
  // writes its tarball beside the manifest.
  ...workspaceDirs.map((dir) => ({ dir, match: (n) => n.endsWith(".tsbuildinfo") })),
  ...workspaceDirs.map((dir) => ({ dir, match: (n) => n.endsWith(".tgz") })),
  // Generated output beside a source config. `vite.config.ts` is the source;
  // any other `vite.config.*` is emitted, and Vite's config search prefers the
  // JavaScript one, so leaving it here silently changes what the build does.
  { dir: "playground", match: (n) => /^vite\.config\.(?!ts$).+$/.test(n) },
  { dir: ".", match: (n) => /^vitest\.config\.(?!ts$).+$/.test(n) },
];

const removed = [];

for (const rel of outputDirs) {
  const abs = join(repoRoot, rel);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  rmSync(abs, { recursive: true, force: true });
  removed.push(`${rel}/`);
}

for (const { dir, match } of sweeps) {
  const abs = join(repoRoot, dir);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !match(entry.name)) continue;
    rmSync(join(abs, entry.name), { force: true });
    removed.push(dir === "." ? entry.name : `${dir}/${entry.name}`);
  }
}

// Last, so the build graph's own bookkeeping agrees with what is on disk.
execFileSync("npx", ["tsc", "-b", "--clean"], { cwd: repoRoot, stdio: "inherit" });

if (removed.length === 0) {
  console.log("clean: nothing to remove — tree was already clean.");
} else {
  console.log(`clean: removed ${removed.length} build artifact(s):`);
  for (const path of removed.sort()) console.log(`  ${path}`);
}
