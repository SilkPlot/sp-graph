import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACCEPTANCE_MS,
  FROZEN_PAGE_OPTIONS,
	PROTOCOL_PASSES,
	createInputActivityRecorder,
	assertServerIdentity,
  evaluateCleanIndexBuildInvariant,
  evaluateMutationProof,
  interactionCommitEvidence,
	interactionGateBreached,
  settleVerdict,
  requiredHeapBytes,
	stats,
	startRecording,
	stopRecording,
	withFreshInteractionSurface,
} from "./perf.mjs";

test("the frame recorder arms and closes on animation-frame boundaries", async () => {
	const originalRequest = globalThis.requestAnimationFrame;
	const originalCancel = globalThis.cancelAnimationFrame;
	const pending = [];
	let identifier = 0;
	globalThis.requestAnimationFrame = (callback) => {
		pending.push(callback);
		return ++identifier;
	};
	globalThis.cancelAnimationFrame = () => {};
	const flush = (now) => {
		for (const callback of pending.splice(0)) callback(now);
	};
	const page = { evaluate: (callback) => callback() };
	try {
		const starting = startRecording(page);
		flush(10);
		await starting;
		flush(20);
		const stopping = stopRecording(page);
		flush(40);
		assert.deepEqual(await stopping, [10, 20]);
	} finally {
		if (originalRequest === undefined) delete globalThis.requestAnimationFrame;
		else globalThis.requestAnimationFrame = originalRequest;
		if (originalCancel === undefined) delete globalThis.cancelAnimationFrame;
		else globalThis.cancelAnimationFrame = originalCancel;
		delete globalThis.__frames;
		delete globalThis.__raf;
		delete globalThis.__recordingClosing;
	}
});

test("raw gate inputs cannot be rounded back inside the thresholds", () => {
	const p95Boundary = stats([
		...Array(95).fill(16.7),
		...Array(5).fill(17.704),
	]);
	assert.equal(p95Boundary.p95, 17.7);
	assert.equal(interactionGateBreached(p95Boundary), true);

	const droppedBoundary = stats([
		...Array(296).fill(16.7),
		...Array(3).fill(33.401),
	]);
	assert.equal(droppedBoundary.pctDropped, 1);
	assert.equal(interactionGateBreached(droppedBoundary), true);

	const settle = settleVerdict("w-a", "replace", {
		samples: 10,
		noChange: 0,
		timeouts: 0,
		rawSamples: [...Array(9).fill(10), 1000.04],
		p95: 1000,
	});
	assert.equal(settle.pass, false);
});

test("input activity retains resolved action intervals and idle gaps", async () => {
	let clock = 100;
	const activity = createInputActivityRecorder("hover", () => clock);
	await activity.run("pointermove", async () => {
		clock += 200;
	});
	clock += 100;
	await activity.run("pointermove", async () => {
		clock += 50;
	});
	clock += 50;

	assert.deepEqual(activity.finish(), {
		gesture: "hover",
		durationMs: 400,
		count: 2,
		firstStartedMs: 0,
		lastEndedMs: 350,
		maxIdleGapMs: 100,
		actions: [
			{ index: 0, kind: "pointermove", startedMs: 0, endedMs: 200 },
			{ index: 1, kind: "pointermove", startedMs: 300, endedMs: 350 },
		],
	});
});

const exactCounts = (pointerEvents = 4) => ({
  pointerEvents,
  injectedRebuilds: pointerEvents,
  injectedRebuildsInPointer: pointerEvents,
  layoutReadsInPointer: pointerEvents,
  productionIndexBuildsInPointer: pointerEvents,
  pointerEventsWithOneInjectedRebuild: pointerEvents,
  pointerEventsWithOneLayoutRead: pointerEvents,
  pointerEventsWithOneProductionIndexBuild: pointerEvents,
});

test("every measured and probe page shares the frozen viewport options", () => {
  assert.deepEqual(FROZEN_PAGE_OPTIONS, {
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1,
  });
});

test("frame summaries retain the raw deltas they summarize", () => {
	const deltas = [10.25, 20.5, 40.75];
	const summary = stats(deltas);

	assert.deepEqual(summary.frameDeltas, deltas);
	assert.equal(summary.frames, deltas.length);
});

test("the driver rejects a page served by any other workload server", () => {
	assert.doesNotThrow(() => assertServerIdentity("run-current", "run-current"));
	assert.doesNotThrow(() => assertServerIdentity(undefined, ""));
	assert.throws(
		() => assertServerIdentity("run-current", "run-stale"),
		/server identity mismatch/,
	);
	assert.throws(
		() => assertServerIdentity("run-current", ""),
		/server identity mismatch/,
	);
});

test("the wide-series workload records reset independently from brush", () => {
  assert.deepEqual(PROTOCOL_PASSES["w-b"], [
    "hover",
    "legend",
    "isolate",
    "pan",
    "zoom",
    "brush",
    "reset",
  ]);
});

test("the dense range-control workload records reset as a full interaction pass", () => {
	assert.deepEqual(PROTOCOL_PASSES["w-a"], [
		"hover",
		"keyboard",
		"zoom",
		"pan",
		"brush",
		"rangeDrag",
		"reset",
	]);
});

test("reset is inert when navigation commits but the shipped reset causes none", () => {
  const evidence = interactionCommitEvidence(
    "reset",
    { viewport: 10, active: 0, reset: 2, visibility: 0 },
    { viewport: 15, active: 0, reset: 2, visibility: 0 },
  );

  assert.deepEqual(evidence, {
    commits: { viewport: 5, active: 0, reset: 0, visibility: 0 },
    inert: true,
  });
});

test("reset is non-inert only when a reset-cause viewport commit is observed", () => {
  const evidence = interactionCommitEvidence(
    "reset",
    { viewport: 10, active: 0, reset: 2, visibility: 0 },
    { viewport: 16, active: 0, reset: 3, visibility: 0 },
  );

  assert.deepEqual(evidence, {
    commits: { viewport: 6, active: 0, reset: 1, visibility: 0 },
    inert: false,
  });
});

test("pointer movement cannot prove a viewport interaction reached its state path", () => {
  const evidence = interactionCommitEvidence(
    "zoom",
    { viewport: 4, active: 10, reset: 0, visibility: 0 },
    { viewport: 4, active: 15, reset: 0, visibility: 0 },
  );

  assert.equal(evidence.inert, true);
});

test("each interaction requires its own committed state kind", () => {
  const before = { viewport: 1, active: 2, reset: 3, visibility: 4 };
  const after = {
    viewport: 2,
    active: 3,
    reset: 4,
    visibility: 5,
  };

  for (const name of ["zoom", "pan", "brush", "rangeDrag"])
    assert.equal(interactionCommitEvidence(name, before, after).inert, false);
  for (const name of ["hover", "keyboard"])
    assert.equal(interactionCommitEvidence(name, before, after).inert, false);
  assert.equal(interactionCommitEvidence("reset", before, after).inert, false);
  for (const name of ["legend", "isolate"])
    assert.equal(interactionCommitEvidence(name, before, after).inert, false);
});

test("the legend pass uses the shipped control instead of a harness state call", () => {
	const source = readFileSync(new URL("./gestures.mjs", import.meta.url), "utf8");
	const legend = source.slice(source.indexOf("legend:"), source.indexOf("isolate:"));

	assert.match(legend, /data-sp-legend-item/);
	assert.match(legend, /\.click\(\)/);
	assert.doesNotMatch(legend, /page\.evaluate|legendToggle/);
});

test("every named interaction is preceded by its own discarded warm-up", () => {
  const source = readFileSync(new URL("../measure-workload-frames.mjs", import.meta.url), "utf8");
  const passLoop = source.slice(
    source.indexOf("for (const name of PROTOCOL_PASSES"),
    source.indexOf("/* --- invariants:"),
  );

  assert.match(passLoop, /await discardedWarmup\(passPage\);/);
});

test("every retained decimation interaction has a discarded warm-up", () => {
	const source = readFileSync(
		new URL("../measure-workload-frames.mjs", import.meta.url),
		"utf8",
	);
	const candidateLoop = source.slice(
		source.indexOf('for (const candidate of ["min-max", "every-nth"])'),
		source.indexOf("await page.evaluate(() => window.__perf?.decimate?.(\"raw\"))"),
	);

	assert.match(
		candidateLoop,
		/decimate\?\.\(c\)[\s\S]*await discardedWarmup\(page\);[\s\S]*await startRecording\(page\);/,
	);
});

test("a stateful pass cannot change the scale opened for the next pass", async () => {
	let opened = 0;
	const open = async () => ({
		page: { close: async () => {} },
		visiblePoints: 616,
		id: ++opened,
	});

	const first = await withFreshInteractionSurface(open, async (surface) => {
		surface.visiblePoints = 28;
		return surface;
	});
	const second = await withFreshInteractionSurface(open, async (surface) => surface);

	assert.equal(first.visiblePoints, 28);
	assert.equal(second.visiblePoints, 616);
	assert.notEqual(first.id, second.id);
});

test("every settle rejects any no-change attempt even without a timing gate", () => {
  const verdict = settleVerdict("w-b", "resize", {
    samples: 9,
    noChange: 1,
    p95: 30,
  });

  assert.equal(verdict.pass, false);
  assert.match(verdict.criterion, /changed on every attempt/);
});

test("every settle rejects a continuous-mutation timeout", () => {
  const verdict = settleVerdict("w-b", "resize", {
    samples: 9,
    noChange: 0,
    timeouts: 1,
    p95: 30,
  });

  assert.equal(verdict.pass, false);
  assert.match(verdict.criterion, /quiet/);
});

test("heap evidence cannot normalize a missing or zero metric", () => {
  assert.throws(() => requiredHeapBytes([]), /JSHeapUsedSize/);
  assert.throws(
    () => requiredHeapBytes([{ name: "JSHeapUsedSize", value: 0 }]),
    /positive/,
  );
  assert.equal(
    requiredHeapBytes([{ name: "JSHeapUsedSize", value: 12_345 }]),
    12_345,
  );
});

// `w-d` is the only dense-timing workload since 2026-08-15. `w-a` carried these
// two cases until the first scored run measured its faithful mutation at p95
// 16.8ms — under the gate — and moved it to the structural proof.
test("dense timing proof is discriminating on a strict p95 breach alone", () => {
  const proof = evaluateMutationProof({
    workload: "w-d",
		distribution: stats([
			...Array(95).fill(16.7),
			...Array(5).fill(ACCEPTANCE_MS + 0.1),
		]),
    counts: exactCounts(),
  });

  assert.equal(proof.mode, "dense-timing");
  assert.equal(proof.exactApplication, true);
  assert.equal(proof.pass, true);
});

test("dense timing proof is discriminating on a strict dropped-frame breach alone", () => {
  const proof = evaluateMutationProof({
    workload: "w-d",
		distribution: stats([
			...Array(198).fill(16.7),
			...Array(3).fill(33.401),
		]),
    counts: exactCounts(),
  });

  assert.equal(proof.exactApplication, true);
  assert.equal(proof.pass, true);
});

test("dense timing proof keeps equality inside both inclusive clean limits", () => {
  const proof = evaluateMutationProof({
    workload: "w-d",
		distribution: stats([
			...Array(95).fill(16.7),
			...Array(4).fill(ACCEPTANCE_MS),
			33.401,
		]),
    counts: exactCounts(),
  });

  assert.equal(proof.exactApplication, true);
  assert.equal(proof.pass, false);
  assert.match(proof.failureReason, /require p95 > 17\.7ms OR dropped > 1%/);
});

test("light structural proof succeeds with exact counts despite fast timing", () => {
  const proof = evaluateMutationProof({
    workload: "w-b",
    distribution: { p95: 8, pctDropped: 0 },
    counts: exactCounts(),
  });

  assert.equal(proof.mode, "light-structural");
  assert.equal(proof.timingBreached, false);
  assert.equal(proof.pass, true);
});

// The reassignment itself, asserted rather than left to the mode function's
// prose. Without this, restoring `w-a` to dense timing reddens nothing: every
// other case here names its own workload, and the two that changed above now
// name `w-d`, so the suite would pass against the exact regression this
// documents.
test("w-a proves discrimination by structure, not by timing", () => {
  const proof = evaluateMutationProof({
    workload: "w-a",
    distribution: { p95: 16.8, pctDropped: 0 },
    counts: exactCounts(),
  });

  assert.equal(proof.mode, "light-structural");
  assert.equal(proof.timingBreached, false);
  assert.equal(proof.pass, true);
});

test("zero pointer events cannot satisfy either mutation proof", () => {
  const proof = evaluateMutationProof({
    workload: "w-c",
    distribution: { p95: 8, pctDropped: 0 },
    counts: exactCounts(0),
  });

  assert.equal(proof.pass, false);
  assert.match(proof.failureReason, /observed 0 pointer events/);
});

test("a missing injected rebuild makes the exact structural proof red", () => {
  const proof = evaluateMutationProof({
    workload: "w-b",
    distribution: { p95: 8, pctDropped: 0 },
    counts: {
      ...exactCounts(3),
      injectedRebuilds: 2,
      injectedRebuildsInPointer: 2,
      pointerEventsWithOneInjectedRebuild: 2,
    },
  });

  assert.equal(proof.pass, false);
  assert.match(proof.failureReason, /injected rebuilds were 2 total \/ 2 in pointer scope/);
});

test("an extra actual builder call makes the exact structural proof red", () => {
  const proof = evaluateMutationProof({
    workload: "w-c",
    distribution: { p95: 8, pctDropped: 0 },
    counts: {
      ...exactCounts(3),
      productionIndexBuildsInPointer: 4,
      pointerEventsWithOneProductionIndexBuild: 2,
    },
  });

  assert.equal(proof.pass, false);
  assert.match(proof.failureReason, /actual production-builder calls were 4/);
});

test("the clean production-builder criterion distinguishes zero from a defect", () => {
  const clean = evaluateCleanIndexBuildInvariant({
    pointerEvents: 5,
    productionIndexBuildsInPointer: 0,
  });
  const defect = evaluateCleanIndexBuildInvariant({
    pointerEvents: 5,
    productionIndexBuildsInPointer: 1,
  });
  const missing = evaluateCleanIndexBuildInvariant({ pointerEvents: 5 });
  const unobserved = evaluateCleanIndexBuildInvariant({
    pointerEvents: 0,
    productionIndexBuildsInPointer: 0,
  });

  assert.equal(clean.pass, true);
  assert.equal(clean.failureReason, null);
  assert.equal(defect.pass, false);
  assert.match(defect.failureReason, /1 actual production-builder call/);
  assert.equal(missing.pass, false);
  assert.match(missing.failureReason, /observation is missing/);
  assert.equal(unobserved.pass, false);
  assert.match(unobserved.failureReason, /0 clean pointer events/);
});
