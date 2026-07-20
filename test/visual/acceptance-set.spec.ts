/**
 * The guard over the acceptance set itself.
 *
 * `charts.spec.ts` proves that the surfaces we capture still look right. This
 * file proves that we are still capturing the surfaces we said we would — a
 * separate claim, and the one a screenshot suite loses first.
 *
 * The failure it exists to prevent is silent shrinkage. Delete a case from
 * `acceptance-set.ts`, or delete the baseline files it owns, and the suite goes
 * green faster than before. Nobody reads a passing run closely enough to notice
 * that it stopped covering the negative-series case, so the coverage is gone
 * and the signal that it is gone is a shorter runtime.
 */
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "playwright/test";
import {
  ACCEPTANCE_SET,
  CASES,
  CHARTS,
  EXCLUSIONS,
  EXPECTED_TOTALS,
  FOCUSABLE,
  LEGEND_CASES,
  MULTI_CASES,
  MULTI_CHARTS,
  FOCUS_RATIONALE,
  THEME_STATES,
} from "./acceptance-set";

const baselinesDir = fileURLToPath(new URL("./baselines", import.meta.url));

test.describe("the acceptance set is explicit", () => {
  /**
   * The dimensions are asserted against literals written out here, NOT against
   * the exported arrays. Comparing an array to itself proves only that it
   * equals itself. These literals are the second copy that has to be changed
   * deliberately, in a diff a reviewer sees.
   */
  test("covers exactly the four alpha chart families", () => {
    expect([...CHARTS]).toEqual(["line", "area", "bar", "scatter"]);
  });

  test("covers exactly the twelve rendering cases", () => {
    expect([...CASES]).toEqual([
      "default",
      "empty",
      "negative",
      "dense-label",
      "responsive-mobile",
      "multi-one",
      "multi-four",
      "multi-22",
      "multi-22-narrow",
      "multi-gaps",
      "multi-ref-one",
      "multi-ref-three",
    ]);
  });

  test("declares the legend's own cases, separate from the chart product", () => {
    // The legend is a primitive, not a chart family: no data, no axes, no
    // y-domain policy. Written out here so that folding it into CHARTS — the
    // obvious and wrong move — has to change this literal in a visible diff.
    expect([...LEGEND_CASES]).toEqual([
      "legend-four",
      "legend-22",
      "legend-22-narrow",
      "legend-stack-scroll",
      "legend-some-hidden",
    ]);
    expect([...CHARTS]).not.toContain("legend");
  });

  test("declares which charts compose the multi-series surface", () => {
    // Two, not four. `bar` and `scatter` have no `series` prop, so a baseline
    // for them would be a picture of nothing under a confident name. Written
    // out here so that the day one of them gains the surface, this literal has
    // to change in a diff a reviewer sees.
    expect([...MULTI_CHARTS]).toEqual(["line", "area"]);
    expect([...MULTI_CASES]).toEqual([
      "multi-one",
      "multi-four",
      "multi-22",
      "multi-22-narrow",
      "multi-gaps",
      "multi-ref-one",
      "multi-ref-three",
    ]);
  });

  test("covers all four scheme x contrast combinations, not three", () => {
    // Scheme and contrast are orthogonal preferences. A three-value list here
    // is the exact shape of the defect that painted light high-contrast values
    // onto a dark surface and measured 1.16:1.
    expect([...THEME_STATES]).toEqual([
      "light",
      "dark",
      "light-high-contrast",
      "dark-high-contrast",
    ]);
  });

  test("declares the frozen baseline totals", () => {
    const byKind = {
      geometry: ACCEPTANCE_SET.filter((b) => b.kind === "geometry").length,
      focus: ACCEPTANCE_SET.filter((b) => b.kind === "focus").length,
      "reduced-motion": ACCEPTANCE_SET.filter((b) => b.kind === "reduced-motion").length,
      all: ACCEPTANCE_SET.length,
    };
    expect(byKind).toEqual({
      geometry: EXPECTED_TOTALS.geometry,
      focus: EXPECTED_TOTALS.focus,
      "reduced-motion": EXPECTED_TOTALS["reduced-motion"],
      all: EXPECTED_TOTALS.all,
    });
    expect(EXPECTED_TOTALS.all).toBe(176);
  });

  test("never lists a surface as excluded AND captures it", () => {
    /**
     * The check that would have caught a real defect the day it appeared.
     *
     * `EXCLUSIONS` is the stated authority for "there is no baseline for X" —
     * it exists so a reviewer can tell an excluded surface from a forgotten
     * one. When the Legend shipped, its baselines were added to this same file
     * and the exclusion below them was not revisited, so the file asserted
     * both "24 legend baselines" and "the legend has no baselines" at once.
     *
     * An entry left here after a surface ships is worse than no entry: it is a
     * confident wrong answer to the exact question the list exists to answer.
     */
    const captured = new Set(ACCEPTANCE_SET.map((b) => b.chart.toLowerCase()));
    const contradictions = EXCLUSIONS.filter((e) => captured.has(e.surface.toLowerCase()));

    expect(
      contradictions.map((e) => e.surface),
      "a surface cannot be both deliberately uncaptured and captured; remove the exclusion when the surface ships",
    ).toEqual([]);
  });

  test("gives every baseline a unique id", () => {
    const ids = ACCEPTANCE_SET.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

test.describe("the baseline files match the declaration", () => {
  test("has exactly one baseline file on disk per declared id, and no strays", () => {
    // A first run on a machine with no baselines yet is a legitimate state:
    // `--update-snapshots` is how the set is created. Enforce the inventory
    // only once a set exists, and say plainly which case applies.
    test.skip(
      !existsSync(baselinesDir),
      "no baselines directory yet — create the set with `npx playwright test -c playwright.visual.config.ts --update-snapshots`",
    );

    /*
      And skip it on any run that is WRITING the set, which is not a nicety —
      it was a deterministic false failure.

      This file sorts before `charts.spec.ts`, and the config is `workers: 1`
      with `fullyParallel: false`, so on a run that adds cases this inventory
      executes BEFORE the baselines it is looking for have been captured. It
      then reports every new id as `missing`, which reads exactly like coverage
      that silently stopped — the failure this assertion exists to catch — when
      in fact the run is seconds away from creating them.

      It cost real confusion on 2026-07-20, when reference-overlay cases were
      first pinned: it appeared alongside a genuine frozen-totals failure and was
      misdiagnosed first as a git-visibility blind spot and then as a race. It is
      neither. It is ordering, and it is deterministic.

      The inventory is only meaningful on a VERIFY run — one that compares
      against a set already on disk. `updateSnapshots` is `'none'` there and
      something else ('all', 'changed', 'missing') on a capture.
    */
    test.skip(
      test.info().config.updateSnapshots !== "none",
      "this run is writing the baseline set; the inventory is only meaningful once it is written",
    );

    const onDisk = readdirSync(baselinesDir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => f.slice(0, -".png".length))
      .sort();
    const declared = ACCEPTANCE_SET.map((b) => b.id).sort();

    const missing = declared.filter((id) => !onDisk.includes(id));
    const orphaned = onDisk.filter((id) => !declared.includes(id));

    expect(
      { missing, orphaned },
      "a declared baseline with no file is coverage that silently stopped; a file with no declaration is a baseline nothing compares against",
    ).toEqual({ missing: [], orphaned: [] });
  });
});

test.describe("the declared focus surface matches the rendered one", () => {
  /**
   * The half of the acceptance set a future feature could shrink without
   * touching this file.
   *
   * Only `LineChart` composes a keyboard surface today, so only `LineChart` has
   * a `:focus-visible` treatment to pin. Asserting that in BOTH directions is
   * what makes the omission honest: the day another chart gains a keyboard
   * composite, this fails and stays failing until a focus baseline is declared
   * for it — instead of an unproven focus indicator shipping under a green run.
   */
  for (const chart of CHARTS) {
    test(`${chart} — ${FOCUS_RATIONALE[chart]}`, async ({ page }) => {
      await page.goto(`/?chart=${chart}&case=default`);
      await page.waitForSelector("html[data-visual-ready]");

      const surfaces = page.locator("[data-silkplot-keyboard-surface]");
      await expect(surfaces).toHaveCount(FOCUSABLE[chart] ? 1 : 0);
    });
  }
});
