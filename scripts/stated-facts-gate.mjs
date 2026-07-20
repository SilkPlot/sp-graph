#!/usr/bin/env node
/**
 * The stated-facts gate.
 *
 * Prose in this repository states numbers, and numbers rot. In a single session
 * on 2026-07-20 a close-out audit found SEVEN stale ones, none of which any gate
 * had noticed and each of which read as authoritative:
 *
 *   - "870 tests" on a branch that had 830, quoted in two files
 *   - "781 tests" long after the suite reached 895
 *   - "six known defects", "eleven known defects", "eighteen known defects" —
 *     three different wrong probe counts, in three different files
 *   - "Vitest runs five projects" while the config built six, with the sixth
 *     missing from the table entirely
 *
 * Every one was written accurately and then outlived its truth. That is the
 * whole problem: **a stale number does not look like a defect, it looks like a
 * measurement nobody has refreshed.** The estate has already been bitten by the
 * same shape twice at a larger scale — a dead frame-budget harness whose numbers
 * were quoted as current for a day, and a "current state" section frozen at an
 * old commit that produced six contradictions over two merges.
 *
 * ---------------------------------------------------------------------------
 * The two kinds of number, and why they are handled differently
 * ---------------------------------------------------------------------------
 *
 * **DERIVABLE facts** have a single machine-readable source of truth that is
 * cheap to read: the probe count is `PROBES.length`, the baseline total is
 * `EXPECTED_TOTALS.all`, the Vitest project count is in `vitest.config.ts`.
 * Those are CHECKED — the gate reads the source, finds every prose statement of
 * that fact, and fails on disagreement.
 *
 * **VOLATILE facts** change on almost every commit. The test count is the only
 * one, and it is the one that went stale most often, because nothing short of
 * running the suite can verify it and nobody re-runs the suite to edit a
 * sentence. Those are FORBIDDEN in prose — not checked, banned — unless the
 * sentence is explicitly dated, which marks it as a historical record rather
 * than a live claim.
 *
 * That asymmetry is the point. A gate that tried to verify the test count would
 * have to run the whole suite to check a sentence, and would fail every time
 * somebody adds a test — punishing exactly the behaviour the repository wants.
 * Banning the claim costs a writer one word ("as of 2026-07-20, …") and removes
 * the failure mode permanently.
 *
 * ---------------------------------------------------------------------------
 * Deliberately narrow
 * ---------------------------------------------------------------------------
 *
 * The patterns match specific phrasings, not "any number near the word test".
 * A broad pattern that caught ordinary English would train people to work around
 * this gate, which is worse than not having it — the same reasoning the
 * public-surface gate records for its own patterns. A phrasing this gate does
 * not recognise is a miss, and a miss is preferable to noise.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { hiddenInputs, hiddenInputsMessage } from "./lib/git-visibility.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "scripts/stated-facts-gate.mjs";

const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

/** Spelled-out numerals this repository's prose actually uses. */
const WORDS = {
  four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  "twenty-one": 21, "twenty-two": 22, "twenty-three": 23, "twenty-four": 24,
};

const asNumber = (token) => {
  const word = WORDS[token.toLowerCase()];
  return word ?? Number.parseInt(token, 10);
};

const NUM = "(\\d+|[a-z]+(?:-[a-z]+)?)";

/* -------------------------------------------------------------------------- */
/* Sources of truth                                                            */
/* -------------------------------------------------------------------------- */

/** `PROBES.length` — counted from the array literal's own entries. */
function probeCount() {
  const src = read("scripts/detection-probes.mjs");
  // `indexOf` returning -1 makes `slice(-1)` one character, and the count then
  // comes out 0 — which this gate would print as a PASS ("detection probes (0)")
  // rather than as the broken anchor it is. `baselineTotal()` below already
  // throws on a missing anchor; these two did not, and matching it is the point.
  const at = src.indexOf("const PROBES = [");
  if (at === -1) {
    throw new Error(
      "stated-facts: could not find `const PROBES = [` in scripts/detection-probes.mjs — " +
        "the anchor moved, so the probe count cannot be derived. Fix the anchor rather " +
        "than letting the gate report zero probes as agreement.",
    );
  }
  const body = src.slice(at);
  // Each probe opens with an `id:` field; counting those is stabler than
  // brace-matching and cannot be fooled by a nested object.
  return (body.match(/^ {4}id: "/gm) ?? []).length;
}

/** `EXPECTED_TOTALS.all` in the visual acceptance set. */
function baselineTotal() {
  const src = read("test/visual/acceptance-set.ts");
  const match = src.match(/all:\s*(\d+)/);
  if (!match) throw new Error("could not read EXPECTED_TOTALS.all from the acceptance set");
  return Number.parseInt(match[1], 10);
}

/** How many Vitest projects the config actually builds. */
function vitestProjectCount() {
  const src = read("vitest.config.ts");
  const at = src.indexOf("projects: [");
  if (at === -1) {
    throw new Error(
      "stated-facts: could not find `projects: [` in vitest.config.ts — the anchor moved, " +
        "so the project count cannot be derived. A miss here would report zero projects " +
        "as agreement with every document that names a number.",
    );
  }
  const projects = src.slice(at);
  const named = (projects.match(/name: "[a-z]+"/g) ?? []).length;
  const helpers = (projects.match(/browserProject(?:In)?\("/g) ?? []).length;
  return named + helpers;
}

const FACTS = [
  {
    id: "probe-count",
    truth: probeCount,
    what: "detection probes",
    source: "scripts/detection-probes.mjs (PROBES)",
    patterns: [
      new RegExp(`applies ${NUM} known defects`, "gi"),
      new RegExp(`${NUM} known defects`, "gi"),
      new RegExp(`probe:detection[^.\\n]{0,40}?\\b${NUM}/\\1\\b`, "gi"),
    ],
  },
  {
    id: "baseline-total",
    truth: baselineTotal,
    what: "visual baselines",
    source: "test/visual/acceptance-set.ts (EXPECTED_TOTALS.all)",
    patterns: [new RegExp(`\\*\\*${NUM} baselines\\*\\*`, "gi")],
  },
  {
    id: "vitest-projects",
    truth: vitestProjectCount,
    what: "Vitest projects",
    source: "vitest.config.ts (projects)",
    patterns: [new RegExp(`Vitest runs ${NUM} projects`, "gi")],
  },
];

/* -------------------------------------------------------------------------- */
/* Volatile facts — banned in undated prose                                    */
/* -------------------------------------------------------------------------- */

/**
 * A sentence is exempt when its own line carries a date or an explicit
 * historical marker. That is the escape hatch, and it is deliberately cheap:
 * the goal is not to stop anyone recording a measurement, it is to stop a
 * measurement being read as current three merges later.
 */
const DATED = /\b(?:20\d{2}-\d{2}-\d{2}|\[HISTORICAL|Historical|as of\b|at the .*? close\b)/;

const VOLATILE = [
  {
    id: "test-count",
    what: "a test count",
    // "895 tests", "**895 tests**", "895 tests across 50 files"
    pattern: /\b\d{2,4} tests\b/g,
    why:
      "the test count changes on almost every commit, so a prose statement of it is stale\n" +
      "      within days and nothing re-runs the suite to notice. It went stale four times in\n" +
      "      one session.",
    remedy:
      "date the sentence (`as of 2026-07-20, 895 tests`), mark it `[HISTORICAL]`, or drop the\n" +
      "      number — `npm test` is the answer to how many tests there are.",
  },
];

/* -------------------------------------------------------------------------- */

/**
 * What this gate reads.
 *
 * `.mjs` joined on 2026-07-20, and the omission was pointed: the SCRIPTS were
 * the one place a stale number was guaranteed to go unnoticed, because they are
 * the files arguing that stale numbers are dangerous. Two were found the moment
 * the scope widened — `visual-baseline-guard.mjs` claiming 92 pinned PNGs
 * against an actual 176, and a run-count in `detection-probes.mjs` describing a
 * harness a third its current size.
 *
 * A gate exempting itself from its own rule is the same shape as tooling
 * exempting itself from review, which this repository has already paid for once.
 */
const DOCS = /\.(?:md|mdx|mjs)$/;
const SKIP = [/^CHANGELOG\.md$/, /^docs\/decisions\//, /node_modules/];

function trackedDocs() {
  return execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((p) => DOCS.test(p) && p !== SELF && !SKIP.some((re) => re.test(p)));
}

const hidden = hiddenInputs(repoRoot, (p) => DOCS.test(p) && !SKIP.some((re) => re.test(p)));
if (hidden.length > 0) {
  console.error(`\n${hiddenInputsMessage("Stated facts gate", hidden)}\n`);
  process.exit(1);
}

const files = trackedDocs();
const findings = [];

for (const fact of FACTS) {
  const expected = fact.truth();
  for (const file of files) {
    const text = read(file);
    for (const pattern of fact.patterns) {
      for (const match of text.matchAll(pattern)) {
        const stated = asNumber(match[1]);
        if (Number.isNaN(stated) || stated === expected) continue;
        findings.push({
          file,
          line: text.slice(0, match.index).split("\n").length,
          said: match[0].trim(),
          why: `states ${stated} ${fact.what}; the source of truth says ${expected}`,
          remedy: `read ${fact.source} and correct the sentence`,
        });
      }
    }
  }
}

for (const rule of VOLATILE) {
  for (const file of files) {
    const text = read(file);
    const lines = text.split("\n");
    for (const [i, line] of lines.entries()) {
      if (DATED.test(line)) continue;
      for (const match of line.matchAll(rule.pattern)) {
        findings.push({
          file,
          line: i + 1,
          said: match[0].trim(),
          why: `${rule.what} in undated prose — ${rule.why}`,
          remedy: rule.remedy,
        });
      }
    }
  }
}

/**
 * A gate that exists but never runs is the failure this whole file is about,
 * expressed in the workflow instead of in prose.
 *
 * `package.json` declaring `gate:foo` says nothing about whether anything ever
 * executes it. Adding a gate and forgetting to wire it into CI produces exactly
 * the symptom every entry above describes: a green run that checked less than
 * the repository believes it did — and it is a SHORTER, greener run, so nothing
 * about it invites suspicion.
 *
 * This is not hypothetical housekeeping. `gate:typecheck-coverage` was added on
 * 2026-07-20 and had to be wired into `.github/workflows/ci.yml` by hand, with
 * nothing anywhere that would have failed if that step had been forgotten.
 *
 * Two gates are deliberately NOT in CI and each states why, so "not in CI" stays
 * a recorded decision rather than something a reader has to infer from a
 * workflow file's silence.
 */
const CI_EXEMPT = new Map([
  [
    "gate:probe-residue",
    "CI structurally CANNOT see what it checks: the sentinel it reads is " +
      "gitignored, so a probe mutation left by a killed run is a purely local " +
      "hazard. It runs as a pre-commit hook, wired by `npm prepare`.",
  ],
]);

function ciCoverageFindings() {
  const pkg = JSON.parse(read("package.json"));
  const gates = Object.keys(pkg.scripts ?? {}).filter((s) => s.startsWith("gate:"));

  // Every workflow, not just ci.yml: a gate may legitimately live on its own
  // schedule, exactly as `probe:detection` does.
  const workflowDir = join(repoRoot, ".github", "workflows");
  const workflows = existsSync(workflowDir)
    ? readdirSync(workflowDir)
        .filter((f) => /\.ya?ml$/.test(f))
        .map((f) => read(join(".github", "workflows", f)))
        .join("\n")
    : "";

  const out = [];
  for (const gate of gates) {
    if (CI_EXEMPT.has(gate)) continue;
    if (workflows.includes(gate)) continue;
    out.push({
      file: "package.json",
      line: read("package.json").slice(0, read("package.json").indexOf(`"${gate}"`)).split("\n")
        .length,
      said: `"${gate}"`,
      why:
        "declared as a gate but never referenced by any workflow in .github/workflows — " +
        "it does not run, and a gate nobody runs is indistinguishable from one that passes",
      remedy:
        `add a step running \`npm run ${gate}\` to a workflow, or — if it deliberately ` +
        "does not belong in CI — add it to CI_EXEMPT in " +
        `${SELF} with the reason, the way gate:probe-residue is.`,
    });
  }

  // An exemption naming a gate that no longer exists is a stale justification,
  // and a stale justification is where a real gap eventually hides.
  for (const gate of CI_EXEMPT.keys()) {
    if (gates.includes(gate)) continue;
    out.push({
      file: SELF,
      line: 1,
      said: gate,
      why: "exempted from CI but no such script exists in package.json",
      remedy: `remove the stale CI_EXEMPT entry for ${gate}`,
    });
  }
  return out;
}

findings.push(...ciCoverageFindings());

if (findings.length > 0) {
  console.error(`\nStated facts gate FAILED — ${findings.length} claim(s) disagree with reality:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  "${f.said}"`);
    console.error(`      ${f.why}`);
    console.error(`      remedy: ${f.remedy}\n`);
  }
  console.error(
    "A stale number does not look like a defect — it looks like a measurement nobody\n" +
      "has refreshed, which is why these survive review.\n",
  );
  process.exit(1);
}

console.log(
  `Stated facts gate: ${files.length} documents agree with source on ` +
    `${FACTS.map((f) => `${f.what} (${f.truth()})`).join(", ")}, ` +
    "and state no volatile count in undated prose.",
);
