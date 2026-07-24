/**
 * Score every decimation candidate against the raw density fixture.
 *
 *   npm run perf:decimation
 *
 * This is PURE COMPUTATION over the closed-form fixture: no browser, no frame
 * timer, no machine-dependent number anywhere in the output. Re-running it on
 * any machine reproduces the table exactly, which is the property that makes
 * its numbers quotable — a frame measurement needs named hardware and a quiet
 * box; this deliberately measures nothing a busy machine could move.
 *
 * Two verification oracles run BEFORE any scoring, and a failed oracle fails
 * the script. A candidate implementation is a claim about a published
 * algorithm, and each is checked against a property its own publication
 * states, not against our reading of it:
 *
 *   1. M4's theorem (Jugel et al., PVLDB 7(10), 2014) is that per-pixel-column
 *      {first, last, min, max} reproduces the EXACT pixel image of the raw
 *      line at the width the columns were derived from. So: rasterize the raw
 *      series and the M4 reduction at the reference width under the model
 *      below and require identity.
 *   2. LTTB is verified point-for-point against the author's own published
 *      implementation (`scripts/lib/lttb-reference.mjs`, transcribed verbatim
 *      from flot-downsample) on null-free inputs, where the two must agree
 *      exactly.
 *
 * ---------------------------------------------------------------------------
 * The rasterization model, stated so the pixel numbers mean one thing
 * ---------------------------------------------------------------------------
 * A W x H integer grid (the protocol's 1,100 CSS px measured container width,
 * and the workload page's 420 px chart height). A datum maps to the column
 * `floor((t - t0) / span * W)` (clamped to W-1) — the same binning M4's
 * grouping uses — and to the row `round((yMax - y) / (yMax - yMin) * (H-1))`
 * against the RAW series extent, so every candidate is drawn on the same axes
 * as the truth it is compared to (a candidate that lost the extremes would
 * otherwise be granted a rescaled, flattering canvas). Consecutive non-null
 * points connect with 1 px Bresenham segments, no anti-aliasing. This is a
 * MODEL of the line render, not a screenshot of one: it is deterministic
 * across machines, which a browser's anti-aliased compositor is not, and it
 * is the rendering model under which M4's guarantee is stated.
 *
 * Inspected-datum divergence models the chart's hit resolution: a pointer at
 * fraction f of the surface width resolves to the drawn point nearest in time
 * to `t0 + f * span` — the same nearest-in-time rule the chart's hit index
 * applies to whatever points it was given. The scripted positions include the
 * seven spread fractions, the position an earlier profiling run recorded, and
 * three planted-spike positions, because "does inspecting AT an excursion
 * still find it" is the divergence question a reader actually asks.
 */
import {
  W4_SPIKE_INDICES,
  w4Seconds,
} from "../packages/charts/test/workload-fixtures.ts";
import {
  decimationError,
  everyNth,
  minMaxBuckets,
} from "../test/perf/app/decimate.ts";
import { m4Columns } from "../test/perf/app/decimate-m4.ts";
import { lttb } from "../test/perf/app/decimate-lttb.ts";
import { WD_TARGET_POINTS } from "../test/perf/app/workloads.ts";
import { largestTriangleThreeBuckets } from "./lib/lttb-reference.mjs";

/** The protocol's measured container width and the workload page's chart height. */
const WIDTH = 1100;
const HEIGHT = 420;

const RAW = w4Seconds()[0].data;
const T0 = RAW[0].t.getTime();
const SPAN = RAW[RAW.length - 1].t.getTime() - T0;

/* ------------------------------------------------------------------------- */
/* Rasterization                                                              */
/* ------------------------------------------------------------------------- */

const rawExtent = (() => {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const d of RAW) {
    if (d.y === null) continue;
    if (d.y < lo) lo = d.y;
    if (d.y > hi) hi = d.y;
  }
  return { lo, hi };
})();

const colOf = (t) => Math.min(WIDTH - 1, Math.floor(((t - T0) / SPAN) * WIDTH));
const rowOf = (y) =>
  Math.round(((rawExtent.hi - y) / (rawExtent.hi - rawExtent.lo)) * (HEIGHT - 1));

/** Lit pixels of the 1 px polyline through `points`, as a Set of col*HEIGHT+row. */
function rasterize(points) {
  const lit = new Set();
  let prev;
  for (const d of points) {
    if (d.y === null) {
      prev = undefined; // a gap breaks the line, exactly as the gap policy draws it
      continue;
    }
    const x1 = colOf(d.t.getTime());
    const y1 = rowOf(d.y);
    if (prev === undefined) {
      lit.add(x1 * HEIGHT + y1);
    } else {
      // Bresenham between consecutive points — every segment pixel counts.
      let [x0, y0] = prev;
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        lit.add(x0 * HEIGHT + y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    }
    prev = [x1, y1];
  }
  return lit;
}

function pixelDiff(rawLit, candLit) {
  let diff = 0;
  let inter = 0;
  for (const p of rawLit) if (!candLit.has(p)) diff++;
  for (const p of candLit) {
    if (rawLit.has(p)) inter++;
    else diff++;
  }
  const union = rawLit.size + candLit.size - inter;
  return {
    identical: diff === 0,
    diffPixels: diff,
    unionPixels: union,
    mismatchRatio: +(diff / union).toFixed(4),
  };
}

/* ------------------------------------------------------------------------- */
/* Inspected-datum divergence                                                 */
/* ------------------------------------------------------------------------- */

/** Nearest drawn point in time — the hit index's rule, applied to any point set. */
function nearestByTime(points, t) {
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t.getTime() < t) lo = mid;
    else hi = mid;
  }
  const dLo = Math.abs(t - points[lo].t.getTime());
  const dHi = Math.abs(points[hi].t.getTime() - t);
  return dLo <= dHi ? points[lo] : points[hi];
}

/**
 * Where the scripted pointer lands. Spread fractions cover the surface; the
 * 49904/86399 fraction is the position an earlier profiling run recorded
 * (kept so its three-way divergence stays comparable); the three spike
 * fractions put the pointer exactly over planted excursions.
 */
const POSITIONS = [
  { label: "0.10", frac: 0.1 },
  { label: "0.25", frac: 0.25 },
  { label: "0.333", frac: 1 / 3 },
  { label: "0.50", frac: 0.5 },
  { label: "recorded", frac: 49904 / 86399 },
  { label: "0.75", frac: 0.75 },
  { label: "0.90", frac: 0.9 },
  { label: "spike@21600", frac: (21600 * 1000) / SPAN },
  { label: "spike@43200", frac: (43200 * 1000) / SPAN },
  { label: "spike@71111", frac: (71111 * 1000) / SPAN },
];

const sourceIndex = (d) => Math.round((d.t.getTime() - T0) / 1000);

function divergence(points) {
  const rows = POSITIONS.map(({ label, frac }) => {
    const t = T0 + frac * SPAN;
    const raw = nearestByTime(RAW, t);
    const shown = nearestByTime(points, t);
    return {
      position: label,
      rawIndex: sourceIndex(raw),
      rawY: raw.y,
      shownIndex: sourceIndex(shown),
      shownY: shown.y,
      deltaSeconds: sourceIndex(shown) - sourceIndex(raw),
      deltaY: shown.y === null || raw.y === null ? null : +(shown.y - raw.y).toFixed(1),
    };
  });
  const dys = rows.filter((r) => r.deltaY !== null).map((r) => Math.abs(r.deltaY));
  const dts = rows.map((r) => Math.abs(r.deltaSeconds));
  return {
    rows,
    maxAbsDeltaY: +Math.max(...dys).toFixed(1),
    meanAbsDeltaY: +(dys.reduce((a, b) => a + b, 0) / dys.length).toFixed(2),
    maxAbsDeltaSeconds: Math.max(...dts),
    meanAbsDeltaSeconds: +(dts.reduce((a, b) => a + b, 0) / dts.length).toFixed(1),
  };
}

/* ------------------------------------------------------------------------- */
/* Oracles                                                                    */
/* ------------------------------------------------------------------------- */

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`ORACLE FAIL: ${msg}`);
};

// 1. M4 pixel identity at the width the columns derive from (4 tuples/column).
const rawLit = rasterize(RAW);
const m4AtWidth = m4Columns(RAW, WIDTH * 4);
const m4WidthPixels = pixelDiff(rawLit, rasterize(m4AtWidth));
if (m4WidthPixels.identical) {
  console.log(
    `VERIFY m4: pixel-identical to raw at ${WIDTH}-column width ` +
      `(${m4AtWidth.length} points, ${rawLit.size} lit pixels) — the paper's theorem holds on this fixture`,
  );
} else {
  fail(
    `m4 at ${WIDTH} columns differs from raw by ${m4WidthPixels.diffPixels} pixels — ` +
      `either the implementation or the rasterization model breaks the theorem; do not use these numbers`,
  );
}

// 2. LTTB against the author's own implementation, point-for-point.
const toPairs = (points) => points.map((d) => [d.t.getTime(), d.y]);
for (const [label, n, threshold] of [
  ["full fixture @ 2000", RAW.length, WD_TARGET_POINTS],
  ["first 5000 @ 500", 5000, 500],
]) {
  const slice = RAW.slice(0, n);
  const ours = lttb(slice, threshold);
  const reference = largestTriangleThreeBuckets(toPairs(slice), threshold);
  const same =
    ours.length === reference.length &&
    ours.every(
      (d, i) => d.t.getTime() === reference[i][0] && d.y === reference[i][1],
    );
  if (same) {
    console.log(`VERIFY lttb: matches the reference implementation on ${label} (${ours.length} points)`);
  } else {
    fail(`lttb diverges from the reference implementation on ${label}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  /* ----------------------------------------------------------------------- */
  /* Scoring                                                                  */
  /* ----------------------------------------------------------------------- */

  const candidates = [
    ["min-max", minMaxBuckets(RAW, WD_TARGET_POINTS)],
    ["lttb", lttb(RAW, WD_TARGET_POINTS)],
    ["m4", m4Columns(RAW, WD_TARGET_POINTS)],
    // The naive candidate is reported as the labelled sanity check it is —
    // its role is to prove the scorer can see a bad answer, not to compete.
    ["every-nth (sanity check)", everyNth(RAW, WD_TARGET_POINTS)],
    // M4 at the width-derived budget the theorem is stated for. Over budget
    // by construction (4 x 1,100 = 4,400 points); reported so the cost of
    // the guarantee is visible next to the budget-constrained rows.
    [`m4 @ ${WIDTH * 4} (width-derived)`, m4AtWidth],
  ];

  const results = candidates.map(([name, out]) => ({
    ...decimationError(name, RAW, out, W4_SPIKE_INDICES),
    pixels: pixelDiff(rawLit, rasterize(out)),
    divergence: divergence(out),
  }));

  const pad = (v, n) => String(v).padStart(n);
  console.log(
    `\n${"candidate".padEnd(28)}${pad("out", 6)}${pad("maxErr", 8)}${pad("meanErr", 9)}` +
      `${pad("min/max", 9)}${pad("spikes", 8)}${pad("pxDiff", 8)}${pad("pxRatio", 9)}`,
  );
  for (const r of results) {
    console.log(
      `${r.candidate.padEnd(28)}${pad(r.outPoints, 6)}${pad(r.maxAbsError, 8)}` +
        `${pad(r.meanAbsError, 9)}${pad(`${r.keptMin ? "y" : "n"}/${r.keptMax ? "y" : "n"}`, 9)}` +
        `${pad(`${r.spikesKept}/${r.spikesTotal}`, 8)}${pad(r.pixels.diffPixels, 8)}` +
        `${pad(r.pixels.mismatchRatio, 9)}`,
    );
  }

  console.log(
    `\n${"candidate".padEnd(28)}${pad("max|dY|", 9)}${pad("mean|dY|", 10)}` +
      `${pad("max|dt|s", 10)}${pad("mean|dt|s", 11)}   (inspected-datum divergence, ${POSITIONS.length} positions)`,
  );
  for (const r of results) {
    const d = r.divergence;
    console.log(
      `${r.candidate.padEnd(28)}${pad(d.maxAbsDeltaY, 9)}${pad(d.meanAbsDeltaY, 10)}` +
        `${pad(d.maxAbsDeltaSeconds, 10)}${pad(d.meanAbsDeltaSeconds, 11)}`,
    );
  }

  console.log(`\n${JSON.stringify({ width: WIDTH, height: HEIGHT, target: WD_TARGET_POINTS, results }, null, 2)}`);
}
