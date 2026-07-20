/**
 * The duplication-scope gate.
 *
 * `.codacy.yml` narrows two metrics — duplication and cyclomatic complexity —
 * so they stop measuring test code, for the reasons recorded in that file. The
 * exclusions have to be written as literal file paths rather than globs, because
 * Codacy documents that wildcards do not work in a duplication exclusion and
 * that the result is simply that the files are not excluded. Nothing reports
 * that. The analysis just measures them again.
 *
 * An explicit list has a matching failure mode: it goes stale the moment someone
 * adds a test file, and the symptom is a percentage drifting upward with no
 * error attached to it. Nobody reviews a diff that adds a test and thinks to
 * check a YAML list they did not touch.
 *
 * So this script is the thing that notices. It reads the test files off disk,
 * reads both exclusion lists out of `.codacy.yml`, and fails when they disagree
 * in either direction — a test file missing from a list (the scope silently
 * reverted for that file) or a listed path that no longer exists (a rename that
 * left the entry behind, which is the same defect one commit earlier).
 *
 * The honest limit, same as the accessibility gate: nothing here survives
 * deleting both the CI step and this file. What it can do is make every smaller
 * move loud, and the CI assertion below covers the step.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { hiddenInputs, hiddenInputsMessage } from "./lib/git-visibility.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * What counts as a test file, stated once so the gate and the config cannot
 * drift apart on the definition itself.
 *
 * Roots, not a name pattern: `packages/*\/test/`, `playground/test/`, and
 * `test/visual/` are where tests live, and everything authored inside them is
 * part of a test — the support modules and the visual-harness app included. A
 * `*.test.ts` pattern would miss `packages/charts/test/support.ts`, which is
 * exactly the kind of file duplication analysis flags hardest.
 */
const TEST_ROOTS = [
  /^packages\/[^/]+\/test\//,
  /^playground\/test\//,
  /^site\/test\//,
  /^test\/visual\//,
];

/**
 * Paths under those roots that the repository-wide `exclude_paths` already
 * removes from every analysis. Listing them again would be redundant, and
 * requiring them would make this gate demand entries for PNG baselines.
 */
const ALREADY_EXCLUDED = [/^test\/visual\/baselines\//, /^test\/visual\/\.output\//, /^test\/visual\/\.report\//];

/** Authored code. Fixtures like `index.html` are not what these metrics read. */
const CODE_EXTENSION = /\.(?:[cm]?tsx?|[cm]?jsx?)$/;

/** The exclusion lists that must cover every test file, and why each exists. */
const SCOPED_LISTS = [
  { engine: "duplication", metric: "duplication analysis" },
  { engine: "metric", metric: "cyclomatic complexity analysis" },
  // Lizard is a TOOL, not part of the `metric` engine, and scopes itself —
  // which is why a file listed under `metric` was still being measured by it.
  // Covered here for the same reason the other two are: an explicit list goes
  // stale the moment a test file is added, and Codacy reports nothing when it
  // does. If the lizard key turns out to be ignored by Codacy and the block is
  // removed from `.codacy.yml`, remove this entry in the same change — a gate
  // demanding entries for a list nothing reads is worse than no gate.
  { engine: "lizard", metric: "Lizard complexity analysis" },
];

/** The npm script CI has to keep calling for this gate to mean anything. */
const REQUIRED_CI_SCRIPT = "npm run gate:duplication-scope";

const failures = [];
const fail = (message) => failures.push(message);

function read(relative) {
  try {
    return readFileSync(join(repoRoot, relative), "utf8");
  } catch {
    return undefined;
  }
}

/** Whether a path is a test file this gate is responsible for. */
function isTestFile(path) {
  return (
    TEST_ROOTS.some((root) => root.test(path)) &&
    !ALREADY_EXCLUDED.some((skip) => skip.test(path)) &&
    CODE_EXTENSION.test(path)
  );
}

/**
 * Every tracked test file on disk. `git ls-files` rather than a directory walk:
 * it agrees with what is actually committed, so an untracked scratch file does
 * not fail the build and a committed one cannot hide behind `.gitignore`.
 *
 * The cost of that choice is handled at the call site rather than here: an
 * untracked test file is invisible to this function, and this gate reported
 * "57 test files, all present in every exclusion list" while two new ones sat
 * untracked beside them. See the `hiddenInputs` check below.
 */
function testFilesOnDisk() {
  const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  return tracked.filter(isTestFile);
}

/**
 * Pull one `engines.<name>.exclude_paths` list out of `.codacy.yml`.
 *
 * Hand-parsed on purpose: the repository has no YAML dependency, and pulling one
 * in to read one nested list of strings would be a heavier change than the gate
 * it serves. The parse is deliberately strict — it locates the block by
 * indentation and stops at the first line that leaves it — so a malformed or
 * moved block reads as "not found" and fails loudly, rather than silently
 * matching nothing and reporting every test file as missing.
 */
function parseExcludeList(yaml, engine) {
  const lines = yaml.split("\n");
  const enginesAt = lines.indexOf("engines:");
  if (enginesAt === -1) return undefined;

  const engineAt = lines.findIndex((line, i) => i > enginesAt && line === `  ${engine}:`);
  if (engineAt === -1) return undefined;

  const listAt = lines.findIndex((line, i) => i > engineAt && line === "    exclude_paths:");
  // The key must belong to this engine, not to the next one down the file.
  if (listAt === -1) return undefined;
  for (let i = engineAt + 1; i < listAt; i += 1) {
    if (lines[i].trim() !== "" && !lines[i].startsWith("    ")) return undefined;
  }

  const entries = [];
  for (let i = listAt + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^ {6}- "([^"]+)"$/);
    if (match === null) break;
    entries.push(match[1]);
  }
  return entries;
}

const codacyConfig = read(".codacy.yml");
// A test file this gate cannot see is a test file measured by Codacy without
// anybody knowing. Refuse rather than report a pass over an unknown.
const hidden = hiddenInputs(repoRoot, isTestFile);
if (hidden.length > 0) {
  console.error(`\n${hiddenInputsMessage("Duplication scope gate", hidden)}\n`);
  process.exit(1);
}

const onDisk = testFilesOnDisk();

if (codacyConfig === undefined) {
  fail(".codacy.yml not found — the duplication and complexity scope is unconfigured");
} else {
  for (const { engine, metric } of SCOPED_LISTS) {
    const listed = parseExcludeList(codacyConfig, engine);

    if (listed === undefined) {
      fail(
        `.codacy.yml has no \`engines.${engine}.exclude_paths\` block this gate can read\n` +
          `    every test file is being measured by ${metric}\n` +
          "    remedy: restore the block, one literal quoted path per line at six spaces of indent",
      );
      continue;
    }

    const listedSet = new Set(listed);
    const missing = onDisk.filter((path) => !listedSet.has(path));
    if (missing.length > 0) {
      fail(
        `${missing.length} test file(s) missing from \`engines.${engine}.exclude_paths\` in .codacy.yml:\n` +
          `${missing.map((path) => `        ${path}`).join("\n")}\n` +
          `    these are being measured by ${metric}, which the scope decision says they should not be\n` +
          "    remedy: add each path to that list, verbatim and quoted — a glob will not match there",
      );
    }

    const onDiskSet = new Set(onDisk);
    const stale = listed.filter((path) => !onDiskSet.has(path));
    if (stale.length > 0) {
      fail(
        `${stale.length} path(s) in \`engines.${engine}.exclude_paths\` no longer exist:\n` +
          `${stale.map((path) => `        ${path}`).join("\n")}\n` +
          "    a renamed test leaves the old entry behind and the new one unlisted\n" +
          "    remedy: delete the stale entry, and check the renamed file was added",
      );
    }
  }

  // A test path in the repository-wide list would remove it from quality and
  // security analysis too, which is the thing the scope decision explicitly is
  // not. Cheap to check, and it is the way this decision would be misread.
  const repoWide = codacyConfig.slice(codacyConfig.indexOf("\nexclude_paths:"));
  for (const suspect of ["packages/*/test", "playground/test", "test/visual/*", '"test/**"']) {
    if (repoWide.includes(suspect)) {
      fail(
        `repository-wide \`exclude_paths\` appears to exclude test code (\`${suspect}\`)\n` +
          "    that removes tests from quality and security analysis, which the scope decision does not\n" +
          "    remedy: narrow it under `engines:` instead",
      );
    }
  }
}

// CI still calls this gate.
const workflow = read(".github/workflows/ci.yml");
if (workflow === undefined) {
  fail(".github/workflows/ci.yml not found — the gate is not wired into CI");
} else if (!workflow.includes(REQUIRED_CI_SCRIPT)) {
  fail(`.github/workflows/ci.yml no longer runs \`${REQUIRED_CI_SCRIPT}\``);
}

if (failures.length > 0) {
  console.error("Duplication scope gate FAILED:\n");
  for (const message of failures) console.error(`  - ${message}\n`);
  console.error(
    "Codacy does not report an exclusion that failed to match. A test file absent from\n" +
      "these lists is measured again, silently, and the only visible symptom is a metric\n" +
      "drifting the wrong way months later. Fix the lists, or change the scope decision in\n" +
      ".codacy.yml first and update this gate with it.\n",
  );
  process.exit(1);
}

console.log(
  `Duplication scope gate: ${onDisk.length} test files, all present in every scoped exclusion list (${SCOPED_LISTS.map((l) => l.engine).join(", ")}).`,
);
