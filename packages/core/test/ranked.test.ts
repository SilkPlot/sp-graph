/**
 * The ranked categorical model — the contract, walked.
 *
 * Organised around the failures the contract exists to prevent rather than the
 * functions it exports, the same way `series.test.ts` is. The failures here are
 * the categorical restatements of ADR-0008's: identity that survives a reorder
 * on the one surface where reordering is the whole point, a broken value that
 * never becomes a zero, a domain that stays finite on input that is entirely
 * broken, and an order the library never quietly improves.
 *
 * Written DAMP: each case carries its own literal data so the arithmetic is
 * visible without resolving a helper.
 */
import { describe, expect, it, vi } from "vitest";
import { normalizeCategories, rankedDomainOf } from "../src/index";
import type { RankedCategory, SeriesIssue } from "../src/index";

/** `strict: false` is production behaviour; the dev throw is tested separately. */
const lenient = { strict: false } as const;

describe("identity", () => {
  it("is held on the id, not the position, so a reorder does not disturb it", () => {
    const before: RankedCategory[] = [
      { id: "a", label: "Alpha", value: 10 },
      { id: "b", label: "Bravo", value: 20 },
    ];
    const after: RankedCategory[] = [
      { id: "b", label: "Bravo", value: 20 },
      { id: "a", label: "Alpha", value: 10 },
    ];

    const first = normalizeCategories(before, lenient);
    const second = normalizeCategories(after, lenient);

    // Same id, same value, DIFFERENT position — which is what a ranked chart
    // does every time its ordering changes.
    expect(first.byId.get("a")?.value).toBe(10);
    expect(second.byId.get("a")?.value).toBe(10);
    expect(first.byId.get("a")?.sourceIndex).toBe(0);
    expect(second.byId.get("a")?.sourceIndex).toBe(1);
  });

  it("is held on the id, not the label, so two categories may share display text", () => {
    const model = normalizeCategories(
      [
        { id: "q1-north", label: "Regional total", value: 5 },
        { id: "q1-south", label: "Regional total", value: 8 },
      ],
      lenient,
    );

    // Neither is dropped, and each is reachable independently.
    expect(model.categories).toHaveLength(2);
    expect(model.byId.get("q1-north")?.value).toBe(5);
    expect(model.byId.get("q1-south")?.value).toBe(8);
  });

  it("throws on a duplicate id in development, because it is an authored bug", () => {
    expect(() =>
      normalizeCategories(
        [
          { id: "dup", label: "First", value: 1 },
          { id: "dup", label: "Second", value: 2 },
        ],
        { strict: true },
      ),
    ).toThrow(/two categories share the id "dup"/);
  });

  it("keeps the FIRST occurrence in production and reports the drop", () => {
    const issues: SeriesIssue[] = [];
    const model = normalizeCategories(
      [
        { id: "dup", label: "First", value: 1 },
        { id: "dup", label: "Second", value: 2 },
      ],
      { strict: false, onIssue: (i) => issues.push(i) },
    );

    expect(model.categories).toHaveLength(1);
    expect(model.categories[0]?.label).toBe("First");
    expect(issues.map((i) => i.code)).toEqual(["duplicate-id"]);
    expect(issues[0]?.categoryId).toBe("dup");
  });

  it("preserves sourceIndex across a drop, so it is provenance and not a position", () => {
    const model = normalizeCategories(
      [
        { id: "a", label: "Alpha", value: 1 },
        { id: "a", label: "Shadow", value: 2 },
        { id: "c", label: "Charlie", value: 3 },
      ],
      lenient,
    );

    // "c" sits at output position 1 but arrived at input index 2. Reading the
    // output position as the caller's index is the bug this pins.
    expect(model.categories).toHaveLength(2);
    expect(model.categories[1]?.id).toBe("c");
    expect(model.categories[1]?.sourceIndex).toBe(2);
  });
});

describe("broken values are never zero-filled", () => {
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("classifies %s as invalid and stores null, not 0", (_name, value) => {
    const model = normalizeCategories(
      [{ id: "broken", label: "Broken", value }],
      lenient,
    );

    expect(model.categories[0]?.state).toBe("invalid");
    // The whole point: `0` here would be a visible claim that the category
    // measured nothing.
    expect(model.categories[0]?.value).toBeNull();
    expect(model.categories[0]?.value).not.toBe(0);
  });

  it("classifies null and undefined as missing rather than invalid", () => {
    const model = normalizeCategories(
      [
        // Untyped-caller shapes: the published type requires a number, so these
        // are only reachable from JS. They must not read as corrupt data.
        { id: "n", label: "Null", value: null as unknown as number },
        { id: "u", label: "Undefined", value: undefined as unknown as number },
      ],
      lenient,
    );

    expect(model.categories.map((c) => c.state)).toEqual(["missing", "missing"]);
    expect(model.categories.map((c) => c.value)).toEqual([null, null]);
  });

  it("keeps a real zero as a present value", () => {
    const model = normalizeCategories(
      [{ id: "z", label: "Zero", value: 0 }],
      lenient,
    );

    // The mirror of the case above: a measured zero is data, not a gap.
    expect(model.categories[0]?.state).toBe("present");
    expect(model.categories[0]?.value).toBe(0);
  });

  it("reports bad values ONCE for the chart, not once per category", () => {
    const issues: SeriesIssue[] = [];
    normalizeCategories(
      Array.from({ length: 500 }, (_, i) => ({
        id: `c${i}`,
        label: `C${i}`,
        value: Number.NaN,
      })),
      { strict: false, onIssue: (i) => issues.push(i) },
    );

    // 500 identical diagnostics is how a console gets switched off.
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("invalid-value");
    expect(issues[0]?.message).toContain("500");
  });
});

describe("signed values", () => {
  it("keeps a negative value signed rather than ranking on magnitude", () => {
    const model = normalizeCategories(
      [
        { id: "gain", label: "Gain", value: 1_284_500 },
        { id: "loss", label: "Asset disposal", value: -84_750 },
      ],
      lenient,
    );

    expect(model.byId.get("loss")?.value).toBe(-84_750);
    // The domain must reach below zero, or the loss has nowhere to be drawn.
    expect(model.valueDomain[0]).toBeLessThan(0);
  });

  it("spans a domain crossing zero in both directions", () => {
    const model = normalizeCategories(
      [
        { id: "a", label: "A", value: -30 },
        { id: "b", label: "B", value: 50 },
      ],
      lenient,
    );

    expect(model.valueDomain).toEqual([-30, 50]);
  });
});

describe("domains stay finite", () => {
  it("returns the sentinel for empty input rather than a degenerate domain", () => {
    const model = normalizeCategories([], lenient);

    expect(model.categories).toHaveLength(0);
    expect(model.bandDomain).toEqual([]);
    // A chart still has to produce a scale; NaN positions render as nothing and
    // are painful to trace back.
    expect(model.valueDomain.every(Number.isFinite)).toBe(true);
  });

  it("returns a finite domain when EVERY value is broken", () => {
    const model = normalizeCategories(
      [
        { id: "a", label: "A", value: Number.NaN },
        { id: "b", label: "B", value: Number.POSITIVE_INFINITY },
      ],
      lenient,
    );

    expect(model.valueDomain.every(Number.isFinite)).toBe(true);
  });

  it("excludes broken values from the domain instead of flooring it at zero", () => {
    const model = normalizeCategories(
      [
        { id: "a", label: "A", value: 40 },
        { id: "b", label: "B", value: Number.NaN },
        { id: "c", label: "C", value: 60 },
      ],
      lenient,
    );

    // A stray NaN read as 0 would floor this at 0 and squash the real spread.
    expect(model.valueDomain).toEqual([40, 60]);
  });

  it("computes a constant-value domain without collapsing it", () => {
    const model = normalizeCategories(
      [
        { id: "a", label: "A", value: 7 },
        { id: "b", label: "B", value: 7 },
      ],
      lenient,
    );

    expect(model.valueDomain.every(Number.isFinite)).toBe(true);
  });
});

describe("order is the caller's", () => {
  it("never sorts, even when the input is obviously unranked", () => {
    const model = normalizeCategories(
      [
        { id: "small", label: "Small", value: 1 },
        { id: "large", label: "Large", value: 100 },
        { id: "medium", label: "Medium", value: 50 },
      ],
      lenient,
    );

    // A library re-sort would make the picture disagree with the table, the
    // export, and the array that was passed in.
    expect(model.categories.map((c) => c.id)).toEqual(["small", "large", "medium"]);
    expect(model.bandDomain).toEqual(["small", "large", "medium"]);
  });

  it("builds the band domain from ids, not labels, so duplicate text cannot collide", () => {
    const model = normalizeCategories(
      [
        { id: "north", label: "Regional total", value: 5 },
        { id: "south", label: "Regional total", value: 8 },
      ],
      lenient,
    );

    // Two identical labels would give a band scale ONE slot and stack the bars.
    expect(model.bandDomain).toEqual(["north", "south"]);
    expect(new Set(model.bandDomain).size).toBe(2);
  });
});

describe("purity", () => {
  it("is a pure function of its input, so a removed category cannot survive", () => {
    const first = normalizeCategories(
      [
        { id: "a", label: "A", value: 1 },
        { id: "gone", label: "Gone", value: 2 },
      ],
      lenient,
    );
    const second = normalizeCategories([{ id: "a", label: "A", value: 1 }], lenient);

    expect(first.byId.has("gone")).toBe(true);
    // No cache and no retained record, so stale identity is structurally
    // impossible rather than merely tested for.
    expect(second.byId.has("gone")).toBe(false);
    expect(second.bandDomain).toEqual(["a"]);
  });

  it("does not mutate the caller's array", () => {
    const input: RankedCategory[] = [
      { id: "b", label: "B", value: 2 },
      { id: "a", label: "A", value: 1 },
    ];
    // Hand-built rather than `structuredClone`: `core` typechecks under a
    // deliberately DOM-free `lib`, which does not declare it.
    const snapshot = input.map((c) => ({ ...c }));

    normalizeCategories(input, lenient);

    expect(input).toEqual(snapshot);
  });
});

describe("metadata", () => {
  it("carries meta verbatim and never plots it", () => {
    const meta = { href: "/reports/cc-refurb", owner: "ops" };
    const model = normalizeCategories(
      [{ id: "cc", label: "Cold chain", value: 5, meta }],
      lenient,
    );

    // Same reference out, not a copy — "returned verbatim" (ADR-0008 §3).
    expect(model.byId.get("cc")?.meta).toBe(meta);
    expect(model.valueDomain).toEqual([5, 5]);
  });
});

describe("diagnostics", () => {
  it("routes every issue through the one shared channel", () => {
    const onIssue = vi.fn();
    normalizeCategories(
      [
        { id: "dup", label: "First", value: 1 },
        { id: "dup", label: "Second", value: 2 },
        { id: "bad", label: "Bad", value: Number.NaN },
      ],
      { strict: false, onIssue },
    );

    // One hook hears both a dropped category and a broken value.
    expect(onIssue.mock.calls.map(([i]) => (i as SeriesIssue).code)).toEqual([
      "duplicate-id",
      "invalid-value",
    ]);
  });

  it("collects issues on the model even with no onIssue hook wired", () => {
    const model = normalizeCategories(
      [{ id: "bad", label: "Bad", value: Number.NaN }],
      lenient,
    );

    expect(model.issues.map((i) => i.code)).toEqual(["invalid-value"]);
  });
});

describe("rankedDomainOf", () => {
  it("is reachable independently of normalizeCategories", () => {
    const model = normalizeCategories(
      [
        { id: "a", label: "A", value: 3 },
        { id: "b", label: "B", value: 9 },
      ],
      lenient,
    );

    expect(rankedDomainOf(model.categories)).toEqual([3, 9]);
  });
});
