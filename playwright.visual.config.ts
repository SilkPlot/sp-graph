import { defineConfig } from "playwright/test";
import { fileURLToPath } from "node:url";

/**
 * The visual-regression harness — a dedicated command, deliberately separate
 * from `npm test`.
 *
 * It is its own runner and its own process for two reasons. Vitest's browser
 * mode auto-probes for a port, so a second browser runner started alongside it
 * collides — and the collision does not report as one: it reports a connect
 * timeout, executes zero tests, and finishes in about a second. Keeping the
 * screenshot suite out of the Vitest projects means the two can never be
 * started concurrently by one command. And a pixel comparison answers a
 * different question from an assertion: it fails on things nobody wrote a
 * predicate for, which is the whole point, but it also fails on things nobody
 * cares about unless determinism is engineered rather than hoped for.
 *
 * ── Everything below is determinism ────────────────────────────────────────
 *
 * An unstable screenshot gate is worse than no gate at all. It teaches people
 * that a red diff means "run it again", and once that habit exists the gate has
 * negative value: it costs time and it no longer stops anything. So each knob
 * here closes one specific source of variance.
 */
export default defineConfig({
  testDir: fileURLToPath(new URL("./test/visual", import.meta.url)),

  /**
   * Baselines live beside the suite in one flat directory, under names that
   * come from `acceptance-set.ts` rather than from test titles. A renamed test
   * therefore cannot orphan a baseline, and `acceptance-set.spec.ts` reads this
   * directory to prove there is exactly one file per declared baseline and no
   * strays.
   *
   * NOT `__screenshots__`, which is gitignored repo-wide for Vitest's failure
   * attachments — a baseline written there would never be committed, and the
   * suite would silently rewrite it as "missing" on every machine.
   */
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",

  outputDir: fileURLToPath(new URL("./test/visual/.output", import.meta.url)),

  /**
   * One worker, no parallelism. Screenshot work is memory-hungry — this class
   * of box has previously exhausted swap and killed Chromium at launch with
   * SIGTRAP, an OOM signature that reads exactly like a code defect. Serial is
   * also the only way the run is reproducible: parallel workers contend for the
   * same GPU-less raster path and give the scheduler a say in the output.
   */
  workers: 1,
  fullyParallel: false,

  /**
   * A missing baseline is a FAILURE, not something to quietly create.
   *
   * Playwright's default is `"missing"`, which writes any baseline that does not
   * exist yet and reports the test green. For a declared case with no pinned
   * image that is a self-fulfilling pass: the harness captures whatever the code
   * renders at that moment, compares it against itself, and reports success —
   * "a baseline nothing compares against", which is the exact failure the
   * inventory assertion in `acceptance-set.spec.ts` exists to name. The suite
   * would have gone green on a case nobody ever looked at.
   *
   * `"none"` makes a verify run refuse instead, so a new case is only ever
   * pinned by an explicit `--update-snapshots`, which is the deliberate act
   * `docs/visual-regression.md` requires and the baseline change log records.
   *
   * It also makes `updateSnapshots` a usable signal: it is `"none"` on a verify
   * run and `"changed"` on a capture, which is how the inventory check knows
   * not to look for files the same run has not written yet. Both values were
   * MEASURED rather than assumed — the default turned out not to be `"none"`,
   * and a guard written against that assumption skipped the check on every run
   * while looking like it worked.
   */
  updateSnapshots: "none",

  /**
   * No retries. A retry would convert an unstable baseline into a green run,
   * which is precisely the failure this harness exists to avoid — instability
   * must be visible, because the promotion criterion is measured in
   * consecutive clean runs.
   */
  retries: 0,
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "test/visual/.report", open: "never" }]]
    : [["list"]],

  expect: {
    toHaveScreenshot: {
      /**
       * Exact match. `threshold` is the per-pixel colour tolerance and
       * `maxDiffPixels` the count allowed to differ at all; both at zero means
       * a single changed pixel fails.
       *
       * This is the strict end on purpose, and it is only defensible because
       * everything else here is pinned: fixed device scale, GPU disabled,
       * subpixel text off, a named font, a frozen clock's worth of
       * deterministic data. A tolerance would have to be chosen without
       * evidence, and any tolerance large enough to absorb real jitter is also
       * large enough to absorb a one-pixel stroke regression — which is one of
       * the two probes this harness is required to catch.
       */
      threshold: 0,
      maxDiffPixels: 0,
      /**
       * Freeze CSS animations and transitions at their end state. Without it
       * the screenshot samples whatever frame the compositor happened to be on.
       *
       * The reduced-motion baselines are captured under the same freeze, so
       * they are not a proof that motion collapsed — that claim is made by a
       * computed-style assertion in `charts.spec.ts` instead, which can be
       * deterministic where a mid-flight screenshot cannot.
       */
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },

  use: {
    baseURL: "http://127.0.0.1:5199",

    /**
     * Device scale 1: a 2x scale factor doubles every baseline's size and makes
     * the antialiasing of a half-pixel stroke edge depend on the raster scale,
     * so a machine defaulting to a retina scale would disagree with a runner
     * over pixels neither of them rendered differently.
     */
    deviceScaleFactor: 1,

    /**
     * The clock's zone, not the data's. Axis tick labels are formatted by the
     * browser in its own zone, so a series built in UTC and rendered in
     * Africa/Johannesburg shifts every label — a diff that reads as a rendering
     * regression and is a timezone difference. A scale test in this repository
     * has already asserted the timezone it was written in; pinning here is that
     * lesson applied to pixels.
     */
    timezoneId: "UTC",
    locale: "en-GB",

    /** Diff artifacts only exist if the run is instrumented to keep them. */
    screenshot: "only-on-failure",
    trace: "retain-on-failure",

    launchOptions: {
      args: [
        // Software raster. GPU output varies by driver and by machine, and a
        // headless run has nothing to gain from hardware acceleration.
        "--disable-gpu",
        // Subpixel (LCD) text antialiasing samples the pixel grid in colour, so
        // identical glyphs differ per display geometry. Greyscale is stable.
        "--disable-lcd-text",
        "--disable-font-subpixel-positioning",
        // Hinting snaps glyph outlines to the pixel grid using the platform's
        // hinting engine and its version. Turning it off removes that
        // dependency; the glyphs are slightly blurrier and entirely stable.
        "--font-render-hinting=none",
        // Colour management: without an explicit profile Chromium adopts the
        // display's, so the same hex renders as different pixels.
        "--force-color-profile=srgb",
        // A scrollbar that appears only when content overflows would change the
        // viewport width for some fixtures and not others.
        "--hide-scrollbars",
      ],
    },
  },

  /**
   * The fixture app is served by Vite through the same "solid" export condition
   * the playground uses, so the baselines picture the source path a consumer
   * compiles rather than a build made for the camera.
   */
  webServer: {
    command: "npx vite --config test/visual/vite.config.ts --port 5199 --strictPort",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 120_000,
  },
});
