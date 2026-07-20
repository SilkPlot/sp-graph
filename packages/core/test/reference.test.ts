/**
 * Reference normalisation — ADR-0008 §10 as computation.
 *
 * The organising caution, and it is the same one the whole contract turns on: a
 * reference that is silently dropped, or silently drawn at zero, renders a chart
 * that looks completely fine. So every case below asserts what SURVIVED as well
 * as what was reported — a test that only checks the diagnostic passes against
 * an implementation that reports and then draws the bad line anyway.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeReferences,
  referenceDomainOf,
  type ReferenceValue,
  type SeriesIssue,
} from "../src/index";

const collect = (): { issues: SeriesIssue[]; onIssue: (i: SeriesIssue) => void } => {
  const issues: SeriesIssue[] = [];
  return { issues, onIssue: (i) => issues.push(i) };
};

/** Non-strict, so production behaviour is what is under test unless stated. */
const lenient = (input: readonly ReferenceValue[] | undefined) => {
  const sink = collect();
  const model = normalizeReferences(input, { strict: false, onIssue: sink.onIssue });
  return { ...model, reported: sink.issues };
};

describe("normalizeReferences — the shape", () => {
  it("resolves a numeric reference onto the value axis", () => {
    const { references } = lenient([{ id: "sla", value: 95, label: "SLA floor" }]);
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ id: "sla", axis: "value", at: 95, label: "SLA floor" });
  });

  it("resolves a temporal reference onto the time axis, as epoch ms", () => {
    const when = new Date("2026-03-01T00:20:00Z");
    const { references } = lenient([{ id: "deploy", time: when, label: "Deploy" }]);
    expect(references[0]).toMatchObject({ axis: "time", at: when.valueOf() });
  });

  it("keeps both axes in ONE collection, in the caller's order", () => {
    // Order is the caller's (§5). If this ever sorted — by axis, by position —
    // paint order would stop matching the array that was passed in.
    const { references } = lenient([
      { id: "b", time: new Date("2026-03-01T00:00:00Z"), label: "B" },
      { id: "a", value: 1, label: "A" },
    ]);
    expect(references.map((r) => r.id)).toEqual(["b", "a"]);
    expect(references.map((r) => r.axis)).toEqual(["time", "value"]);
    expect(references.map((r) => r.sourceIndex)).toEqual([0, 1]);
  });

  it("defaults includeInDomain to true and resolves style to an object", () => {
    // Both are resolved here so no consumer re-applies the default or
    // optional-chains a style — two places deciding one thing is two places to
    // disagree.
    const { references } = lenient([{ id: "sla", value: 95, label: "SLA" }]);
    expect(references[0]?.includeInDomain).toBe(true);
    expect(references[0]?.style).toEqual({});
  });

  it("honours an explicit includeInDomain: false", () => {
    const { references } = lenient([
      { id: "design", value: 4000, label: "Design maximum", includeInDomain: false },
    ]);
    expect(references[0]?.includeInDomain).toBe(false);
  });

  it("returns empty for undefined and for an empty array, without reporting", () => {
    expect(lenient(undefined).references).toEqual([]);
    expect(lenient([]).references).toEqual([]);
    expect(lenient(undefined).reported).toEqual([]);
  });
});

describe("normalizeReferences — a duplicate id is structural", () => {
  const DUPES: readonly ReferenceValue[] = [
    { id: "sla", value: 95, label: "First" },
    { id: "sla", value: 80, label: "Second" },
  ];

  it("throws in strict mode, naming both positions", () => {
    expect(() => normalizeReferences(DUPES, { strict: true })).toThrow(/positions 0 and 1/);
  });

  it("keeps the FIRST and reports, in production", () => {
    const { references, reported } = lenient(DUPES);
    // Keeping the first, not the last, and not merging: the caller passed two
    // things and must be able to tell which one survived.
    expect(references).toHaveLength(1);
    expect(references[0]?.label).toBe("First");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.code).toBe("duplicate-reference-id");
    expect(reported[0]?.referenceId).toBe("sla");
  });

  it("defaults strict from the build, so a bare call in a dev build throws", () => {
    // No `strict` key at all — the default must come from `isDevelopmentBuild`,
    // which is true under vitest. A default of `false` would make the
    // development-time throw unreachable for every caller who never sets it.
    expect(() => normalizeReferences(DUPES)).toThrow();
  });
});

describe("normalizeReferences — a broken position is data, and never becomes zero", () => {
  // The single most important property in this file. A threshold computed as
  // `mean + 3 * stddev` over an empty window arrives as NaN; at zero it reads as
  // a real limit an operator would act on.
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("drops a %s value and reports it", (_name, value) => {
    const { references, reported } = lenient([{ id: "bad", value, label: "Broken" }]);
    expect(references).toEqual([]);
    expect(reported.map((i) => i.code)).toEqual(["invalid-reference"]);
    expect(reported[0]?.referenceId).toBe("bad");
  });

  it("drops an Invalid Date, which is the same defect on the other axis", () => {
    const { references, reported } = lenient([
      { id: "bad", time: new Date("not a date"), label: "Broken" },
    ]);
    expect(references).toEqual([]);
    expect(reported[0]?.code).toBe("invalid-reference");
  });

  it("does NOT throw on a broken position, even in strict mode", () => {
    // The deliberate asymmetry against a duplicate id. An invalid position
    // arrives at runtime from a computation; taking the page down over it is
    // worse than omitting one line and saying so. Same posture as `extentOf`.
    expect(() =>
      normalizeReferences([{ id: "bad", value: Number.NaN, label: "Broken" }], { strict: true }),
    ).not.toThrow();
  });

  it("keeps the good references beside the bad one", () => {
    // The bug this catches: bailing out of the whole array on the first bad
    // entry, which loses thresholds that were perfectly fine.
    const { references } = lenient([
      { id: "ok", value: 10, label: "Fine" },
      { id: "bad", value: Number.NaN, label: "Broken" },
      { id: "ok2", value: 20, label: "Also fine" },
    ]);
    expect(references.map((r) => r.id)).toEqual(["ok", "ok2"]);
  });

  it("accepts zero itself — it is a legitimate threshold", () => {
    // Guards the over-correction: filtering falsy rather than non-finite would
    // silently delete a zero threshold, which is a real and common one.
    const { references } = lenient([{ id: "zero", value: 0, label: "Baseline" }]);
    expect(references).toHaveLength(1);
    expect(references[0]?.at).toBe(0);
  });
});

describe("referenceDomainOf", () => {
  const MIXED: readonly ReferenceValue[] = [
    { id: "sla", value: 95, label: "SLA" },
    { id: "warn", value: 80, label: "Warning" },
    { id: "design", value: 4000, label: "Design", includeInDomain: false },
    { id: "deploy", time: new Date("2026-03-01T00:20:00Z"), label: "Deploy" },
  ];

  it("returns only participating references on the requested axis", () => {
    const { references } = lenient(MIXED);
    expect(referenceDomainOf(references, "value")).toEqual([95, 80]);
    expect(referenceDomainOf(references, "time")).toEqual([
      new Date("2026-03-01T00:20:00Z").valueOf(),
    ]);
  });

  it("excludes an opted-out reference from its own axis", () => {
    // 4000 is the value that would compress every series into a band, which is
    // the entire cost §10's opt-out exists to let a caller avoid.
    const { references } = lenient(MIXED);
    expect(referenceDomainOf(references, "value")).not.toContain(4000);
  });

  it("does not leak one axis into the other", () => {
    // The failure this catches is quiet and severe: an epoch-millisecond value
    // folded into the y extent floors the axis at ~1.77e12 and every series
    // collapses onto the baseline.
    const { references } = lenient(MIXED);
    for (const v of referenceDomainOf(references, "value")) expect(v).toBeLessThan(1e6);
  });

  it("returns empty rather than a sentinel when nothing participates", () => {
    // Empty, not `[0, 1]`: this returns CONTRIBUTIONS for a caller to fold into
    // an extent it already has. A sentinel here would drag every domain to zero.
    const { references } = lenient([{ id: "a", value: 5, label: "A", includeInDomain: false }]);
    expect(referenceDomainOf(references, "value")).toEqual([]);
  });
});
