/**
 * The representative cartesian-dashboard composition revision.
 *
 * One identity, one manifest, one digest. The workload page publishes them, the
 * driver copies them onto the host artifact, and an independent validator
 * recomputes eligibility from that artifact without going through the driver.
 * Timing verdicts are not eligible until this revision is present, current,
 * digest-matched, and fully exercised.
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

export const COMPOSITION_MANIFEST = Object.freeze({
  identity: CURRENT_COMPOSITION_IDENTITY,
  tableModes: COMPOSITION_TABLE_MODES,
});

/** SHA-256 of `canonicalJson(COMPOSITION_MANIFEST)`, proven in the Node digest test. */
export const COMPOSITION_DIGEST =
  "b2a423f303fca5462be2c1385425bb8ecdfaf608277deca5f40e6b4b8fd17fac";

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

export function compositionPublication(): {
  compositionRevision: typeof CURRENT_COMPOSITION_IDENTITY;
  compositionDigest: string;
  compositionManifest: typeof COMPOSITION_MANIFEST;
} {
  return {
    compositionRevision: CURRENT_COMPOSITION_IDENTITY,
    compositionDigest: COMPOSITION_DIGEST,
    compositionManifest: COMPOSITION_MANIFEST,
  };
}
