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
 * 2. The per-event INDEX-REBUILD mutation asks a different question — "is this
 *    workload dense enough to detect the regression it is supposed to detect?".
 *    If forcing a full index rebuild inside every pointer event does not breach
 *    the budget, then a chart that HAD that defect would also have passed, and
 *    the clean result is reported as NON-DISCRIMINATING rather than as a pass.
 *    This is the check the hover harness never had: it passed identically at 4x,
 *    6x, 10x and 20x throttle on a 30-point fixture for a year, and "passes at
 *    20x" turned out to mean nothing at all.
 *
 * Both mutations assert they were APPLIED before their result is trusted — the
 * detection probes' rule, learned the same way. A mutation that silently failed
 * to apply reports a clean pass and proves nothing.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  ACCEPTANCE_MS,
  BINDING_RATE,
  BUDGET_MS,
  DEVICE_SCALE_FACTOR,
  DROPPED_GATE_PCT,
  DURATION_MS,
  VIEWPORT,
  WARMUP_MS,
  arg,
  conditionsLine,
  controlDegraded,
  row,
  startBurn,
  startRecording,
  stats,
  stopBurn,
  stopRecording,
  sweep,
} from "./lib/perf.mjs";

const URL_BASE = arg(process.argv, "url", "http://127.0.0.1:5175");
const RATE = Number(arg(process.argv, "rate", String(BINDING_RATE)));
const JSON_OUT = arg(process.argv, "json", undefined);
const REQUESTED = arg(process.argv, "workload", "w-a,w-b,w-c,w-d")
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);

/**
 * Which data-table configurations to run: `both` (the default), `derived`, or
 * `none`.
 *
 * `both` by default because the protocol requires frame cost to be ATTRIBUTED,
 * not merely reported, and the largest single attributable component at these
 * scales is the accessible data table — a real DOM row per instant, rebuilt on
 * every viewport commit because the derived table narrows with the visible
 * domain. One configuration alone produces a number nobody can act on: the
 * chart's cost with the table's folded invisibly into it.
 *
 * The flag exists so an operator can halve a long run when they already know
 * which half they need — not so `both` can be skipped by default.
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

const percentile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : +s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(1);
};

/* -------------------------------------------------------------------------- */
/* Gestures — real input, never a shortcut to the resulting state              */
/* -------------------------------------------------------------------------- */

/** Hold a modifier for the duration of `body`, and release it even if `body` throws. */
async function holding(page, key, body) {
  await page.keyboard.down(key);
  try {
    await body();
  } finally {
    await page.keyboard.up(key);
  }
}

/** Repeat `step` until `ms` have elapsed, pausing `gap` ms between repetitions. */
async function forDuration(ms, step, gap = 0) {
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
const KEY_REPEAT_GAP_MS = 33;

const gestures = {
  /** Pointer hover. On a multi-series chart this IS the shared-time inspection path. */
  hover: (page, ctx) => sweep(page, ctx.box, DURATION_MS),

  /** Keyboard stepping — the same active-datum state the pointer writes (ADR-0016 §3). */
  keyboard: async (page, ctx) => {
    await page.locator(ctx.surface).first().focus();
    await forDuration(
      DURATION_MS,
      (i) => page.keyboard.press(i % 40 < 20 ? "ArrowRight" : "ArrowLeft"),
      KEY_REPEAT_GAP_MS,
    );
  },

  /** `Ctrl`+wheel zoom, in and back out, so it never bottoms out on `minSpan` and idles. */
  zoom: async (page, ctx) => {
    await page.mouse.move(ctx.box.x + ctx.box.width / 2, ctx.box.y + ctx.box.height / 2);
    await holding(page, "Control", () =>
      forDuration(DURATION_MS, (i) => page.mouse.wheel(0, i % 20 < 10 ? -120 : 120)),
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
   * Needs `prepare` (below) to zoom in first. A chart showing all of its data has
   * nowhere to pan to, so the gesture correctly commits nothing — and the pass
   * then records a flawless distribution for an idle page. The commit counters
   * caught exactly that on W-B, where `pan` ran before `zoom` in the pass order
   * and the chart was still un-navigated.
   */
  pan: async (page, ctx) => {
    await page.locator(ctx.surface).first().focus();
    await holding(page, "Shift", () =>
      forDuration(
        DURATION_MS,
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
    await forDuration(DURATION_MS, async () => {
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
    await forDuration(DURATION_MS, (i) => {
      const phase = (Math.sin(i / 12) + 1) / 2;
      return page.mouse.move(box.x + box.width / 2 - phase * 240, y);
    });
    await page.mouse.up();
  },

  /** Legend toggles, one series at a time — the commit a legend click produces. */
  legend: (page) =>
    forDuration(DURATION_MS, async () => {
      await page.evaluate(() => window.__perf?.legendToggle?.());
      await page.waitForTimeout(60);
    }),

  /** Isolate: twenty-one series leaving the domain at once, and coming back. */
  isolate: (page) =>
    forDuration(DURATION_MS, async () => {
      await page.evaluate(() => window.__perf?.isolate?.());
      await page.waitForTimeout(120);
    }),
};

/**
 * Set-up a gesture needs BEFORE recording starts, so its cost is not measured.
 *
 * Only `pan` needs one, and the reason is a real property of the library rather
 * than a harness quirk: under the dirty-flag engage model a chart tracks its full
 * data until the user navigates, and a chart showing everything cannot be panned.
 * Zooming in first is what a user does before panning, so the pass measures a pan
 * instead of measuring nothing.
 */
const PREPARE = {
  pan: async (page, ctx) => {
    await page.mouse.move(ctx.box.x + ctx.box.width / 2, ctx.box.y + ctx.box.height / 2);
    await holding(page, "Control", async () => {
      for (let s = 0; s < 5; s++) await page.mouse.wheel(0, -120);
    });
    await page.waitForTimeout(300);
  },
};

/** Which gestures each workload runs, in order. */
const PASSES = {
  "w-a": ["hover", "keyboard", "zoom", "pan", "brush", "rangeDrag"],
  "w-b": ["hover", "legend", "isolate", "pan", "zoom", "brush"],
  "w-c": ["hover"],
  "w-d": ["hover", "keyboard", "zoom"],
};

/* -------------------------------------------------------------------------- */
/* Instrument readings                                                         */
/* -------------------------------------------------------------------------- */

/** Forced GC, then the JS heap in bytes. */
async function heapBytes(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  return metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
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
  let noChange = 0;
  for (let i = 0; i < repeats; i++) {
    // `before` puts the page into the state the trigger is supposed to change.
    // Measuring a settle from a state where the trigger is a no-op reports 0ms,
    // which reads as "instantaneous" and means "nothing happened".
    if (before) await before(i);
    const ms = await page.evaluate(call, argAt(i));
    if (typeof ms !== "number") continue;
    // -1 is the page's NO_CHANGE: the trigger mutated nothing at all. Averaging
    // it in as a zero would turn a dead trigger into a fast one.
    if (ms < 0) noChange++;
    else samples.push(ms);
  }
  return {
    samples: samples.length,
    noChange,
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

/* -------------------------------------------------------------------------- */
/* One workload                                                                */
/* -------------------------------------------------------------------------- */

async function runWorkload(browser, workload, query = "") {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

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
      ? { workload: api.workload, points: api.points, tableRows: api.tableRows, surface: api.surface, range: api.range }
      : undefined;
  });
  if (!meta) throw new Error(`${workload}: the page published no __perf contract`);
  if (meta.workload !== workload) {
    throw new Error(`${workload}: the page loaded '${meta.workload}' instead — refusing to record it under the wrong heading`);
  }

  const result = {
    workload,
    query,
    url,
    points: meta.points,
    tableRows: meta.tableRows,
    passes: {},
    settles: {},
    heap: undefined,
    invariants: undefined,
    selfCheck: {},
    inspected: {},
    decimation: undefined,
    pageErrors: errors,
  };

  /* --- W-C reveals before anything can be measured on it --- */
  if (workload === "w-c") {
    result.settles.reveal = await settleSeries(page, () => window.__perf?.reveal?.(), 1);
  }

  const surfaceLocator = page.locator(meta.surface).first();
  await surfaceLocator.waitFor({ timeout: 120_000 });
  const box = await surfaceLocator.boundingBox();
  if (!box) throw new Error(`${workload}: no interaction surface at ${meta.surface}`);
  const ctx = { box, surface: meta.surface, range: meta.range };

  /* --- warm-up, discarded --- */
  await startRecording(page);
  await page.waitForTimeout(WARMUP_MS);
  await stopRecording(page);

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
  const countsNow = () => page.evaluate(() => window.__perf?.counts());
  for (const name of PASSES[workload] ?? []) {
    if (name === "rangeDrag" && !meta.range) continue;
    await PREPARE[name]?.(page, ctx);
    const before = await countsNow();
    await startRecording(page);
    await gestures[name](page, ctx);
    const s = stats(await stopRecording(page));
    const after = await countsNow();
    s.commits = {
      viewport: (after?.viewport ?? 0) - (before?.viewport ?? 0),
      active: (after?.active ?? 0) - (before?.active ?? 0),
    };
    s.inert = s.commits.viewport + s.commits.active === 0;
    result.passes[name] = s;
  }

  /* --- invariants: commits per frame, layout reads in pointer dispatch --- */
  result.invariants = await readInvariants(page, ctx);

  /* --- self-check 1: can the timer see a slow frame? --- */
  await startBurn(page);
  await startRecording(page);
  await sweep(page, box, 1200);
  const control = stats(await stopRecording(page));
  await stopBurn(page);
  result.selfCheck.control = control;
  result.selfCheck.controlDegraded = controlDegraded(result.passes.idle, control);

  /* --- self-check 2: is this workload dense enough to discriminate? --- */
  await page.evaluate(() => window.__perf?.pathological(true));
  await startRecording(page);
  await sweep(page, box, 1500);
  const mutated = stats(await stopRecording(page));
  const rebuilds = await page.evaluate(() => window.__perf?.pathological(false) ?? 0);
  result.selfCheck.mutated = mutated;
  result.selfCheck.mutationRebuilds = rebuilds;
  // The mutation must have RUN before its result means anything — the probe
  // rule. A mutation that silently failed to attach reports a clean pass.
  result.selfCheck.mutationApplied = rebuilds > 0;
  result.selfCheck.discriminating = rebuilds > 0 && mutated.p95 > ACCEPTANCE_MS;

  /* --- inspected-value read: what a reader lands on --- */
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2);
  await page.waitForTimeout(120);
  result.inspected.raw = await page.evaluate(() => window.__perf?.lastActive());

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
      await startRecording(page);
      await sweep(page, box, DURATION_MS);
      result.decimation.passes[candidate] = { settleMs, hover: stats(await stopRecording(page)) };
      // The inspected-value read at the SAME pixel as the raw read above, which
      // is what makes the two comparable: same cursor position, different drawn
      // data, so the difference is what a reader would misread by.
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2);
      await page.waitForTimeout(120);
      result.inspected[candidate] = await page.evaluate(() => window.__perf?.lastActive());
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
        criterion: `gesture reached the chart · ${name}`,
        pass: false,
        detail: "0 viewport and 0 active commits — this pass measured an idle page",
      },
    ];
  }
  return [
    {
      criterion: `p95 <= ${ACCEPTANCE_MS.toFixed(1)}ms · ${name}`,
      pass: s.p95 <= ACCEPTANCE_MS,
      detail: `p95 ${s.p95}ms`,
    },
    {
      criterion: `dropped <= ${DROPPED_GATE_PCT}% · ${name}`,
      pass: s.pctDropped <= DROPPED_GATE_PCT,
      detail: `${s.pctDropped}% over 33.4ms`,
    },
  ];
}

/** The interaction-contract criteria, which frames alone cannot answer. */
const judgeInvariants = (inv) =>
  inv
    ? [
        {
          criterion: "at most one commit per frame",
          pass: inv.maxCommitsPerFrame <= 1,
          detail: `worst frame carried ${inv.maxCommitsPerFrame} commit(s) across ${inv.commits}`,
        },
        {
          criterion: "no synchronous layout read inside a pointer event",
          pass: inv.layoutReadsInPointer === 0,
          detail: `${inv.layoutReadsInPointer} read(s) across ${inv.pointerEvents} pointer events`,
        },
      ]
    : [];

/**
 * Whether the protocol froze a settle target for this one.
 *
 * Only the 20,000-value replacement and the 48-chart resize are gated, at 1s
 * p95. Reveal and unmount are RECORDED, not gated — no target was frozen for
 * them, and inventing one here would be this script deciding a number the
 * protocol deliberately left to the results.
 */
const settleIsGated = (workload, name) =>
  (workload === "w-a" && name === "replace") || (workload === "w-c" && name === "resize");

/** Settle criteria for one gated trigger. */
function judgeSettle(name, s) {
  // A trigger that changed nothing is not a fast settle. Scoring its p95 would
  // enter a passing number for work that never happened — which is exactly how
  // the 48-chart resize first reported 0.1ms and passed a 1-second gate.
  if (s.samples === 0) {
    return {
      criterion: `${name} actually changed the page`,
      pass: false,
      detail: `${s.noChange} trigger(s) mutated nothing within the settle window`,
    };
  }
  return {
    criterion: `${name} settles within ${SETTLE_GATE_MS}ms p95`,
    pass: s.p95 <= SETTLE_GATE_MS && s.noChange === 0,
    detail: `p95 ${s.p95}ms over ${s.samples} samples${s.noChange ? `, ${s.noChange} with NO CHANGE` : ""}`,
  };
}

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
      .filter(([name, s]) => s && typeof s.p95 === "number" && settleIsGated(result.workload, name))
      .map(([name, s]) => judgeSettle(name, s)),
  ];
}

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

const browser = await chromium.launch();
const results = [];

for (const workload of REQUESTED) {
  if (!PASSES[workload]) {
    console.error(`unknown workload '${workload}' — expected one of ${Object.keys(PASSES).join(", ")}`);
    await browser.close();
    process.exit(2);
  }
  for (const mode of TABLE_MODES) {
    // W-C runs with its derived tables only. Its questions are reveal, resize,
    // unmount, and heap, and its per-chart tables are twelve rows — attributing
    // cost between marks and table is not where its answer lives, so a second
    // run of forty-eight charts would spend minutes on a distinction that does
    // not apply there. W-A, W-B and W-D carry thousands of rows, and there the
    // distinction IS the finding.
    if (workload === "w-c" && mode === "none") continue;
    results.push(await runWorkload(browser, workload, mode === "none" ? "&table=none" : ""));
  }
}

await browser.close();

/* --- report --- */
console.log(`\n${conditionsLine(RATE, URL_BASE)}`);

let aborted = false;
let missed = 0;
let nonDiscriminating = 0;

for (const r of results) {
  const label = r.query ? `${r.workload}${r.query}` : r.workload;
  console.log(
    `\n=== ${label} — ${r.points.toLocaleString()} points, ${r.tableRows.toLocaleString()} table rows ===`,
  );
  for (const [name, s] of Object.entries(r.passes)) {
    const commits = s.commits ? `  commits=${s.commits.viewport}v/${s.commits.active}a` : "";
    console.log(`${row(name, s)}${commits}${s.inert ? "  << INERT" : ""}`);
  }
  console.log(row("control (+30ms/frame)", r.selfCheck.control));
  // The rebuild count is printed rather than only checked: it is the evidence
  // that the mutation ran at all, and a NON-DISCRIMINATING verdict is only
  // meaningful next to the number of rebuilds it failed to notice.
  console.log(`${row("mutated (index rebuild)", r.selfCheck.mutated)}  rebuilds=${r.selfCheck.mutationRebuilds}`);

  for (const [name, s] of Object.entries(r.settles)) {
    if (!s || typeof s.p95 !== "number") continue;
    console.log(
      `${`settle: ${name}`.padEnd(26)} p50=${String(s.p50).padStart(7)}ms  p95=${String(s.p95).padStart(7)}ms  max=${String(s.max).padStart(7)}ms  n=${s.samples}${s.noChange ? `  << ${s.noChange} NO CHANGE` : ""}`,
    );
  }
  if (r.heap) {
    console.log(
      `${"heap around unmount".padEnd(26)} before=${(r.heap.beforeBytes / 1e6).toFixed(1)}MB  after=${(r.heap.afterBytes / 1e6).toFixed(1)}MB  recovered=${r.heap.recoveredPct}%`,
    );
  }
  if (r.invariants) {
    console.log(
      `${"invariants".padEnd(26)} commits=${r.invariants.commits}  worst frame=${r.invariants.maxCommitsPerFrame}  layout reads in pointer=${r.invariants.layoutReadsInPointer}/${r.invariants.pointerEvents}`,
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

  /* --- self-checks decide whether the numbers above count --- */
  if (!r.selfCheck.controlDegraded) {
    console.error(
      `\n${label} ABORT: the +30ms control did not degrade the distribution, so the frame timer cannot see a slow frame and every figure above is decoration.`,
    );
    aborted = true;
    continue;
  }
  if (!r.selfCheck.mutationApplied) {
    console.error(
      `\n${label} ABORT: the index-rebuild mutation never ran (0 rebuilds recorded), so its result proves nothing about this workload's sensitivity.`,
    );
    aborted = true;
    continue;
  }
  if (!r.selfCheck.discriminating) {
    console.log(
      `\n${label} NON-DISCRIMINATING: forcing a full index rebuild inside every pointer event left p95 at ${r.selfCheck.mutated.p95}ms, inside the ${ACCEPTANCE_MS.toFixed(1)}ms acceptance line. A chart WITH that defect would have passed this workload, so the clean result below is not evidence that it lacks one.`,
    );
    nonDiscriminating++;
  }

  const verdicts = judge(r);
  for (const v of verdicts) {
    console.log(`  ${v.pass ? "PASS" : "MISS"}  ${v.criterion.padEnd(52)} ${v.detail}`);
    if (!v.pass) missed++;
  }
  r.verdicts = verdicts;
}

if (JSON_OUT) {
  writeFileSync(
    JSON_OUT,
    `${JSON.stringify(
      {
        recordedBy: "scripts/measure-workload-frames.mjs",
        // Deliberately NOT a hardware description. This script cannot know what
        // machine it is on, and a guessed one in a results appendix is worse
        // than a blank the operator has to fill in.
        hardware: "UNRECORDED — fill in from the protocol's frozen parameter table",
        throttle: RATE,
        budgetMs: BUDGET_MS,
        acceptanceMs: ACCEPTANCE_MS,
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
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
// A non-discriminating workload is NOT a pass. Reporting it as one is the exact
// mistake the hover harness made for a year.
process.exit(missed > 0 || nonDiscriminating > 0 ? 1 : 0);
