import assert from "node:assert/strict";
import test from "node:test";
import {
	internalIdentifierFindings,
	internalPathIdentifierFindings,
} from "./public-surface-identifiers.mjs";

test("a suffixed planning phase identifier is forbidden on the public surface", () => {
	const identifier = [["S", "007"].join(""), ["P", "04b"].join("")].join("-");

	assert.deepEqual(
		internalIdentifierFindings("fixture.md", `private phase: ${identifier}`),
		[
			{
				file: "fixture.md",
				line: 1,
				match: identifier,
				why: "an internal planning identifier. Public documentation must stand on its own reasoning, not on a sprint plan nobody outside can read.",
			},
		],
	);
});

test("standalone sprint and phase shorthand are forbidden on the public surface", () => {
	const sprint = ["S", "016"].join("");
	const phase = ["P", "09"].join("");
	const findings = internalIdentifierFindings(
		"fixture.md",
		`private sprint: ${sprint}; private phase: ${phase}`,
	);

	assert.deepEqual(
		findings.map(({ match }) => match),
		[sprint, phase],
	);
});

test("later two-digit phase shorthand is forbidden too", () => {
	const phase = ["P", "20"].join("");
	assert.deepEqual(
		internalIdentifierFindings("fixture.md", `private phase: ${phase}`).map(
			({ match }) => match,
		),
		[phase],
	);
});

test("percentile identifiers are not mistaken for planning shorthand", () => {
	assert.deepEqual(
		internalIdentifierFindings(
			"fixture.ts",
			"p50 p95 p50Ms rawP95 selectedP95 rawDroppedRatio",
		),
		[],
	);
});

test("lowercase planning identifiers in public pathnames are forbidden", () => {
	const privateDirectory = [["s", "013"].join(""), ["p", "01"].join("")].join("-");
	const path = `docs/internal/${privateDirectory}/image.png`;

	assert.deepEqual(
		internalPathIdentifierFindings(path).map(({ match }) => match),
		[privateDirectory],
	);
});

test("spelled sprint labels are planning identifiers too", () => {
	const label = ["Sprint", "009"].join(" ");

	assert.deepEqual(
		internalIdentifierFindings("fixture.md", `historical ${label}`).map(
			({ match }) => match,
		),
		[label],
	);
});

test("an org-style repository identifier other than the public repository is forbidden", () => {
	const privateFixture = ["sp", "nonpublic-fixture"].join("-");
	assert.equal(
		internalIdentifierFindings(
			"fixture.md",
			`private repository: ${privateFixture}`,
		).length,
		1,
	);
	assert.equal(
		internalIdentifierFindings("fixture.md", "public repository: sp-graph")
			.length,
		0,
	);
});

test("method identifiers are allowed only inside the exact generated install", () => {
	const identifier = ["CANON", "005"].join("-");

	assert.deepEqual(
		internalIdentifierFindings("test/example.test.ts", identifier).map(
			({ match }) => match,
		),
		[identifier],
	);
	assert.deepEqual(
		internalIdentifierFindings(
			`.agents/skills/${["orca", "verification"].join("-")}/SKILL.md`,
			identifier,
		),
		[],
	);
});

test("distribution provenance and capability names stay in generated artifacts", () => {
	const organization = ["Probably", "Computers"].join("");
	const repository = [["orca", "baseline"].join("-")].join("");
	const capability = ["orca", "verification"].join("-");
	const ordinary = internalIdentifierFindings(
		"docs/example.md",
		`${organization}/${repository} ${capability}`,
	);
	assert.deepEqual(
		ordinary.map(({ match }) => match),
		[organization, repository, capability],
	);
	assert.deepEqual(
		internalIdentifierFindings(
			"skills-lock.json",
			`${organization}/${repository} ${capability}`,
		),
		[],
	);
});

test("the complete method capability namespace stays in generated artifacts", () => {
	const futureCapability = ["orca", "something-new"].join("-");
	assert.deepEqual(
		internalIdentifierFindings("docs/example.md", futureCapability).map(
			({ match }) => match,
		),
		[futureCapability],
	);
	assert.deepEqual(
		internalIdentifierFindings(
			`.agents/skills/${futureCapability}/references/nested.md`,
			futureCapability,
		),
		[],
	);
});

test("method role metadata stays in generated entry points", () => {
	const metadata = ["Roles", "public, implementation"].join(": ");
	assert.equal(internalIdentifierFindings("docs/example.md", metadata).length, 1);
	assert.deepEqual(internalIdentifierFindings("AGENTS.md", metadata), []);
});

test("actual generated code-role forms are method metadata", () => {
	for (const metadata of [
		["Roles", "code"].join(": "),
		["description: Generated entry point. Roles", "code. Access: read-write."].join(
			": ",
		),
		["Part of the project. Roles", "`code`."].join(": "),
	]) {
		assert.equal(internalIdentifierFindings("README.md", metadata).length, 1);
		assert.deepEqual(internalIdentifierFindings("AGENTS.md", metadata), []);
	}
});

test("runtime task and decision-gate identifiers are always private", () => {
	const identifiers = [
		["task", "abc123"].join("_"),
		["gate", "def456"].join("_"),
		["ctx", "789abc"].join("_"),
	];
	const findings = internalIdentifierFindings(
		"fixture.md",
		identifiers.join(" "),
	);

	assert.deepEqual(
		findings.map(({ match }) => match),
		identifiers,
	);
});
