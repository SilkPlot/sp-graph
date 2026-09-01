/**
 * Drive the four binding workloads against the frozen performance protocol.
 *
 * This is the CODE half of representative performance profiling. The other half
 * is a run on named reference hardware, and this script deliberately cannot do
 * that half: it records what it measured on whatever machine invoked it, and the
 * protocol's results appendix is where a run on a named machine is written down.
 * A number produced anywhere else is a number about that machine.
 *
 *   npm run dev:perf                      # in one terminal
 *   npm run perf:workload                 # all four workloads
 *   npm run perf:workload -- --workload w-d --json /tmp/w-d.json
 *
 * What it measures, per workload: a warm-up that is discarded, an idle baseline,
 * every interaction the protocol names for that workload as a real gesture, the
 * settle times it names, and the two self-checks that decide whether any of it
 * counts.
 *
 * ---------------------------------------------------------------------------
 * The two self-checks, and why a green run without them is worthless
 * ---------------------------------------------------------------------------
 * 1. The +30ms CONTROL asks "can this timer see a slow frame?". If a deliberate
 *    30ms of work per frame does not move the distribution, the timer is broken
 *    and every other number in the run is decoration. The run ABORTS.
 *
 * 2. The per-event INDEX-REBUILD mutation asks whether the workload can detect
 *    the forbidden operation. Every workload must first prove the exact same
 *    structure: one injected rebuild, one injected layout read, and one observed
 *    actual production-builder call on every pointer event. W-D then uses dense
 *    timing discrimination; W-A, W-B and W-C use that exact structural proof.
 *
 * Both mutations assert they were APPLIED before their result is trusted — the
 * detection probes' rule, learned the same way. A mutation that silently failed
 * to apply reports a clean pass and proves nothing.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  appendBrowserProcessSnapshot,
  browserSurfacePlan,
  inspectBrowserProcesses,
  inspectBrowserSurface,
  inspectDisplaySurface,
} from "./lib/browser-surface.mjs";
import {
  ACCEPTANCE_MS,
  BINDING_RATE,
  BUDGET_MS,
  CONTROL_BURN_MS,
  DEVICE_SCALE_FACTOR,
  DROPPED_GATE_PCT,
  DROPPED_MS,
  DURATION_MS,
  FROZEN_PAGE_OPTIONS,
  PROTOCOL_PASSES,
  TIMER_TOLERANCE_MS,
  VIEWPORT,
  WARMUP_MS,
  arg,
	assertServerIdentity,
  conditionsLine,
  controlDegraded,
	createInputActivityRecorder,
	discardedWarmup,
  evaluateCleanIndexBuildInvariant,
  evaluateMutationProof,
  interactionCommitEvidence,
	interactionTiming,
  row,
  settleVerdict,
  requiredHeapBytes,
  startBurn,
  startRecording,
  stats,
  stopBurn,
  stopRecording,
  sweep,
	withFreshInteractionSurface,
} from "./lib/perf.mjs";
import {
  COMPOSITION_DIGEST,
  COMPOSITION_MANIFEST,
  CURRENT_COMPOSITION_IDENTITY,
  DEFAULT_SURFACE_FAILURE,
  REVISION_FAILURE,
  evaluateHostArtifact,
  evaluatePageRevision,
  resultTableMode,
  tableModeFromQuery,
  tableModeRole,
  timingVerdictsEligibleForResult,
} from "../test/perf/app/composition-revision.ts";
import { KEY_REPEAT_GAP_MS, PREPARE, forDuration, gesturesFor, holding } from "./lib/gestures.mjs";

const URL_BASE = arg(process.argv, "url", "http://127.0.0.1:5175");
const RATE = Number(arg(process.argv, "rate", String(BINDING_RATE)));
const JSON_OUT = arg(process.argv, "json", undefined);
const EXPECTED_SERVER_TOKEN = arg(process.argv, "server-token", undefined);
const BROWSER_PLAN = (() => {
  try {
    return browserSurfacePlan(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
})();
const REQUESTED = arg(process.argv, "workload", "w-a,w-b,w-c,w-d")
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);

/**
 * Which data-table configurations to run: `both` (the default), `derived`, or
 * `none`.
 *
 * `both` by default because the protocol requires frame cost to be ATTRIBUTED,
 * not merely reported. The derived accessible table follows data scope, so
 * viewport commits do not narrow or rebuild it. Running the same marks with the
 * table present and with caller-supplied empty rows attributes the table's
 * presence; one configuration alone folds that standing cost invisibly into the
 * chart's result.
 *
 * The flag exists so an operator can halve a long run when they already know
 * which half they need — not so `both` can be skipped by default. A `none`-only
 * or `derived`-only run is a partial exercise of this revision: timing verdicts
 * stay ineligible until every required cell has been run. `table=none` never
 * satisfies the default-surface acceptance line on its own.
 */
const TABLE_MODES = (() => {
  const choice = arg(process.argv, "table", "both");
  return choice === "both" ? ["derived", "none"] : [choice];
})();

/** Settle repetitions, for a p95 rather than a single sample. */
const SETTLE_REPEATS = 10;
/** The protocol's settle gate for a replacement and for the 48-chart resize. */
const SETTLE_GATE_MS = 1000;
/** Shorter than a full pass: enough events to read a counter, short enough not to dominate the run. */
const INVARIANT_MS = 1500;

let browserSurfaceEvidence;

async function captureBrowserProcesses(browser) {
  if (!browserSurfaceEvidence) return;
  const snapshot = await inspectBrowserProcesses(browser);
  appendBrowserProcessSnapshot(browserSurfaceEvidence, snapshot);
  return snapshot;
}

async function captureBrowserPage(browser, page, context) {
  const before = await captureBrowserProcesses(browser);
  const browserPid = before?.processes.find(
    (process) => process.type === "browser",
  )?.pid;
  browserSurfaceEvidence.displaySnapshots.push(
    await inspectDisplaySurface(page, 120, context, {
      mode: browserSurfaceEvidence.requestedMode,
      browserPid,
    }),
  );
  await captureBrowserProcesses(browser);
}

async function finalizeBrowserSurface(browser) {
  const page = await browser.newPage(FROZEN_PAGE_OPTIONS);
  try {
    await page.goto("data:text/html,<canvas></canvas>");
    await captureBrowserPage(browser, page, "probe-final");
    browserSurfaceEvidence.displayFinal =
      browserSurfaceEvidence.displaySnapshots.at(-1);
  } finally {
    await page.close();
  }
}

const percentile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : +s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(1);
};

/* -------------------------------------------------------------------------- */
/* Gestures — real input, never a shortcut to the resulting state.             */
/* Shared with the commit profiler (`scripts/lib/gestures.mjs`), so what gets  */
/* attributed is the gesture that was measured, not a re-implementation.       */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Instrument readings                                                         */
/* -------------------------------------------------------------------------- */

/** Forced GC, then the JS heap in bytes. */
async function heapBytes(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  return requiredHeapBytes(metrics);
}

/**
 * Repeat a settling trigger and report its distribution.
 *
 * A distribution rather than one sample, because the first settle after a
 * navigation is not like the tenth — caches are cold, the JIT has not seen the
 * path, and a single reading of a 20,000-value replacement would be a reading of
 * the first one. `argAt` supplies each repetition's argument, so a resize can
 * alternate widths instead of resizing to the width it is already at.
 */
async function settleSeries(page, call, repeats = SETTLE_REPEATS, argAt = (i) => i, before) {
  const samples = [];
  const attempts = [];
  let noChange = 0;
  let timeouts = 0;
  for (let i = 0; i < repeats; i++) {
    // `before` puts the page into the state the trigger is supposed to change.
    // Measuring a settle from a state where the trigger is a no-op reports 0ms,
    // which reads as "instantaneous" and means "nothing happened".
    if (before) await before(i);
    const argument = argAt(i);
    const ms = await page.evaluate(call, argument);
    if (typeof ms !== "number") {
      attempts.push({ index: i, argument, outcome: "invalid", value: ms ?? null });
      continue;
    }
    // -1 is the page's NO_CHANGE: the trigger mutated nothing at all. Averaging
    // it in as a zero would turn a dead trigger into a fast one.
    if (ms === -2) {
      timeouts++;
      attempts.push({ index: i, argument, outcome: "timeout", value: ms });
    } else if (ms < 0) {
      noChange++;
      attempts.push({ index: i, argument, outcome: "no-change", value: ms });
    } else {
      samples.push(ms);
      attempts.push({ index: i, argument, outcome: "settled", ms });
    }
  }
  return {
    samples: samples.length,
    rawSamples: samples,
    attempts,
    noChange,
    timeouts,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: samples.length ? +Math.max(...samples).toFixed(1) : 0,
  };
}

/**
 * Commits per frame and layout reads inside pointer dispatch.
 *
 * Its own short pass, not folded into the frame measurements, because watching
 * patches `getBoundingClientRect` on the prototype — leaving that patch in place
 * during a frame pass would put the instrument's own cost into the number beside
 * it.
 */
async function readInvariants(page, ctx) {
  await page.evaluate(() => window.__perf?.invariants.start());
  // BOTH input paths under one watch window. The pointer is where coalescing has
  // to work, so it is the interesting case — but the two paths write one shared
  // active-datum state (ADR-0016 §3), and a claim about commits per frame that
  // only ever watched the pointer would be a claim about half the contract.
  await sweep(page, ctx.box, INVARIANT_MS);
  await page.locator(ctx.surface).first().focus();
  await forDuration(INVARIANT_MS, () => page.keyboard.press("ArrowRight"), KEY_REPEAT_GAP_MS);
  await page.evaluate(() => window.__perf?.invariants.stop());
  return page.evaluate(() => window.__perf?.invariants.read());
}

/** Resolve the frozen inspection fraction in actual inner-plot coordinates. */
async function inspectionTarget(page, surfaceBox, fraction = 0.62) {
  const coordinate = await page.evaluate(
    (rawDomainFraction) => window.__perf?.inspectionTarget?.(rawDomainFraction),
    fraction,
  );
  if (
    coordinate !== undefined &&
    (coordinate.rawDomainFraction !== fraction ||
      !Number.isFinite(coordinate.plotFraction) ||
      coordinate.plotFraction < 0 ||
      coordinate.plotFraction > 1 ||
      !Array.isArray(coordinate.appliedDomain) ||
      coordinate.appliedDomain.length !== 2)
  ) {
    throw new Error("inspection target requires the applied plot-domain coordinate");
  }
  const plot = await page.locator("[data-silkplot-canvas-plot]").first().evaluate((canvas) => ({
    originX: Number(canvas.getAttribute("data-silkplot-plot-origin-x")),
    originY: Number(canvas.getAttribute("data-silkplot-plot-origin-y")),
    width: Number(canvas.getAttribute("data-silkplot-plot-width")),
    height: Number(canvas.getAttribute("data-silkplot-plot-height")),
  }));
  if (
    !Object.values(plot).every(Number.isFinite) ||
    plot.width <= 0 ||
    plot.height <= 0
  ) {
    throw new Error("inspection target requires positive recorded plot geometry");
  }
  const plotFraction = coordinate?.plotFraction ?? fraction;
  const relativeX = plot.originX + plot.width * plotFraction;
  const relativeY = plot.originY + plot.height / 2;
  return {
    evidence: {
      fraction,
      ...(coordinate === undefined
        ? {}
        : {
            plotFraction,
            targetTime: coordinate.targetTime,
            appliedDomain: coordinate.appliedDomain,
          }),
      surfaceWidth: surfaceBox.width,
      surfaceHeight: surfaceBox.height,
      ...plot,
      relativeX,
      relativeY,
    },
    clientX: surfaceBox.x + relativeX,
    clientY: surfaceBox.y + relativeY,
  };
}

/* -------------------------------------------------------------------------- */
/* One workload                                                                */
/* -------------------------------------------------------------------------- */

async function openWorkloadPage(
  browser,
  workload,
  query = "",
  evidenceContext = `${workload}${query}:primary`,
) {
  const page = await browser.newPage(FROZEN_PAGE_OPTIONS);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });

    const url = `${URL_BASE}/?workload=${workload}${query}`;
    await page.goto(url, { waitUntil: "load" });
    // The page signals readiness only once its chart has measured itself. Waiting
    // on a selector rather than a timeout: a fixed wait is a guess that gets
    // shorter as the workload gets heavier, which is precisely backwards.
    await page.waitForSelector("[data-perf-ready]", { timeout: 120_000 });

    const meta = await page.evaluate(() => {
      const api = window.__perf;
      return api
        ? {
            workload: api.workload,
            points: api.points,
            tableRows: api.tableRows,
            surface: api.surface,
            range: api.range,
            serverToken: api.serverToken,
            compositionRevision: api.compositionRevision,
            compositionDigest: api.compositionDigest,
            compositionManifest: api.compositionManifest,
            tableMode: api.tableMode,
					paintDecimation: api.paintDecimation
						? {
								budget: api.paintDecimation.budget,
								drawnPoints: api.paintDecimation.drawnPoints(),
							}
						: null,
          }
        : undefined;
    });
    if (!meta) throw new Error(`${workload}: the page published no __perf contract`);
    assertServerIdentity(EXPECTED_SERVER_TOKEN, meta.serverToken);
    if (meta.workload !== workload) {
      throw new Error(
        `${workload}: the page loaded '${meta.workload}' instead — refusing to record it under the wrong heading`,
      );
    }
    const tableMode = meta.tableMode ?? tableModeFromQuery(query);
    if (tableModeRole(workload, tableMode) === undefined) {
      throw new Error(REVISION_FAILURE.unknown);
    }
    const revision = evaluatePageRevision({
      identity: meta.compositionRevision,
      digest: meta.compositionDigest,
      manifest: meta.compositionManifest,
    });
    if (!revision.ok) {
      throw new Error(revision.message);
    }
    meta.tableMode = tableMode;

    // The deck workload starts hidden. Every page—including each isolated pass
    // page—must reveal it before resolving the interaction surface.
    const reveal =
      workload === "w-c"
        ? await settleSeries(page, () => window.__perf?.reveal?.(), 1)
        : undefined;
    const surfaceLocator = page.locator(meta.surface).first();
    await surfaceLocator.waitFor({ timeout: 120_000 });
    const box = await surfaceLocator.boundingBox();
    if (!box) throw new Error(`${workload}: no interaction surface at ${meta.surface}`);
    await captureBrowserPage(browser, page, evidenceContext);

    return {
      page,
      cdp,
      meta,
      ctx: { box, surface: meta.surface, range: meta.range },
      errors,
      reveal,
    };
  } catch (error) {
    await page.close();
    throw error;
  }
}

function assertSameWorkloadMetadata(expected, actual) {
  for (const key of [
    "workload",
    "points",
    "tableRows",
    "surface",
    "range",
    "compositionRevision",
    "compositionDigest",
    "tableMode",
  ]) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `fresh interaction page changed ${key}: expected '${expected[key]}', received '${actual[key]}'`,
      );
    }
  }
	if (
		JSON.stringify(actual.paintDecimation) !==
		JSON.stringify(expected.paintDecimation)
	) {
		throw new Error("fresh interaction page changed paint-decimation evidence");
	}
	if (
		JSON.stringify(actual.compositionManifest) !==
		JSON.stringify(expected.compositionManifest)
	) {
		throw new Error("fresh interaction page changed composition manifest");
	}
}

function emptyWorkloadResult(workload, query, meta, errors) {
	const tableMode = meta.tableMode ?? resultTableMode({ query });
	return {
		workload,
		query,
		tableMode,
		url: `${URL_BASE}/?workload=${workload}${query}`,
		points: meta.points,
		tableRows: meta.tableRows,
		paintDecimation: meta.paintDecimation,
		compositionIdentity: meta.compositionRevision,
		compositionDigest: meta.compositionDigest,
		compositionManifest: meta.compositionManifest,
		compositionRevision: {
			identity: meta.compositionRevision,
			digest: meta.compositionDigest,
			manifest: meta.compositionManifest,
		},
		passes: {},
		settles: {},
		heap: undefined,
		invariants: undefined,
		selfCheck: {},
		inspected: {},
		inspectionExpected: {},
		inspectionTarget: null,
		decimation: undefined,
		pageErrors: errors,
		timingVerdictsEligible: false,
	};
}

async function runWorkload(browser, workload, query = "") {
  const primary = await openWorkloadPage(browser, workload, query);
  const { page, cdp, meta, ctx, errors } = primary;
  const result = emptyWorkloadResult(workload, query, meta, errors);

  /* --- W-C reveals before anything can be measured on it --- */
  if (primary.reveal) result.settles.reveal = primary.reveal;
  const { box } = ctx;

  /* --- warm-up, discarded --- */
  await discardedWarmup(page);

  /* --- idle baseline --- */
  await startRecording(page);
  await page.waitForTimeout(1000);
  result.passes.idle = stats(await stopRecording(page));

  /* --- the interaction passes --- */
  //
  // Every pass is bracketed by the page's commit counters. A gesture that
  // silently fails to reach the chart — a selector that stopped matching, a
  // modifier the library no longer honours, a thumb that moved zero pixels —
  // produces a flawless frame distribution, because an idle page is fast. That
  // failure looks IDENTICAL to a fast chart, which is the shape of defect this
  // repository has now been bitten by three times (a dead frame harness, a gate
  // scanning nothing, five probes that never applied). So a pass that commits
  // nothing is recorded as INERT and is not allowed to count as a pass.
  for (const name of PROTOCOL_PASSES[workload] ?? []) {
    if (name === "rangeDrag" && !meta.range) continue;
    const isolated = await withFreshInteractionSurface(
      () => openWorkloadPage(
        browser,
        workload,
        query,
        `${workload}${query}:pass:${name}`,
      ),
      async ({ page: passPage, meta: passMeta, ctx: passCtx, errors: passErrors }) => {
        assertSameWorkloadMetadata(meta, passMeta);
        await PREPARE[name]?.(passPage, passCtx);
        await discardedWarmup(passPage);
        const before = await passPage.evaluate(() => window.__perf?.counts());
				const inputActivity = createInputActivityRecorder(name);
        await startRecording(passPage);
				await gesturesFor(DURATION_MS, inputActivity)[name](passPage, passCtx);
				const inputActivityEvidence = inputActivity.finish();
        const distribution = stats(await stopRecording(passPage));
        const after = await passPage.evaluate(() => window.__perf?.counts());
        Object.assign(
          distribution,
          interactionCommitEvidence(name, before, after),
					{ inputActivity: inputActivityEvidence },
        );
        return { distribution, passErrors };
      },
    );
    result.passes[name] = isolated.distribution;
    result.pageErrors.push(...isolated.passErrors);
  }

  /* --- invariants: commits, layout reads, and real index builds in pointer scope --- */
  result.invariants = await readInvariants(page, ctx);

  /* --- self-check 1: can the timer see a slow frame? --- */
  await startBurn(page);
  await startRecording(page);
  await sweep(page, box, 1200);
  const control = stats(await stopRecording(page));
  await stopBurn(page);
  result.selfCheck.control = control;
  result.selfCheck.controlDegraded = controlDegraded(result.passes.idle, control);

  /* --- self-check 2: exact per-event mutation, then workload-specific proof --- */
  await page.evaluate(() => window.__perf?.invariants.start());
  await page.evaluate(() => window.__perf?.pathological(true));
  await startRecording(page);
  await sweep(page, box, 1500);
  const mutated = stats(await stopRecording(page));
  const rebuilds = await page.evaluate(() => window.__perf?.pathological(false) ?? 0);
  await page.evaluate(() => window.__perf?.invariants.stop());
  const mutationInvariants = await page.evaluate(() => window.__perf?.invariants.read());
  const mutationProof = evaluateMutationProof({
    workload,
    distribution: mutated,
    counts: {
      pointerEvents: mutationInvariants?.pointerEvents,
      injectedRebuilds: rebuilds,
      injectedRebuildsInPointer: mutationInvariants?.injectedRebuildsInPointer,
      layoutReadsInPointer: mutationInvariants?.layoutReadsInPointer,
      productionIndexBuildsInPointer: mutationInvariants?.productionIndexBuildsInPointer,
      pointerEventsWithOneInjectedRebuild:
        mutationInvariants?.pointerEventsWithOneInjectedRebuild,
      pointerEventsWithOneLayoutRead: mutationInvariants?.pointerEventsWithOneLayoutRead,
      pointerEventsWithOneProductionIndexBuild:
        mutationInvariants?.pointerEventsWithOneProductionIndexBuild,
    },
  });
  result.selfCheck.mutated = mutated;
  result.selfCheck.mutationRebuilds = rebuilds;
  result.selfCheck.mutationInvariants = mutationInvariants;
  result.selfCheck.proofMode = mutationProof.mode;
  result.selfCheck.mutationCounts = mutationProof.counts;
  result.selfCheck.mutationProof = mutationProof;
  // Retained as named summary booleans for readers of earlier artifacts. Exact
  // application replaces the old "rebuild count > 0" approximation.
  result.selfCheck.mutationApplied = mutationProof.exactApplication;
  result.selfCheck.discriminating = mutationProof.pass;

  /* --- inspected-value read: what a reader lands on --- */
  const frozenInspectionTarget = await inspectionTarget(page, box);
  result.inspectionTarget = frozenInspectionTarget.evidence;
  if (workload === "w-d") {
    result.inspectionExpected.raw =
      (await page.evaluate(
        (fraction) => window.__perf?.inspectionExpected?.("raw", fraction),
        frozenInspectionTarget.evidence.fraction,
      )) ?? null;
  }
  await page.mouse.move(
    frozenInspectionTarget.clientX,
    frozenInspectionTarget.clientY,
  );
  await page.waitForTimeout(120);
  result.inspected.raw = (await page.evaluate(() => window.__perf?.lastActive())) ?? null;

  /* --- settles the protocol names for this workload --- */
  if (workload === "w-a") {
    result.settles.replace = await settleSeries(page, () => window.__perf?.replace?.());
    // Zoom in with a real gesture before each reset sample. Without it the chart
    // is already at full extent, reset commits nothing, the DOM never mutates,
    // and the settle reads 0ms — a number that says "instant" when what happened
    // was "nothing". The first run of this harness reported exactly that.
    result.settles.reset = await settleSeries(
      page,
      () => window.__perf?.reset?.(),
      3,
      (i) => i,
      async () => {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await holding(page, "Control", async () => {
          for (let s = 0; s < 6; s++) await page.mouse.wheel(0, -120);
        });
        await page.waitForTimeout(200);
      },
    );
  }
  if (workload === "w-b" || workload === "w-c") {
    const [wide, narrow] = await page.evaluate(() => [
      Number(document.querySelector("[data-perf-wide]")?.getAttribute("data-perf-wide")),
      Number(document.querySelector("[data-perf-narrow]")?.getAttribute("data-perf-narrow")),
    ]);
    // Alternating, so every repetition is a real layout change. Resizing to the
    // width it is already at settles instantly and would halve the reported p95
    // with work that never happened.
    result.settles.resize = await settleSeries(
      page,
      (width) => window.__perf?.resize?.(width),
      SETTLE_REPEATS,
      (i) => (i % 2 === 0 ? narrow : wide),
    );
    result.settles.resizeWidths = { wide, narrow };
  }

  /* --- W-C: cleanup and the heap either side of it --- */
  if (workload === "w-c") {
    const before = await heapBytes(cdp);
    result.settles.unmount = await settleSeries(page, () => window.__perf?.unmount?.(), 1);
    // Two GCs with a beat between them: a single collection can run before the
    // detached tree's finalisers have been queued, and reports memory that comes
    // back a moment later as though it had leaked.
    await page.waitForTimeout(250);
    const after = await heapBytes(cdp);
    result.heap = {
      beforeBytes: before,
      afterBytes: after,
      deltaBytes: after - before,
      recoveredPct: before === 0 ? 0 : +(((before - after) / before) * 100).toFixed(1),
    };
  }

  /* --- W-D: the density policy, raw against each candidate --- */
  if (workload === "w-d") {
    result.decimation = { report: await page.evaluate(() => window.__perf?.decimationReport?.()), passes: {} };
    for (const candidate of ["min-max", "every-nth"]) {
      const settleMs = await page.evaluate((c) => window.__perf?.decimate?.(c), candidate);
			await discardedWarmup(page);
			const inputActivity = createInputActivityRecorder("hover");
      await startRecording(page);
			await sweep(page, box, DURATION_MS, inputActivity.run);
			const inputActivityEvidence = inputActivity.finish();
			const hover = {
				...stats(await stopRecording(page)),
				inputActivity: inputActivityEvidence,
			};
			const drawnPoints = await page.evaluate(
				() => window.__perf?.paintDecimation?.drawnPoints() ?? null,
			);
			result.decimation.passes[candidate] = {
				settleMs,
				drawnPoints,
				hover,
			};
      result.inspectionExpected[candidate] =
        (await page.evaluate(
          ({ choice, fraction }) =>
            window.__perf?.inspectionExpected?.(choice, fraction),
          { choice: candidate, fraction: frozenInspectionTarget.evidence.fraction },
        )) ?? null;
      // The inspected-value read at the SAME pixel as the raw read above, which
      // is what makes the two comparable: same cursor position, different drawn
      // data, so the difference is what a reader would misread by.
      await page.mouse.move(
        frozenInspectionTarget.clientX,
        frozenInspectionTarget.clientY,
      );
      await page.waitForTimeout(120);
      result.inspected[candidate] =
        (await page.evaluate(() => window.__perf?.lastActive())) ?? null;
    }
    await page.evaluate(() => window.__perf?.decimate?.("raw"));
  }

  await page.close();
  return result;
}

/* -------------------------------------------------------------------------- */
/* Verdicts                                                                    */
/* -------------------------------------------------------------------------- */

/** Frame criteria for one interaction pass. */
function judgePass(name, s) {
  // An inert pass is not a fast pass. Judging its p95 would enter a number for a
  // gesture that never reached the chart, so the p95 and dropped-frame criteria
  // are replaced by the one criterion that actually failed.
  if (s.inert) {
    return [
      {
        criterion: `interaction reached the chart · ${name}`,
        pass: false,
        detail: `0 required ${name} state commits — this pass measured an idle page`,
      },
    ];
  }
	const timing = interactionTiming(s);
  return [
    {
      criterion: `p95 <= ${ACCEPTANCE_MS.toFixed(1)}ms · ${name}`,
      pass: timing.rawP95 <= ACCEPTANCE_MS,
      detail: `p95 ${s.p95}ms`,
    },
    {
      criterion: `dropped <= ${DROPPED_GATE_PCT}% · ${name}`,
      pass: timing.exactDroppedPct <= DROPPED_GATE_PCT,
      detail: `${s.pctDropped}% over 33.4ms`,
    },
  ];
}

/** The interaction-contract criteria, which frames alone cannot answer. */
const judgeInvariants = (inv) => {
  if (!inv) return [];
  const cleanIndexBuild = evaluateCleanIndexBuildInvariant(inv);
  return [
    {
      criterion: "at most one commit per frame",
      pass: inv.maxCommitsPerFrame <= 1,
      detail: `worst frame carried ${inv.maxCommitsPerFrame} commit(s) across ${inv.commits}`,
    },
    {
      criterion: "no synchronous layout read inside a pointer event",
      pass: inv.pointerEvents > 0 && inv.layoutReadsInPointer === 0,
      detail: `${inv.layoutReadsInPointer} read(s) across ${inv.pointerEvents} pointer events`,
    },
    {
      criterion: "no production index-builder call inside a pointer event",
      pass: cleanIndexBuild.pass,
      detail: cleanIndexBuild.pass
        ? `0 call(s) across ${cleanIndexBuild.pointerEvents} pointer events`
        : cleanIndexBuild.failureReason,
    },
  ];
};

/**
 * Apply the protocol's acceptance criteria to one workload's numbers.
 *
 * Every criterion returns a NAMED verdict rather than a boolean, so the report
 * says which one failed. A single pass/fail on a run this size is a result
 * nobody can act on.
 */
function judge(result) {
  return [
    ...Object.entries(result.passes)
      .filter(([name]) => name !== "idle")
      .flatMap(([name, s]) => judgePass(name, s)),
    ...judgeInvariants(result.invariants),
    ...Object.entries(result.settles)
      .filter(([, s]) => s && typeof s.p95 === "number")
      .map(([name, s]) => settleVerdict(result.workload, name, s, SETTLE_GATE_MS)),
  ];
}

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

const browser = await chromium.launch(BROWSER_PLAN.launchOptions);
const probePage = await browser.newPage(FROZEN_PAGE_OPTIONS);
await probePage.goto("data:text/html,<canvas></canvas>");
const browserSurface = await inspectBrowserSurface(browser, probePage, BROWSER_PLAN);
browserSurfaceEvidence = browserSurface;
await probePage.close();

console.log(
  `browser surface: ${browserSurface.requestedMode} · ${browserSurface.classification} · Chrome ${browserSurface.browserVersion}`,
);
console.log(`GPU renderer: ${browserSurface.gpu.renderer ?? browserSurface.webgl.renderer ?? "unreported"}`);
if (!browserSurface.surfaceEligible) {
  for (const reason of browserSurface.ineligibilityReasons) console.log(`diagnostic: ${reason}`);
}

const artifactMetadata = {
  recordedBy: "scripts/measure-workload-frames.mjs",
  schemaVersion: 5,
	interactionIsolation: "fresh-page-per-pass",
  compositionRevision: {
    identity: CURRENT_COMPOSITION_IDENTITY,
    digest: COMPOSITION_DIGEST,
    manifest: COMPOSITION_MANIFEST,
  },
  // Deliberately NOT a hardware description. This script cannot know what
  // machine it is on; the host runner supplies the measured host record.
  hardware: "UNRECORDED — fill in from the protocol's frozen parameter table",
  classification: browserSurface.classification,
  browserSurface,
  throttle: RATE,
  budgetMs: BUDGET_MS,
  timerToleranceMs: TIMER_TOLERANCE_MS,
  acceptanceMs: ACCEPTANCE_MS,
  droppedFrameMs: DROPPED_MS,
  droppedGatePct: DROPPED_GATE_PCT,
  warmupMs: WARMUP_MS,
  durationMs: DURATION_MS,
  controlBurnMs: CONTROL_BURN_MS,
  settleRepeats: SETTLE_REPEATS,
  settleGateMs: SETTLE_GATE_MS,
  invariantDurationMs: INVARIANT_MS,
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
};

// A caller explicitly asking for the headed binding surface should find out
// before a long seven-run pass if Chrome silently fell back to software.
if (BROWSER_PLAN.mode === "headed" && !browserSurface.surfaceEligible) {
  await finalizeBrowserSurface(browser);
  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify(
        {
          ...artifactMetadata,
          abortedBeforeWorkloads: true,
          results: [],
        },
        null,
        2,
      )}\n`,
    );
    console.log(`wrote ${JSON_OUT}`);
  }
  console.error("headed browser surface is not hardware-accelerated; refusing a binding-candidate run");
  await browser.close();
  process.exit(2);
}
const results = [];

for (const workload of REQUESTED) {
  if (!PROTOCOL_PASSES[workload]) {
    console.error(
      `unknown workload '${workload}' — expected one of ${Object.keys(PROTOCOL_PASSES).join(", ")}`,
    );
    await browser.close();
    process.exit(1);
  }
  for (const mode of TABLE_MODES) {
    // W-C is the protocol's single-mode exception and runs with its derived
    // tables only. Its questions are reveal, resize, unmount, heap, and one-chart
    // interaction while forty-seven charts sit idle; a second no-table deck run
    // would not answer a frozen attribution question. W-A, W-B and W-D run both
    // modes to attribute the cost of the accessible table being present.
    if (workload === "w-c" && mode === "none") continue;
    results.push(await runWorkload(browser, workload, mode === "none" ? "&table=none" : ""));
  }
}

await finalizeBrowserSurface(browser);
await browser.close();

/* --- report --- */
console.log(
  `\n${conditionsLine(RATE, URL_BASE, ` · browser: ${browserSurface.requestedMode}/${browserSurface.classification}`)}`,
);

const hostRevision = evaluateHostArtifact({ ...artifactMetadata, results }, PROTOCOL_PASSES);
for (const r of results) {
  r.timingVerdictsEligible = timingVerdictsEligibleForResult(
    hostRevision.ok,
    r.workload,
    r.tableMode,
  );
}

if (!hostRevision.ok) {
  console.error(`\ncomposition revision: ${hostRevision.message}`);
} else {
  console.log("\ncomposition revision: eligible");
}

let aborted = false;
let missed = 0;
let nonDiscriminating = 0;

for (const r of results) {
  const label = r.query ? `${r.workload}${r.query}` : r.workload;
  console.log(
    `\n=== ${label} — ${r.points.toLocaleString()} points, ${r.tableRows.toLocaleString()} table rows ===`,
  );
  for (const [name, s] of Object.entries(r.passes)) {
    const commits = s.commits
      ? `  commits=${s.commits.viewport}v/${s.commits.active}a/${s.commits.reset}r/${s.commits.visibility}s`
      : "";
    console.log(`${row(name, s)}${commits}${s.inert ? "  << INERT" : ""}`);
  }
  console.log(row("control (+30ms/frame)", r.selfCheck.control));
  console.log(
    `${row("mutated (index rebuild)", r.selfCheck.mutated)}  proof=${r.selfCheck.proofMode}`,
  );
  const mutationCounts = r.selfCheck.mutationCounts;
  console.log(
    `${"mutation counts".padEnd(26)} events=${mutationCounts.pointerEvents}  injected=${mutationCounts.injectedRebuilds} (${mutationCounts.injectedRebuildsInPointer} in scope)  layout reads=${mutationCounts.layoutReadsInPointer}  actual builder calls=${mutationCounts.productionIndexBuildsInPointer}`,
  );
  console.log(
    `${"mutation exact events".padEnd(26)} injected=${mutationCounts.pointerEventsWithOneInjectedRebuild}/${mutationCounts.pointerEvents}  layout=${mutationCounts.pointerEventsWithOneLayoutRead}/${mutationCounts.pointerEvents}  actual builder=${mutationCounts.pointerEventsWithOneProductionIndexBuild}/${mutationCounts.pointerEvents}`,
  );

  for (const [name, s] of Object.entries(r.settles)) {
    if (!s || typeof s.p95 !== "number") continue;
    console.log(
      `${`settle: ${name}`.padEnd(26)} p50=${String(s.p50).padStart(7)}ms  p95=${String(s.p95).padStart(7)}ms  max=${String(s.max).padStart(7)}ms  n=${s.samples}${s.noChange ? `  << ${s.noChange} NO CHANGE` : ""}${s.timeouts ? `  << ${s.timeouts} TIMEOUT` : ""}`,
    );
  }
  if (r.heap) {
    console.log(
      `${"heap around unmount".padEnd(26)} before=${(r.heap.beforeBytes / 1e6).toFixed(1)}MB  after=${(r.heap.afterBytes / 1e6).toFixed(1)}MB  recovered=${r.heap.recoveredPct}%`,
    );
  }
  if (r.invariants) {
    console.log(
      `${"invariants".padEnd(26)} commits=${r.invariants.commits}  worst frame=${r.invariants.maxCommitsPerFrame}  layout reads in pointer=${r.invariants.layoutReadsInPointer}/${r.invariants.pointerEvents}  actual builder calls in pointer=${r.invariants.productionIndexBuildsInPointer}/${r.invariants.pointerEvents}`,
    );
  }
  if (r.decimation?.report) {
    for (const d of r.decimation.report) {
      console.log(
        `${`decimation: ${d.candidate}`.padEnd(26)} ${d.rawPoints.toLocaleString()}→${d.outPoints.toLocaleString()}  max err=${d.maxAbsError}  mean err=${d.meanAbsError}  kept min/max=${d.keptMin}/${d.keptMax}  spikes=${d.spikesKept}/${d.spikesTotal}`,
      );
    }
    for (const [c, pass] of Object.entries(r.decimation.passes)) {
      console.log(
        `${`swap to ${c}`.padEnd(26)} settle=${pass.settleMs}ms  ${row("", pass.hover).trim()}`,
      );
    }
    console.log(`${"inspected raw".padEnd(26)} ${JSON.stringify(r.inspected.raw)}`);
    for (const c of ["min-max", "every-nth"]) {
      console.log(`${`inspected ${c}`.padEnd(26)} ${JSON.stringify(r.inspected[c])}`);
    }
  }
  if (r.pageErrors.length) console.log("page errors:", r.pageErrors);

  // Eligible derived runs keep named verdicts even when a later control abort
  // refuses to score them. An empty `verdicts` array would look like a truncated
  // harness run. table=none and an ineligible host never receive timing verdicts.
  if (hostRevision.ok && r.timingVerdictsEligible) {
    r.verdicts = judge(r);
  } else {
    r.verdicts = [];
  }

  /* --- self-checks decide whether the numbers above count --- */
  if (!r.selfCheck.controlDegraded) {
    console.error(
      `\n${label} ABORT: the +30ms control did not degrade the distribution, so the frame timer cannot see a slow frame and every figure above is decoration.`,
    );
    aborted = true;
    continue;
  }
  if (!r.selfCheck.mutationProof.pass) {
    console.log(
      `\n${label} NON-DISCRIMINATING (${r.selfCheck.mutationProof.mode}): ${r.selfCheck.mutationProof.failureReason}`,
    );
    nonDiscriminating++;
  } else {
    console.log(`\n${label} MUTATION PROOF PASS (${r.selfCheck.mutationProof.mode})`);
  }

  if (!hostRevision.ok) continue;
  if (!r.timingVerdictsEligible) {
    console.log(`  ${DEFAULT_SURFACE_FAILURE}`);
    continue;
  }

  for (const v of r.verdicts) {
    console.log(`  ${v.pass ? "PASS" : "MISS"}  ${v.criterion.padEnd(52)} ${v.detail}`);
    if (!v.pass) missed++;
  }
}

if (JSON_OUT) {
  writeFileSync(
    JSON_OUT,
    `${JSON.stringify(
      {
        ...artifactMetadata,
        results,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nwrote ${JSON_OUT}`);
}

console.log(
  `\n${results.length} workload run(s) · ${missed} criterion miss(es) · ${nonDiscriminating} non-discriminating`,
);

if (aborted) process.exit(2);
if (!hostRevision.ok) process.exit(1);
// A non-discriminating workload is NOT a pass. Reporting it as one is the exact
// mistake the hover harness made for a year.
process.exit(missed > 0 || nonDiscriminating > 0 ? 1 : 0);
