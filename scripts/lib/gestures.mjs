/**
 * The workload gestures, shared between the frame harness and the profiler.
 *
 * `measure-workload-frames.mjs` measures these gestures against the frozen
 * protocol; `collect-commit-profiles.mjs` attributes where their time goes.
 * The attribution is only evidence about the measurement if both drive the
 * SAME gesture — a re-implemented "roughly the same zoom" in the profiler
 * would attribute a gesture nobody measured. So the definitions live here
 * once, moved verbatim from the frame harness — the same
 * comparability rule that put the frame timer in `perf.mjs`.
 */
import { sweep } from "./perf.mjs";

/** Hold a modifier for the duration of `body`, and release it even if `body` throws. */
export async function holding(page, key, body) {
  await page.keyboard.down(key);
  try {
    await body();
  } finally {
    await page.keyboard.up(key);
  }
}

/** Repeat `step` until `ms` have elapsed, pausing `gap` ms between repetitions. */
export async function forDuration(ms, step, gap = 0) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    await step(i);
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    i++;
  }
}

/**
 * The gap between synthetic key repeats, in ms.
 *
 * ~30 per second, which is where typical operating-system key autorepeat sits
 * once the initial delay has passed. Driving the keyboard as fast as the
 * automation protocol allows instead produced ~790 presses per second — a rate
 * no human and no OS generates — and the resulting commit count (2,364 in three
 * seconds, about thirteen per frame) said more about CDP round-trip latency than
 * about the chart. A gesture measured at an impossible rate is not a
 * conservative measurement; it is a measurement of something else.
 */
export const KEY_REPEAT_GAP_MS = 33;

/**
 * Build the gesture table for one pass duration.
 *
 * A factory rather than a constant because the two consumers legitimately run
 * different pass lengths (the harness's frozen `DURATION_MS`; a profiler pass
 * may want the same or longer for sample depth) — and a gesture must never
 * close over the wrong one silently.
 */
export function gesturesFor(durationMs) {
  return {
    /** Pointer hover. On a multi-series chart this IS the shared-time inspection path. */
    hover: (page, ctx) => sweep(page, ctx.box, durationMs),

    /** Keyboard stepping — the same active-datum state the pointer writes (ADR-0016 §3). */
    keyboard: async (page, ctx) => {
      await page.locator(ctx.surface).first().focus();
      await forDuration(
        durationMs,
        (i) => page.keyboard.press(i % 40 < 20 ? "ArrowRight" : "ArrowLeft"),
        KEY_REPEAT_GAP_MS,
      );
    },

    /** `Ctrl`+wheel zoom, in and back out, so it never bottoms out on `minSpan` and idles. */
    zoom: async (page, ctx) => {
      await page.mouse.move(ctx.box.x + ctx.box.width / 2, ctx.box.y + ctx.box.height / 2);
      await holding(page, "Control", () =>
        forDuration(durationMs, (i) => page.mouse.wheel(0, i % 20 < 10 ? -120 : 120)),
      );
    },

    /**
     * Pan. `Shift`+arrow, which is the library's pan gesture.
     *
     * The protocol calls this "drag pan". The shipped pointer drag is
     * brush-to-zoom, not pan (ADR-0018), so pan is measured through the gesture
     * that exists and the drag is measured separately as `brush` below. Both paths
     * commit a viewport change, which is what the budget is about; neither is
     * omitted and neither is renamed to look like the other.
     *
     * Needs `PREPARE` (below) to zoom in first. A chart showing all of its data has
     * nowhere to pan to, so the gesture correctly commits nothing — and the pass
     * then records a flawless distribution for an idle page. The commit counters
     * caught exactly that on W-B, where `pan` ran before `zoom` in the pass order
     * and the chart was still un-navigated.
     */
    pan: async (page, ctx) => {
      await page.locator(ctx.surface).first().focus();
      await holding(page, "Shift", () =>
        forDuration(
          durationMs,
          (i) => page.keyboard.press(i % 30 < 15 ? "ArrowRight" : "ArrowLeft"),
          KEY_REPEAT_GAP_MS,
        ),
      );
    },

    /**
     * Drag-to-brush, then `0` to reset.
     *
     * The reset is part of the pass rather than a tidy-up between passes: without
     * it the second brush starts from the first one's zoom and the fifth is
     * brushing a window at `minSpan`, so the pass would measure one real brush and
     * then a lot of nothing. `0` is the shipped reset key, so this stays a
     * user-reachable path with no harness API in it.
     */
    brush: async (page, ctx) => {
      const { x, y, width, height } = ctx.box;
      await forDuration(durationMs, async () => {
        await page.mouse.move(x + width * 0.3, y + height / 2);
        await page.mouse.down();
        for (let s = 1; s <= 8; s++) {
          await page.mouse.move(x + width * (0.3 + 0.05 * s), y + height / 2);
        }
        await page.mouse.up();
        await page.keyboard.press("0");
      });
    },

    /** Drag the range control's end thumb back and forth. */
    rangeDrag: async (page, ctx) => {
      const thumb = page.locator(ctx.range).last();
      const box = await thumb.boundingBox();
      if (!box) throw new Error(`no range-control thumb at ${ctx.range}`);
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      await forDuration(durationMs, (i) => {
        const phase = (Math.sin(i / 12) + 1) / 2;
        return page.mouse.move(box.x + box.width / 2 - phase * 240, y);
      });
      await page.mouse.up();
    },

    /** Legend toggles, one series at a time — the commit a legend click produces. */
    legend: (page) =>
      forDuration(durationMs, async () => {
        await page.evaluate(() => window.__perf?.legendToggle?.());
        await page.waitForTimeout(60);
      }),

    /** Isolate: twenty-one series leaving the domain at once, and coming back. */
    isolate: (page) =>
      forDuration(durationMs, async () => {
        await page.evaluate(() => window.__perf?.isolate?.());
        await page.waitForTimeout(120);
      }),
  };
}

/**
 * Set-up a gesture needs BEFORE recording starts, so its cost is not measured.
 *
 * Only `pan` needs one, and the reason is a real property of the library rather
 * than a harness quirk: under the dirty-flag engage model a chart tracks its full
 * data until the user navigates, and a chart showing everything cannot be panned.
 * Zooming in first is what a user does before panning, so the pass measures a pan
 * instead of measuring nothing.
 */
export const PREPARE = {
  pan: async (page, ctx) => {
    await page.mouse.move(ctx.box.x + ctx.box.width / 2, ctx.box.y + ctx.box.height / 2);
    await holding(page, "Control", async () => {
      for (let s = 0; s < 5; s++) await page.mouse.wheel(0, -120);
    });
    await page.waitForTimeout(300);
  },
};
