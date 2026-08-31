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

/** Select a retained quantile without applying display rounding. */
export const rawQuantile = (values, quantile) => {
  if (!Array.isArray(values) || values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
};

/** Exact gate inputs, derived from retained raw frames. */
export const interactionTiming = (distribution) => ({
  rawP95: rawQuantile(distribution.frameDeltas, 0.95),
  exactDroppedPct: (distribution.dropped / distribution.frames) * 100,
});

/** Frozen viewport and device scale factor. A frame number without these is not comparable to anything. */
export const VIEWPORT = { width: 1200, height: 900 };
export const DEVICE_SCALE_FACTOR = 1;
export const FROZEN_PAGE_OPTIONS = {
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
};

/** The binding CPU throttle. 6/10/20 are supplementary and never the pass gate. */
export const BINDING_RATE = 4;

/** The control's deliberate cost per frame — far past the budget, so a working timer cannot miss it. */
export const CONTROL_BURN_MS = 30;

/** The independently named interaction distributions each workload records. */
export const PROTOCOL_PASSES = Object.freeze({
	"w-a": Object.freeze([
		"hover",
		"keyboard",
		"zoom",
		"pan",
		"brush",
		"rangeDrag",
		"reset",
	]),
  "w-b": Object.freeze(["hover", "legend", "isolate", "pan", "zoom", "brush", "reset"]),
  "w-c": Object.freeze(["hover"]),
  "w-d": Object.freeze(["hover", "keyboard", "zoom"]),
});

const INTERACTION_COMMIT_KIND = Object.freeze({
  hover: "active",
  keyboard: "active",
  zoom: "viewport",
  pan: "viewport",
  brush: "viewport",
  rangeDrag: "viewport",
  reset: "reset",
  legend: "visibility",
  isolate: "visibility",
});

/** Derive reachability from the state kind the named interaction must change. */
export function interactionCommitEvidence(name, before, after) {
  const required = INTERACTION_COMMIT_KIND[name];
  if (required === undefined) throw new Error(`unknown interaction '${name}'`);
  const commits = {
    viewport: (after?.viewport ?? 0) - (before?.viewport ?? 0),
    active: (after?.active ?? 0) - (before?.active ?? 0),
    reset: (after?.reset ?? 0) - (before?.reset ?? 0),
    visibility: (after?.visibility ?? 0) - (before?.visibility ?? 0),
  };
  const reached = commits[required];
  return { commits, inert: reached === 0 };
}

/**
 * Judge a settle without turning a trigger that did nothing into a fast result.
 * Only replacement and the 48-chart resize have a frozen 1000ms timing gate;
 * every other settle still has to change the page on every recorded attempt.
 */
export function settleVerdict(workload, name, stats, gateMs = 1000) {
  const gated =
    (workload === "w-a" && name === "replace") ||
    (workload === "w-c" && name === "resize");
  if ((stats.timeouts ?? 0) > 0) {
    return {
      criterion: `${name} reached quiet on every attempt`,
      pass: false,
      detail: `${stats.timeouts} trigger(s) continued mutating through the settle timeout`,
    };
  }
  if (stats.samples === 0 || stats.noChange > 0) {
    return {
      criterion: `${name} changed on every attempt`,
      pass: false,
      detail: `${stats.noChange} trigger(s) mutated nothing within the settle window`,
    };
  }
  if (!gated) {
    return {
      criterion: `${name} changed on every attempt`,
      pass: true,
      detail: `${stats.samples} of ${stats.samples} trigger(s) changed the page`,
    };
  }
  return {
    criterion: `${name} settles within ${gateMs}ms p95`,
    pass: rawQuantile(stats.rawSamples, 0.95) <= gateMs,
    detail: `p95 ${stats.p95}ms over ${stats.samples} samples`,
  };
}

/** Extract the required positive heap metric without inventing a zero reading. */
export function requiredHeapBytes(metrics) {
  const value = metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value;
  if (!Number.isFinite(value)) {
    throw new Error("CDP did not report the required JSHeapUsedSize metric");
  }
  if (value <= 0) {
    throw new Error("CDP JSHeapUsedSize must be a positive byte reading");
  }
  return value;
}

/** Read a `--flag value` argument. */
export const arg = (argv, name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

/** Refuse to measure content that was not served by this runner invocation. */
export function assertServerIdentity(expected, actual) {
	if (expected == null) return;
	if (actual !== expected) {
		throw new Error(
			`workload server identity mismatch: expected '${expected}', received '${actual || "unreported"}'`,
		);
	}
}

/**
 * Run one interaction against a newly opened workload surface and always close
 * it. Stateful passes must not lend their visibility or viewport scale to the
 * pass that follows.
 */
export async function withFreshInteractionSurface(open, run) {
	const surface = await open();
	try {
		return await run(surface);
	} finally {
		await surface.page.close();
	}
}

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
    return {
      frameDeltas: [...xs],
      frames: 0,
      p50: 0,
      p95: 0,
      max: 0,
      overBudget: 0,
      pctOver: 0,
      dropped: 0,
      pctDropped: 0,
    };
  }
  const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  const over = s.filter((d) => d > ACCEPTANCE_MS).length;
  const dropped = s.filter((d) => d > DROPPED_MS).length;
  return {
    frameDeltas: [...xs],
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
  page.evaluate(
    () =>
      new Promise((resolve) => {
        globalThis.__frames = [];
        globalThis.__recordingClosing = false;
        requestAnimationFrame((armedAt) => {
          let last = armedAt;
          const tick = (now) => {
            globalThis.__frames.push(now - last);
            last = now;
            if (!globalThis.__recordingClosing) {
              globalThis.__raf = requestAnimationFrame(tick);
            }
          };
          globalThis.__raf = requestAnimationFrame(tick);
          resolve();
        });
      }),
  );

/** Close on the next rAF so final interaction work cannot escape the trace. */
export const stopRecording = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        globalThis.__recordingClosing = true;
        requestAnimationFrame(() => resolve([...globalThis.__frames]));
      }),
  );

/** The frozen idle recording discarded after setup and before an interaction. */
export async function discardedWarmup(page) {
	await startRecording(page);
	await page.waitForTimeout(WARMUP_MS);
	await stopRecording(page);
}

/**
 * Drive the pointer back and forth across a box for `ms`.
 *
 * A smooth sinusoidal reversal rather than a straight sweep, so the pointer
 * spends time in the middle of the surface as well as at its edges and never
 * leaves it — a pass that wandered off the chart would measure the frames of a
 * chart with nothing active, which is the idle case with extra steps.
 */
const directAction = (_kind, action) => action();

export async function sweep(page, box, ms, runAction = directAction) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    const phase = (Math.sin(i / 18) + 1) / 2; // 0..1, smooth reversal
    await runAction("pointermove", () =>
      page.mouse.move(
        box.x + 6 + phase * (box.width - 12),
        box.y + box.height * (0.35 + 0.3 * phase),
      ),
    );
    i++;
  }
}

/** Retain the complete timing of every resolved driver input in one pass. */
export function createInputActivityRecorder(gesture, now = () => performance.now()) {
  const origin = now();
  const actions = [];
  const elapsed = () => +(now() - origin).toFixed(3);
  return {
    run: async (kind, action) => {
      const startedMs = elapsed();
      const value = await action();
      actions.push({
        index: actions.length,
        kind,
        startedMs,
        endedMs: elapsed(),
      });
      return value;
    },
    finish: () => {
      const durationMs = elapsed();
      const firstStartedMs = actions[0]?.startedMs ?? null;
      const lastEndedMs = actions.at(-1)?.endedMs ?? null;
      const idleGaps = actions.map((action, index) =>
        index === 0
          ? action.startedMs
          : action.startedMs - actions[index - 1].endedMs,
      );
      if (lastEndedMs !== null) idleGaps.push(durationMs - lastEndedMs);
      return {
        gesture,
        durationMs,
        count: actions.length,
        firstStartedMs,
        lastEndedMs,
        maxIdleGapMs:
          idleGaps.length === 0 ? durationMs : +Math.max(...idleGaps).toFixed(3),
        actions,
      };
    },
  };
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
  rawQuantile(control.frameDeltas, 0.95) >
    rawQuantile(baseline.frameDeltas, 0.95) * 1.5 &&
  rawQuantile(control.frameDeltas, 0.95) > ACCEPTANCE_MS;

/**
 * Whether one interactive frame distribution breaches the frozen gate.
 *
 * The protocol has two independent limits: p95 and dropped-frame percentage.
 * A regression that breaches either one must make the mutation self-check go
 * red. Keeping that rule here lets clean-pass judging and the self-check share
 * the same thresholds instead of reducing "the gate" to whichever number a
 * caller happened to inspect.
 */
export const interactionGateBreached = (distribution) => {
  const timing = interactionTiming(distribution);
  return (
    timing.rawP95 > ACCEPTANCE_MS ||
    timing.exactDroppedPct > DROPPED_GATE_PCT
  );
};

/**
 * The frozen discrimination mode for each workload.
 *
 * `w-d` is the only workload dense enough to prove discrimination by timing. It
 * was not the only one until 2026-08-15: `w-a` was assigned dense timing at the
 * same time, on the reasoning that 20,000 points is dense, and no scored run
 * could test that reasoning until the pointer-scope window was repaired and the
 * mutation started applying at all.
 *
 * The first run that could measure it says otherwise. `w-a`'s mutation applies
 * exactly — 89/89 and 91/91 pointer events carrying one injected rebuild, one
 * layout read and one production-builder call — and costs p95 16.8ms against a
 * 17.7ms gate. `w-d`'s identical mutation over 86,400 points costs 216.7ms. A
 * 4.3x point count separates them by more than 12x in time, and `w-a` lands
 * under the gate, so a faithful mutation there proves nothing by timing.
 *
 * The alternative was to grow `w-a`'s mutation until it breached, and
 * `test/perf/app/instrument.ts` forbids exactly that: the size of the injected
 * work is set by what the library does, not by the verdict it needs to produce.
 * So `w-a` proves discrimination the way `w-b` and `w-c` do — by exact
 * structure, which it already satisfies — and the timing claim it can honestly
 * make is the clean-pass one it already makes.
 */
export function mutationProofMode(workload) {
  if (workload === "w-d") return "dense-timing";
  if (workload === "w-a" || workload === "w-b" || workload === "w-c") {
    return "light-structural";
  }
  throw new Error(`unknown mutation-proof workload '${workload}'`);
}

const normalizeMutationCounts = (counts) => ({
  pointerEvents: Number(counts.pointerEvents ?? 0),
  injectedRebuilds: Number(counts.injectedRebuilds ?? 0),
  injectedRebuildsInPointer: Number(counts.injectedRebuildsInPointer ?? 0),
  layoutReadsInPointer: Number(counts.layoutReadsInPointer ?? 0),
  productionIndexBuildsInPointer: Number(counts.productionIndexBuildsInPointer ?? 0),
  pointerEventsWithOneInjectedRebuild: Number(
    counts.pointerEventsWithOneInjectedRebuild ?? 0,
  ),
  pointerEventsWithOneLayoutRead: Number(counts.pointerEventsWithOneLayoutRead ?? 0),
  pointerEventsWithOneProductionIndexBuild: Number(
    counts.pointerEventsWithOneProductionIndexBuild ?? 0,
  ),
});

function mutationApplicationFailures(counts) {
  const events = counts.pointerEvents;
  if (events < 1) {
    return ["observed 0 pointer events; at least one mutated event is required"];
  }

  const failureReasons = [];
  if (
    counts.injectedRebuilds !== events ||
    counts.injectedRebuildsInPointer !== events ||
    counts.pointerEventsWithOneInjectedRebuild !== events
  ) {
    failureReasons.push(
      `injected rebuilds were ${counts.injectedRebuilds} total / ${counts.injectedRebuildsInPointer} in pointer scope, with ${counts.pointerEventsWithOneInjectedRebuild}/${events} events carrying exactly one; expected ${events} / ${events} and ${events}/${events}`,
    );
  }
  if (
    counts.layoutReadsInPointer !== events ||
    counts.pointerEventsWithOneLayoutRead !== events
  ) {
    failureReasons.push(
      `deliberately injected layout reads were ${counts.layoutReadsInPointer}, with ${counts.pointerEventsWithOneLayoutRead}/${events} events carrying exactly one; expected ${events} and ${events}/${events}`,
    );
  }
  if (
    counts.productionIndexBuildsInPointer !== events ||
    counts.pointerEventsWithOneProductionIndexBuild !== events
  ) {
    failureReasons.push(
      `actual production-builder calls were ${counts.productionIndexBuildsInPointer}, with ${counts.pointerEventsWithOneProductionIndexBuild}/${events} events carrying exactly one; expected ${events} and ${events}/${events}`,
    );
  }
  return failureReasons;
}

/**
 * Judge the per-event production-index mutation without running a workload.
 *
 * Exact per-event structure is required in both modes. Dense workloads then
 * also have to breach either strict timing boundary; light workloads finish on
 * the structural proof, even when the mutated timing remains fast.
 */
export function evaluateMutationProof({ workload, distribution, counts }) {
  const mode = mutationProofMode(workload);
  const normalized = normalizeMutationCounts(counts);
  const failureReasons = mutationApplicationFailures(normalized);

  const exactApplication = failureReasons.length === 0;
  const timingBreached = interactionGateBreached(distribution);
  if (exactApplication && mode === "dense-timing" && !timingBreached) {
    failureReasons.push(
      `dense timing stayed inside the inclusive clean limits: p95 ${distribution.p95}ms <= ${ACCEPTANCE_MS.toFixed(1)}ms and dropped ${distribution.pctDropped}% <= ${DROPPED_GATE_PCT}%; require p95 > ${ACCEPTANCE_MS.toFixed(1)}ms OR dropped > ${DROPPED_GATE_PCT}%`,
    );
  }

  return {
    mode,
    pass: failureReasons.length === 0,
    exactApplication,
    timingBreached,
    counts: normalized,
    failureReason: failureReasons.length === 0 ? null : failureReasons.join("; "),
    failureReasons,
  };
}

/** Direct clean-path criterion for the production builder inside pointer scope. */
export function evaluateCleanIndexBuildInvariant(reading) {
  const pointerEvents = Number(reading?.pointerEvents ?? 0);
  const observed = Number.isFinite(reading?.productionIndexBuildsInPointer);
  const productionIndexBuildsInPointer = observed
    ? Number(reading.productionIndexBuildsInPointer)
    : 0;
  const pass = observed && pointerEvents > 0 && productionIndexBuildsInPointer === 0;
  let failureReason = null;
  if (!observed) {
    failureReason = "actual production-builder observation is missing from the clean invariant reading";
  } else if (pointerEvents <= 0) {
    failureReason = "observed 0 clean pointer events; the clean-path index check did not run";
  } else if (!pass) {
    failureReason = `observed ${productionIndexBuildsInPointer} actual production-builder call(s) inside ${pointerEvents} clean pointer event(s); expected 0`;
  }
  return {
    pass,
    pointerEvents,
    productionIndexBuildsInPointer,
    failureReason,
  };
}

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
