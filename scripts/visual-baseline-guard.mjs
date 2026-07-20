#!/usr/bin/env node
/**
 * The visual-baseline guard.
 *
 * `test/visual/baselines/` holds 92 pinned PNGs, and one command re-pins all of
 * them. `docs/visual-regression.md` already says the right thing — that
 * `--update-snapshots` is a decision about what "correct" means and not a fix,
 * and that a green suite afterwards is a tautology rather than evidence. Nothing
 * enforced it. A document that describes a discipline nobody is held to is a
 * document, not a gate.
 *
 * This is the enforcement. A change under `test/visual/baselines/` must arrive
 * with a matching entry in the BASELINE CHANGE LOG in `docs/visual-regression.md`,
 * added in the same diff, naming the exact baselines that moved, why the picture
 * changed, and who accepted it.
 *
 * ---------------------------------------------------------------------------
 * Why a ledger in the doc, and not a commit trailer
 * ---------------------------------------------------------------------------
 *
 * A commit-message trailer was the obvious alternative and is worse on every
 * axis that matters here. It does not survive a squash merge. It is invisible in
 * the rendered repository, so the record of why a picture changed lives only in
 * `git log`, which is exactly where nobody looks when the chart has looked wrong
 * for six weeks. And a trailer is checked against a commit range, so its meaning
 * changes with the branch topology it is measured on.
 *
 * The ledger is a file. It is reviewed like any other file, it renders next to
 * the workflow it enforces, and reading back six months of baseline history is
 * scrolling rather than archaeology.
 *
 * ---------------------------------------------------------------------------
 * Why it is hard to satisfy by accident
 * ---------------------------------------------------------------------------
 *
 * The entry must ENUMERATE the ids that changed, and the guard checks the set
 * BOTH WAYS. A baseline that moved without being named fails. An id named in the
 * entry that did not move also fails — so the cheapest defeat, pasting a
 * previous entry or writing "all baselines updated", does not work: the author
 * has to have looked at which images actually changed, which is step 3 of the
 * review workflow (check the blast radius) expressed as a check.
 *
 * Only entries ADDED IN THIS DIFF count. An existing entry naming the same id
 * from a previous re-pin does not license a second one — otherwise a baseline
 * that changed once could change forever on the strength of one sentence.
 *
 * ---------------------------------------------------------------------------
 * What it deliberately does not do
 * ---------------------------------------------------------------------------
 *
 * It does not check that the accepter is a different person from the author. Git
 * authorship is trivially settable and a name in a file is not an identity, so a
 * check on it would assert something it cannot know. Two-person review is
 * enforced where it can be — by branch protection, and by the reviewer reading
 * the entry this guard forces to exist. What the guard guarantees is that the
 * claim is WRITTEN DOWN, attributed, and specific: a reviewer who disagrees now
 * has a sentence to disagree with, which is the thing that was missing.
 *
 * And, the same honest limit as the other gates: nothing here survives someone
 * deleting the CI job and this file. What it can do is make every smaller move
 * loud, and the CI assertion below covers the job.
 *
 *   node scripts/visual-baseline-guard.mjs                 # against origin/main
 *   node scripts/visual-baseline-guard.mjs --base <ref>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BASELINE_DIR = "test/visual/baselines/";
const LEDGER_FILE = "docs/visual-regression.md";
/** The npm script CI has to keep calling for this guard to mean anything. */
const REQUIRED_CI_SCRIPT = "npm run gate:visual-baselines";

/**
 * An entry heading: `### <date> — <id>, <id>, …`
 *
 * The date is required and fixed-format so the log stays sortable and an entry
 * cannot be a bare sentence. Ids are the baseline file names without `.png`.
 */
const ENTRY_HEADING = /^###\s+(\d{4}-\d{2}-\d{2})\s+[—-]\s+(.+?)\s*$/;
const WHY_LINE = /^-\s+\*\*Why:\*\*\s*(.+?)\s*$/;
const ACCEPTED_LINE = /^-\s+\*\*Accepted by:\*\*\s*(.+?)\s*$/;

/** Rejected as an accepter: they attribute the decision to nobody. */
const NOT_A_NAME = /^(?:tbd|n\/?a|me|self|us|team|someone|anyone|\?+|x+|-+)$/i;
/** A "why" this short is a label, not a reason. Step 2 asks for one sentence. */
const MIN_WHY_LENGTH = 25;

const failures = [];
const fail = (message) => failures.push(message);

const git = (args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

// ---------------------------------------------------------------------------
// What to compare against
// ---------------------------------------------------------------------------

const baseAt = process.argv.indexOf("--base");
const explicitBase = baseAt === -1 ? undefined : process.argv[baseAt + 1];

/** `github.event.before` on a branch's first push. Not a commit. */
const NULL_SHA = /^0{40}$/;

/**
 * Resolve a ref to a commit SHA, or `undefined`.
 *
 * git's own stderr is captured rather than inherited: probing a ref that may not
 * exist is the normal path here, and letting `fatal: Needed a single revision`
 * land in the log above a message that explains the same thing in full reads as
 * a crash rather than as the fallback it is.
 */
const resolveRef = (ref) => {
  try {
    return execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
};

/**
 * Resolve the base commit — the state this change is being compared against.
 *
 * This is the part of the guard that is easiest to get quietly wrong, and the
 * first version WAS quietly wrong. It tried `GITHUB_BASE_REF` (set only on pull
 * requests), then `origin/main`. On a PUSH TO MAIN — which is this repository's
 * only workflow, it has no pull requests — the runner checks HEAD out at the
 * pushed commit and `origin/main` resolves to that same commit. `base...HEAD`
 * was therefore always empty and the guard reported "no baseline changed" on
 * every run, whatever the push did to the baselines. It was inert, and it was
 * inert in the most dangerous way available: printing a pass.
 *
 * That is the same failure shape the detection probes exist to prevent — a check
 * that cannot see its subject reporting success — so the rule here is the same
 * one: a base that cannot be determined is a FAILURE, never a fallback to
 * "nothing changed".
 *
 * The order, most specific first:
 *
 *   1. `--base <ref>`, for running it by hand against an arbitrary point.
 *   2. On a `push` event: `github.event.before`, the commit the branch pointed at
 *      before the push. Passed in as `PUSH_BEFORE_SHA` because the `github`
 *      context is not visible to a script. This is the ref that makes the guard
 *      work at all on a push-to-main estate.
 *      - It is the null SHA on a branch's first push, and can be unreachable
 *        after a force-push. Both fall back to `HEAD~1`, which describes the
 *        same thing for a single-commit push.
 *      - If `HEAD~1` does not exist either — a root commit, or a shallow clone —
 *        there is genuinely nothing to compare against and the guard FAILS.
 *        It does NOT fall through to `origin/main`, because on a push that is
 *        HEAD and would resurrect the inert bug.
 *   3. On a pull request: `origin/$GITHUB_BASE_REF`. Kept working in case the
 *      estate ever adopts pull requests. If that ref is missing the guard FAILS
 *      rather than falling back — on a PR the correct base is known, so failing
 *      to reach it is a fetch problem to fix, not a reason to compare against
 *      something else.
 *   4. Outside CI: `origin/main`, then `main`, for local use.
 */
function resolveBase() {
  if (explicitBase !== undefined) {
    const sha = resolveRef(explicitBase);
    return sha === undefined
      ? { error: `--base ${explicitBase} does not resolve to a commit` }
      : { ref: explicitBase, sha, how: "--base" };
  }

  if (process.env.GITHUB_EVENT_NAME === "push") {
    const before = (process.env.PUSH_BEFORE_SHA ?? "").trim();
    if (before !== "" && !NULL_SHA.test(before)) {
      const sha = resolveRef(before);
      if (sha !== undefined) {
        return { ref: before.slice(0, 12), sha, how: "github.event.before (push)" };
      }
    }
    const parent = resolveRef("HEAD~1");
    if (parent !== undefined) {
      const why =
        before === ""
          ? "PUSH_BEFORE_SHA was not passed through"
          : NULL_SHA.test(before)
            ? "github.event.before is the null SHA — first push of this branch"
            : "github.event.before is unreachable — probably a force-push";
      return { ref: "HEAD~1", sha: parent, how: `HEAD~1 (${why})` };
    }
    return {
      error:
        "on a push event, neither github.event.before nor HEAD~1 resolves to a commit.\n" +
        "    A root commit, or a shallow clone. Deliberately NOT falling back to origin/main:\n" +
        "    on a push that IS HEAD, and comparing HEAD against itself is how this guard was\n" +
        "    inert in the first place.\n" +
        "    remedy: check the checkout uses `fetch-depth: 0`",
    };
  }

  if (process.env.GITHUB_BASE_REF) {
    const ref = `origin/${process.env.GITHUB_BASE_REF}`;
    const sha = resolveRef(ref);
    return sha === undefined
      ? {
          error:
            `on a pull request, the base ref ${ref} does not resolve.\n` +
            "    remedy: check the checkout uses `fetch-depth: 0` so the base branch is fetched",
        }
      : { ref, sha, how: "GITHUB_BASE_REF (pull request)" };
  }

  for (const ref of ["origin/main", "main"]) {
    const sha = resolveRef(ref);
    if (sha !== undefined) return { ref, sha, how: "local fallback" };
  }
  return { error: "none of --base, $GITHUB_BASE_REF, origin/main, or main resolves to a commit" };
}

const base = resolveBase();
if (base.error !== undefined) {
  console.error(
    `Visual baseline guard FAILED — no base commit to compare against.\n\n  ${base.error}\n\n` +
      "  Without a base this guard cannot see which baselines changed, and 'cannot see'\n" +
      "  must never read as 'nothing changed'. That is a pass proving nothing.\n",
  );
  process.exit(1);
}

const headSha = git(["rev-parse", "HEAD"]).trim();

// The inert case, caught explicitly rather than allowed to print a pass.
//
// A local fallback that lands on HEAD means the guard is comparing the commit
// against itself. Off a runner that is just a clean checkout with nothing to
// say, and it reports so. ON a runner it means the event-specific resolution
// above did not fire and something has regressed in the workflow wiring — which
// is precisely the bug this rewrite fixes, so it fails rather than passes.
const comparingAgainstItself = base.sha === headSha;
if (comparingAgainstItself && base.how === "local fallback" && process.env.GITHUB_ACTIONS === "true") {
  console.error(
    `Visual baseline guard FAILED — base ${base.ref} IS HEAD (${headSha.slice(0, 12)}).\n\n` +
      "  The guard fell through to its local fallback on a runner, so it would have compared\n" +
      "  the pushed commit against itself and reported 'no baseline changed' regardless of\n" +
      "  what the push did. That is the inert failure this resolution order exists to prevent.\n\n" +
      "  remedy: the workflow step must set GITHUB_EVENT_NAME (GitHub does this) and pass\n" +
      // GitHub Actions expression syntax, quoted verbatim in a remedy message.
      // Turning it into a template string would EVALUATE it, and the message would
      // then print an empty `env:` line — telling the reader to write exactly the
      // nothing that broke their workflow. The suppression must be the LAST comment
      // line before the code: Biome associates only that one line with the rule.
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GHA syntax, not a JS placeholder
      "  `PUSH_BEFORE_SHA: ${{ github.event.before }}` through in its `env:` block.\n",
  );
  process.exit(1);
}

/** One line naming what was compared, how it was chosen, and where HEAD is. */
const describeBase = () =>
  `${base.ref} (${base.sha.slice(0, 12)}) via ${base.how}, HEAD ${headSha.slice(0, 12)}`;

// `git diff A...B` — the three-dot form, so this reports what the branch DID
// rather than everything that also happened on the base since it forked. A
// baseline changed on main by somebody else is not this branch's to justify.
const range = `${base.sha}...HEAD`;

// ---------------------------------------------------------------------------
// Which baselines moved
// ---------------------------------------------------------------------------

const changedBaselines = git(["diff", "--name-status", range, "--", BASELINE_DIR])
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, ...paths] = line.split("\t");
    // A rename reports the destination last; the destination is the file that
    // now exists and the id that must be justified.
    const path = paths[paths.length - 1];
    return { status: status[0], path, id: path.slice(BASELINE_DIR.length).replace(/\.png$/, "") };
  });

// ---------------------------------------------------------------------------
// What the ledger gained in this diff
// ---------------------------------------------------------------------------

/**
 * Parse entries out of the lines ADDED to the ledger by this diff.
 *
 * Added lines only, taken from the diff rather than the file: the whole file
 * would let an entry written months ago justify today's change, and the point of
 * the guard is that each re-pin is decided once, on the images in front of you.
 */
function addedLedgerEntries() {
  const patch = git(["diff", "--unified=0", range, "--", LEDGER_FILE]);
  const added = patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));

  const entries = [];
  let current;
  for (const line of added) {
    const heading = line.match(ENTRY_HEADING);
    if (heading) {
      current = {
        date: heading[1],
        ids: heading[2]
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
        why: undefined,
        acceptedBy: undefined,
      };
      entries.push(current);
      continue;
    }
    if (current === undefined) continue;
    const why = line.match(WHY_LINE);
    if (why) current.why = why[1];
    const accepted = line.match(ACCEPTED_LINE);
    if (accepted) current.acceptedBy = accepted[1];
  }
  return entries;
}

const entries = addedLedgerEntries();
const justified = new Map();
for (const entry of entries) {
  for (const id of entry.ids) {
    if (!justified.has(id)) justified.set(id, entry);
  }
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const changedIds = new Set(changedBaselines.map((b) => b.id));

const unjustified = changedBaselines.filter((b) => !justified.has(b.id));
if (unjustified.length > 0) {
  const verb = { A: "added", M: "changed", D: "deleted", R: "renamed to" };
  fail(
    `${unjustified.length} baseline(s) changed with no entry in the change log:\n` +
      `${unjustified.map((b) => `        ${verb[b.status] ?? "changed"} ${b.id}`).join("\n")}\n` +
      `    remedy: add an entry to the baseline change log in ${LEDGER_FILE} naming these ids,\n` +
      "    the reason the picture changed, and who accepted it — after looking at the diff",
  );
}

const phantom = [...justified.keys()].filter((id) => !changedIds.has(id));
if (phantom.length > 0) {
  fail(
    `${phantom.length} id(s) named in a new change-log entry did not change:\n` +
      `${phantom.map((id) => `        ${id}`).join("\n")}\n` +
      "    an entry that does not match the diff is a rationale for something that did not\n" +
      "    happen — usually a pasted previous entry, or a blanket list written without\n" +
      "    looking at which images moved\n" +
      "    remedy: list exactly the ids in the diff",
  );
}

for (const entry of entries) {
  const label = `${entry.date} — ${entry.ids.join(", ") || "(no ids)"}`;
  if (entry.ids.length === 0) {
    fail(`change-log entry \`${label}\` names no baseline ids`);
  }
  if (entry.why === undefined || entry.why.length < MIN_WHY_LENGTH) {
    fail(
      `change-log entry \`${label}\` has no usable **Why:** line\n` +
        "    \"baselines updated\" is not a reason. Name the cause in one sentence — the\n" +
        "    review workflow asks for it before any update is run, because being unable to\n" +
        "    write it means you do not yet know whether this is an intended change, a\n" +
        "    regression, or harness instability\n" +
        `    remedy: add \`- **Why:** …\` under the heading (at least ${MIN_WHY_LENGTH} characters)`,
    );
  }
  if (entry.acceptedBy === undefined || NOT_A_NAME.test(entry.acceptedBy)) {
    fail(
      `change-log entry \`${label}\` has no named accepter\n` +
        "    a baseline change is accepted by a person who looked at the rendered\n" +
        "    before/after, not by the suite going green again — which it always does\n" +
        "    remedy: add `- **Accepted by:** <name>` under the heading",
    );
  }
}

// The guard is only worth what CI does with it.
let workflow;
try {
  workflow = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
} catch {
  fail(".github/workflows/ci.yml not found — the guard is not wired into CI");
}
if (workflow !== undefined && !workflow.includes(REQUIRED_CI_SCRIPT)) {
  fail(`.github/workflows/ci.yml no longer runs \`${REQUIRED_CI_SCRIPT}\``);
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`Visual baseline guard FAILED — base ${describeBase()}:\n`);
  for (const message of failures) console.error(`  - ${message}\n`);
  console.error(
    "Re-pinning a baseline is a decision about what 'correct' means, and a green suite\n" +
      "afterwards is guaranteed rather than earned. This guard does not stop a re-pin — it\n" +
      "requires the decision to be written down, attributed, and specific about which\n" +
      `pictures moved. The workflow it enforces is in ${LEDGER_FILE}.\n`,
  );
  process.exit(1);
}

// The base is named on EVERY run, pass or fail, and not only when something
// fails. The inert bug survived a review precisely because a passing run said
// "no baseline changed against origin/main" without saying which commit that
// was — had it printed a base identical to HEAD, the defect would have been
// visible in the first CI log anybody read. Observability this cheap belongs on
// the success path, where it is the only path most people ever see.
console.log(`Visual baseline guard: base ${describeBase()}`);

if (changedBaselines.length === 0) {
  console.log(
    comparingAgainstItself
      ? "  no baselines to check — the base is HEAD, so this checkout has nothing to compare."
      : "  no baseline changed.",
  );
} else {
  console.log(
    `  ${changedBaselines.length} baseline change(s), each justified and accepted in ${LEDGER_FILE}:`,
  );
  for (const b of changedBaselines) {
    console.log(`  ✓ ${b.id} — accepted by ${justified.get(b.id).acceptedBy}`);
  }
}
