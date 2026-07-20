/**
 * The baseline capture suite.
 *
 * Every test here is generated from `ACCEPTANCE_SET`. Nothing is written out by
 * hand, so a baseline cannot exist for a case the acceptance set does not
 * declare, and a declared case cannot be missing a test.
 */
import { expect, test, type Browser, type Page } from "playwright/test";
import {
  ACCEPTANCE_SET,
  THEME_EMULATION,
  type Baseline,
} from "./acceptance-set";

/**
 * Contexts are built per test rather than through `test.use`, because scheme,
 * contrast, reduced motion and viewport all vary per baseline and `use` takes
 * static values. Every option that affects a pixel is therefore stated here
 * explicitly — including the ones the config also sets, since
 * `browser.newContext` does not inherit them.
 */
const openFixture = async (browser: Browser, baseline: Baseline): Promise<Page> => {
  const emulation = THEME_EMULATION[baseline.theme];
  const context = await browser.newContext({
    viewport: baseline.viewport,
    deviceScaleFactor: 1,
    timezoneId: "UTC",
    locale: "en-GB",
    colorScheme: emulation.colorScheme,
    contrast: emulation.contrast,
    reducedMotion: baseline.reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  await page.goto(
    `/?chart=${baseline.chart}&case=${encodeURIComponent(baseline.case)}`,
  );

  // The fixture sets this only after `ChartRoot`'s ResizeObserver measurement
  // has landed. Screenshotting before it captures the zero-size first frame.
  await page.waitForSelector("html[data-visual-ready]");

  // A glyph rendered before its face has loaded is drawn in the fallback and
  // reflows on swap, which is a one-frame difference that lands in a baseline.
  await page.evaluate(() => document.fonts.ready);

  return page;
};

/**
 * What receives focus on the first Tab, per surface.
 *
 * A chart's is its keyboard composite; the legend's is its first toolbar entry,
 * because the legend IS a roving-tabindex toolbar and has no composite element
 * of its own. Selecting the wrong one would report "not focused" and read as a
 * broken focus model rather than a wrong selector.
 */
const focusTarget = (baseline: Baseline): string =>
  baseline.chart === "legend"
    ? "button[data-sp-legend-item][tabindex='0']"
    : "[data-silkplot-keyboard-surface]";

for (const baseline of ACCEPTANCE_SET) {
  test(baseline.id, async ({ browser }) => {
    const page = await openFixture(browser, baseline);
    const target = page.locator("[data-visual-target]");

    if (baseline.focus) {
      // A real Tab press, not `.focus()`. Chromium matches `:focus-visible`
      // only for keyboard focus, so a programmatic focus would capture a
      // baseline of the wrong pseudo-class — a picture with no ring in it,
      // pinned as though it were correct.
      await page.keyboard.press("Tab");

      await expect(page.locator(focusTarget(baseline))).toBeFocused();
    }

    if (baseline.reducedMotion) {
      // Screenshots are captured with animations frozen, so a still frame
      // cannot prove that authored motion collapsed — it looks identical either
      // way. The claim is made here instead, on the resolved tokens, where it
      // is deterministic.
      const motion = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return ["fast", "base", "slow"].map((k) =>
          style.getPropertyValue(`--sp-motion-${k}`).trim(),
        );
      });
      expect(motion).toEqual(["0ms", "0ms", "0ms"]);
    }

    await expect(target).toHaveScreenshot(`${baseline.id}.png`);

    if (baseline.focus) {
      // A control, and deliberately AFTER the comparison above.
      //
      // An invisible focus ring and a browser that rendered nothing produce the
      // same screenshot, so the pixels alone cannot say the ring was there. In
      // an ordinary run the comparison fails first, which is what proves the
      // PIXEL gate catches a removed indicator. This assertion covers the one
      // path where that gate cannot fail by construction: under
      // `--update-snapshots` the screenshot is written rather than compared, so
      // without this check a ringless baseline could be pinned as correct and
      // every later run would agree with it.
      const outlineWidth = await page
        .locator(focusTarget(baseline))
        .evaluate((el) => getComputedStyle(el).outlineWidth);
      expect(Number.parseFloat(outlineWidth)).toBeGreaterThanOrEqual(2);
    }

    await page.context().close();
  });
}
