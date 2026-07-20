/**
 * What a `git ls-files` gate cannot see, and how to make that loud.
 *
 * ## The failure this exists to end
 *
 * Several gates in this repository enumerate their inputs with `git ls-files`,
 * for a good reason: the tracked set is what ships, and a directory walk would
 * pick up scratch files, editor droppings, and build output nobody meant to
 * scan. The cost is that **an untracked file is invisible**, and the gate does
 * not say so — it reports a clean pass over a file it never opened.
 *
 * That is the exact shape of the failure this whole repository is organised
 * against: *a gate that measured nothing is indistinguishable from a gate that
 * passed.* It has been hit three times, all in ordinary work rather than in a
 * drill:
 *
 *   - `gate:public-surface` reported a clean pass over 235 files while a new ADR
 *     was untracked and unexamined. Staged, it found a planted planning
 *     identifier at the correct line.
 *   - `gate:public-surface` again, later, reported clean while a new ADR carried
 *     two real planning identifiers. Staging turned the pass into a failure.
 *   - `gate:duplication-scope` reported "57 test files, all present in every
 *     exclusion list" while two new test files sat untracked beside them.
 *
 * In every case the fix was "stage the files", and in every case the gate had
 * already said everything was fine.
 *
 * ## What this does instead
 *
 * A gate calls `assertNothingHidden` with the same predicate it uses to select
 * its inputs. If any untracked-but-not-ignored file matches that predicate, the
 * gate FAILS with the list and one instruction. It does not scan the file and it
 * does not guess: an untracked file is not a finding, it is an *unknown*, and
 * the honest report is that the gate cannot answer yet.
 *
 * **Ignored files are deliberately not reported.** `--exclude-standard` honours
 * `.gitignore`, so build output and coverage do not become noise. A file
 * somebody has deliberately ignored is a decision; a file they have not staged
 * yet is an oversight in progress.
 */
import { execFileSync } from "node:child_process";

/**
 * Untracked, non-ignored paths, repo-relative.
 *
 * `--others --exclude-standard` is precisely "files git does not track and has
 * not been told to ignore" — the set a tracked-file gate is blind to.
 */
export function untrackedFiles(repoRoot) {
  return execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

/**
 * Fail when a gate's own inputs include something it cannot see.
 *
 * @param repoRoot   absolute path to the repository root
 * @param matches    the gate's input predicate: `(path) => boolean`
 * @param gateName   for the message, e.g. "Public surface gate"
 * @returns          the matching untracked paths (empty when clean)
 *
 * Returns rather than throws, so each gate reports in its own established
 * format and sets its own exit code. A helper that called `process.exit` would
 * make every gate's output inconsistent and untestable.
 */
export function hiddenInputs(repoRoot, matches) {
  return untrackedFiles(repoRoot).filter(matches);
}

/**
 * The standard message. One place, so three gates cannot word it three ways —
 * and so the remedy is always the same sentence a reader has seen before.
 */
export function hiddenInputsMessage(gateName, paths) {
  return [
    `${gateName} CANNOT RUN — ${paths.length} file(s) it would check are untracked:`,
    "",
    ...paths.map((p) => `        ${p}`),
    "",
    "    This gate enumerates its inputs with `git ls-files`, so an untracked file is",
    "    invisible to it. Reporting a pass here would be reporting a pass over files",
    "    it never opened, which is the failure mode this repository is most careful",
    "    about: a gate that measured nothing looks exactly like a gate that passed.",
    "",
    "    remedy: `git add` these files, then re-run. An untracked file is not a",
    "    finding — it is an unknown, and this gate will not guess.",
  ].join("\n");
}
