/**
 * The layered time selection model — ADR-0007's precedence table, walked.
 *
 * The organising idea: the six-row table IS the specification, so it is written
 * here as data and every row is asserted, rather than sampled by a handful of
 * illustrative cases. The rows where two scopes disagree are the ones that
 * matter and the ones nobody writes a fixture for by accident, so they are not
 * optional here — the table drives the loop.
 *
 * Written DAMP rather than DRY on purpose: each case carries its own literal
 * instants so a reader can see the arithmetic without resolving a helper.
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import { resolveEffectiveDomain } from "../src/index";
import type {
  DynamicSelection,
  EffectiveDomain,
  GlobalRange,
  SectionScope,
  TimeScopeIssue,
} from "../src/index";

/** Production posture: resolve and report rather than throw. */
const LENIENT = { strict: false } as const;

const GLOBAL: GlobalRange = { scope: "global", start: 100, end: 900 };
const DYNAMIC: DynamicSelection = { scope: "dynamic", start: 300, end: 500 };
const WINDOW: SectionScope = { scope: "section-window", start: 600, end: 800 };
const LATEST: SectionScope = { scope: "section-latest" };

/**
 * ADR-0007 §3, as data. `dynamic` and `section` are the two optional inputs; the
 * global range is present in every row by definition, which is what makes the
 * table total.
 *
 * The chosen instants make every row's expected result DISTINGUISHABLE: the
 * dynamic selection (300-500) and the section window (600-800) do not overlap,
 * so a rule that confused them could not accidentally produce the right answer.
 */
const PRECEDENCE: readonly {
  row: string;
  dynamic?: DynamicSelection;
  section?: SectionScope;
  expected: EffectiveDomain;
}[] = [
  {
    row: "no dynamic, no section — the global range",
    expected: { kind: "range", start: 100, end: 900 },
  },
  {
    row: "no dynamic, section window — global ∩ window",
    section: WINDOW,
    expected: { kind: "range", start: 600, end: 800 },
  },
  {
    row: "no dynamic, section latest — latest bounded by the global range",
    section: LATEST,
    expected: { kind: "latest", bounds: { start: 100, end: 900 } },
  },
  {
    row: "dynamic active, no section — global ∩ dynamic",
    dynamic: DYNAMIC,
    expected: { kind: "range", start: 300, end: 500 },
  },
  {
    row: "dynamic active, section window — the window wins, dynamic ignored",
    dynamic: DYNAMIC,
    section: WINDOW,
    expected: { kind: "range", start: 600, end: 800 },
  },
  {
    row: "dynamic active, section latest — latest wins, dynamic ignored",
    dynamic: DYNAMIC,
    section: LATEST,
    expected: { kind: "latest", bounds: { start: 100, end: 900 } },
  },
];

describe("resolveEffectiveDomain — the precedence table", () => {
  it("covers every combination of the two optional scopes", () => {
    // Guards the table itself: 2 dynamic states × 3 section states = 6. If a row
    // is deleted, this fails before the loop silently tests less than it claims.
    expect(PRECEDENCE).toHaveLength(6);
    const combinations = new Set(
      PRECEDENCE.map((c) => `${c.dynamic ? "dynamic" : "-"}/${c.section?.scope ?? "-"}`),
    );
    expect(combinations.size).toBe(6);
  });

  for (const testCase of PRECEDENCE) {
    it(testCase.row, () => {
      expect(
        resolveEffectiveDomain(
          { global: GLOBAL, dynamic: testCase.dynamic, section: testCase.section },
          LENIENT,
        ),
      ).toEqual(testCase.expected);
    });
  }
});

/**
 * The row the phase exists for. Stated separately from the table loop because
 * "all three disagree" is the case the whole isolation rule was written to
 * answer, and it should fail with its own name rather than as row five of six.
 */
describe("resolveEffectiveDomain — the three-way disagreement", () => {
  it("resolves to the section window when global, dynamic, and section all disagree", () => {
    const result = resolveEffectiveDomain(
      {
        global: { scope: "global", start: 0, end: 1000 },
        dynamic: { scope: "dynamic", start: 100, end: 200 },
        section: { scope: "section-window", start: 700, end: 900 },
      },
      LENIENT,
    );

    // The window, not the dynamic selection, and not the global range. A section
    // that declared its own window did so in order NOT to follow a drag made on
    // another chart.
    expect(result).toEqual({ kind: "range", start: 700, end: 900 });
  });

  it("follows the dynamic selection when the section declared nothing", () => {
    // The counterpart that makes the rule above meaningful rather than a way of
    // ignoring the shared cursor everywhere.
    expect(
      resolveEffectiveDomain(
        {
          global: { scope: "global", start: 0, end: 1000 },
          dynamic: { scope: "dynamic", start: 100, end: 200 },
        },
        LENIENT,
      ),
    ).toEqual({ kind: "range", start: 100, end: 200 });
  });
});

describe("resolveEffectiveDomain — nothing widens past the global range", () => {
  it("clamps a section window that extends past both ends", () => {
    expect(
      resolveEffectiveDomain(
        {
          global: { scope: "global", start: 400, end: 600 },
          section: { scope: "section-window", start: 0, end: 1000 },
        },
        LENIENT,
      ),
    ).toEqual({ kind: "range", start: 400, end: 600 });
  });

  it("clamps a dynamic selection that overhangs one end", () => {
    expect(
      resolveEffectiveDomain(
        {
          global: { scope: "global", start: 400, end: 600 },
          dynamic: { scope: "dynamic", start: 500, end: 5000 },
        },
        LENIENT,
      ),
    ).toEqual({ kind: "range", start: 500, end: 600 });
  });

  it("bounds latest-value by the global range, so a newer datum is out of scope", () => {
    // The bound IS the answer to "what if the newest reading is newer than the
    // selected range?" — it is excluded by construction, rather than by a rule a
    // consumer has to remember.
    expect(
      resolveEffectiveDomain(
        { global: { scope: "global", start: 400, end: 600 }, section: LATEST },
        LENIENT,
      ),
    ).toEqual({ kind: "latest", bounds: { start: 400, end: 600 } });
  });
});

describe("resolveEffectiveDomain — an empty result never widens outward", () => {
  it("resolves disjoint global and section to empty rather than to the global range", () => {
    const result = resolveEffectiveDomain(
      {
        global: { scope: "global", start: 0, end: 100 },
        section: { scope: "section-window", start: 500, end: 600 },
      },
      LENIENT,
    );

    // The failure this asserts against is a fallback to `{100, 900}` or to the
    // global range — a populated chart showing data the reader had excluded,
    // which looks like it is working.
    expect(result).toEqual({ kind: "empty", reason: "disjoint" });
  });

  it("resolves disjoint global and dynamic to empty", () => {
    expect(
      resolveEffectiveDomain(
        {
          global: { scope: "global", start: 0, end: 100 },
          dynamic: { scope: "dynamic", start: 500, end: 600 },
        },
        LENIENT,
      ),
    ).toEqual({ kind: "empty", reason: "disjoint" });
  });
});

describe("resolveEffectiveDomain — degenerate intervals", () => {
  it("treats a zero-width range as valid, not empty", () => {
    expect(
      resolveEffectiveDomain({ global: { scope: "global", start: 500, end: 500 } }, LENIENT),
    ).toEqual({ kind: "range", start: 500, end: 500 });
  });

  it("intersects intervals that touch at exactly one instant", () => {
    // The `>` vs `>=` boundary in `intersect`. With `>=` this range would vanish.
    expect(
      resolveEffectiveDomain(
        {
          global: { scope: "global", start: 0, end: 500 },
          section: { scope: "section-window", start: 500, end: 900 },
        },
        LENIENT,
      ),
    ).toEqual({ kind: "range", start: 500, end: 500 });
  });

  it("throws on an inverted range in a development build", () => {
    expect(() =>
      resolveEffectiveDomain(
        { global: { scope: "global", start: 900, end: 100 } },
        { strict: true },
      ),
    ).toThrow(/ends before it starts/);
  });

  it("reports and resolves empty on an inverted range in a production build", () => {
    const issues: TimeScopeIssue[] = [];
    const result = resolveEffectiveDomain(
      { global: { scope: "global", start: 900, end: 100 } },
      { strict: false, onIssue: (issue) => issues.push(issue) },
    );

    expect(result).toEqual({ kind: "empty", reason: "inverted" });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("inverted-range");
  });

  it("catches an inverted section window, not only an inverted global range", () => {
    const issues: TimeScopeIssue[] = [];
    const result = resolveEffectiveDomain(
      {
        global: GLOBAL,
        section: { scope: "section-window", start: 800, end: 600 },
      },
      { strict: false, onIssue: (issue) => issues.push(issue) },
    );

    // Without the second check this would intersect to `{800, 600}` and ship an
    // inverted domain as a successful result.
    expect(result).toEqual({ kind: "empty", reason: "inverted" });
    expect(issues).toHaveLength(1);
  });
});

describe("resolveEffectiveDomain — determinism", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces identical output when the platform clock moves by years", () => {
    // The AC asks for a time-dependent case proved by advancing the clock. There
    // is no such case BY CONSTRUCTION — latest-value resolves to a bounded
    // request, not to a datum — so the proof available is the stronger one: move
    // the clock arbitrarily and show the output does not notice.
    const scopes = { global: GLOBAL, dynamic: DYNAMIC, section: LATEST };

    vi.useFakeTimers();
    vi.setSystemTime(new Date("1999-01-01T00:00:00Z"));
    const before = resolveEffectiveDomain(scopes, LENIENT);

    vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
    const after = resolveEffectiveDomain(scopes, LENIENT);

    expect(after).toEqual(before);
    expect(after).toEqual({ kind: "latest", bounds: { start: 100, end: 900 } });
  });

  it("does not mutate its input", () => {
    const scopes = {
      global: { scope: "global", start: 100, end: 900 },
      dynamic: { scope: "dynamic", start: 300, end: 500 },
    } as const;
    // Written out rather than cloned: `structuredClone` is not in this package's
    // test lib, and a literal snapshot shows the reader exactly what "unchanged"
    // means here without depending on a global that may not exist.
    resolveEffectiveDomain(scopes, LENIENT);

    expect(scopes).toEqual({
      global: { scope: "global", start: 100, end: 900 },
      dynamic: { scope: "dynamic", start: 300, end: 500 },
    });
  });
});
