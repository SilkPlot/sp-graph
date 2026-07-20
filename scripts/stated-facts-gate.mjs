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
import { readFileSync } from "node:fs";
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
  const body = src.slice(src.indexOf("const PROBES = ["));
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
  const projects = src.slice(src.indexOf("projects: ["));
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

const DOCS = /\.(?:md|mdx)$/;
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
