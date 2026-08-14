import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTANCE_MS,
  DROPPED_GATE_PCT,
  evaluateCleanIndexBuildInvariant,
  evaluateMutationProof,
} from "./perf.mjs";

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

test("dense timing proof is discriminating on a strict p95 breach alone", () => {
  const proof = evaluateMutationProof({
    workload: "w-a",
    distribution: {
      p95: ACCEPTANCE_MS + 0.1,
      pctDropped: DROPPED_GATE_PCT,
    },
    counts: exactCounts(),
  });

  assert.equal(proof.mode, "dense-timing");
  assert.equal(proof.exactApplication, true);
  assert.equal(proof.pass, true);
});

test("dense timing proof is discriminating on a strict dropped-frame breach alone", () => {
  const proof = evaluateMutationProof({
    workload: "w-d",
    distribution: {
      p95: ACCEPTANCE_MS,
      pctDropped: DROPPED_GATE_PCT + 0.01,
    },
    counts: exactCounts(),
  });

  assert.equal(proof.exactApplication, true);
  assert.equal(proof.pass, true);
});

test("dense timing proof keeps equality inside both inclusive clean limits", () => {
  const proof = evaluateMutationProof({
    workload: "w-a",
    distribution: {
      p95: ACCEPTANCE_MS,
      pctDropped: DROPPED_GATE_PCT,
    },
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

  assert.equal(clean.pass, true);
  assert.equal(clean.failureReason, null);
  assert.equal(defect.pass, false);
  assert.match(defect.failureReason, /1 actual production-builder call/);
  assert.equal(missing.pass, false);
  assert.match(missing.failureReason, /observation is missing/);
});
