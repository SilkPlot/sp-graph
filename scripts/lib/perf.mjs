/**
 * The shared frame-measurement primitives.
 *
 * Two harnesses measure frames in this repository — the hover harness
 * (`scripts/measure-hover-frames.mjs`) and the workload harness
 * (`scripts/measure-workload-frames.mjs`) — and they have to be comparable. A
 * p95 from one is quoted beside a p95 from the other in the same results
 * appendix, so if each carried its own timer, its own percentile function, or
 * its own idea of what "over budget" means, a difference between two numbers
 * could be a difference between two definitions and nobody would be able to tell
 * which. The definitions live here once.
 *
 * Every constant below is the frozen protocol's, not a preference. Change one
 * and you have changed what a recorded measurement means, which invalidates the
 * appendix rather than improving it — so the protocol is the thing to amend
 * first, and this file second.
 */

/** The interactive target. Not a measurement; the thing measurements are judged against. */
export const BUDGET_MS = 16.7;

/**
 * Timer and display jitter, declared BEFORE measuring rather than fitted after.
 *
 * A rAF delta is not a pure measure of the work in the frame: the callback is
 * scheduled against the display's refresh, so a frame that finished inside the
 * budget can still report a delta a fraction past it. One millisecond covers
 * that without covering a real stutter — a frame a user notices is tens of
 * milliseconds late, not one.
 *
 * It is reported alongside the nominal budget everywhere, so a pass is never
 * quotable as "hits 16.7ms" when what it hit was 17.7ms.
 */
export const TIMER_TOLERANCE_MS = 1.0;

/** The acceptance line: nominal budget plus the declared tolerance. */
export const ACCEPTANCE_MS = BUDGET_MS + TIMER_TOLERANCE_MS;

/**
 * Two budgets. A frame past this has certainly dropped one — no tolerance
 * argument reaches 33.4ms — so this is the threshold for "dropped", counted
 * separately from "over the acceptance line" because they answer different
 * questions: how often is it late, versus how often does it visibly stutter.
 */
export const DROPPED_MS = 33.4;

/** At most 1% of frames may be dropped. */
export const DROPPED_GATE_PCT = 1;

/** Discarded before every pass — the first frames after a navigation are not the steady state. */
export const WARMUP_MS = 1000;

/** One interaction pass. Long enough for a p95 to mean something, short enough to run four workloads. */
export const DURATION_MS = 3000;

/** Frozen viewport and device scale factor. A frame number without these is not comparable to anything. */
export const VIEWPORT = { width: 1200, height: 900 };
export const DEVICE_SCALE_FACTOR = 1;

/** The binding CPU throttle. 6/10/20 are supplementary and never the pass gate. */
export const BINDING_RATE = 4;

/** The control's deliberate cost per frame — far past the budget, so a working timer cannot miss it. */
export const CONTROL_BURN_MS = 30;

/** Read a `--flag value` argument. */
export const arg = (argv, name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

/** Whether a bare `--flag` is present. */
export const flag = (argv, name) => argv.includes(`--${name}`);

/**
 * The distribution, never the mean.
 *
 * A mean hides exactly the stutter a user notices: one 60ms frame in an
 * otherwise smooth second moves a mean by under a millisecond and is the only
 * thing in that second anybody saw. p95 and max are the numbers that answer
 * "does this feel smooth", so those are the numbers reported.
 */
export const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) {
    return { frames: 0, p50: 0, p95: 0, max: 0, overBudget: 0, pctOver: 0, dropped: 0, pctDropped: 0 };
  }
  const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  const over = s.filter((d) => d > ACCEPTANCE_MS).length;
  const dropped = s.filter((d) => d > DROPPED_MS).length;
  return {
    frames: s.length,
    p50: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    max: +s[s.length - 1].toFixed(2),
    overBudget: over,
    pctOver: +((over / s.length) * 100).toFixed(1),
    dropped,
    pctDropped: +((dropped / s.length) * 100).toFixed(2),
  };
};

/** Start the in-page rAF frame recorder. */
export const startRecording = (page) =>
  page.evaluate(() => {
    globalThis.__frames = [];
    let last = performance.now();
    const tick = (now) => {
      globalThis.__frames.push(now - last);
      last = now;
      globalThis.__raf = requestAnimationFrame(tick);
    };
    globalThis.__raf = requestAnimationFrame(tick);
  });

/** Stop it and return the deltas, less the first. */
export const stopRecording = (page) =>
  page.evaluate(() => {
    cancelAnimationFrame(globalThis.__raf);
    // Drop the first frame: it carries the gap since recording started, not work.
    return globalThis.__frames.slice(1);
  });

/**
 * Drive the pointer back and forth across a box for `ms`.
 *
 * A smooth sinusoidal reversal rather than a straight sweep, so the pointer
 * spends time in the middle of the surface as well as at its edges and never
 * leaves it — a pass that wandered off the chart would measure the frames of a
 * chart with nothing active, which is the idle case with extra steps.
 */
export async function sweep(page, box, ms) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    const phase = (Math.sin(i / 18) + 1) / 2; // 0..1, smooth reversal
    await page.mouse.move(
      box.x + 6 + phase * (box.width - 12),
      box.y + box.height * (0.35 + 0.3 * phase),
    );
    i++;
  }
}

/** Begin burning `CONTROL_BURN_MS` per frame. */
export const startBurn = (page) =>
  page.evaluate((burnMs) => {
    globalThis.__burn = () => {
      const end = performance.now() + burnMs;
      while (performance.now() < end) {
        /* deliberately block the frame */
      }
      globalThis.__burnRaf = requestAnimationFrame(globalThis.__burn);
    };
    globalThis.__burnRaf = requestAnimationFrame(globalThis.__burn);
  }, CONTROL_BURN_MS);

/** Stop burning. */
export const stopBurn = (page) =>
  page.evaluate(() => cancelAnimationFrame(globalThis.__burnRaf));

/**
 * Did the control pass degrade enough to prove the timer can see a slow frame?
 *
 * Both halves are required. Past the acceptance line alone is not enough — a
 * measurement pass already sitting at the line would satisfy it without the
 * control having done anything. Well clear of the baseline alone is not enough
 * either, on a workload whose own p95 is already tiny. Together they say the
 * timer moved, a lot, because 30ms of work was added.
 *
 * ---------------------------------------------------------------------------
 * The baseline is the IDLE pass, not the interaction pass
 * ---------------------------------------------------------------------------
 * This compared the control against the measured INTERACTION until 2026-07-23,
 * which is fine while the interaction is near-idle — as hover on a 30-point
 * fixture is — and silently inverts when it is not. On the 86,400-point density
 * workload, hover itself ran at 100ms p95 while the control ran at 66.7ms, so
 * the control was "not degraded" and the whole run ABORTED as untrustworthy.
 * The timer was fine; the comparison was wrong.
 *
 * Idle is the correct reference because of what this check actually asks: not
 * "is the control worse than the work", but "does the clock move when 30ms of
 * work is added to a frame". Idle is the only pass where nothing else is
 * varying, so it is the only honest zero.
 */
export const controlDegraded = (baseline, control) =>
  control.p95 > baseline.p95 * 1.5 && control.p95 > ACCEPTANCE_MS;

/** One fixed-width report line. */
export const row = (name, s) =>
  `${name.padEnd(26)} frames=${String(s.frames).padStart(4)}  p50=${String(s.p50).padStart(6)}ms  ` +
  `p95=${String(s.p95).padStart(6)}ms  max=${String(s.max).padStart(7)}ms  ` +
  `over=${String(s.pctOver).padStart(5)}%  dropped=${String(s.pctDropped).padStart(5)}%`;

/** The header every harness prints, so two runs are comparable at a glance. */
export const conditionsLine = (rate, url, extra = "") =>
  `CPU throttle: ${rate}x · viewport: ${VIEWPORT.width}x${VIEWPORT.height} @${DEVICE_SCALE_FACTOR}x · ` +
  `nominal budget: ${BUDGET_MS}ms · tolerance: ${TIMER_TOLERANCE_MS.toFixed(1)}ms · ` +
  `acceptance: ${ACCEPTANCE_MS.toFixed(1)}ms · dropped >${DROPPED_MS}ms · url: ${url}${extra}`;
