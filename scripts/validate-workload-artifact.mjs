#!/usr/bin/env node
/**
 * Independent composition-revision validator.
 *
 * Reads a host artifact and refuses timing eligibility when the published
 * revision is absent, unknown, mismatched, partially exercised, or when a
 * table=none run claims default-surface acceptance. It does not import the
 * workload driver and does not judge frames.
 *
 *   node scripts/validate-workload-artifact.mjs path/to/artifact.json
 */
import { readFileSync } from "node:fs";
import { PROTOCOL_PASSES } from "./lib/perf.mjs";
import {
  DEFAULT_SURFACE_FAILURE,
  evaluateHostArtifact,
  evaluateTableNoneDefaultSurface,
} from "../test/perf/app/composition-revision.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/validate-workload-artifact.mjs <artifact.json>");
  process.exit(2);
}

let artifact;
try {
  artifact = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const revision = evaluateHostArtifact(artifact, PROTOCOL_PASSES);
if (!revision.ok) {
  console.error(revision.message);
  process.exit(1);
}

const defaultSurface = evaluateTableNoneDefaultSurface(artifact, PROTOCOL_PASSES);
if (!defaultSurface.ok) {
  console.error(defaultSurface.message ?? DEFAULT_SURFACE_FAILURE);
  process.exit(1);
}

console.log("composition revision: eligible");
