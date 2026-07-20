#!/usr/bin/env node
/**
 * The typecheck-coverage gate.
 *
 * `npm run typecheck` is a list of `tsc -p` invocations written by hand. That
 * list has no relationship to the files that actually exist, so a directory
 * nobody added to it is not typechecked and NOTHING SAYS SO — the run is
 * shorter and greener, which is the least suspicious way for coverage to
 * disappear.
 *
 * ---------------------------------------------------------------------------
 * What this cost, so the gate is not mistaken for a hypothetical
 * ---------------------------------------------------------------------------
 *
 * `test/visual/` — the Playwright specs, the acceptance set that the whole
 * visual harness is accountable to, and the Solid fixture page — was in no
 * project at all. It had never been typechecked. On 2026-07-20 a missing import
 * in the fixture app passed `npm run typecheck` and then surfaced as sixteen
 * consecutive 30-second Playwright timeouts during a baseline capture. A
 * timeout on a rendering harness reads like a rendering regression; it took a
 * log dive to find a one-line mistake the compiler would have caught instantly.
 *
 * Wiring the directory up immediately surfaced two more real problems in a file
 * nobody thought was suspect: two untyped node imports and three implicit-`any`
 * parameters.
 *
 * This is the same failure shape as the Lizard scope finding in `.codacy.yml` —
 * a tool silently covering less than intended does not look like a failure, it
 * looks like a number. And it is the same shape as the three static gates that
 * could not see untracked files. In all three cases the fix is the same: make
 * the tool refuse when it cannot see something, instead of passing over it.
 *
 * ---------------------------------------------------------------------------
 * How it works
 * ---------------------------------------------------------------------------
 *
 * Every tracked `.ts`/`.tsx` file must be claimed by at least one of the
 * projects `npm run typecheck` actually runs. The project list is READ FROM
 * `package.json` rather than restated here, so a project removed from the
 * script is a project this gate stops counting — which is the whole point.
 * Restating the list would let the two drift, and a gate that agrees with a
 * stale copy of the thing it checks is decoration.
 *
 * File membership comes from `tsc --listFilesOnly`, which is TypeScript's own
 * answer to "what is in this program" — include/exclude globs, `references`,
 * and `types` resolution all applied by the compiler rather than reimplemented
 * with a glob library that would get `exclude` subtly wrong.
 *
 * `git ls-files`, so this shares the untracked blind spot the other gates have
 * and handles it the same way: it REFUSES rather than reporting a clean pass
 * over files it never saw. Stage before believing it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Files that are deliberately outside every project, each with its reason.
 *
 * An allowlist rather than a pattern, so adding to it is a visible line in a
 * diff with a justification attached. "Not typechecked" must always be a
 * recorded decision, never something a reader has to infer from the absence of
 * a config.
 */
const BUILD_CONFIG_REASON =
  "a node-side BUILD CONFIG. It needs node builtins, and this workspace " +
  "deliberately has no `@types/node` — `packages/core/src/build-env.ts` declares " +
  "`process` file-locally precisely so the browser packages never acquire node " +
  "globals. Typechecking these would mean adding that type surface to the " +
  "workspace for every project to reach for. They are exercised instead by " +
  "actually running: a broken build config fails `npm run build`, the visual " +
  "capture, or `npm test` immediately and loudly.";

/**
 * The release-consumer fixture is typechecked, just NOT here — and that is the
 * entire point of it.
 *
 * `release:verify` copies this directory OUTSIDE the workspace, installs the
 * packed tarballs into it, and runs `tsc` there against the PUBLISHED
 * declarations. Adding it to a workspace project would defeat the gate rather
 * than strengthen it: inside the workspace these files resolve `@silkplot/*`
 * through the source path and would compile cleanly even if the tarballs
 * shipped no declarations at all. That is exactly the defect the release gate
 * exists to catch, and it is how a generic public component was caught being
 * unassignable to `Component<P>` when nothing inside the workspace could tell.
 */
const RELEASE_FIXTURE_REASON =
  "typechecked by `release:verify` OUTSIDE the workspace against the packed " +
  "tarballs. Typechecking it here would resolve @silkplot/* through source and " +
  "pass even if the tarballs shipped no declarations — defeating the gate.";

const EXEMPT = new Map([
  [
    "test/visual/vite.config.ts",
    "needs node builtins (`node:url`). Excluded by name in " +
      "test/visual/tsconfig.json rather than pulling in a node type surface. " +
      BUILD_CONFIG_REASON,
  ],
  ["vitest.config.ts", BUILD_CONFIG_REASON],
  ["playwright.visual.config.ts", BUILD_CONFIG_REASON],
  ["playground/vite.config.ts", BUILD_CONFIG_REASON],
  ["site/vite.config.ts", BUILD_CONFIG_REASON],
  ["packages/core/tsup.config.ts", BUILD_CONFIG_REASON],
  ["packages/theme/tsup.config.ts", BUILD_CONFIG_REASON],
  ["packages/solid/tsup.config.ts", BUILD_CONFIG_REASON],
  ["packages/charts/tsup.config.ts", BUILD_CONFIG_REASON],
  ["packages/calendar/tsup.config.ts", BUILD_CONFIG_REASON],
  ["test/release-consumer/vite.default.config.ts", BUILD_CONFIG_REASON],
  ["test/release-consumer/vite.solid.config.ts", BUILD_CONFIG_REASON],
  ["test/release-consumer/record-resolution.ts", RELEASE_FIXTURE_REASON],
  ["test/release-consumer/src/main.default.ts", RELEASE_FIXTURE_REASON],
  ["test/release-consumer/src/main.solid.tsx", RELEASE_FIXTURE_REASON],
  ["test/release-consumer/src/series.ts", RELEASE_FIXTURE_REASON],
]);

const sh = (cmd, args) =>
  execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** The projects `npm run typecheck` actually runs, read from the scripts it runs. */
function declaredProjects() {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
  const scripts = pkg.scripts ?? {};
  // `tsc -b` on the root config pulls in every referenced package project;
  // the rest are explicit `tsc -p <path>` invocations across the sub-scripts.
  const text = [scripts.typecheck, scripts["typecheck:tests"], scripts["typecheck:docs"]]
    .filter(Boolean)
    .join(" && ");

  const projects = [...text.matchAll(/tsc\s+-p\s+(\S+)/g)].map((m) => m[1]);
  if (/tsc\s+-b(?!\w)/.test(text)) projects.unshift("tsconfig.json");

  if (projects.length === 0) {
    console.error(
      "Typecheck-coverage gate FAILED — parsed ZERO projects out of package.json.\n\n" +
        "  That is this gate's own worst failure mode: with no projects, every file\n" +
        "  looks uncovered, or (worse, if the check were inverted) everything passes.\n" +
        "  The typecheck scripts have probably been restructured.\n" +
        "  remedy: update the parser in scripts/typecheck-coverage-gate.mjs to match.",
    );
    process.exit(1);
  }
  return projects;
}

/**
 * Strip `//` and block comments so a tsconfig can be parsed as JSON.
 *
 * The configs here are JSONC — several carry long explanatory comments, which
 * is the house style and worth keeping. String-aware, because a `//` inside a
 * path string is not a comment and eating it would silently corrupt a project
 * path into one that resolves nowhere.
 */
function parseJsonc(text) {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === "\n") { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") { inBlock = false; i++; }
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") { out += next ?? ""; i++; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && next === "/") { inLine = true; i++; continue; }
    if (c === "/" && next === "*") { inBlock = true; i++; continue; }
    out += c;
  }
  return JSON.parse(out);
}

/**
 * Expand a solution-style config into the projects that actually hold files.
 *
 * The root `tsconfig.json` is `"files": []` plus `references` — the standard
 * shape for `tsc -b`. Asking `--listFilesOnly` about it lists NOTHING, because
 * references are only followed in build mode. Left unhandled that is this
 * gate's most dangerous result: a config that legitimately contains no files of
 * its own would make every package source look uncovered.
 */
function expand(project, seen = new Set()) {
  const path = resolve(repoRoot, project);
  if (seen.has(path)) return [];
  seen.add(path);

  let config;
  try {
    config = parseJsonc(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(
      `Typecheck-coverage gate FAILED — could not read ${project}: ${error.message}`,
    );
    process.exit(1);
  }

  const references = config.references ?? [];
  const ownsNoFiles =
    Array.isArray(config.files) && config.files.length === 0 && config.include === undefined;

  if (references.length > 0 && ownsNoFiles) {
    return references.flatMap((r) =>
      expand(relative(repoRoot, resolve(dirname(path), r.path, "tsconfig.json")), seen),
    );
  }
  return [project];
}

/** Every file TypeScript itself considers part of `project`. */
function filesIn(project) {
  const run = spawnSync(
    "npx",
    ["tsc", "-p", project, "--listFilesOnly", "--noEmit", "false"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  // `--listFilesOnly` prints the program and exits 0 even for a project with
  // type errors, so a non-empty stdout is the success signal rather than the
  // status. A project that lists nothing is a broken config, not an empty one.
  const out = (run.stdout ?? "").trim();
  if (out === "") {
    console.error(
      `Typecheck-coverage gate FAILED — \`tsc -p ${project} --listFilesOnly\` listed no files.\n\n` +
        `  ${(run.stderr ?? "").trim().split("\n").slice(0, 6).join("\n  ")}\n\n` +
        "  remedy: the project is missing or its include globs match nothing.",
    );
    process.exit(1);
  }
  return new Set(
    out
      .split("\n")
      .map((f) => relative(repoRoot, resolve(repoRoot, f.trim())))
      .filter((f) => !f.startsWith("..") && !f.includes("node_modules")),
  );
}

/** Refuse rather than pass over files `git ls-files` cannot see. */
function refuseOnUntracked() {
  // Same blind spot as gate:public-surface, gate:duplication-scope and
  // gate:stated-facts, handled the same way.
  const untracked = sh("git", ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter((f) => /\.tsx?$/.test(f));
  if (untracked.length === 0) return;

  console.error(
    "Typecheck-coverage gate REFUSED to run — untracked TypeScript files:\n\n" +
      untracked.map((f) => `  ?? ${f}`).join("\n") +
      "\n\n  This gate reads `git ls-files`, so it cannot see these. Reporting a clean\n" +
      "  pass over files it never opened is exactly the failure it exists to prevent.\n" +
      "  remedy: `git add` these files, then re-run.",
  );
  process.exit(1);
}

/** Report files in no project, and exemptions whose file is gone. */
function report(uncovered, staleExemptions) {
  if (uncovered.length > 0) {
    console.error(
      `Typecheck-coverage gate FAILED — ${uncovered.length} file(s) are in no project:\n`,
    );
    for (const f of uncovered) console.error(`  ${f}`);
    console.error(
      "\n  These compile against nothing. `npm run typecheck` passes without ever\n" +
        "  reading them, which does not look like missing coverage — it looks like a\n" +
        "  green run. `test/visual/` sat like this until 2026-07-20 and cost a full\n" +
        "  baseline-capture run in 30-second timeouts.\n" +
        "  remedy: add these to an existing tsconfig's `include`, give the directory\n" +
        "  its own project and add it to `typecheck:tests`, or — if being unchecked is\n" +
        "  genuinely correct — add the file to EXEMPT in this script WITH its reason.",
    );
  }

  if (staleExemptions.length > 0) {
    console.error(
      `\nTypecheck-coverage gate FAILED — ${staleExemptions.length} exemption(s) name a file that no longer exists:\n`,
    );
    for (const f of staleExemptions) console.error(`  ${f}`);
    console.error(
      "\n  remedy: delete the entry from EXEMPT. An allowlist that outlives its files\n" +
        "  is where a real gap eventually goes unnoticed.",
    );
  }
}

function main() {
  refuseOnUntracked();

  const tracked = sh("git", ["ls-files"])
    .split("\n")
    .filter((f) => /\.tsx?$/.test(f) && !f.includes("node_modules"));

  const projects = declaredProjects().flatMap((p) => expand(p));
  const covered = new Set();
  for (const project of projects) for (const f of filesIn(project)) covered.add(f);

  const uncovered = tracked.filter((f) => !covered.has(f) && !EXEMPT.has(f));

  // An exemption for a file that no longer exists is a stale justification, and
  // stale justifications are how an allowlist becomes a place things hide.
  const staleExemptions = [...EXEMPT.keys()].filter((f) => !tracked.includes(f));

  if (uncovered.length === 0 && staleExemptions.length === 0) {
    console.log(
      `Typecheck coverage: ${tracked.length} tracked TS files, ` +
        `all covered by ${projects.length} project(s)` +
        (EXEMPT.size > 0 ? `, ${EXEMPT.size} exempt by name.` : "."),
    );
    return;
  }

  report(uncovered, staleExemptions);
  process.exit(1);
}

main();
