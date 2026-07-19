#!/usr/bin/env node
/**
 * The detection probes.
 *
 * A test suite proves nothing about the code until somebody has watched it FAIL.
 * A green run says "these assertions did not fire"; it does not say "these
 * assertions would fire if the behaviour broke". Those are different claims, and
 * only the second one is worth anything. A refactor that guts a suite — an
 * assertion softened to a truism, a loop that iterates over an empty array, a
 * helper that swallows the throw it was supposed to surface — reports green, and
 * green is what everyone reads.
 *
 * So each probe here breaks one real behaviour in one real source file, runs the
 * suite that claims to cover it, and requires that suite to GO RED. Then it puts
 * the file back and requires green to return. The suites were mutation-proved by
 * hand once; this script is that proof, executable, so the next session inherits
 * evidence rather than a claim.
 *
 * `npm run perf:hover` already works this way — it burns 30ms of a frame in a
 * control pass and aborts if the timer fails to notice. Same idea, wider scope.
 *
 * ---------------------------------------------------------------------------
 * The failure mode this script is most likely to have
 * ---------------------------------------------------------------------------
 *
 * A probe whose mutation SILENTLY FAILS TO APPLY. It runs the suite against
 * unmodified source, the suite passes, and the probe — if it only checked "did
 * something happen" — reports a clean pass having proved nothing at all. It
 * looks exactly like a working gate. This happened three separate times while
 * the probes were being developed by hand: a stale file wiped by a clean step, a
 * regex that never matched because the code used a guard clause where the
 * pattern assumed a `.filter()`, and an untracked file invisible to the tooling
 * that was looking for it.
 *
 * Every probe therefore proves its own mutation before it trusts the run:
 *
 *   1. The anchor text must appear EXACTLY ONCE in the file. Zero occurrences
 *      means the code moved and the probe is stale; more than one means the
 *      probe cannot say which site it hit.
 *   2. After writing, the file is re-read from disk and must differ from the
 *      backup, and must contain the replacement.
 *   3. Any of that failing is a BROKEN PROBE — it fails the run loudly. A probe
 *      that cannot apply must never skip quietly, because a quiet skip is
 *      indistinguishable from a pass.
 *
 * ---------------------------------------------------------------------------
 * Telling a real detection from a crash
 * ---------------------------------------------------------------------------
 *
 * A non-zero exit code is not evidence. A browser that fails to launch exits
 * non-zero. An out-of-memory kill exits non-zero — and on this class of machine
 * that is a live risk, because swap exhaustion takes Chromium out with SIGTRAP,
 * which reads exactly like a code defect. A syntax error from a botched mutation
 * exits non-zero having executed nothing.
 *
 * So a probe's run counts as a detection only when all four hold:
 *
 *   - the run failed;
 *   - it executed the SAME NUMBER OF TESTS as the clean baseline run for that
 *     project, so nothing collapsed, was skipped, or failed to collect;
 *   - at least `minFailures` tests failed, every one of them inside the files the
 *     probe declares — a mutation that reddens a suite it has no business
 *     touching is not the detection being claimed. `failingIn` is a SET rather
 *     than one path because several suites are split by subject (`BarChart` and
 *     `BarChart-reactive`), and the split is a property of the suites, not of the
 *     defect;
 *   - at least one failure message matches the expected shape, so the suite
 *     failed for the reason the probe induced and not for an unrelated one;
 *   - and tests OUTSIDE the affected file still passed, which is the direct
 *     evidence that the run really ran.
 *
 * `minFailures` is a floor rather than an equality. The counts observed by hand
 * are recorded next to each probe for the record, but asserting them exactly
 * would make this script fail every time somebody ADDS a test — punishing the
 * behaviour it exists to encourage. The floor plus the file constraint plus the
 * message match is specific enough that a coincidental red cannot satisfy it.
 *
 * ---------------------------------------------------------------------------
 * Restoration
 * ---------------------------------------------------------------------------
 *
 * Leaving a mutated source file in the tree would be far worse than the problem
 * this script solves. Every mutation is written inside a try/finally, restored
 * from an in-memory backup, and verified byte-identical by SHA-256 before the
 * probe is allowed to report anything. A restoration that does not verify is a
 * hard exit with the path named, not a warning.
 *
 * ---------------------------------------------------------------------------
 * Why this is not on the per-push critical path
 * ---------------------------------------------------------------------------
 *
 * It runs three Vitest projects clean and then once per probe — ten browser and
 * node runs in sequence, several minutes of wall clock. Putting that in front of
 * every push buys nothing: the probes prove a property of the SUITES, which
 * changes when somebody edits a suite, not on every commit. It is wired as its
 * own scheduled workflow (`.github/workflows/detection-probes.yml`) with a
 * manual trigger, so it can never fail a build it was not meant to gate and can
 * never share a runner with the Vitest browser projects.
 *
 * Run it by hand before touching any suite named below:
 *
 *   npm run probe:detection
 *   npm run probe:detection -- --only extent-finite-guard
 *   npm run probe:detection -- --list
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One fixed port for every run, and never two runs at once.
 *
 * Vitest's browser mode auto-probes for a free port. Two runners started
 * concurrently collide, and the collision does not report as one: it reports a
 * connect timeout, executes ZERO tests, and finishes in about a second. That is
 * a run this script would otherwise have to interpret, and "zero tests executed"
 * is precisely the shape of a probe proving nothing. Pinning the port makes the
 * collision immediate and obvious instead of silent.
 */
const BROWSER_API_PORT = 65300;

/**
 * The probes.
 *
 * `anchor` is text verified to exist in the file as written — not a guessed
 * pattern. `observed` records what the mutation produced when it was run by
 * hand, for the record; `minFailures` is what the script enforces.
 */
const PROBES = [
  {
    id: "semantics-strict-throw",
    file: "packages/solid/src/semantics.ts",
    project: "charts",
    browser: true,
    breaks:
      "the name/description contract fails loud in development — remove the throw and a " +
      "chart with no accessible name ships silently",
    anchor: "    if (strict) throw new Error(message);",
    mutation: "    /* probe: strict throw removed */",
    failingIn: ["packages/charts/test/chart-semantics.test.tsx"],
    minFailures: 4,
    observed: "4 failures, “expected [Function] to throw an error”",
    messagePattern: /to throw an error/,
  },
  {
    id: "announcer-queue-window",
    file: "packages/solid/src/ChartAnnouncer.tsx",
    project: "solid",
    browser: true,
    breaks:
      "announcements are throttled into a window — write straight through and a keyboard walk " +
      "floods the live region with every step it passed",
    anchor: "    if (timer !== undefined) {\n      pending = text;\n      return;\n    }",
    mutation: "    if (timer !== undefined) {\n      write(text);\n      return;\n    }",
    failingIn: ["packages/solid/test/announcer.test.tsx"],
    minFailures: 3,
    observed: "3 failures showing the flooded sequence, e.g. ['point 1','point 2',…]",
    messagePattern: /point 2/,
  },
  {
    id: "area-zero-baseline-domain",
    file: "packages/charts/src/AreaChart.tsx",
    project: "charts",
    browser: true,
    breaks:
      "Area's y-domain includes zero because its fill is drawn FROM zero — collapse it onto " +
      "Line's `zero-floor` and an all-negative series draws its baseline on a labelled non-zero pixel",
    anchor: 'domain: "zero-baseline"',
    mutation: 'domain: "zero-floor"',
    failingIn: [
      "packages/charts/test/AreaChart.test.tsx",
      "packages/charts/test/AreaChart-reactive.test.tsx",
    ],
    minFailures: 2,
    observed: "2 failures, on the -75-against-0 and ~60-against-0 pixel values",
    messagePattern: /expected/,
  },
  {
    id: "bar-negative-height",
    file: "packages/charts/src/BarChart.tsx",
    project: "charts",
    browser: true,
    breaks:
      "a bar's height is a magnitude — take the raw difference instead and every bar below the " +
      "baseline gets a negative height, which SVG discards without complaint",
    anchor: "height={Math.abs(yVal() - y0())}",
    mutation: "height={yVal() - y0()}",
    failingIn: [
      "packages/charts/test/BarChart.test.tsx",
      "packages/charts/test/BarChart-reactive.test.tsx",
    ],
    minFailures: 7,
    observed: "7 failures, e.g. “expected -103.08 to be greater than or equal to 0”",
    messagePattern: /to be greater than or equal to 0/,
  },
  {
    id: "extent-finite-guard",
    file: "packages/core/src/extent.ts",
    project: "core",
    browser: false,
    breaks:
      "extent skips non-finite values — drop the guard and one NaN or null in a series poisons " +
      "the whole domain, which every scale downstream then inherits",
    anchor: "    if (!Number.isFinite(v)) continue;\n",
    mutation: "",
    failingIn: ["packages/core/test/extent.test.ts"],
    minFailures: 9,
    observed: "9 failures, e.g. “expected [ null, null ] to deeply equal [ +0, 1 ]”",
    messagePattern: /to deeply equal/,
  },
  {
    id: "time-scope-isolation",
    file: "packages/core/src/time-scope.ts",
    project: "core",
    browser: false,
    breaks:
      "a section that declared its own scope is isolated from the dynamic selection — invert the " +
      "precedence and a drag on one chart silently retargets a section that opted out of following it",
    anchor: "  const narrowing = section ?? scopes.dynamic;",
    mutation: "  const narrowing = scopes.dynamic ?? section;",
    failingIn: ["packages/core/test/time-scope.test.ts"],
    minFailures: 2,
    observed:
      "2 failures carrying the defect's own instants, e.g. “expected { start: 300 } to deeply equal { start: 600 }”",
    messagePattern: /to deeply equal/,
  },
  {
    id: "overlap-duplicate-key",
    file: "packages/core/src/overlap.ts",
    project: "core",
    browser: false,
    breaks:
      "a duplicate pack key throws — swallow it and two items sharing a key map to two lanes, " +
      "which no rendering can express and nothing reports",
    anchor: "        throw new Error(",
    mutation: "        void new Error(",
    failingIn: [
      "packages/core/test/overlap.test.ts",
      "packages/core/test/overlap-identity.test.ts",
    ],
    minFailures: 2,
    observed: "2 failures, “expected [Function] to throw an error”",
    messagePattern: /to throw an error/,
  },
  {
    id: "series-identity-by-id",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "a series is identified by its id — key the lookup by position instead and a reorder " +
      "reassigns every series' data, colour, and legend toggle without anything throwing",
    anchor: "  const byId = new Map(series.map((s) => [s.id, s]));",
    mutation: "  const byId = new Map(series.map((s) => [String(s.sourceIndex), s]));",
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 4,
    observed: "identity, gap-policy and metadata lookups all miss — “expected undefined to …”",
    messagePattern: /undefined/,
  },
  {
    id: "series-metadata-preserved",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "raw datum metadata survives normalisation — drop it and a tooltip loses the unplotted " +
      "fields it exists to show, forcing every application back to a parallel join",
    anchor: "        meta: d.meta,",
    mutation: "        meta: undefined,",
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 2,
    observed: "2 failures, “expected undefined to deeply equal { serial: 'PA-99120' }”",
    messagePattern: /to deeply equal/,
  },
  {
    id: "series-no-zero-fill",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "a gap stays null — fill it with zero and a missing reading becomes indistinguishable " +
      "from a real measurement of zero, inverting the meaning of any signed series",
    anchor: '        y: state === "present" ? (d.y as number) : null,',
    mutation: '        y: state === "present" ? (d.y as number) : 0,',
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 3,
    observed: "gaps read as 0 — “expected 0 to be null” and a domain floored at zero",
    messagePattern: /to be null|to deeply equal/,
  },
  {
    id: "series-finite-domain",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "a non-finite value is classified invalid and kept out of the domain — admit it as " +
      "present and one NaN poisons the extent every scale downstream inherits",
    anchor: '  return Number.isFinite(y) ? "present" : "invalid";',
    mutation: '  return "present";',
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 3,
    observed: "domains go non-finite — “expected [ NaN, NaN ] to deeply equal [ +0, 1 ]”",
    messagePattern: /to deeply equal|to be/,
  },
  {
    id: "multi-series-palette-stability",
    file: "packages/charts/src/MultiSeriesBody.tsx",
    project: "charts",
    browser: true,
    breaks:
      "a series' palette slot comes from its position in the CALLER's array — key it on " +
      "visible position instead and hiding one series silently recolours the rest",
    anchor: "              resolveSeriesStyle(series.style, series.sourceIndex, {",
    mutation: "              resolveSeriesStyle(series.style, i(), {",
    failingIn: ["packages/charts/test/multi-series.test.tsx"],
    minFailures: 1,
    observed: "the hidden series' colour shifts from --sp-cat-1 to --sp-cat-0",
    messagePattern: /to be|expected/,
  },
  {
    id: "multi-series-ignored-gap",
    file: "packages/charts/src/MultiSeriesBody.tsx",
    project: "charts",
    browser: true,
    breaks:
      "a `connect` series drops its gaps before the path generator sees them — keep them and " +
      "the generator scales a null, which coerces to ZERO and draws a spike to the baseline",
    anchor: '                  points: series.data.filter((d) => d.state === "present"),',
    mutation: "                  points: series.data,",
    failingIn: ["packages/charts/test/multi-series.test.tsx"],
    minFailures: 1,
    observed: "connect no longer yields one subpath; a gap reaches the baseline",
    messagePattern: /expected|to be/,
  },
  {
    id: "multi-series-signed-domain",
    file: "packages/charts/src/LineChart.tsx",
    project: "charts",
    browser: true,
    breaks:
      "the multi-series line keeps its own y-domain policy — swap it for the area's and an " +
      "all-negative series is padded to zero at the wrong end, which only signed data reveals",
    anchor: '        yDomain="zero-floor"',
    mutation: '        yDomain="extent"',
    failingIn: ["packages/charts/test/multi-series.test.tsx"],
    minFailures: 1,
    observed: "the union-domain test reads a different pixel for the same value",
    messagePattern: /to be close to|expected/,
  },
];

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const abs = (relative) => join(repoRoot, relative);
const readSource = (relative) => readFileSync(abs(relative), "utf8");

class BrokenProbe extends Error {}

const jsonDir = mkdtempSync(join(tmpdir(), "silkplot-probes-"));
let runCounter = 0;

/**
 * Run one Vitest project and return a structured summary.
 *
 * The JSON reporter rather than stdout scraping: the questions this script asks
 * — how many tests EXECUTED, which file each failure came from, what each
 * failure said — are answered exactly by the report and only approximately by
 * parsing a human-readable log.
 */
function runProject(project, browser) {
  runCounter += 1;
  const outputFile = join(jsonDir, `run-${runCounter}.json`);
  const args = [
    "vitest",
    "run",
    "--project",
    project,
    "--reporter=json",
    `--outputFile=${outputFile}`,
  ];
  // Only for the browser projects: `core` runs in node, and handing a node
  // project a browser flag is a config error, not a stricter run.
  if (browser) args.push(`--browser.api.port=${BROWSER_API_PORT}`);

  const result = spawnSync("npx", args, {
    cwd: repoRoot,
    encoding: "utf8",
    // Captured, not inherited: a probe's mutated run is EXPECTED to be red, and
    // dumping a screenful of red into the log of a passing gate is how people
    // learn to stop reading it. The summary below reports what matters, and a
    // broken probe prints the captured output in full.
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });

  let report;
  try {
    report = JSON.parse(readFileSync(outputFile, "utf8"));
  } catch {
    // No parseable report means the run did not get far enough to produce one:
    // a browser that would not launch, an OOM kill, a collection error. Not a
    // detection, and not something to guess about.
    return {
      exitCode: result.status,
      signal: result.signal,
      parsed: false,
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      executed: 0,
      failures: [],
    };
  }

  const failures = [];
  let executed = 0;
  for (const file of report.testResults ?? []) {
    const path = String(file.name ?? "").replace(`${repoRoot}/`, "");
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status === "pending" || assertion.status === "todo") continue;
      executed += 1;
      if (assertion.status === "failed") {
        failures.push({
          path,
          name: assertion.fullName ?? assertion.title ?? "",
          messages: assertion.failureMessages ?? [],
        });
      }
    }
  }

  return {
    exitCode: result.status,
    signal: result.signal,
    parsed: true,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    executed,
    failures,
  };
}

/**
 * Apply a probe's mutation, proving at every step that it landed.
 *
 * Returns the backup text. Throws `BrokenProbe` — never returns quietly — if
 * the anchor is missing, ambiguous, or the write did not change the file.
 */
function applyMutation(probe) {
  const before = readSource(probe.file);

  const occurrences = before.split(probe.anchor).length - 1;
  if (occurrences === 0) {
    throw new BrokenProbe(
      `anchor text not found in ${probe.file}\n` +
        `    looked for: ${JSON.stringify(probe.anchor)}\n` +
        "    the source moved and this probe no longer mutates anything — it would have\n" +
        "    run against unmodified code and reported a clean pass having proved nothing.\n" +
        "    remedy: re-anchor the probe on text that exists in the file today",
    );
  }
  if (occurrences > 1) {
    throw new BrokenProbe(
      `anchor text appears ${occurrences} times in ${probe.file}\n` +
        `    looked for: ${JSON.stringify(probe.anchor)}\n` +
        "    an ambiguous anchor cannot say which site it broke, so the failures it produces\n" +
        "    cannot be attributed.\n" +
        "    remedy: widen the anchor until it is unique",
    );
  }

  writeFileSync(abs(probe.file), before.replace(probe.anchor, probe.mutation), "utf8");

  // Re-read from disk. Trusting the write is exactly the assumption that made
  // three hand-run probes silently prove nothing.
  const after = readSource(probe.file);
  if (after === before) {
    throw new BrokenProbe(
      `mutation did not change ${probe.file}\n` +
        "    the file on disk is byte-identical after the write — the anchor and the\n" +
        "    replacement may be the same text, or something restored the file underneath.\n" +
        "    remedy: check the probe's `mutation` actually differs from its `anchor`",
    );
  }
  if (!after.includes(probe.mutation) && probe.mutation !== "") {
    throw new BrokenProbe(
      `mutation text is absent from ${probe.file} after the write\n` +
        "    the file changed but not in the way the probe intended.\n" +
        "    remedy: check the probe's `mutation` for whitespace that the anchor does not carry",
    );
  }

  return before;
}

/** Put the file back, and prove it. A restoration nobody verified is a rumour. */
function restore(probe, backup) {
  writeFileSync(abs(probe.file), backup, "utf8");
  const restored = readSource(probe.file);
  if (sha256(restored) !== sha256(backup)) {
    console.error(
      "\nFATAL — could not restore a mutated source file.\n\n" +
        `  ${probe.file} does not match its backup after restoration.\n` +
        "  This file is CURRENTLY MUTATED in your working tree. Recover it with\n" +
        `  \`git checkout -- ${probe.file}\` before doing anything else.\n`,
    );
    process.exit(2);
  }
}

/**
 * Decide whether a mutated run is a detection or a crash wearing its clothes.
 *
 * Returns a list of reasons it is NOT a detection; empty means it is one.
 */
function judge(probe, run, baseline) {
  const reasons = [];

  if (!run.parsed) {
    reasons.push(
      "the run produced no parseable report — it died before it collected anything " +
        `(exit ${run.exitCode}${run.signal ? `, signal ${run.signal}` : ""}). ` +
        "That is a failed proof, not a detection.",
    );
    return reasons;
  }

  if (run.exitCode === 0) {
    reasons.push(
      "the run PASSED with the mutation applied. The suite does not detect this defect — " +
        "either the assertions no longer cover it, or the mutation is not the behaviour " +
        "they were written for.",
    );
  }

  if (run.signal !== null && run.signal !== undefined) {
    reasons.push(
      `the run was killed by ${run.signal}. SIGTRAP here is the local out-of-memory ` +
        "signature — swap exhaustion takes chromium out and it reads exactly like a code " +
        "defect. Check `free -m` and run again.",
    );
  }

  if (run.executed !== baseline.executed) {
    reasons.push(
      `the run executed ${run.executed} tests against ${baseline.executed} in the clean ` +
        "baseline. A mutation must redden tests, not remove them — a different count means " +
        "collection changed, which is not the property under test.",
    );
  }

  if (run.failures.length < probe.minFailures) {
    reasons.push(
      `${run.failures.length} test(s) failed, fewer than the ${probe.minFailures} this ` +
        "mutation is known to break. Part of the coverage has gone.",
    );
  }

  const strays = run.failures.filter((f) => !probe.failingIn.includes(f.path));
  if (strays.length > 0) {
    reasons.push(
      `${strays.length} failure(s) landed outside ${probe.failingIn.join(", ")}:\n` +
        `${[...new Set(strays.map((f) => `        ${f.path}`))].join("\n")}\n` +
        "    the mutation is reddening suites it has no business touching, so the failures " +
        "cannot be read as this probe's detection",
    );
  }

  const matched = run.failures.some((f) =>
    f.messages.some((m) => probe.messagePattern.test(m)),
  );
  if (!matched) {
    reasons.push(
      `no failure message matched ${probe.messagePattern}. The suite went red, but not in ` +
        "the shape this mutation produces — so something else broke and the detection is " +
        "unproven.",
    );
  }

  const passed = run.executed - run.failures.length;
  if (passed <= 0) {
    reasons.push(
      "every test in the project failed. A total wipeout is a broken build, not a targeted " +
        "detection — the unaffected tests must still pass for the run to be evidence of anything.",
    );
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

if (argv.includes("--list")) {
  console.log("Detection probes:\n");
  for (const p of PROBES) {
    console.log(`  ${p.id}`);
    console.log(`      mutates  ${p.file}`);
    console.log(`      proves   ${p.failingIn.join(", ")} (project "${p.project}")`);
    console.log(`      breaks   ${p.breaks}`);
    console.log(`      observed ${p.observed}\n`);
  }
  process.exit(0);
}

const onlyAt = argv.indexOf("--only");
const only = onlyAt === -1 ? undefined : argv[onlyAt + 1];
const selected = only === undefined ? PROBES : PROBES.filter((p) => p.id === only);
if (selected.length === 0) {
  console.error(`No probe named "${only}". Run with --list to see the ids.`);
  process.exit(1);
}

// A mutated tree would corrupt every backup this script takes, so it refuses to
// start on top of one. Scoped to the files the selected probes touch.
const dirty = spawnSync("git", ["status", "--porcelain", "--", ...selected.map((p) => p.file)], {
  cwd: repoRoot,
  encoding: "utf8",
});
if ((dirty.stdout ?? "").trim() !== "") {
  console.error(
    "Detection probes REFUSED to start — a source file a probe mutates is already modified:\n",
  );
  console.error(dirty.stdout);
  console.error(
    "  Each probe backs a file up, mutates it, and restores the backup. Starting from a\n" +
      "  dirty file would make that backup the modified state, and the probe would then\n" +
      "  'restore' your uncommitted work into something it never was.\n" +
      "  remedy: commit or stash these files first.\n",
  );
  process.exit(1);
}

console.log("Detection probes — proving the suites fail when the behaviour breaks.\n");

const projects = [...new Set(selected.map((p) => `${p.project}:${p.browser}`))];
const baselines = new Map();
const results = [];
let broken = 0;

try {
  // A clean run per project FIRST. It is the reference every mutated run is
  // judged against — the executed-test count that says "this run really ran".
  // It also means a suite that is red before any mutation is reported as such,
  // rather than being read as six successful detections.
  for (const key of projects) {
    const [project, browserFlag] = key.split(":");
    const browser = browserFlag === "true";
    process.stdout.write(`  baseline  ${project.padEnd(10)} `);
    const run = runProject(project, browser);
    if (!run.parsed || run.exitCode !== 0) {
      console.log("FAILED");
      console.error(
        `\nThe "${project}" project is not green before any mutation was applied.\n` +
          "  Every probe judges its mutated run against this one, so there is nothing to\n" +
          "  measure against. Fix the suite first.\n",
      );
      console.error(run.output);
      process.exit(1);
    }
    console.log(`green, ${run.executed} tests`);
    baselines.set(key, run);
  }

  console.log("");

  for (const probe of selected) {
    const key = `${probe.project}:${probe.browser}`;
    const baseline = baselines.get(key);
    process.stdout.write(`  probe     ${probe.id.padEnd(28)} `);

    let backup;
    try {
      backup = applyMutation(probe);
    } catch (error) {
      if (!(error instanceof BrokenProbe)) throw error;
      console.log("BROKEN PROBE");
      results.push({ probe, ok: false, brokenProbe: error.message });
      broken += 1;
      continue;
    }

    let run;
    try {
      run = runProject(probe.project, probe.browser);
    } finally {
      restore(probe, backup);
    }

    const reasons = judge(probe, run, baseline);
    if (reasons.length === 0) {
      const spread = [...new Set(run.failures.map((f) => f.path.split("/").pop()))];
      console.log(`detected — ${run.failures.length} failure(s) in ${spread.join(", ")}`);
      results.push({ probe, ok: true, failures: run.failures.length });
    } else {
      console.log("NOT DETECTED");
      results.push({ probe, ok: false, reasons, output: run.output });
    }
  }

  // Green has to come back. The per-file SHA check above proves the bytes are
  // restored; this proves the SUITE agrees, which is the claim the next session
  // will actually rely on.
  console.log("");
  for (const key of projects) {
    const [project, browserFlag] = key.split(":");
    process.stdout.write(`  restored  ${project.padEnd(10)} `);
    const run = runProject(project, browserFlag === "true");
    const expected = baselines.get(key).executed;
    if (!run.parsed || run.exitCode !== 0 || run.executed !== expected) {
      console.log("NOT GREEN");
      console.error(
        `\nThe "${project}" project is not green after the probes restored their files.\n` +
          `  Expected ${expected} passing tests; got ${run.executed} executed, ` +
          `${run.failures.length} failed (exit ${run.exitCode}).\n` +
          "  A mutation may have survived. Check `git status` and `git diff` now.\n",
      );
      console.error(run.output);
      process.exit(2);
    }
    console.log(`green, ${run.executed} tests`);
  }
} finally {
  rmSync(jsonDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);

if (failed.length > 0) {
  console.error(`\nDetection probes FAILED — ${failed.length} of ${selected.length}:\n`);
  for (const result of failed) {
    if (result.brokenProbe) {
      console.error(`  ✗ ${result.probe.id} — BROKEN PROBE\n    ${result.brokenProbe}\n`);
      continue;
    }
    console.error(`  ✗ ${result.probe.id}`);
    console.error(`    mutated ${result.probe.file}`);
    console.error(`    expected ${result.probe.failingIn.join(", ")} to fail: ${result.probe.observed}`);
    for (const reason of result.reasons) console.error(`    - ${reason}`);
    console.error("");
  }
  console.error(
    broken > 0
      ? "A BROKEN PROBE is not a skipped check. A probe whose mutation does not apply runs\n" +
          "against unmodified source and passes, which is indistinguishable from a working\n" +
          "gate and is the reason this script exists in the shape it does. Re-anchor it.\n"
      : "A suite that stays green while its behaviour is broken is not covering that\n" +
          "behaviour, whatever its assertion count says. Either the coverage regressed and\n" +
          "must be restored, or the contract changed — in which case change it deliberately,\n" +
          "in the suite and in this probe, in the same diff.\n",
  );
  process.exit(1);
}

console.log(`\nDetection probes: ${selected.length}/${selected.length} suites detected their defect.`);
for (const result of results) {
  console.log(`  ✓ ${result.probe.id.padEnd(28)} ${result.failures} failure(s)`);
}
