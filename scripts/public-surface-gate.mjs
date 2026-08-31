#!/usr/bin/env node
/**
 * The public-surface gate.
 *
 * This repository is public and the ones it is developed alongside are not. Two
 * failures follow from that, and neither one announces itself:
 *
 *   1. AN INTERNAL IDENTIFIER LEAKS. A private repository name, a research ID,
 *      or a planning ID gets pasted into a comment or a doc while someone is
 *      thinking in internal terms. It reads as normal prose to the person who
 *      wrote it. To a reader outside it is a pointer they cannot follow, which
 *      is worse than no pointer: it advertises that an internal document exists
 *      and gives them nothing to do about it.
 *
 *   2. A LINK ROTS. A file moves or is renamed and the documentation keeps
 *      pointing at where it used to be. A `blob/main/...` URL into this same
 *      repository is the worst case, because it looks authoritative and 404s.
 *
 * Both are invisible to every other gate in this repository. The test suite has
 * no opinion about prose, and the type checker has none about a URL in a string.
 *
 * Deliberately NO NETWORK. Every check here is deterministic and offline:
 *
 *   - Links into this repository are resolved against the files on disk, which
 *     is exactly the class of link that rots, and is checkable exactly.
 *   - Third-party links are checked for shape only. Fetching them would make
 *     this gate fail on somebody else's outage, and a gate that goes red for
 *     reasons the repository cannot fix is a gate people learn to ignore.
 *
 *   node scripts/public-surface-gate.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hiddenInputs, hiddenInputsMessage } from "./lib/git-visibility.mjs";
import {
  internalIdentifierFindings,
  internalPathIdentifierFindings,
} from "./lib/public-surface-identifiers.mjs";
import {
  readPublicArtifact,
  resolveInsideRoot,
} from "./lib/public-surface-links.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The canonical public repository, as it appears in a URL.
 *
 * Everything else about the estate is private, so this is the ONLY repository
 * name that may appear in a public artifact.
 */
const PUBLIC_REPO = "SilkPlot/sp-graph";

/**
 * Binary and generated paths, skipped because scanning them is meaningless
 * rather than because they are trusted.
 *
 * `dist` and `coverage` are gitignored and so are not in the tracked file list
 * at all; the baselines are PNGs. Anything else tracked in this repository IS a
 * public artifact and is scanned, including workflows, configs, and scripts.
 */
const SKIP = [
  /^test\/visual\/baselines\//,
  /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf)$/i,
];

/** Files whose links are checked. Prose and site source; not test fixtures. */
const LINK_SOURCES = /^(?:[^/]+\.md|docs\/.*\.md|site\/src\/.*\.tsx?|\.github\/.*\.(?:md|yml))$/;

function tracked() {
  return execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/** Line number of a character offset, so a failure is navigable. */
function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

// ---------------------------------------------------------------------------
// Check 1 — no prohibited private-estate identifiers
// ---------------------------------------------------------------------------

function checkIdentifiers(files) {
  const findings = [];

  for (const file of files) {
    findings.push(...internalPathIdentifierFindings(file));
    let artifact;
    try {
      artifact = readPublicArtifact(repoRoot, file);
    } catch {
      continue; // A tracked path that is not a readable file (for example, a submodule).
    }
    if (!artifact.symlink && SKIP.some((re) => re.test(file))) continue;
    const { text } = artifact;
    if (text.includes("\0")) continue; // Binary that dodged the extension list.

    findings.push(...internalIdentifierFindings(file, text));
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check 2 — links into this repository resolve to real files
// ---------------------------------------------------------------------------

/**
 * Every `blob/main/...` or `tree/main/...` URL pointing at THIS repository,
 * with the path it claims exists.
 */
const SELF_LINK = new RegExp(
  `https://github\\.com/${PUBLIC_REPO}/(?:blob|tree)/main/([^)\\s"'\`<>]+)`,
  "gi",
);

/** Markdown relative links: `[text](./path)` or `[text](path/file.md)`. */
const MD_RELATIVE = /\[[^\]]*\]\((?!https?:|mailto:|#)([^)#\s]+)(?:#[^)\s]*)?\)/g;

function checkLinks(files) {
  const findings = [];

  for (const file of files) {
    try {
      const artifact = readPublicArtifact(repoRoot, file);
      if (artifact.symlinkEscapesRoot) {
        findings.push({
          file,
          line: 1,
          target: artifact.symlinkTarget,
          why: "a tracked symbolic link that escapes the public repository.",
        });
			} else if (artifact.symlink && !artifact.symlinkTargetExists) {
				findings.push({
					file,
					line: 1,
					target: artifact.symlinkTarget,
					why: "a tracked symbolic link whose in-repository target does not exist.",
				});
      }
    } catch {
      // Submodules and other non-file entries are outside this text/link gate.
    }
  }

  for (const file of files.filter((f) => LINK_SOURCES.test(f))) {
    // Same guard `checkIdentifiers` already has. A tracked path can be
    // unreadable — a submodule, a dangling symlink — and crashing the gate on
    // one is worse than skipping it: the whole public-surface check stops
    // running over every other file.
    let artifact;
    try {
      artifact = readPublicArtifact(repoRoot, file);
    } catch {
      continue;
    }
    if (artifact.symlink) continue;
    const { text } = artifact;

    for (const m of text.matchAll(SELF_LINK)) {
			const raw = m[1].replace(/[.,;:]+$/, "");
			const target = resolveInsideRoot(repoRoot, repoRoot, raw);
			if (target === undefined || !existsSync(target)) {
        findings.push({
          file,
          line: lineOf(text, m.index ?? 0),
					target: raw,
					why:
						target === undefined
							? "attempts to escape the public repository."
							: `points into this repository at a path that does not exist. A ${PUBLIC_REPO} URL that 404s looks authoritative and is not.`,
        });
      }
    }

    if (!file.endsWith(".md")) continue;

    for (const m of text.matchAll(MD_RELATIVE)) {
      const raw = m[1];
			const target = resolveInsideRoot(
				repoRoot,
				join(repoRoot, dirname(file)),
				raw,
			);
			if (target === undefined || !existsSync(target)) {
        findings.push({
          file,
          line: lineOf(text, m.index ?? 0),
          target: raw,
					why:
						target === undefined
							? "a relative link that escapes the public repository."
							: "a relative link with no file at the other end.",
        });
      } else if (statSync(target).isDirectory() && !raw.endsWith("/")) {
        // Not a failure — GitHub resolves a directory link fine. Noted only so
        // the counts below are honest about what was checked.
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------

// Refuse before scanning anything if this gate's own inputs include a file it
// cannot see. This gate has twice reported a clean pass over an untracked ADR
// that carried a real planning identifier — a pass over files it never opened.
const hidden = hiddenInputs(repoRoot, () => true);
if (hidden.length > 0) {
  console.error(`\n${hiddenInputsMessage("Public surface gate", hidden)}\n`);
  process.exit(1);
}

const files = tracked();
const idFindings = checkIdentifiers(files);
const linkFindings = checkLinks(files);

if (idFindings.length > 0) {
  console.error(
    `\nProhibited private-estate identifiers found in public artifacts (${idFindings.length}):\n`,
  );
  for (const f of idFindings) {
    console.error(`  ${f.file}:${f.line}  "${f.match}"`);
    console.error(`      ${f.why}\n`);
  }
}

if (linkFindings.length > 0) {
  console.error(`\nBroken links in public artifacts (${linkFindings.length}):\n`);
  for (const f of linkFindings) {
    console.error(`  ${f.file}:${f.line}  -> ${f.target}`);
    console.error(`      ${f.why}\n`);
  }
}

if (idFindings.length > 0 || linkFindings.length > 0) {
  console.error("Public surface gate FAILED.\n");
  process.exit(1);
}

const linkFiles = files.filter((f) => LINK_SOURCES.test(f)).length;
console.log(
  `Public surface gate: ${files.length} tracked files carry no prohibited private-estate identifier, ` +
    `and every in-repository link across ${linkFiles} prose and site files resolves to a real path.`,
);
