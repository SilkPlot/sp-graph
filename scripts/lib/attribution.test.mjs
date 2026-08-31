import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAttributionRequest } from "./attribution.mjs";

test("attribution requires a positive integer repeat count", () => {
	assert.throws(
		() =>
			validateAttributionRequest({
				repeats: 0,
				gestures: ["zoom"],
				table: "none",
			}),
		/positive integer/,
	);
	assert.throws(
		() =>
			validateAttributionRequest({
				repeats: Number.NaN,
				gestures: ["zoom"],
				table: "none",
			}),
		/positive integer/,
	);
});

test("attribution requires at least one requested gesture", () => {
	assert.throws(
		() =>
			validateAttributionRequest({ repeats: 1, gestures: [], table: "none" }),
		/at least one gesture/,
	);
	assert.doesNotThrow(() =>
		validateAttributionRequest({
			repeats: 1,
			gestures: ["zoom"],
			table: "none",
		}),
	);
});

test("attribution rejects duplicate gestures and mislabeled table modes", () => {
	assert.throws(
		() =>
			validateAttributionRequest({
				repeats: 1,
				gestures: ["zoom", "zoom"],
				table: "none",
			}),
		/duplicates/,
	);
	assert.throws(
		() =>
			validateAttributionRequest({
				repeats: 1,
				gestures: ["zoom"],
				table: "bogus",
			}),
		/derived or none/,
	);
});

test("attribution prepares state before the discarded warm-up and recording", () => {
	const source = readFileSync(
		new URL("../collect-commit-profiles.mjs", import.meta.url),
		"utf8",
	);
	const pass = source.slice(
		source.indexOf("async function pass"),
		source.indexOf("const browser = await chromium.launch"),
	);
	assert.match(
		pass,
		/prepares\.get\(gesture\)[\s\S]*discardedWarmup\(page\)[\s\S]*const before/,
	);
});
