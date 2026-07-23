/**
 * Measure the hover path against the 60 fps frame budget.
 *
 * ADR-0002 states the budget and explicitly says none of its numbers are
 * measurements. This is the thing that measures. Committed rather than run once
 * and quoted, so the claim can be re-checked instead of re-derived.
 *
 *   npm run dev                       # in one terminal
 *   node scripts/measure-hover-frames.mjs [--rate 4] [--url http://localhost:5173]
 *
 * Method
 * ------
 * Headless Chromium, CPU throttled via CDP `Emulation.setCPUThrottlingRate` to
 * stand in for a mid-tier machine. An in-page rAF loop records the interval
 * between frames while the pointer is driven across the chart continuously.
 * We report the distribution, not the mean: a mean hides exactly the stutter a
 * user notices, and one 60 ms frame in a smooth run is a visible hitch.
 *
 * The harness self-checks. It runs a CONTROL pass that injects deliberate busy
 * work per frame and asserts the measurement notices. A frame timer that cannot
 * report a slow frame would report success no matter what the code did — the
 * number would be decoration. If the control does not degrade, the run aborts
 * rather than print a reassuring figure.
 */
import { chromium } from "playwright";
import {
  ACCEPTANCE_MS,
  BUDGET_MS,
  BINDING_RATE,
  DURATION_MS,
  TIMER_TOLERANCE_MS,
  VIEWPORT,
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

// The frame timer, the percentile function, the acceptance line, and the control
// burn all live in `lib/perf.mjs` rather than here, because the workload harness
// reports numbers into the same appendix as this one. Two copies of a definition
// that MUST agree is the shape of defect this repository keeps finding.

const URL = arg(process.argv, "url", "http://localhost:5173");
const SELECTOR = arg(process.argv, "selector", "[data-silkplot-keyboard-surface]");
const RATE = Number(arg(process.argv, "rate", String(BINDING_RATE)));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "networkidle" });

const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });

// `[data-silkplot-keyboard-surface]`, not `[role="application"]`.
//
// This harness located the chart by `role="application"` until 2026-07-19. That
// role was REMOVED from the library on 2026-07-18 when the keyboard model became
// a single-entry composite, and the suites that assert its absence were updated
// in the same change — but this script was not. It has been unable to find a
// chart ever since, and because it runs off the per-push path nothing reported
// it: `npm run perf:hover` failed with a Playwright timeout rather than a result,
// and the last recorded frame numbers pre-date the break.
//
// The lesson is the one the detection probes exist for. A measurement that
// cannot run does not look like a failure; it looks like a number nobody has
// refreshed.
//
// The selector is an argument so this harness can be pointed at a COMPOSED
// surface as well as a single chart. What it measures is whatever box it is
// given; the caveats belong with the number, not with the script.
const surface = page.locator(SELECTOR).first();
const box = await surface.boundingBox();
if (!box) {
  throw new Error(
    `no interaction surface found at ${SELECTOR} — is the dev server ` +
      "running, and does the page render a chart with its keyboard composite enabled?",
  );
}

// --- idle baseline: what the frame timer reads with nothing happening ---
await startRecording(page);
await page.waitForTimeout(1000);
const idle = stats(await stopRecording(page));

// --- the measurement: frames while hovering ---
await startRecording(page);
await sweep(page, box, DURATION_MS);
const hover = stats(await stopRecording(page));

// --- control: prove the harness can fail ---
await startBurn(page);
await startRecording(page);
await sweep(page, box, 1200);
const control = stats(await stopRecording(page));
await stopBurn(page);

await browser.close();

console.log(`\n${conditionsLine(RATE, URL, ` · selector: ${SELECTOR}`)}`);
console.log(row("idle (no pointer)", idle));
console.log(row("hover (sweeping)", hover));
console.log(row("control (+30ms/frame)", control));
if (errors.length) console.log("page errors:", errors);

// The control must degrade, or the measurement proves nothing.
// Against IDLE, not against the hover pass: this asks whether the clock moves
// when work is added, and idle is the only pass with nothing else varying.
const degraded = controlDegraded(idle, control);
console.log(
  `\nharness self-check: control ${degraded ? "DEGRADED as expected — the timer can see a slow frame" : "DID NOT DEGRADE — measurement is not trustworthy"}`,
);
if (!degraded) {
  console.error("\nABORT: the control pass did not degrade, so a passing hover figure means nothing.");
  process.exit(2);
}

const holds = hover.p95 <= ACCEPTANCE_MS;
console.log(
  `verdict: hover p95 ${hover.p95}ms ${holds ? "<=" : ">"} ${ACCEPTANCE_MS.toFixed(1)}ms acceptance (nominal ${BUDGET_MS}ms + ${TIMER_TOLERANCE_MS.toFixed(1)}ms timer/display tolerance) — ${holds ? "PASSES" : "MISSES"} the harness at ${RATE}x throttle\n`,
);
process.exit(holds ? 0 : 1);
