/**
 * Attribute the viewport-commit cost: JS CPU profiles and DevTools timeline
 * traces, per gesture, on a workload page.
 *
 *   npm run dev:perf                                   # in one terminal
 *   node scripts/collect-commit-profiles.mjs --out DIR # profiles + traces
 *
 * This is the ATTRIBUTION instrument, not the measurement. The frame harness
 * (`measure-workload-frames.mjs`) answers "does this gesture fit the budget?"
 * under frozen conditions; this script answers "where does the time go?" and
 * is allowed to run under ordinary load, because its output is relative and
 * structural — which functions dominate, whether the long task is script,
 * layout, or paint — not a frame time anybody may quote. Profiling itself
 * perturbs the page (sampling, trace buffers), so the p95 printed beside each
 * profile exists ONLY to prove the miss reproduced while being profiled,
 * never as a result.
 *
 * Two recordings per gesture, in separate passes because they perturb each
 * other:
 *
 *   - a V8 sampling profile (`Profiler.start`, 100µs interval) — JS
 *     attribution by function, the "which derivation recomputed" half;
 *   - a DevTools timeline trace (`devtools.timeline` categories) — the
 *     script/layout/paint/GC split, the "is it even JS" half the protocol's
 *     cause taxonomy needs (model, path, index, layout, paint, event, memory,
 *     bundle).
 *
 * Every pass is bracketed by the page's commit counters, for the same reason
 * the frame harness brackets its passes: a gesture that silently failed to
 * reach the chart profiles an idle page, and an idle profile looks exactly
 * like a fast chart. An inert pass is recorded as inert and its files are
 * still written — labelled, so nobody reads them as attribution.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  appendBrowserProcessSnapshot,
  browserSurfacePlan,
  inspectBrowserProcesses,
  inspectBrowserSurface,
  inspectDisplaySurface,
} from "./lib/browser-surface.mjs";
import {
  BINDING_RATE,
  DURATION_MS,
	FROZEN_PAGE_OPTIONS,
	discardedWarmup,
  arg,
	assertServerIdentity,
  startRecording,
  stats,
  stopRecording,
	interactionCommitEvidence,
} from "./lib/perf.mjs";
import { PREPARE, gesturesFor } from "./lib/gestures.mjs";
import { validateAttributionRequest } from "./lib/attribution.mjs";

const URL_BASE = arg(process.argv, "url", "http://127.0.0.1:5175");
const WORKLOAD = arg(process.argv, "workload", "w-a");
const TABLE = arg(process.argv, "table", "none");
const RATE = Number(arg(process.argv, "rate", String(BINDING_RATE)));
const OUT = arg(process.argv, "out", undefined);
const REPEATS = Number(arg(process.argv, "repeats", "2"));
const EXPECTED_SERVER_TOKEN = arg(process.argv, "server-token", undefined);
const BROWSER_PLAN = (() => {
  try {
    return browserSurfacePlan(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
})();
// pan is the CONTROL: it passed where zoom/brush/rangeDrag missed, so what the
// three misses share and pan lacks is the attribution target.
const GESTURES = arg(process.argv, "gestures", "pan,zoom,brush,rangeDrag")
  .split(",")
  .map((g) => g.trim())
  .filter(Boolean);

try {
	validateAttributionRequest({ repeats: REPEATS, gestures: GESTURES, table: TABLE });
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(2);
}

if (!OUT) {
  console.error("--out DIR is required (profiles and traces are files, not stdout)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const TRACE_CATEGORIES = [
  "-*",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "toplevel",
  "v8.execute",
].join(",");

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

// `Map`s rather than bare objects, and the requested names validated against
// them up front: a typo'd `--gestures` value dies here with the valid names
// listed, instead of surfacing later as a TypeError mid-collection — and the
// dispatch below stays static-analysable (no dynamic property access on an
// object that could be polluted from input).
const gestures = new Map(Object.entries(gesturesFor(DURATION_MS)));
const prepares = new Map(Object.entries(PREPARE));
const unknown = GESTURES.filter((g) => !gestures.has(g));
if (unknown.length > 0) {
  console.error(
    `unknown gesture(s): ${unknown.join(", ")} — expected one of ${[...gestures.keys()].join(", ")}`,
  );
  process.exit(2);
}

/** One page per pass: no state leaks from a previous gesture's navigation. */
async function openPage(browser, evidenceContext) {
  const page = await browser.newPage(FROZEN_PAGE_OPTIONS);
	const pageErrors = [];
	page.on("pageerror", (error) => pageErrors.push(String(error)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
  const query = TABLE === "none" ? "&table=none" : "";
  await page.goto(`${URL_BASE}/?workload=${WORKLOAD}${query}`, { waitUntil: "load" });
  await page.waitForSelector("[data-perf-ready]", { timeout: 120_000 });
  const meta = await page.evaluate(() => {
    const api = window.__perf;
    return api
			? {
					workload: api.workload,
					surface: api.surface,
					range: api.range,
					serverToken: api.serverToken,
				}
			: undefined;
  });
  if (!meta) throw new Error("the page published no __perf contract");
	assertServerIdentity(EXPECTED_SERVER_TOKEN, meta.serverToken);
  if (meta.workload !== WORKLOAD) {
    throw new Error(`page loaded '${meta.workload}' instead of '${WORKLOAD}'`);
  }
  const surface = page.locator(meta.surface).first();
  await surface.waitFor({ timeout: 120_000 });
  const box = await surface.boundingBox();
  if (!box) throw new Error(`no interaction surface at ${meta.surface}`);
  await captureBrowserPage(browser, page, evidenceContext);
  return {
		page,
		cdp,
		ctx: { box, surface: meta.surface, range: meta.range },
		pageErrors,
	};
}

/** Run one gesture pass under `record`, bracketed by frame stats and commit counts. */
async function pass(browser, gesture, evidenceContext, record) {
  const { page, cdp, ctx, pageErrors } = await openPage(
    browser,
    evidenceContext,
  );
  try {
    if (gesture === "rangeDrag" && !ctx.range) {
      return { skipped: `no range control on ${WORKLOAD}`, pageErrors };
    }
    await prepares.get(gesture)?.(page, ctx);
		await discardedWarmup(page);
    const before = await page.evaluate(() => window.__perf?.counts());
    await startRecording(page);
    const run = gestures.get(gesture);
    const recorded = await record(page, cdp, () => run(page, ctx));
    const frames = stats(await stopRecording(page));
    const after = await page.evaluate(() => window.__perf?.counts());
    return {
      frames,
			...interactionCommitEvidence(gesture, before, after),
			pageErrors,
      ...recorded,
    };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch(BROWSER_PLAN.launchOptions);
const probePage = await browser.newPage(FROZEN_PAGE_OPTIONS);
await probePage.goto("data:text/html,<canvas></canvas>");
const browserSurface = await inspectBrowserSurface(browser, probePage, BROWSER_PLAN, {
  instrumented: true,
});
browserSurfaceEvidence = browserSurface;
await probePage.close();

const summary = {
  recordedBy: "scripts/collect-commit-profiles.mjs",
	schemaVersion: 1,
  purpose:
    "ATTRIBUTION ONLY — relative/structural evidence collected under possible ambient load. No figure here is a protocol result.",
  classification: browserSurface.classification,
  browserSurface,
  workload: WORKLOAD,
  table: TABLE,
  throttle: RATE,
  durationMs: DURATION_MS,
	repeats: REPEATS,
	requestedGestures: GESTURES,
  passes: [],
};

console.log(
  `browser surface: ${browserSurface.requestedMode} · ${browserSurface.classification} · Chrome ${browserSurface.browserVersion}`,
);
console.log(`GPU renderer: ${browserSurface.gpu.renderer ?? browserSurface.webgl.renderer ?? "unreported"}`);
for (const reason of browserSurface.ineligibilityReasons) console.log(`diagnostic: ${reason}`);

for (let r = 0; r < REPEATS; r++) {
  for (const gesture of GESTURES) {
    /* --- V8 sampling profile --- */
    const profFile = join(OUT, `${gesture}-r${r}.cpuprofile`);
    const prof = await pass(
      browser,
      gesture,
      `${gesture}:r${r}:cpuprofile`,
      async (_page, cdp, run) => {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
      await cdp.send("Profiler.start");
      await run();
      const { profile } = await cdp.send("Profiler.stop");
      writeFileSync(profFile, JSON.stringify(profile));
      return { file: `${gesture}-r${r}.cpuprofile`, kind: "cpuprofile" };
      },
    );
    summary.passes.push({ gesture, repeat: r, ...prof });
    console.log(
      `${gesture} r${r} cpuprofile: ${prof.skipped ?? `p95=${prof.frames.p95}ms commits=${prof.commits.viewport}v/${prof.commits.active}a${prof.inert ? " << INERT" : ""}`}`,
    );

    /* --- DevTools timeline trace (first repeat only — one per gesture answers
           the script/layout/paint split; repeats add bulk, not information) --- */
    if (r === 0) {
      const traceFile = join(OUT, `${gesture}-timeline.trace.json`);
      const tl = await pass(
        browser,
        gesture,
        `${gesture}:r${r}:timeline`,
        async (_page, cdp, run) => {
        const chunks = [];
        cdp.on("Tracing.dataCollected", (e) => chunks.push(...e.value));
        const done = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
        await cdp.send("Tracing.start", {
          categories: TRACE_CATEGORIES,
          transferMode: "ReportEvents",
        });
        await run();
        await cdp.send("Tracing.end");
        await done;
        writeFileSync(traceFile, JSON.stringify({ traceEvents: chunks }));
        return {
				file: `${gesture}-timeline.trace.json`,
				kind: "timeline",
				events: chunks.length,
			};
        },
      );
      summary.passes.push({ gesture, repeat: r, ...tl });
      console.log(
        `${gesture} r${r} timeline:   ${tl.skipped ?? `p95=${tl.frames.p95}ms commits=${tl.commits.viewport}v/${tl.commits.active}a events=${tl.events}${tl.inert ? " << INERT" : ""}`}`,
      );
    }
  }
}

const finalProbePage = await browser.newPage(FROZEN_PAGE_OPTIONS);
await finalProbePage.goto("data:text/html,<canvas></canvas>");
await captureBrowserPage(browser, finalProbePage, "probe-final");
browserSurface.displayFinal = browserSurface.displaySnapshots.at(-1);
await finalProbePage.close();
await browser.close();

const summaryFile = join(OUT, "summary.json");
writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nwrote ${summaryFile}`);

// An inert pass wrote a file that attributes nothing. Say so with the exit
// code, not only in the JSON nobody reads on a green run.
const failed = summary.passes.filter(
	(pass) =>
		pass.skipped !== undefined ||
		pass.inert === true ||
		!Array.isArray(pass.pageErrors) ||
		pass.pageErrors.length > 0,
);
if (failed.length > 0) {
  console.error(
		`${failed.length} pass(es) were skipped, inert, or reported page errors — the trace is not complete attribution evidence.`,
  );
  process.exit(1);
}
