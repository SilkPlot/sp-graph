import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { internalIdentifierFindings } from "./public-surface-identifiers.mjs";
import {
	readPublicArtifact,
	resolveInsideRoot,
} from "./public-surface-links.mjs";

test("relative public links cannot escape the repository", () => {
	const root = "/workspace/public";
	const base = join(root, "docs", "guide");
	assert.equal(resolveInsideRoot(root, base, "../../README.md"), join(root, "README.md"));
	assert.equal(resolveInsideRoot(root, base, "../../../private/plan.md"), undefined);
});

test("decoded self-link paths cannot traverse outside the repository", () => {
	const root = "/workspace/public";
	assert.equal(resolveInsideRoot(root, root, "docs/adr.md"), join(root, "docs", "adr.md"));
	assert.equal(resolveInsideRoot(root, root, "%2e%2e/private.md"), undefined);
});

test("a tracked symlink is scanned as link text and never followed outside the repository", () => {
	const root = mkdtempSync(join(tmpdir(), "silkplot-public-surface-"));
	const privateFixture = ["sp", "nonpublic-fixture"].join("-");
	const target = `../../${privateFixture}/plan.md`;
	try {
		symlinkSync(target, join(root, "innocent.md"));
		const artifact = readPublicArtifact(root, "innocent.md");

		assert.deepEqual(artifact, {
			text: target,
			symlink: true,
			symlinkTarget: target,
			symlinkEscapesRoot: true,
			symlinkTargetExists: false,
		});
		assert.deepEqual(
			internalIdentifierFindings("innocent.md", artifact.text).map(
				({ match }) => match,
			),
			[privateFixture],
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a dangling symlink inside the repository remains a broken public artifact", () => {
	const root = mkdtempSync(join(tmpdir(), "silkplot-public-surface-"));
	try {
		symlinkSync("missing.md", join(root, "guide.md"));
		const artifact = readPublicArtifact(root, "guide.md");

		assert.equal(artifact.symlinkEscapesRoot, false);
		assert.equal(artifact.symlinkTargetExists, false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
