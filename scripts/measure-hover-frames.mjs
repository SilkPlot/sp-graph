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

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const URL = arg("url", "http://localhost:5173");
const RATE = Number(arg("rate", "4"));
const BUDGET_MS = 16.7;
const DURATION_MS = 3000;

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return {
    frames: s.length,
    p50: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    max: +s[s.length - 1].toFixed(2),
    overBudget: s.filter((d) => d > BUDGET_MS + 1).length,
    pctOver: +((s.filter((d) => d > BUDGET_MS + 1).length / s.length) * 100).toFixed(1),
  };
};

const startRecording = (page) =>
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

const stopRecording = (page) =>
  page.evaluate(() => {
    cancelAnimationFrame(globalThis.__raf);
    // Drop the first frame: it carries the gap since recording started, not work.
    return globalThis.__frames.slice(1);
  });

/** Drive the pointer back and forth across the chart for `ms`. */
async function sweep(page, box, ms) {
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "networkidle" });

const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });

const surface = page.locator('[role="application"]').first();
const box = await surface.boundingBox();
if (!box) throw new Error("no interaction surface found — is the playground built?");

// --- idle baseline: what the frame timer reads with nothing happening ---
await startRecording(page);
await page.waitForTimeout(1000);
const idle = stats(await stopRecording(page));

// --- the measurement: frames while hovering ---
await startRecording(page);
await sweep(page, box, DURATION_MS);
const hover = stats(await stopRecording(page));

// --- control: prove the harness can fail ---
await page.evaluate(() => {
  globalThis.__burn = () => {
    const end = performance.now() + 30;
    while (performance.now() < end) {
      /* deliberately block the frame */
    }
    globalThis.__burnRaf = requestAnimationFrame(globalThis.__burn);
  };
  globalThis.__burnRaf = requestAnimationFrame(globalThis.__burn);
});
await startRecording(page);
await sweep(page, box, 1200);
const control = stats(await stopRecording(page));
await page.evaluate(() => cancelAnimationFrame(globalThis.__burnRaf));

await browser.close();

const row = (name, s) =>
  `${name.padEnd(22)} frames=${String(s.frames).padStart(4)}  p50=${String(s.p50).padStart(6)}ms  p95=${String(s.p95).padStart(6)}ms  max=${String(s.max).padStart(7)}ms  over-budget=${s.pctOver}%`;

console.log(`\nCPU throttle: ${RATE}x · budget: ${BUDGET_MS}ms · url: ${URL}`);
console.log(row("idle (no pointer)", idle));
console.log(row("hover (sweeping)", hover));
console.log(row("control (+30ms/frame)", control));
if (errors.length) console.log("page errors:", errors);

// The control must degrade, or the measurement proves nothing.
const controlDegraded = control.p95 > hover.p95 * 1.5 && control.p95 > BUDGET_MS + 1;
console.log(
  `\nharness self-check: control ${controlDegraded ? "DEGRADED as expected — the timer can see a slow frame" : "DID NOT DEGRADE — measurement is not trustworthy"}`,
);
if (!controlDegraded) {
  console.error("\nABORT: the control pass did not degrade, so a passing hover figure means nothing.");
  process.exit(2);
}

const holds = hover.p95 <= BUDGET_MS + 1;
console.log(`verdict: hover p95 ${hover.p95}ms ${holds ? "<=" : ">"} ${BUDGET_MS}ms — ${holds ? "HOLDS" : "MISSES"} the budget at ${RATE}x throttle\n`);
process.exit(holds ? 0 : 1);
