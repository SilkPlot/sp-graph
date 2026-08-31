import assert from "node:assert/strict";
import test from "node:test";
import { internalIdentifierFindings } from "./public-surface-identifiers.mjs";

test("a suffixed planning phase identifier is forbidden on the public surface", () => {
	const identifier = ["S007", "P04b"].join("-");

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
