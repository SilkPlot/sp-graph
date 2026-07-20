#!/usr/bin/env node
/**
 * The probe-residue gate.
 *
 * `detection-probes.mjs` mutates a real source file, runs a suite, and restores
 * it. Restoration is wrapped in `try/finally` and verified byte-identical by
 * SHA-256 — which covers every failure path the script itself can see, and none
 * of the ones that matter most.
 *
 * **A SIGKILL runs no `finally` block.** On 2026-07-20 a probe run wrapped in an
 * external ten-minute timeout was killed mid-probe and left this mutation in
 * `packages/core/src/series.ts`:
 *
 *     - points: series.data.filter((d) => d.state === "present"),
 *     + points: series.data,
 *
 * Read cold, that is a plausible simplification — a reviewer skimming a diff
 * would not necessarily flinch at it. And **no test could have caught it**: a
 * probe mutation is designed to keep the code compiling, so it fails a suite,
 * not the compiler. What actually caught it was the probe script refusing to
 * start on a dirty file the next time it ran, and `git status` being clean
 * before a commit. Both are luck dressed as process.
 *
 * So the probe script now records its intent to disk BEFORE mutating, and
 * clears it only after a restore is proved byte-identical. This gate reads that
 * record.
 *
 * ## What it does
 *
 * - No sentinel: pass, silently. The overwhelmingly common case, and a gate that
 *   chattered on every clean run would be tuned out.
 * - Sentinel present, file already matches its recorded original: the run was
 *   interrupted between writing the sentinel and mutating, or something else
 *   restored it. Clear the sentinel and pass, saying so.
 * - Sentinel present, file differs: **a mutation is live in the working tree.**
 *   Fail, name the file, and show exactly how to restore it — including from the
 *   sentinel's own copy of the original, which survives even if the file was
 *   subsequently committed and `git checkout` would no longer help.
 *
 * `--restore` performs that restoration rather than only describing it.
 *
 * ## Why this is not just `git status`
 *
 * `git status` says a file changed. It does not say the change is a probe
 * mutation rather than your own work, and it cannot say what the file said
 * before. The sentinel carries the original bytes, so recovery is exact and does
 * not depend on the change never having been committed.
 */
import {
  closeSync,
  existsSync,
  ftruncateSync,
  openSync,
  readFileSync,
  rmSync,
  writeSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SENTINEL = join(repoRoot, ".probe-residue.json");

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const shouldRestore = process.argv.includes("--restore");

if (!existsSync(SENTINEL)) {
  console.log("Probe residue gate: no probe mutation outstanding.");
  process.exit(0);
}

let record;
try {
  record = JSON.parse(readFileSync(SENTINEL, "utf8"));
} catch (error) {
  console.error(
    "\nProbe residue gate FAILED — the sentinel exists but could not be read.\n\n" +
      `  ${SENTINEL}\n` +
      `  ${error instanceof Error ? error.message : String(error)}\n\n` +
      "  A probe run may have been interrupted while writing it. Check `git status`\n" +
      "  against the probe list in scripts/detection-probes.mjs by hand, then delete\n" +
      "  the sentinel.\n",
  );
  process.exit(1);
}

const { file, sha256: originalHash, original } = record;
const target = join(repoRoot, file);

/**
 * Read the target, or explain why not — WITHOUT checking existence first.
 *
 * The obvious shape here is `if (!existsSync(target)) { … }` and then read. That
 * is a time-of-check/time-of-use race, and CodeQL flagged it as one: between the
 * check and the read, the path can be replaced — with a symlink, most usefully
 * to an attacker — and the later write would follow it. The window is tiny and
 * this script runs on a developer's own machine, which is exactly the reasoning
 * that makes TOCTOU bugs ship.
 *
 * Attempting the operation and handling `ENOENT` closes the window entirely:
 * there is one filesystem call, so there is no interval to race. The error
 * message is just as specific.
 */
function readTarget() {
  try {
    return readFileSync(target, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    console.error(
      `\nProbe residue gate FAILED — the sentinel names a file that no longer exists.\n\n  ${file}\n\n` +
        "  remedy: restore it from the sentinel with `npm run gate:probe-residue -- --restore`.\n",
    );
    process.exit(1);
  }
}

const current = readTarget();

if (sha256(current) === originalHash) {
  // Interrupted before the write landed, or already put back by other means.
  // Clearing here is safe precisely because the hash proves the file is intact.
  rmSync(SENTINEL, { force: true });
  console.log(
    `Probe residue gate: a run was interrupted, but ${file} matches its recorded original. Sentinel cleared.`,
  );
  process.exit(0);
}

if (shouldRestore) {
  // `wx` would refuse an existing file and `w` follows a symlink, so the handle
  // is opened once and both the write and the read-back go through it. Resolving
  // the path twice is the same TOCTOU window in a different coat.
  const handle = openSync(target, "r+");
  try {
    ftruncateSync(handle, 0);
    writeSync(handle, original, 0, "utf8");
  } finally {
    closeSync(handle);
  }
  const after = readTarget();
  if (sha256(after) !== originalHash) {
    console.error(
      `\nProbe residue gate FAILED — could not restore ${file} from the sentinel.\n\n` +
        "  The write did not produce the recorded bytes. Do not commit; recover by hand.\n",
    );
    process.exit(2);
  }
  rmSync(SENTINEL, { force: true });
  console.log(`Probe residue gate: restored ${file} from the sentinel, verified by hash.`);
  process.exit(0);
}

console.error(
  "\nProbe residue gate FAILED — a probe mutation is live in your working tree.\n\n" +
    `  ${file}\n\n` +
    "  A detection-probe run was interrupted before it could restore this file. The\n" +
    "  mutation is designed to keep the code COMPILING — it fails a suite, not the\n" +
    "  compiler — so no test run and no type check will tell you it is there.\n\n" +
    "  remedy, either of:\n" +
    "    npm run gate:probe-residue -- --restore   (restores the exact recorded bytes)\n" +
    `    git checkout -- ${file}                    (if the change was never committed)\n`,
);
process.exit(1);
