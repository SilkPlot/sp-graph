import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PROTOCOL_PASSES } from "./perf.mjs";
import {
  COMPOSITION_DIGEST,
  COMPOSITION_MANIFEST,
  CURRENT_COMPOSITION_IDENTITY,
  DEFAULT_SURFACE_FAILURE,
  HISTORICAL_COMPOSITION_IDENTITIES,
  REVISION_FAILURE,
  canonicalJson,
  defaultSurfaceEligible,
  evaluateDefaultSurfaceAcceptance,
  evaluateHostArtifact,
  evaluatePageRevision,
  evaluateTableNoneDefaultSurface,
  requiredExerciseCells,
  resultTableMode,
  tableModeFromQuery,
  timingVerdictsEligibleForResult,
} from "../../test/perf/app/composition-revision.ts";

const digestOf = (value) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const currentObservation = () => ({
  identity: CURRENT_COMPOSITION_IDENTITY,
  digest: COMPOSITION_DIGEST,
  manifest: COMPOSITION_MANIFEST,
});

const completePasses = (workload) =>
  Object.fromEntries((PROTOCOL_PASSES[workload] ?? []).map((name) => [name, {}]));

const completeResults = () =>
  requiredExerciseCells().map((cell) => ({
    workload: cell.workload,
    tableMode: cell.tableMode,
    ...currentObservation(),
    compositionIdentity: CURRENT_COMPOSITION_IDENTITY,
    compositionDigest: COMPOSITION_DIGEST,
    compositionManifest: COMPOSITION_MANIFEST,
    passes: completePasses(cell.workload),
    timingVerdictsEligible: cell.tableMode === "derived",
  }));

const completeArtifact = () => ({
  compositionRevision: currentObservation(),
  results: completeResults(),
});

test("the published digest is the hash of the canonical manifest", () => {
  assert.equal(digestOf(COMPOSITION_MANIFEST), COMPOSITION_DIGEST);
  assert.notEqual(digestOf({ ...COMPOSITION_MANIFEST, identity: "x" }), COMPOSITION_DIGEST);
});

test("the current identity is public-safe and v1 is only historical", () => {
  assert.equal(CURRENT_COMPOSITION_IDENTITY, "cartesian-dashboard-representative-v2");
  assert.deepEqual(HISTORICAL_COMPOSITION_IDENTITIES, [
    "cartesian-dashboard-representative-v1",
  ]);
});

test("page revision rejects absent, unknown, and mismatched identities", () => {
  assert.deepEqual(evaluatePageRevision({}), {
    ok: false,
    message: REVISION_FAILURE.absent,
    reason: "absent",
  });
  assert.equal(evaluatePageRevision(null).message, REVISION_FAILURE.absent);
  assert.equal(
    evaluatePageRevision({ identity: "", digest: COMPOSITION_DIGEST }).message,
    REVISION_FAILURE.absent,
  );
  assert.equal(
    evaluatePageRevision({
      identity: "not-a-known-revision",
      digest: COMPOSITION_DIGEST,
    }).message,
    REVISION_FAILURE.unknown,
  );
  assert.equal(
    evaluatePageRevision({
      identity: HISTORICAL_COMPOSITION_IDENTITIES[0],
      digest: COMPOSITION_DIGEST,
    }).message,
    REVISION_FAILURE.mismatched,
  );
  assert.equal(
    evaluatePageRevision({
      identity: CURRENT_COMPOSITION_IDENTITY,
      digest: "0".repeat(64),
    }).message,
    REVISION_FAILURE.mismatched,
  );
  assert.equal(
    evaluatePageRevision({
      ...currentObservation(),
      manifest: { identity: CURRENT_COMPOSITION_IDENTITY },
    }).message,
    REVISION_FAILURE.mismatched,
  );
  assert.equal(evaluatePageRevision(currentObservation()).ok, true);
});

test("host artifact rejects a partial exercise before timing can be eligible", () => {
  const partial = completeArtifact();
  partial.results = partial.results.filter(
    (result) => !(result.workload === "w-a" && result.tableMode === "derived"),
  );
  const verdict = evaluateHostArtifact(partial, PROTOCOL_PASSES);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.message, REVISION_FAILURE.partiallyExercised);
  assert.equal(
    timingVerdictsEligibleForResult(verdict.ok, "w-a", "derived"),
    false,
  );
});

test("host artifact rejects a result that skipped a required interaction", () => {
  const artifact = completeArtifact();
  const wa = artifact.results.find(
    (result) => result.workload === "w-a" && result.tableMode === "derived",
  );
  delete wa.passes.hover;
  assert.equal(
    evaluateHostArtifact(artifact, PROTOCOL_PASSES).message,
    REVISION_FAILURE.partiallyExercised,
  );
});

test("W-C table=none is not a cell of this revision", () => {
  const artifact = completeArtifact();
  artifact.results.push({
    workload: "w-c",
    tableMode: "none",
    ...currentObservation(),
    compositionIdentity: CURRENT_COMPOSITION_IDENTITY,
    compositionDigest: COMPOSITION_DIGEST,
    passes: completePasses("w-c"),
  });
  assert.equal(
    evaluateHostArtifact(artifact, PROTOCOL_PASSES).message,
    REVISION_FAILURE.unknown,
  );
});

test("table=none cannot satisfy the default-surface acceptance line", () => {
  assert.equal(defaultSurfaceEligible("w-a", "none"), false);
  assert.equal(defaultSurfaceEligible("w-a", "derived"), true);
  assert.equal(defaultSurfaceEligible("w-c", "none"), false);
  assert.deepEqual(evaluateDefaultSurfaceAcceptance("none"), {
    ok: false,
    message: DEFAULT_SURFACE_FAILURE,
  });
  assert.equal(
    timingVerdictsEligibleForResult(true, "w-d", "none"),
    false,
  );
  assert.equal(
    timingVerdictsEligibleForResult(true, "w-c", "derived"),
    true,
  );

  const artifact = completeArtifact();
  const none = artifact.results.find(
    (result) => result.workload === "w-a" && result.tableMode === "none",
  );
  none.timingVerdictsEligible = true;
  assert.equal(
    evaluateTableNoneDefaultSurface(artifact, PROTOCOL_PASSES).message,
    DEFAULT_SURFACE_FAILURE,
  );
});

test("a complete v2 artifact is eligible", () => {
  const artifact = completeArtifact();
  assert.deepEqual(evaluateHostArtifact(artifact, PROTOCOL_PASSES), {
    ok: true,
    message: null,
    reason: null,
  });
  assert.deepEqual(evaluateTableNoneDefaultSurface(artifact, PROTOCOL_PASSES), {
    ok: true,
    message: null,
  });
});

test("table mode is derived from the query string once", () => {
  assert.equal(tableModeFromQuery("?workload=w-a"), "derived");
  assert.equal(tableModeFromQuery("?workload=w-a&table=none"), "none");
  assert.equal(tableModeFromQuery("&table=none"), "none");
  assert.equal(resultTableMode({ query: "&table=none" }), "none");
  assert.equal(resultTableMode({ tableMode: "derived", query: "&table=none" }), "derived");
});

test("the independent validator does not import the workload driver", () => {
  const source = readFileSync(
    new URL("../validate-workload-artifact.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /evaluateHostArtifact/);
  assert.match(source, /evaluateTableNoneDefaultSurface/);
  assert.doesNotMatch(source, /measure-workload-frames/);
});

test("tracked revision messages do not carry planning identifiers", () => {
  const source = readFileSync(
    new URL("../../test/perf/app/composition-revision.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /S00\d-P\d\d/);
  assert.doesNotMatch(source, /Sprint\s+\d{3}/);
});

test("an absent host artifact is ineligible before any timing verdict", () => {
  assert.equal(evaluateHostArtifact(null, PROTOCOL_PASSES).message, REVISION_FAILURE.absent);
  assert.equal(evaluateHostArtifact({}, PROTOCOL_PASSES).message, REVISION_FAILURE.absent);
});

test("the driver refuses a bad page revision before any timing pass", () => {
  const source = readFileSync(new URL("../measure-workload-frames.mjs", import.meta.url), "utf8");
  const openAt = source.indexOf("async function openWorkloadPage");
  const runAt = source.indexOf("async function runWorkload");
  const throwAt = source.indexOf("throw new Error(revision.message)");
  const hostAt = source.indexOf("evaluateHostArtifact({ ...artifactMetadata, results }");
  assert.ok(openAt >= 0 && runAt > openAt);
  assert.ok(throwAt > openAt && throwAt < runAt);
  assert.ok(source.includes("evaluatePageRevision"));
  assert.ok(source.includes("timingVerdictsEligibleForResult"));
  assert.ok(source.includes("DEFAULT_SURFACE_FAILURE"));
  assert.ok(hostAt > runAt);
});

const validatorPath = fileURLToPath(
  new URL("../validate-workload-artifact.mjs", import.meta.url),
);

const validateArtifact = (artifact) => {
  const dir = mkdtempSync(join(tmpdir(), "workload-artifact-"));
  const path = join(dir, "artifact.json");
  writeFileSync(path, `${JSON.stringify(artifact)}\n`);
  const result = spawnSync(process.execPath, [validatorPath, path], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return result;
};

test("the independent validator rejects each ineligible host artifact with the retained message", () => {
  const eligible = validateArtifact(completeArtifact());
  assert.equal(eligible.status, 0);
  assert.match(eligible.stdout, /composition revision: eligible/);

  const absent = validateArtifact({});
  assert.equal(absent.status, 1);
  assert.equal(absent.stderr.trim(), REVISION_FAILURE.absent);

  const unknown = validateArtifact({
    compositionRevision: {
      identity: "not-a-known-revision",
      digest: COMPOSITION_DIGEST,
      manifest: COMPOSITION_MANIFEST,
    },
    results: completeResults(),
  });
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stderr.trim(), REVISION_FAILURE.unknown);

  const mismatched = validateArtifact({
    compositionRevision: {
      identity: HISTORICAL_COMPOSITION_IDENTITIES[0],
      digest: COMPOSITION_DIGEST,
      manifest: COMPOSITION_MANIFEST,
    },
    results: completeResults(),
  });
  assert.equal(mismatched.status, 1);
  assert.equal(mismatched.stderr.trim(), REVISION_FAILURE.mismatched);

  const partial = completeArtifact();
  partial.results = partial.results.filter(
    (result) => !(result.workload === "w-d" && result.tableMode === "none"),
  );
  const partialRun = validateArtifact(partial);
  assert.equal(partialRun.status, 1);
  assert.equal(partialRun.stderr.trim(), REVISION_FAILURE.partiallyExercised);

  const claimed = completeArtifact();
  const none = claimed.results.find(
    (result) => result.workload === "w-a" && result.tableMode === "none",
  );
  none.timingVerdictsEligible = true;
  const claimedNone = validateArtifact(claimed);
  assert.equal(claimedNone.status, 1);
  assert.equal(claimedNone.stderr.trim(), DEFAULT_SURFACE_FAILURE);
});

