/**
 * The representative cartesian-dashboard composition revision.
 *
 * One identity, one manifest, one digest. The workload page publishes them and
 * the driver copies them onto the host artifact. Timing verdicts are not
 * eligible until this revision is present, current, digest-matched, and fully
 * exercised. Eligibility is recomputed from retained per-surface `passes`, not
 * from a summary boolean.
 *
 * The independent validator lives in gitops
 * `local/perf-host/composition-manifest.mjs`. `scripts/validate-workload-artifact.mjs`
 * is the in-repo driver-side check and must not be treated as that validator.
 */
export const CURRENT_COMPOSITION_IDENTITY =
  "cartesian-dashboard-representative-v2" as const;

/** Historical identity retained so a v1 page is rejected as mismatched, not unknown. */
export const HISTORICAL_COMPOSITION_IDENTITIES = Object.freeze([
  "cartesian-dashboard-representative-v1",
] as const);

export const REVISION_FAILURE = Object.freeze({
  absent: "workload revision is absent",
  unknown: "workload revision is unknown",
  mismatched: "workload revision digest does not match",
  partiallyExercised: "workload revision is partially exercised",
});

export const DEFAULT_SURFACE_FAILURE =
  "table=none cannot satisfy the default-surface acceptance line";

export type TableMode = "derived" | "none";
export type TableModeRole = "default-surface" | "attribution";
export type CompositionWorkload = "w-a" | "w-b" | "w-c" | "w-d";

export const COMPOSITION_TABLE_MODES = Object.freeze({
  "w-a": Object.freeze({ derived: "default-surface", none: "attribution" }),
  "w-b": Object.freeze({ derived: "default-surface", none: "attribution" }),
  "w-c": Object.freeze({ derived: "default-surface" }),
  "w-d": Object.freeze({ derived: "default-surface", none: "attribution" }),
} as const);

/**
 * Hashed bytes the page publishes. Protocol names for the same facts, and the
 * host field gitops used to read, map onto these keys rather than the other
 * way around — do not rename this object to `artifact.composition` or prefix
 * the digest with `sha256:`:
 *
 *   workload identity / workload revision → `identity`
 *   table mode and required-surface role  → `tableModes`
 *     (`derived` = default-surface, `none` = attribution)
 *   SHA-256 of these exact canonical bytes → `COMPOSITION_DIGEST`
 *     (64 hex characters; no `sha256:` prefix)
 *
 * Frozen scale and named interactions are not keys of this object. The driver
 * retains them as per-surface `passes` on the host artifact (`compositionManifest`
 * + `compositionDigest` / `compositionRevision`). Gitops consumes that shape.
 */
export const COMPOSITION_MANIFEST = Object.freeze({
  identity: CURRENT_COMPOSITION_IDENTITY,
  tableModes: COMPOSITION_TABLE_MODES,
});

/** SHA-256 of `canonicalJson(COMPOSITION_MANIFEST)`, proven in the Node digest test. */
export const COMPOSITION_DIGEST =
  "b2a423f303fca5462be2c1385425bb8ecdfaf608277deca5f40e6b4b8fd17fac";

export const HISTORICAL_COMPOSITION_IDENTITY =
  HISTORICAL_COMPOSITION_IDENTITIES[0];

/** Pre-correction mount identity. Same table-mode matrix; different identity bytes. */
export const HISTORICAL_COMPOSITION_MANIFEST = Object.freeze({
  identity: HISTORICAL_COMPOSITION_IDENTITY,
  tableModes: COMPOSITION_TABLE_MODES,
});

/** SHA-256 of `canonicalJson(HISTORICAL_COMPOSITION_MANIFEST)`. */
export const HISTORICAL_COMPOSITION_DIGEST =
  "e8f9b71c30c139352c76b30a928ecb03228c0b3627391813fd172ef9465dbbb4";

export type CompositionIdentity =
  | typeof CURRENT_COMPOSITION_IDENTITY
  | typeof HISTORICAL_COMPOSITION_IDENTITY;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function tableModeFromQuery(search: string): TableMode {
  const normalized = search.startsWith("&") ? `?${search.slice(1)}` : search;
  return new URLSearchParams(normalized).get("table") === "none" ? "none" : "derived";
}

export function isCompositionWorkload(value: string): value is CompositionWorkload {
  return Object.hasOwn(COMPOSITION_TABLE_MODES, value);
}

export function tableModeRole(
  workload: string,
  mode: TableMode,
): TableModeRole | undefined {
  if (!isCompositionWorkload(workload)) return undefined;
  const modes = COMPOSITION_TABLE_MODES[workload];
  return (modes as Record<string, TableModeRole | undefined>)[mode];
}

export function defaultSurfaceEligible(workload: string, mode: TableMode): boolean {
  return tableModeRole(workload, mode) === "default-surface";
}

export interface RevisionObservation {
  identity?: string | null;
  digest?: string | null;
  manifest?: unknown;
}

export type RevisionFailureReason =
  | "absent"
  | "unknown"
  | "mismatched"
  | "partially-exercised";

export interface RevisionVerdict {
  ok: boolean;
  message: string | null;
  reason: RevisionFailureReason | null;
}

const fail = (reason: RevisionFailureReason): RevisionVerdict => ({
  ok: false,
  message:
    reason === "partially-exercised"
      ? REVISION_FAILURE.partiallyExercised
      : REVISION_FAILURE[reason],
  reason,
});

export function evaluatePageRevision(
  observed: RevisionObservation | null | undefined,
): RevisionVerdict {
  const identity = observed?.identity;
  const digest = observed?.digest;
  if (
    identity == null ||
    identity === "" ||
    digest == null ||
    digest === ""
  ) {
    return fail("absent");
  }
  const historical = (HISTORICAL_COMPOSITION_IDENTITIES as readonly string[]).includes(
    identity,
  );
  if (identity !== CURRENT_COMPOSITION_IDENTITY && !historical) {
    return fail("unknown");
  }
  if (identity !== CURRENT_COMPOSITION_IDENTITY) {
    return fail("mismatched");
  }
  if (digest !== COMPOSITION_DIGEST) {
    return fail("mismatched");
  }
  if (
    observed?.manifest !== undefined &&
    canonicalJson(observed.manifest) !== canonicalJson(COMPOSITION_MANIFEST)
  ) {
    return fail("mismatched");
  }
  return { ok: true, message: null, reason: null };
}

export interface HostResultExercise {
  workload: string;
  tableMode?: TableMode | string | null;
  query?: string;
  compositionIdentity?: string | null;
  compositionDigest?: string | null;
  compositionManifest?: unknown;
  compositionRevision?: RevisionObservation | null;
  passes?: Record<string, unknown>;
  timingVerdictsEligible?: boolean;
  verdicts?: unknown;
}

export interface HostArtifact {
  compositionIdentity?: string | null;
  compositionDigest?: string | null;
  compositionManifest?: unknown;
  compositionRevision?: RevisionObservation | null;
  results?: HostResultExercise[];
}

export function requiredExerciseCells(): readonly {
  workload: CompositionWorkload;
  tableMode: TableMode;
}[] {
  return (Object.keys(COMPOSITION_TABLE_MODES) as CompositionWorkload[]).flatMap(
    (workload) =>
      (Object.keys(COMPOSITION_TABLE_MODES[workload]) as TableMode[]).map(
        (tableMode) => ({ workload, tableMode }),
      ),
  );
}

export function resultTableMode(result: HostResultExercise): TableMode {
  if (result.tableMode === "none" || result.tableMode === "derived") {
    return result.tableMode;
  }
  if (typeof result.query === "string" && result.query.includes("table=none")) {
    return "none";
  }
  return "derived";
}

const resultObservation = (
  result: HostResultExercise,
  host: RevisionObservation,
): RevisionObservation => ({
  identity:
    result.compositionRevision?.identity ??
    result.compositionIdentity ??
    host.identity,
  digest:
    result.compositionRevision?.digest ?? result.compositionDigest ?? host.digest,
  manifest:
    result.compositionRevision?.manifest ??
    result.compositionManifest ??
    host.manifest,
});

const hostObservation = (artifact: HostArtifact): RevisionObservation => ({
  identity: artifact.compositionRevision?.identity ?? artifact.compositionIdentity,
  digest: artifact.compositionRevision?.digest ?? artifact.compositionDigest,
  manifest: artifact.compositionRevision?.manifest ?? artifact.compositionManifest,
});

export function evaluateHostArtifact(
  artifact: HostArtifact | null | undefined,
  requiredPasses: Record<string, readonly string[]>,
): RevisionVerdict {
  if (!artifact) return fail("absent");

  const host = hostObservation(artifact);
  const hostPage = evaluatePageRevision(host);
  if (!hostPage.ok) return hostPage;

  const results = artifact.results ?? [];
  for (const result of results) {
    const page = evaluatePageRevision(resultObservation(result, host));
    if (!page.ok) return page;

    const mode = resultTableMode(result);
    if (tableModeRole(result.workload, mode) === undefined) {
      return fail("unknown");
    }

    const required = requiredPasses[result.workload];
    if (required) {
      const passes = result.passes ?? {};
      if (required.some((name) => !(name in passes))) {
        return fail("partially-exercised");
      }
    }
  }

  const seen = new Set(results.map((result) => `${result.workload}:${resultTableMode(result)}`));
  if (
    requiredExerciseCells().some(
      (cell) => !seen.has(`${cell.workload}:${cell.tableMode}`),
    )
  ) {
    return fail("partially-exercised");
  }

  return { ok: true, message: null, reason: null };
}

export function evaluateDefaultSurfaceAcceptance(mode: TableMode): {
  ok: boolean;
  message: string | null;
} {
  if (mode === "none") {
    return { ok: false, message: DEFAULT_SURFACE_FAILURE };
  }
  return { ok: true, message: null };
}

export function timingVerdictsEligibleForResult(
  hostOk: boolean,
  workload: string,
  mode: TableMode,
): boolean {
  return hostOk && defaultSurfaceEligible(workload, mode);
}

export function evaluateTableNoneDefaultSurface(
  artifact: HostArtifact,
  requiredPasses: Record<string, readonly string[]>,
): { ok: boolean; message: string | null } {
  const host = evaluateHostArtifact(artifact, requiredPasses);
  if (!host.ok) return host;
  for (const result of artifact.results ?? []) {
    if (
      resultTableMode(result) === "none" &&
      result.timingVerdictsEligible === true
    ) {
      return { ok: false, message: DEFAULT_SURFACE_FAILURE };
    }
  }
  return { ok: true, message: null };
}

export function compositionPublication(
  identity: CompositionIdentity | undefined = CURRENT_COMPOSITION_IDENTITY,
): {
  compositionRevision: CompositionIdentity;
  compositionDigest: string;
  compositionManifest:
    | typeof COMPOSITION_MANIFEST
    | typeof HISTORICAL_COMPOSITION_MANIFEST;
} {
  if (identity === HISTORICAL_COMPOSITION_IDENTITY) {
    return {
      compositionRevision: HISTORICAL_COMPOSITION_IDENTITY,
      compositionDigest: HISTORICAL_COMPOSITION_DIGEST,
      compositionManifest: HISTORICAL_COMPOSITION_MANIFEST,
    };
  }
  return {
    compositionRevision: CURRENT_COMPOSITION_IDENTITY,
    compositionDigest: COMPOSITION_DIGEST,
    compositionManifest: COMPOSITION_MANIFEST,
  };
}
