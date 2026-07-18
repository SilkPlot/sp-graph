/**
 * Per-package coverage floors.
 *
 * Coverage was reported and gated nothing until now, deliberately: a number that
 * fails the build is a promise about what the tests prove, and until S002 and
 * S003 had added their correctness and accessibility branches there was no
 * representative run to make that promise from. There is now, so these floors are
 * SELECTED FROM OBSERVED NUMBERS rather than picked as round targets.
 *
 * PER PACKAGE, never one aggregate. The whole repository sits at 98.59% of
 * statements, and that single number is exactly where a stub hides: `calendar`
 * is at 0% and contributes three statements to a denominator of 926, so it moves
 * the aggregate by a tenth of a point. An aggregate floor would be satisfied by
 * four well-tested packages carrying an untested one indefinitely, and would
 * report that as health.
 *
 * ── How each floor was chosen ───────────────────────────────────────────────
 *
 * Observed on the S003 tip (2026-07-18), 599 tests across five Vitest projects,
 * `vitest run --coverage`, barrel `index` files excluded (they re-export and
 * hold no logic; counting them measures the export list):
 *
 *   package   statements        branches         functions      lines
 *   core      98.56 (137/139)   93.02 (80/86)    100 (36/36)    99.09 (109/110)
 *   theme     100   (65/65)     100   (9/9)      100 (20/20)    100   (56/56)
 *   solid     98.54 (472/479)   92.45 (245/265)  100 (143/143)  99.44 (354/356)
 *   charts    99.58 (239/240)   91.95 (80/87)    100 (146/146)  100   (172/172)
 *   calendar   0    (0/3)       n/a   (0/0)        0 (0/3)        0   (0/2)
 *
 * The rule, applied uniformly so no floor is an argument:
 *
 *   - a metric below 100 is floored at the observed value truncated to a whole
 *     percent, minus one point of headroom. One point is roughly one branch in
 *     these denominators — enough that adding a line of code ahead of its test
 *     does not fail the build, far too little for a deleted test file to slip
 *     through;
 *   - **a metric observed at exactly 100 is floored at 100.** There is no
 *     headroom to give: nothing in those packages is uncovered, so the first
 *     uncovered thing is a regression rather than noise. Lowering one of these
 *     needs the same evidence that raising it did.
 *
 * ── Documented honest exclusions ────────────────────────────────────────────
 *
 * These are why two packages sit below 100 and must STAY below it. They are
 * recorded here so that sub-100 reads as a decision rather than as slack, and so
 * that nobody "fixes" them with a test that asserts a stub.
 */

/** Uncovered on purpose, with the reason. Printed by the gate; never quietly ignored. */
export const DOCUMENTED_EXCLUSIONS = [
  {
    file: "packages/solid/src/createResize.ts",
    lines: "47-48",
    reason:
      "the `contentRect` fallback. Chromium reports `contentBoxSize`, so the fallback is " +
      "unreachable in the only browser these tests run in. Stubbing `ResizeObserver` to force " +
      "the branch would exercise the stub, not the observer — it would raise the number and " +
      "prove nothing. It stays honestly uncovered.",
  },
];

/**
 * Packages in the alpha release set, floored.
 *
 * Keyed by the same glob Vitest matches coverage against.
 */
export const COVERAGE_FLOORS = {
  // observed 98.56 / 93.02 / 100 / 99.09
  "packages/core/src/**": { statements: 97, branches: 92, functions: 100, lines: 98 },
  // observed 100 across the board — no exclusion, so no headroom
  "packages/theme/src/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
  // observed 98.54 / 92.45 / 100 / 99.44, carrying the createResize exclusion above
  "packages/solid/src/**": { statements: 97, branches: 91, functions: 100, lines: 98 },
  // observed 99.58 / 91.95 / 100 / 100
  "packages/charts/src/**": { statements: 98, branches: 90, functions: 100, lines: 100 },

  // `calendar` is NOT in the alpha release set: its public `buildTimeGrid` entry
  // point throws, so publishing it would advertise an implementation that does
  // not exist. Its floor is 0 and that is not an oversight — it is the stub being
  // named out loud instead of being averaged into someone else's percentage. When
  // the calendar work lands, this line is replaced by observed numbers like the
  // rest, and until then a zero here is a true statement.
  "packages/calendar/src/**": { statements: 0, branches: 0, functions: 0, lines: 0 },
};
