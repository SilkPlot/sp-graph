#!/usr/bin/env node
/**
 * The release gate.
 *
 * Everything before this point proves the library works *inside* the workspace,
 * where npm links `@silkplot/*` to the packages next door and TypeScript resolves
 * them through the "source" condition. That arrangement makes almost every
 * packaging defect invisible: a `default` export pointing at TSX, an internal
 * dependency pinned to `"*"`, a declaration file whose source was deleted, a test
 * colocated where it would be published. Each of those resolves perfectly well
 * from a sibling directory and fails the moment the workspace is gone.
 *
 * So this script removes the workspace. It cleans, builds, packs each publish
 * target, validates every packed manifest against an ALLOWLIST rather than an
 * eyeballed listing, and then installs the resulting tarballs into a consumer
 * project created OUTSIDE this repository — with no `file:` link back to the
 * source tree and no workspace resolution available to save it.
 *
 * Why an allowlist and not a blocklist. A blocklist enumerates the mistakes
 * somebody already made; the failures worth catching are the ones nobody has
 * made yet. Every path in the tarball must match a rule that says what it is and
 * why it ships. A file nobody declared is a failure, not a curiosity — which is
 * how a resurrected `Placeholder`, an emitted tsconfig, or tomorrow's unforeseen
 * artifact gets caught without anyone having predicted it.
 *
 *   node scripts/release-verify.mjs               full gate
 *   node scripts/release-verify.mjs --no-consumer manifests only (fast)
 *   node scripts/release-verify.mjs --keep        leave the consumer fixture on disk
 *
 * This script NEVER publishes. It runs `npm pack`, never `npm publish`, not even
 * a dry run against a registry. Publication is a separate, authorised step.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = join(repoRoot, ".release-staging");

const argv = process.argv.slice(2);
const runConsumer = !argv.includes("--no-consumer");
const keepFixture = argv.includes("--keep");

// ---------------------------------------------------------------------------
// What ships, and what deliberately does not
// ---------------------------------------------------------------------------

/**
 * The alpha publish set.
 *
 * `entry` is the source module the "solid"/"source" conditions point at, and
 * `solidCondition` records whether the package exposes one at all — `core` and
 * `theme` have no JSX, so there is nothing for a Solid-aware bundler to compile
 * differently and no condition to keep honest.
 */
const PUBLISH_TARGETS = [
  { dir: "core", name: "@silkplot/core", entry: "src/index.ts", solidCondition: false },
  { dir: "theme", name: "@silkplot/theme", entry: "src/index.ts", solidCondition: false },
  { dir: "solid", name: "@silkplot/solid", entry: "src/index.tsx", solidCondition: true },
  { dir: "charts", name: "@silkplot/charts", entry: "src/index.tsx", solidCondition: true },
];

/**
 * Packages held back from the release set, and why.
 *
 * This list is checked, not decorative: a held-back package must still fail its
 * stated reason. If `buildTimeGrid` were implemented, the reason would stop being
 * true and this gate would say so rather than letting the package stay held back
 * out of habit.
 */
const HELD_BACK = [
  {
    dir: "calendar",
    name: "@silkplot/calendar",
    reason: "its public `buildTimeGrid` entry point throws",
    // The gate asserts this is still the case.
    provenBy: { file: "packages/calendar/src/time-grid.ts", contains: "throw new Error(" },
  },
];

/** Solid-exporting packages own no copy of solid-js; the application does. */
const PEER_ONLY = ["solid-js"];

// ---------------------------------------------------------------------------
// The allowlist
// ---------------------------------------------------------------------------

/**
 * Every path in a tarball must match exactly one of these, or the gate fails.
 *
 * `required` means at least one path must match it — the difference between
 * "no unintended file shipped" and "the intended files shipped". A tarball that
 * lost its declarations would pass a pure rejection check perfectly.
 */
const ALLOWED = [
  { id: "manifest", pattern: /^package\.json$/, required: true, why: "the manifest npm reads" },
  { id: "readme", pattern: /^README\.md$/, required: true, why: "the page the registry renders" },
  { id: "licence", pattern: /^LICENSE$/, required: true, why: "Apache-2.0, per file, not by reference" },
  { id: "bundle", pattern: /^dist\/index\.js$/, required: true, why: "the compiled ESM entry the \"default\" condition serves" },
  { id: "bundle-map", pattern: /^dist\/index\.js\.map$/, required: true, why: "sourcemap for the compiled entry; resolves back into the shipped src" },
  { id: "entry-types", pattern: /^dist\/index\.d\.ts$/, required: true, why: "the declarations the \"types\" condition serves" },
  { id: "types", pattern: /^dist\/[A-Za-z0-9][A-Za-z0-9_-]*\.d\.ts$/, why: "per-module declarations emitted by tsc" },
  { id: "types-map", pattern: /^dist\/[A-Za-z0-9][A-Za-z0-9_-]*\.d\.ts\.map$/, why: "declaration maps" },
  { id: "source", pattern: /^src\/[A-Za-z0-9][A-Za-z0-9_-]*\.tsx?$/, required: true, why: "the TSX/TS the \"solid\" condition serves and the sourcemaps resolve through" },
];

/**
 * Named diagnoses for paths that fail the allowlist.
 *
 * These change nothing about the verdict — anything unmatched fails either way.
 * They exist so the failure names the defect instead of printing a path and
 * leaving the reader to work out why it matters.
 */
const TRAPS = [
  { test: (p) => /(^|\/)test\//.test(p) || /\.(test|spec)\./.test(p), label: "a test file — tests live in test/, never colocated in src/, precisely because src ships" },
  { test: (p) => /__screenshots__/.test(p), label: "a browser-test screenshot artifact" },
  { test: (p) => /^\.tsbuild\//.test(p), label: "`tsc -b` validation output — .tsbuild is not publishable, dist is" },
  { test: (p) => /\.tsbuildinfo$/.test(p), label: "TypeScript incremental build metadata" },
  { test: (p) => /(^|\/)tsconfig[^/]*\.json$/.test(p), label: "a tsconfig — build configuration, not a consumer artifact" },
  { test: (p) => /(^|\/)tsup\.config\./.test(p), label: "the tsup config — build configuration, not a consumer artifact" },
  { test: (p) => /(^|\/)coverage\//.test(p), label: "a coverage report" },
  { test: (p) => /(^|\/)node_modules\//.test(p), label: "an installed dependency" },
  { test: (p) => /\.tgz$/.test(p), label: "a packed tarball inside a packed tarball" },
  { test: (p) => /placeholder/i.test(p), label: "the deleted `Placeholder` module — stale output has been resurrected" },
  { test: (p) => /\.jsx?$/.test(p) && p.startsWith("src/"), label: "compiled JavaScript inside src/ — an emitter is writing beside the source" },
];

// ---------------------------------------------------------------------------

const failures = [];
const fail = (target, message) => failures.push(`${target}: ${message}`);
const step = (message) => console.log(`\n── ${message}`);

const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: repoRoot, encoding: "utf8", ...options });

// ---------------------------------------------------------------------------
// 1. Clean, then build from scratch
// ---------------------------------------------------------------------------

step("Clean build");
// `npm run build` is `npm run clean && tsc -b`. The clean is the point: `tsc -b`
// is incremental and never deletes, so without it a module whose source was
// removed survives in the validation output indefinitely.
run("npm", ["run", "build"], { stdio: "inherit" });

// ---------------------------------------------------------------------------
// 2. Pack every publish target
// ---------------------------------------------------------------------------

step("Pack");
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

/** `npm pack --json` shares stdout with the `prepack` lifecycle script's output. */
const parsePackJson = (stdout, name) => {
  const start = stdout.search(/^\[$/m);
  if (start === -1) {
    throw new Error(`npm pack --json produced no JSON array for ${name}:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(start));
};

const packed = [];
for (const target of PUBLISH_TARGETS) {
  const cwd = join(repoRoot, "packages", target.dir);
  // `prepack` runs `build:dist` here, which is what makes a tarball impossible to
  // produce from stale output: tsup empties `dist` before writing to it.
  const stdout = run("npm", ["pack", "--json", "--pack-destination", stagingDir], { cwd });
  const [result] = parsePackJson(stdout, target.name);
  const tarball = join(stagingDir, result.filename);
  // The manifest is read back OUT of the tarball, not off disk. What ships is the
  // only thing worth checking; a manifest edited after packing is not it.
  const manifest = JSON.parse(run("tar", ["-xzOf", tarball, "package/package.json"]));
  packed.push({ target, tarball, manifest, files: result.files.map((f) => f.path).sort() });
  console.log(`  packed ${result.filename} (${result.files.length} files, ${result.size} bytes)`);
}

// ---------------------------------------------------------------------------
// 3. Allowlist every packed path
// ---------------------------------------------------------------------------

step("Allowlist");
for (const { target, files } of packed) {
  const matched = new Set();

  for (const path of files) {
    const rule = ALLOWED.find((r) => r.pattern.test(path));
    if (rule === undefined) {
      const trap = TRAPS.find((t) => t.test(path));
      fail(
        target.name,
        `undeclared file in the tarball: ${path}` +
          (trap === undefined
            ? "\n      Nothing in the allowlist says what this is or why it ships."
            : `\n      This is ${trap.label}.`),
      );
      continue;
    }
    matched.add(rule.id);
  }

  for (const rule of ALLOWED.filter((r) => r.required)) {
    if (!matched.has(rule.id)) {
      fail(target.name, `the tarball has no ${rule.id} — expected ${rule.pattern}\n      ${rule.why}`);
    }
  }

  // Stale output. `dist/index.js` is a bundle and rebuilt from empty, so it
  // cannot go stale — but the declarations are emitted file-per-source by tsc,
  // and a `dist/Foo.d.ts` whose `src/Foo.tsx` is gone is the exact defect that
  // kept a `Placeholder` module alive long after its source was deleted.
  const srcDir = join(repoRoot, "packages", target.dir, "src");
  for (const path of files) {
    const stem = /^dist\/(.+?)\.d\.ts(?:\.map)?$/.exec(path)?.[1];
    if (stem === undefined) continue;
    if (![".ts", ".tsx"].some((ext) => existsSync(join(srcDir, stem + ext)))) {
      fail(
        target.name,
        `stale declaration: ${path} has no source — packages/${target.dir}/src/${stem}.{ts,tsx} does not exist.\n` +
          "      Deleted source survived into the tarball; `dist` was not emptied before the declarations landed.",
      );
    }
  }

  // Every file the tarball ships under `src/` must still exist in the working
  // tree under that name, and the declared entry must be among them.
  if (!files.includes(target.entry)) {
    fail(target.name, `the declared entry ${target.entry} is not in the tarball`);
  }
}

// ---------------------------------------------------------------------------
// 4. The exports contract (ADR-0006)
// ---------------------------------------------------------------------------

step("Exports contract");
for (const { target, manifest, files } of packed) {
  const map = manifest.exports?.["."];
  if (map === undefined || typeof map !== "object") {
    fail(target.name, "package.json declares no `exports[\".\"]` object");
    continue;
  }

  const conditions = Object.keys(map);
  const inTarball = (specifier) => files.includes(String(specifier).replace(/^\.\//, ""));

  const expectDist = (condition, extension) => {
    const value = map[condition];
    if (value === undefined) {
      fail(target.name, `exports["."] has no "${condition}" condition`);
      return;
    }
    if (!String(value).startsWith("./dist/")) {
      fail(
        target.name,
        `exports["."].${condition} is ${value}, which is not under ./dist/.\n` +
          (String(value).startsWith("./src/")
            ? "      A `default` or `types` condition pointing at source is the defect this gate exists for:\n" +
              "      a bundler with no Solid plugin resolves it and gets TypeScript and JSX it cannot parse."
            : "      Compiled output is what the non-Solid conditions serve."),
      );
      return;
    }
    if (!String(value).endsWith(extension)) {
      fail(target.name, `exports["."].${condition} is ${value}, which does not end in ${extension}`);
    }
    if (!inTarball(value)) {
      fail(target.name, `exports["."].${condition} points at ${value}, which is not in the tarball`);
    }
  };

  const expectSource = (condition) => {
    const value = map[condition];
    if (value === undefined) {
      fail(target.name, `exports["."] has no "${condition}" condition`);
      return;
    }
    if (!String(value).startsWith("./src/")) {
      fail(
        target.name,
        `exports["."].${condition} is ${value}, which is not under ./src/.\n` +
          (condition === "solid"
            ? "      The \"solid\" condition serving SOURCE is load-bearing. Solid's JSX compiles to\n" +
              "      fine-grained reactive DOM operations against a chosen target; pre-compiling picks\n" +
              "      that target for every consumer forever. See ADR-0006."
            : "      The \"source\" condition is how the workspace typechecks without building first."),
      );
      return;
    }
    if (!inTarball(value)) {
      fail(target.name, `exports["."].${condition} points at ${value}, which is not in the tarball`);
    }
  };

  expectSource("source");
  if (target.solidCondition) expectSource("solid");
  expectDist("types", ".d.ts");
  expectDist("default", ".js");

  // Order matters to every resolver: conditions are tried top to bottom, so a
  // `default` that is not last shadows everything after it.
  if (conditions.at(-1) !== "default") {
    fail(
      target.name,
      `exports["."] lists "${conditions.at(-1)}" after "default" (order: ${conditions.join(", ")}).\n` +
        "      `default` matches everything, so any condition after it is unreachable.",
    );
  }
  const expectedOrder = ["source", target.solidCondition ? "solid" : null, "types", "default"].filter(Boolean);
  if (conditions.join(",") !== expectedOrder.join(",")) {
    fail(
      target.name,
      `exports["."] conditions are [${conditions.join(", ")}], expected [${expectedOrder.join(", ")}] — most specific first`,
    );
  }

  // The legacy fields a non-`exports`-aware toolchain still reads.
  for (const [field, extension] of [["main", ".js"], ["types", ".d.ts"]]) {
    const value = manifest[field];
    if (value === undefined) {
      fail(target.name, `package.json has no top-level "${field}"`);
    } else if (!String(value).startsWith("./dist/") || !String(value).endsWith(extension)) {
      fail(target.name, `package.json "${field}" is ${value}; expected ./dist/*${extension}`);
    }
  }

  if (manifest.private === true) {
    fail(target.name, "package.json is marked private — it cannot be published");
  }
  if (manifest.license !== "Apache-2.0") {
    fail(target.name, `package.json license is ${manifest.license}, expected Apache-2.0`);
  }
}

// ---------------------------------------------------------------------------
// 5. Coordinated internal versions
// ---------------------------------------------------------------------------

step("Version coordination");
const versions = new Set(packed.map((p) => p.manifest.version));
if (versions.size !== 1) {
  fail(
    "release",
    `the publish set does not share one version: ${packed
      .map((p) => `${p.manifest.name}@${p.manifest.version}`)
      .join(", ")}\n      These packages are released as one set and only ever tested as one.`,
  );
}
const coordinated = packed[0]?.manifest.version;

for (const { target, manifest } of packed) {
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
      if (!dependency.startsWith("@silkplot/")) continue;
      if (range !== coordinated) {
        fail(
          target.name,
          `${field}["${dependency}"] is "${range}", not the coordinated "${coordinated}".\n` +
            (range === "*"
              ? "      `\"*\"` resolves to whatever the registry happens to hold once the package leaves\n" +
                "      this workspace — or to nothing at all when the sibling is unpublished."
              : "      A range permits an install that mixes versions across a set only tested together."),
        );
      }
      if (!PUBLISH_TARGETS.some((t) => t.name === dependency)) {
        fail(
          target.name,
          `${field}["${dependency}"] is not in the publish set — installing this package would 404`,
        );
      }
    }
  }

  for (const peer of PEER_ONLY) {
    if (manifest.dependencies?.[peer] !== undefined) {
      fail(
        target.name,
        `${peer} is a regular dependency. It must be a peer dependency: two copies in one\n` +
          "      application means two reactive graphs that cannot see each other's signals.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Held-back packages are still held back for the stated reason
// ---------------------------------------------------------------------------

step("Held-back packages");
for (const held of HELD_BACK) {
  if (PUBLISH_TARGETS.some((t) => t.dir === held.dir)) {
    fail(held.name, "is listed both as a publish target and as held back");
    continue;
  }
  const source = readFileSync(join(repoRoot, held.provenBy.file), "utf8");
  if (!source.includes(held.provenBy.contains)) {
    fail(
      held.name,
      `is held back because ${held.reason}, but ${held.provenBy.file} no longer contains\n` +
        `      \`${held.provenBy.contains}\`. The stated reason is no longer true — either publish it\n` +
        "      or record the real reason. A package held back out of habit is not a decision.",
    );
  } else {
    console.log(`  ${held.name} held back — ${held.reason} (still true)`);
  }
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\nRelease gate FAILED — ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`\n  ✓ ${packed.length} tarballs, every path allowlisted`);
console.log(`  ✓ exports serve src to "solid"/"source" and dist to "types"/"default"`);
console.log(`  ✓ internal dependencies pinned to the coordinated ${coordinated}`);

// ---------------------------------------------------------------------------
// 7. The consumer, outside the workspace
// ---------------------------------------------------------------------------

if (!runConsumer) {
  console.log("\nRelease gate passed (manifests only — consumer proof skipped).");
  if (!keepFixture) rmSync(stagingDir, { recursive: true, force: true });
  process.exit(0);
}

const { verifyConsumer } = await import("./release-consumer.mjs");
const consumerFailures = await verifyConsumer({
  repoRoot,
  tarballs: packed.map((p) => p.tarball),
  packageNames: packed.map((p) => p.manifest.name),
  keepFixture,
});

if (consumerFailures.length > 0) {
  console.error(`\nRelease gate FAILED — ${consumerFailures.length} consumer problem(s):\n`);
  for (const failure of consumerFailures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

if (!keepFixture) rmSync(stagingDir, { recursive: true, force: true });
console.log("\nRelease gate passed.");
