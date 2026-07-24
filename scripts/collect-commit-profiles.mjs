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
  BINDING_RATE,
  DEVICE_SCALE_FACTOR,
  DURATION_MS,
  VIEWPORT,
  WARMUP_MS,
  arg,
  startRecording,
  stats,
  stopRecording,
} from "./lib/perf.mjs";
import { PREPARE, gesturesFor } from "./lib/gestures.mjs";

const URL_BASE = arg(process.argv, "url", "http://127.0.0.1:5175");
const WORKLOAD = arg(process.argv, "workload", "w-a");
const TABLE = arg(process.argv, "table", "none");
const RATE = Number(arg(process.argv, "rate", String(BINDING_RATE)));
const OUT = arg(process.argv, "out", undefined);
const REPEATS = Number(arg(process.argv, "repeats", "2"));
// pan is the CONTROL: it passed where zoom/brush/rangeDrag missed, so what the
// three misses share and pan lacks is the attribution target.
const GESTURES = arg(process.argv, "gestures", "pan,zoom,brush,rangeDrag")
  .split(",")
  .map((g) => g.trim())
  .filter(Boolean);

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
async function openPage(browser) {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
  const query = TABLE === "none" ? "&table=none" : "";
  await page.goto(`${URL_BASE}/?workload=${WORKLOAD}${query}`, { waitUntil: "load" });
  await page.waitForSelector("[data-perf-ready]", { timeout: 120_000 });
  const meta = await page.evaluate(() => {
    const api = window.__perf;
    return api ? { workload: api.workload, surface: api.surface, range: api.range } : undefined;
  });
  if (!meta) throw new Error("the page published no __perf contract");
  if (meta.workload !== WORKLOAD) {
    throw new Error(`page loaded '${meta.workload}' instead of '${WORKLOAD}'`);
  }
  const surface = page.locator(meta.surface).first();
  await surface.waitFor({ timeout: 120_000 });
  const box = await surface.boundingBox();
  if (!box) throw new Error(`no interaction surface at ${meta.surface}`);
  // Warm-up, discarded — the first frames after navigation are not steady state.
  await page.waitForTimeout(WARMUP_MS);
  return { page, cdp, ctx: { box, surface: meta.surface, range: meta.range } };
}

/** Run one gesture pass under `record`, bracketed by frame stats and commit counts. */
async function pass(browser, gesture, record) {
  const { page, cdp, ctx } = await openPage(browser);
  try {
    if (gesture === "rangeDrag" && !ctx.range) {
      return { skipped: `no range control on ${WORKLOAD}` };
    }
    await prepares.get(gesture)?.(page, ctx);
    const before = await page.evaluate(() => window.__perf?.counts());
    await startRecording(page);
    const run = gestures.get(gesture);
    const recorded = await record(page, cdp, () => run(page, ctx));
    const frames = stats(await stopRecording(page));
    const after = await page.evaluate(() => window.__perf?.counts());
    const commits = {
      viewport: (after?.viewport ?? 0) - (before?.viewport ?? 0),
      active: (after?.active ?? 0) - (before?.active ?? 0),
    };
    return {
      frames,
      commits,
      inert: commits.viewport + commits.active === 0,
      ...recorded,
    };
  } finally {
    await page.close();
  }
}

const summary = {
  recordedBy: "scripts/collect-commit-profiles.mjs",
  purpose:
    "ATTRIBUTION ONLY — relative/structural evidence collected under possible ambient load. No figure here is a protocol result.",
  workload: WORKLOAD,
  table: TABLE,
  throttle: RATE,
  durationMs: DURATION_MS,
  passes: [],
};

const browser = await chromium.launch();

for (let r = 0; r < REPEATS; r++) {
  for (const gesture of GESTURES) {
    /* --- V8 sampling profile --- */
    const profFile = join(OUT, `${gesture}-r${r}.cpuprofile`);
    const prof = await pass(browser, gesture, async (_page, cdp, run) => {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
      await cdp.send("Profiler.start");
      await run();
      const { profile } = await cdp.send("Profiler.stop");
      writeFileSync(profFile, JSON.stringify(profile));
      return { file: profFile, kind: "cpuprofile" };
    });
    summary.passes.push({ gesture, repeat: r, ...prof });
    console.log(
      `${gesture} r${r} cpuprofile: ${prof.skipped ?? `p95=${prof.frames.p95}ms commits=${prof.commits.viewport}v/${prof.commits.active}a${prof.inert ? " << INERT" : ""}`}`,
    );

    /* --- DevTools timeline trace (first repeat only — one per gesture answers
           the script/layout/paint split; repeats add bulk, not information) --- */
    if (r === 0) {
      const traceFile = join(OUT, `${gesture}-timeline.trace.json`);
      const tl = await pass(browser, gesture, async (_page, cdp, run) => {
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
        return { file: traceFile, kind: "timeline", events: chunks.length };
      });
      summary.passes.push({ gesture, repeat: r, ...tl });
      console.log(
        `${gesture} r${r} timeline:   ${tl.skipped ?? `p95=${tl.frames.p95}ms commits=${tl.commits.viewport}v/${tl.commits.active}a events=${tl.events}${tl.inert ? " << INERT" : ""}`}`,
      );
    }
  }
}

await browser.close();

const summaryFile = join(OUT, "summary.json");
writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nwrote ${summaryFile}`);

// An inert pass wrote a file that attributes nothing. Say so with the exit
// code, not only in the JSON nobody reads on a green run.
const inert = summary.passes.filter((p) => p.inert);
if (inert.length > 0) {
  console.error(
    `${inert.length} pass(es) were INERT (gesture never reached the chart) — their files are not attribution evidence.`,
  );
  process.exit(1);
}
