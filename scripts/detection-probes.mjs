#!/usr/bin/env node
/**
 * The detection probes.
 *
 * A test suite proves nothing about the code until somebody has watched it FAIL.
 * A green run says "these assertions did not fire"; it does not say "these
 * assertions would fire if the behaviour broke". Those are different claims, and
 * only the second one is worth anything. A refactor that guts a suite — an
 * assertion softened to a truism, a loop that iterates over an empty array, a
 * helper that swallows the throw it was supposed to surface — reports green, and
 * green is what everyone reads.
 *
 * So each probe here breaks one real behaviour in one real source file, runs the
 * suite that claims to cover it, and requires that suite to GO RED. Then it puts
 * the file back and requires green to return. The suites were mutation-proved by
 * hand once; this script is that proof, executable, so the next session inherits
 * evidence rather than a claim.
 *
 * `npm run perf:hover` already works this way — it burns 30ms of a frame in a
 * control pass and aborts if the timer fails to notice. Same idea, wider scope.
 *
 * ---------------------------------------------------------------------------
 * The failure mode this script is most likely to have
 * ---------------------------------------------------------------------------
 *
 * A probe whose mutation SILENTLY FAILS TO APPLY. It runs the suite against
 * unmodified source, the suite passes, and the probe — if it only checked "did
 * something happen" — reports a clean pass having proved nothing at all. It
 * looks exactly like a working gate. This happened three separate times while
 * the probes were being developed by hand: a stale file wiped by a clean step, a
 * regex that never matched because the code used a guard clause where the
 * pattern assumed a `.filter()`, and an untracked file invisible to the tooling
 * that was looking for it.
 *
 * Every probe therefore proves its own mutation before it trusts the run:
 *
 *   1. The anchor text must appear EXACTLY ONCE in the file. Zero occurrences
 *      means the code moved and the probe is stale; more than one means the
 *      probe cannot say which site it hit.
 *   2. After writing, the file is re-read from disk and must differ from the
 *      backup, and must contain the replacement.
 *   3. Any of that failing is a BROKEN PROBE — it fails the run loudly. A probe
 *      that cannot apply must never skip quietly, because a quiet skip is
 *      indistinguishable from a pass.
 *
 * ---------------------------------------------------------------------------
 * Telling a real detection from a crash
 * ---------------------------------------------------------------------------
 *
 * A non-zero exit code is not evidence. A browser that fails to launch exits
 * non-zero. An out-of-memory kill exits non-zero — and on this class of machine
 * that is a live risk, because swap exhaustion takes Chromium out with SIGTRAP,
 * which reads exactly like a code defect. A syntax error from a botched mutation
 * exits non-zero having executed nothing.
 *
 * So a probe's run counts as a detection only when all four hold:
 *
 *   - the run failed;
 *   - it executed the SAME NUMBER OF TESTS as the clean baseline run for that
 *     project, so nothing collapsed, was skipped, or failed to collect;
 *   - at least `minFailures` tests failed, every one of them inside the files the
 *     probe declares — a mutation that reddens a suite it has no business
 *     touching is not the detection being claimed. `failingIn` is a SET rather
 *     than one path because several suites are split by subject (`BarChart` and
 *     `BarChart-reactive`), and the split is a property of the suites, not of the
 *     defect;
 *   - at least one failure message matches the expected shape, so the suite
 *     failed for the reason the probe induced and not for an unrelated one;
 *   - and tests OUTSIDE the affected file still passed, which is the direct
 *     evidence that the run really ran.
 *
 * `minFailures` is a floor rather than an equality. The counts observed by hand
 * are recorded next to each probe for the record, but asserting them exactly
 * would make this script fail every time somebody ADDS a test — punishing the
 * behaviour it exists to encourage. The floor plus the file constraint plus the
 * message match is specific enough that a coincidental red cannot satisfy it.
 *
 * ---------------------------------------------------------------------------
 * Restoration
 * ---------------------------------------------------------------------------
 *
 * Leaving a mutated source file in the tree would be far worse than the problem
 * this script solves. Every mutation is written inside a try/finally, restored
 * from an in-memory backup, and verified byte-identical by SHA-256 before the
 * probe is allowed to report anything. A restoration that does not verify is a
 * hard exit with the path named, not a warning.
 *
 * **`try/finally` does not survive a SIGKILL, and this has now happened.** A run
 * killed by an external timeout mid-probe left `packages/core/src/series.ts`
 * carrying the ignored-gap mutation, with no message anywhere saying so. The
 * mutation is a plausible-looking one-line simplification, so a reviewer
 * skimming the diff would not necessarily flinch at it.
 *
 * Two things caught it, and both are worth keeping:
 *
 *   - The dirty-tree refusal below. The next run would not start, and said
 *     exactly which file and why. That check exists to stop a probe backing up
 *     already-modified work — and it doubles as the alarm for this.
 *   - `git status` being clean before a commit. The stray edit was invisible in
 *     the test suites, because a probe mutation is *supposed* to keep the code
 *     compiling; it fails a suite, not the compiler.
 *
 * So: this script runs to completion or it leaves a mess. Do not wrap it in a
 * timeout that can kill it, and if a run is interrupted, `git status` before
 * doing anything else.
 *
 * ---------------------------------------------------------------------------
 * Why this is not on the per-push critical path
 * ---------------------------------------------------------------------------
 *
 * It runs three Vitest projects clean and then once per probe — ten browser and
 * node runs in sequence, several minutes of wall clock. Putting that in front of
 * every push buys nothing: the probes prove a property of the SUITES, which
 * changes when somebody edits a suite, not on every commit. It is wired as its
 * own scheduled workflow (`.github/workflows/detection-probes.yml`) with a
 * manual trigger, so it can never fail a build it was not meant to gate and can
 * never share a runner with the Vitest browser projects.
 *
 * Run it by hand before touching any suite named below:
 *
 *   npm run probe:detection
 *   npm run probe:detection -- --only extent-finite-guard
 *   npm run probe:detection -- --list
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One fixed port for every run, and never two runs at once.
 *
 * Vitest's browser mode auto-probes for a free port. Two runners started
 * concurrently collide, and the collision does not report as one: it reports a
 * connect timeout, executes ZERO tests, and finishes in about a second. That is
 * a run this script would otherwise have to interpret, and "zero tests executed"
 * is precisely the shape of a probe proving nothing. Pinning the port makes the
 * collision immediate and obvious instead of silent.
 */
const BROWSER_API_PORT = 65300;

/**
 * The probes.
 *
 * `anchor` is text verified to exist in the file as written — not a guessed
 * pattern. `observed` records what the mutation produced when it was run by
 * hand, for the record; `minFailures` is what the script enforces.
 */
const PROBES = [
  {
    id: "semantics-strict-throw",
    file: "packages/solid/src/semantics.ts",
    project: "charts",
    browser: true,
    breaks:
      "the name/description contract fails loud in development — remove the throw and a " +
      "chart with no accessible name ships silently",
    anchor: "    if (strict) throw new Error(message);",
    mutation: "    /* probe: strict throw removed */",
    failingIn: ["packages/charts/test/chart-semantics.test.tsx"],
    minFailures: 4,
    observed: "4 failures, “expected [Function] to throw an error”",
    messagePattern: /to throw an error/,
  },
  {
    id: "announcer-queue-window",
    file: "packages/solid/src/ChartAnnouncer.tsx",
    project: "solid",
    browser: true,
    breaks:
      "announcements are throttled into a window — write straight through and a keyboard walk " +
      "floods the live region with every step it passed",
    anchor: "    if (timer !== undefined) {\n      pending = text;\n      return;\n    }",
    mutation: "    if (timer !== undefined) {\n      write(text);\n      return;\n    }",
    failingIn: ["packages/solid/test/announcer.test.tsx"],
    minFailures: 3,
    observed: "3 failures showing the flooded sequence, e.g. ['point 1','point 2',…]",
    messagePattern: /point 2/,
  },
  {
    id: "area-zero-baseline-domain",
    file: "packages/charts/src/AreaChart.tsx",
    project: "charts",
    browser: true,
    breaks:
      "Area's y-domain includes zero because its fill is drawn FROM zero — collapse it onto " +
      "Line's `zero-floor` and an all-negative series draws its baseline on a labelled non-zero pixel",
    anchor: 'domain: "zero-baseline"',
    mutation: 'domain: "zero-floor"',
    failingIn: [
      "packages/charts/test/AreaChart.test.tsx",
      "packages/charts/test/AreaChart-reactive.test.tsx",
    ],
    minFailures: 2,
    observed: "2 failures, on the -75-against-0 and ~60-against-0 pixel values",
    messagePattern: /expected/,
  },
  {
    id: "bar-negative-height",
    file: "packages/charts/src/BarChart.tsx",
    project: "charts",
    browser: true,
    breaks:
      "a bar's height is a magnitude — take the raw difference instead and every bar below the " +
      "baseline gets a negative height, which SVG discards without complaint",
    anchor: "height={Math.abs(at() - zero())}",
    mutation: "height={at() - zero()}",
    failingIn: [
      "packages/charts/test/BarChart.test.tsx",
      "packages/charts/test/BarChart-reactive.test.tsx",
      // Widened when ranked bars landed: the new suite legitimately reddens on
      // this mutation because it asserts the vertical negative case too. The
      // probe REFUSED rather than passing over a blast radius it no longer
      // described, which is the behaviour that makes a declared radius worth
      // anything - the suite was not loosened to keep the old claim true.
      "packages/charts/test/ranked-bars.test.tsx",
    ],
    minFailures: 7,
    observed: "9 failures, e.g. “expected -103.08 to be greater than or equal to 0”",
    messagePattern: /to be greater than or equal to 0/,
  },
  {
    id: "bar-horizontal-baseline",
    file: "packages/charts/src/BarChart.tsx",
    project: "charts",
    browser: true,
    breaks:
      "the HORIZONTAL mirror of the negative-bar defect. A bar's width is a magnitude too - take " +
      "the raw difference and every bar left of the baseline gets a negative width, which SVG " +
      "discards silently. Separate from bar-negative-height because the two orientations are " +
      "separate branches: fixing one has never fixed the other",
    anchor: "width={Math.abs(at() - zero())}",
    mutation: "width={at() - zero()}",
    failingIn: ["packages/charts/test/ranked-bars.test.tsx"],
    minFailures: 1,
    observed: "1 failure: the horizontal negative bar renders a negative width",
    messagePattern: /to be greater than 0/,
  },
  {
    id: "bar-label-truncation",
    file: "packages/charts/src/BarChart.tsx",
    project: "charts",
    browser: true,
    breaks:
      "returning every label untruncated. The axis then renders the full text, which on a crowded " +
      "categorical axis collides into an unreadable smear - the picture this default exists to bound",
    anchor: "return label.length > DEFAULT_LABEL_MAX_CHARS",
    mutation: "return false && label.length > DEFAULT_LABEL_MAX_CHARS",
    failingIn: [
      "packages/charts/test/ranked-bars.test.tsx",
      // The workload gate's W3 truncation case asserts the same ellipsis, so it
      // legitimately reddens too — a declared suite, not a stray.
      "packages/charts/test/workload.test.tsx",
    ],
    minFailures: 1,
    observed: "1 failure: the axis renders the full label, so no ellipsis is present",
    messagePattern: /to contain/,
  },
  {
    id: "ranked-identity-by-label",
    file: "packages/core/src/ranked.ts",
    project: "core",
    browser: false,
    breaks:
      "building the band domain from LABELS instead of ids. Two categories sharing display text " +
      "then collapse into one band slot and stack their bars - precisely the failure that " +
      "caller-supplied identity exists to prevent, and it renders without error",
    anchor: "bandDomain: categories.map((c) => c.id),",
    mutation: "bandDomain: categories.map((c) => c.label),",
    failingIn: ["packages/core/test/ranked.test.ts"],
    minFailures: 1,
    observed: "3 failures: two categories collapse onto one band slot",
    messagePattern: /Regional total/,
  },
  {
    id: "extent-finite-guard",
    file: "packages/core/src/extent.ts",
    project: "core",
    browser: false,
    breaks:
      "extent skips non-finite values — drop the guard and one NaN or null in a series poisons " +
      "the whole domain, which every scale downstream then inherits",
    anchor: "    if (!Number.isFinite(v)) continue;\n",
    mutation: "",
    failingIn: ["packages/core/test/extent.test.ts"],
    minFailures: 9,
    observed: "9 failures, e.g. “expected [ null, null ] to deeply equal [ +0, 1 ]”",
    messagePattern: /to deeply equal/,
  },
  {
    id: "time-scope-isolation",
    file: "packages/core/src/time-scope.ts",
    project: "core",
    browser: false,
    breaks:
      "a section that declared its own scope is isolated from the dynamic selection — invert the " +
      "precedence and a drag on one chart silently retargets a section that opted out of following it",
    anchor: "  const narrowing = section ?? scopes.dynamic;",
    mutation: "  const narrowing = scopes.dynamic ?? section;",
    failingIn: ["packages/core/test/time-scope.test.ts"],
    minFailures: 2,
    observed:
      "2 failures carrying the defect's own instants, e.g. “expected { start: 300 } to deeply equal { start: 600 }”",
    messagePattern: /to deeply equal/,
  },
  {
    id: "active-point-duplicate-time",
    file: "packages/core/src/active-point.ts",
    project: "core",
    browser: false,
    breaks:
      "duplicate timestamps in a series resolve to the lowest sourceIndex — keep the first array " +
      "occurrence instead and a pointer and a keyboard can land on a different one of two stacked readings",
    anchor:
      "      if (existing === undefined || options.sourceIndex(d) < options.sourceIndex(existing)) {",
    mutation: "      if (existing === undefined) {",
    failingIn: ["packages/core/test/active-point.test.ts"],
    minFailures: 1,
    observed: "1 failure, “expected 2 to be +0” (the kept datum's sourceIndex)",
    messagePattern: /expected 2 to be \+0/,
  },
  {
    id: "active-point-tie-lower-ordinal",
    file: "packages/core/src/active-point.ts",
    project: "core",
    browser: false,
    breaks:
      "an exact midpoint tie resolves to the lower ordinal (the earlier instant) — flip it to the " +
      "higher and a pointer exactly between two instants snaps to the wrong one",
    anchor: "  return dLo <= dHi ? lo : hi;",
    mutation: "  return dLo < dHi ? lo : hi;",
    failingIn: ["packages/core/test/active-point.test.ts"],
    minFailures: 2,
    observed: "2 failures (the search tie and the time-index tie), e.g. “expected 1 to be +0”",
    messagePattern: /expected 1 to be \+0/,
  },
  {
    id: "active-point-band-left-inclusive",
    file: "packages/core/src/active-point.ts",
    project: "core",
    browser: false,
    breaks:
      "a band is selected on a left-inclusive [start, end) test — make the left edge exclusive and " +
      "the pointer falls into no band exactly on a boundary the caller expects to hit",
    anchor: "        if (coord >= options.bandStart(d, i) && coord < options.bandEnd(d, i)) return i;",
    mutation: "        if (coord > options.bandStart(d, i) && coord < options.bandEnd(d, i)) return i;",
    failingIn: ["packages/core/test/active-point.test.ts"],
    minFailures: 1,
    observed: "1 failure, “expected -1 to be +0” (the left-edge band lookup)",
    messagePattern: /expected -1 to be \+0/,
  },
  {
    id: "inspection-pointer-resolve",
    file: "packages/solid/src/createChartInspection.ts",
    project: "charts",
    browser: true,
    breaks:
      "a pointer move resolves the nearest datum and writes it — never resolve and hover " +
      "stops surfacing anything: no crosshair, no tooltip, no announcement",
    anchor: "    active.set(ordinal < 0 ? undefined : ordinal);",
    mutation: "    active.set(undefined);",
    failingIn: ["packages/charts/test/inspection-hover.test.tsx"],
    minFailures: 3,
    observed: "several hover assertions, e.g. “expected null not to be null” (the crosshair)",
    messagePattern: /not to be null/,
  },
  {
    id: "inspection-clear-on-leave",
    file: "packages/solid/src/createChartInspection.ts",
    project: "charts",
    browser: true,
    breaks:
      "leaving the plot clears the active point — drop the clear and a phantom cursor, tooltip, " +
      "and announcement stay pinned where the pointer last was",
    anchor: "    active.clear();",
    mutation: "    void 0; /* probe: clear removed */",
    failingIn: ["packages/charts/test/inspection-hover.test.tsx"],
    minFailures: 1,
    observed: "1 failure, “expected <g …> to be null” (the crosshair after leave)",
    messagePattern: /to be null/,
  },
  {
    id: "active-point-shared-attime",
    file: "packages/core/src/active-point.ts",
    project: "core",
    browser: false,
    breaks:
      "a shared-time record carries every visible series' value at the instant — drop atTime and " +
      "a multi-series tooltip cannot show the other series at the hovered time",
    anchor: "      atTime: column.entries,",
    mutation: "      atTime: undefined,",
    failingIn: ["packages/core/test/active-point.test.ts"],
    minFailures: 1,
    observed: "1 failure, “expected undefined to deeply equal [ 'a', 'b' ]”",
    messagePattern: /to deeply equal/,
  },
  {
    id: "overlap-duplicate-key",
    file: "packages/core/src/overlap.ts",
    project: "core",
    browser: false,
    breaks:
      "a duplicate pack key throws — swallow it and two items sharing a key map to two lanes, " +
      "which no rendering can express and nothing reports",
    anchor: "        throw new Error(",
    mutation: "        void new Error(",
    failingIn: [
      "packages/core/test/overlap.test.ts",
      "packages/core/test/overlap-identity.test.ts",
    ],
    minFailures: 2,
    observed: "2 failures, “expected [Function] to throw an error”",
    messagePattern: /to throw an error/,
  },
  {
    id: "series-identity-by-id",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "a series is identified by its id — key the lookup by position instead and a reorder " +
      "reassigns every series' data, colour, and legend toggle without anything throwing",
    anchor: "  const byId = new Map(series.map((s) => [s.id, s]));",
    mutation: "  const byId = new Map(series.map((s) => [String(s.sourceIndex), s]));",
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 4,
    observed: "identity, gap-policy and metadata lookups all miss — “expected undefined to …”",
    messagePattern: /undefined/,
  },
  {
    id: "series-metadata-preserved",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "raw datum metadata survives normalisation — drop it and a tooltip loses the unplotted " +
      "fields it exists to show, forcing every application back to a parallel join",
    anchor: "        meta: d.meta,",
    mutation: "        meta: undefined,",
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 2,
    observed: "2 failures, “expected undefined to deeply equal { serial: 'PA-99120' }”",
    messagePattern: /to deeply equal/,
  },
  {
    id: "series-no-zero-fill",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "a gap stays null — fill it with zero and a missing reading becomes indistinguishable " +
      "from a real measurement of zero, inverting the meaning of any signed series",
    anchor: '        y: state === "present" ? (d.y as number) : null,',
    mutation: '        y: state === "present" ? (d.y as number) : 0,',
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 3,
    observed: "gaps read as 0 — “expected 0 to be null” and a domain floored at zero",
    messagePattern: /to be null|to deeply equal/,
  },
  {
    id: "series-finite-domain",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "a non-finite value is classified invalid and kept out of the domain — admit it as " +
      "present and one NaN poisons the extent every scale downstream inherits",
    anchor: '  return Number.isFinite(y) ? "present" : "invalid";',
    mutation: '  return "present";',
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 3,
    observed: "domains go non-finite — “expected [ NaN, NaN ] to deeply equal [ +0, 1 ]”",
    messagePattern: /to deeply equal|to be/,
  },
  {
    id: "multi-series-palette-stability",
    file: "packages/charts/src/MultiSeriesBody.tsx",
    project: "charts",
    browser: true,
    breaks:
      "a series' palette slot comes from its position in the CALLER's array — key it on " +
      "visible position instead and hiding one series silently recolours the rest",
    anchor: "              resolveSeriesStyle(series.style, series.sourceIndex, {",
    mutation: "              resolveSeriesStyle(series.style, i(), {",
    // Two suites, the second added with the legend. The legend/mark seam test
    // compares swatch colours to mark colours, so a palette shift on hiding
    // reddens it too — a genuinely wider blast radius rather than a mutation
    // touching something it should not.
    failingIn: [
      "packages/charts/test/multi-series.test.tsx",
      "packages/charts/test/legend-identity.test.tsx",
    ],
    minFailures: 1,
    observed: "the hidden series' colour shifts from --sp-cat-1 to --sp-cat-0",
    messagePattern: /to be|expected/,
  },
  {
    id: "multi-series-ignored-gap",
    file: "packages/core/src/series.ts",
    project: "charts",
    browser: true,
    breaks:
      "a `connect` series drops its gaps before the path generator sees them — keep them and " +
      "the generator scales a null, which coerces to ZERO and draws a spike to the baseline. " +
      "Mutating CORE and asserting CHARTS reddens is the point: it proves the composed chart " +
      "consumes the shared gap policy rather than carrying a copy of it",
    anchor: '      points: series.data.filter((d) => d.state === "present"),',
    mutation: "      points: series.data,",
    failingIn: [
      "packages/charts/test/multi-series.test.tsx",
      // The workload gate's W1/W2 gap-policy cases consume the same shared policy,
      // so they redden on this mutation too — a declared suite, not a stray.
      "packages/charts/test/workload.test.tsx",
    ],
    minFailures: 1,
    observed: "connect no longer yields one subpath; a gap reaches the baseline",
    messagePattern: /expected|to be/,
  },
  {
    id: "multi-series-signed-domain",
    file: "packages/charts/src/LineChart.tsx",
    project: "charts",
    browser: true,
    breaks:
      "the multi-series line keeps its own y-domain policy — swap it for the area's and an " +
      "all-negative series is padded to zero at the wrong end, which only signed data reveals.\n" +
      "      The blast radius WIDENED when reference overlays landed, and this list was " +
      "updated rather than the new suite loosened. `reference-overlay.test.tsx` rebuilds " +
      "Line's expected scale under the named `zero-floor` policy — it has to, because a " +
      "reference's whole contract is that it lands where the marks put the same value — so " +
      "it legitimately goes red on this mutation too. A probe's `failingIn` is a claim about " +
      "which suites cover a behaviour, so a second suite genuinely covering it belongs here.",
    anchor: '        yDomain="zero-floor"',
    mutation: '        yDomain="extent"',
    failingIn: [
      "packages/charts/test/multi-series.test.tsx",
      "packages/charts/test/reference-overlay.test.tsx",
    ],
    minFailures: 1,
    observed: "the union-domain test reads a different pixel for the same value",
    messagePattern: /to be close to|expected/,
  },
  {
    id: "table-format-ignored",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "the caller's value formatter is applied to the table cell — drop it and every cell falls " +
      "back to the generic default, which is the ONE failure mode a formatter has: the chart " +
      "renders perfectly, with the library's wording where the application's should be",
    anchor: "      return formatValue === undefined ? d.y : formatValue(d.y, label);",
    mutation: "      return d.y;",
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 1,
    observed: "formatted cells read as bare numbers",
    messagePattern: /expected|toEqual/,
  },
  {
    id: "table-format-fills-gaps",
    file: "packages/core/src/series.ts",
    project: "core",
    browser: false,
    breaks:
      "a gap short-circuits BEFORE the value formatter. Reorder it and the formatter is handed " +
      "a missing reading, which prints a unit against a measurement nobody took — the same " +
      "class of failure as a gap becoming zero, one layer up",
    anchor: '      if (d === undefined || d.y === null) return "";\n      return formatValue',
    mutation:
      '      if (d === undefined) return "";\n      if (d.y === null) return formatValue === undefined ? "" : formatValue(0, label);\n      return formatValue',
    failingIn: ["packages/core/test/series.test.ts"],
    minFailures: 1,
    observed: "a gap cell carries a formatted zero instead of staying empty",
    messagePattern: /expected|toEqual/,
  },
  {
    id: "axis-format-crossed",
    file: "packages/charts/src/MultiSeriesBody.tsx",
    project: "charts",
    browser: true,
    breaks:
      "each axis gets its OWN formatter. Wire the x formatter to both and a chart formatting " +
      "only one axis silently formats the other with a function written for a different value " +
      "kind — a `Date` formatter handed a number, which does not throw, it just reads wrong",
    anchor: "        yFormat={props.yTickFormat}",
    mutation: "        yFormat={props.xTickFormat as never}",
    failingIn: ["packages/charts/test/multi-series.test.tsx"],
    minFailures: 1,
    observed: "the y axis carries the x axis' wording",
    messagePattern: /expected|to be/,
  },
  {
    id: "resize-updates-dropped",
    file: "packages/solid/src/createResize.ts",
    project: "charts",
    browser: true,
    breaks:
      "the observer keeps REPORTING size after the initial seed. Drop its updates and a chart " +
      "keeps whatever width it had when it mounted — every path stays self-consistent and " +
      "agrees with every other path, so a test asserting only that the series agree passes " +
      "against a chart frozen at the wrong size. That is the shape this probe guards",
    anchor:
      "      const box = entry.contentBoxSize?.[0];\n" +
      "      if (box) {\n" +
      "        setSize({ width: box.inlineSize, height: box.blockSize });\n" +
      "      } else {\n" +
      "        const rect = entry.contentRect;\n" +
      "        setSize({ width: rect.width, height: rect.height });\n" +
      "      }",
    mutation: "      void entry;",
    failingIn: [
      "packages/charts/test/multi-series.test.tsx",
      // The workload gate's W1 repeated-resize case is the first test in the
      // repository to drive successive resizes; it reddens here by design — a
      // declared suite, not a stray.
      "packages/charts/test/workload.test.tsx",
    ],
    minFailures: 3,
    observed: "geometry stays frozen at the mount-time width across every resize",
    messagePattern: /expected|to be/,
  },
  {
    id: "legend-mark-identity",
    file: "packages/solid/src/Legend.tsx",
    project: "charts",
    browser: true,
    breaks:
      "the legend resolves each swatch from the series' OWN palette slot, the same index the " +
      "mark uses. Pin it to slot 0 and every swatch shows series A's colour beside every other " +
      "series' label — a legend that still renders, toggles, and announces correctly while " +
      "being wrong about every series it describes.\n" +
      "      Note what this probe deliberately does NOT do: mutating the SHARED resolver in " +
      "`core` moves the swatch and the mark together, so they stay equal and the seam suite " +
      "stays green. That is correct — a shared change should move both — and it is why the " +
      "mutation has to break one consumer rather than the source they share.",
    anchor: "            resolveSeriesStyle(series.style, i(), { area: false }),",
    mutation: "            resolveSeriesStyle(series.style, 0, { area: false }),",
    failingIn: ["packages/charts/test/legend-identity.test.tsx"],
    minFailures: 1,
    observed: "swatch colours no longer line up with their own marks",
    messagePattern: /expected|toEqual/,
  },
  {
    id: "legend-colour-only",
    file: "packages/solid/src/Legend.tsx",
    project: "solid",
    browser: true,
    breaks:
      "a legend swatch carries the dash channel as well as the colour. Drop it and two series " +
      "a colour-blind reader sees as one hue become genuinely indistinguishable — the failure " +
      "ADR-0005 §5 forbids, and one that no structural assertion about the legend would catch",
    anchor: "                  stroke-dasharray={style().dash}",
    mutation: "                  stroke-dasharray={undefined}",
    failingIn: ["packages/solid/test/legend.test.tsx"],
    minFailures: 1,
    observed: "every swatch is solid; colour becomes the only channel",
    messagePattern: /expected|to be/,
  },
  {
    id: "reference-scale-drift",
    file: "packages/charts/src/MultiSeriesBody.tsx",
    project: "charts",
    browser: true,
    breaks:
      "a reference line is positioned by the SAME scale the marks are. Flip it about the " +
      "plot's mid-line — the shape of a genuine SVG-origin 'fix', since y grows downward — " +
      "and the threshold is drawn at a plausible height that is simply the wrong one. " +
      "Nothing errors, no geometry is NaN, the axis is untouched, and the chart is beautiful; " +
      "an operator reads the series as crossing a limit it never crossed.\n" +
      "      This is why the suite's oracle is the RENDERED series path rather than a " +
      "recomputed scale: the reference's y must equal the y the marks put that same value at, " +
      "so a drifted overlay cannot satisfy both halves.",
    anchor: "              ? model.y()(reference.at)",
    mutation: "              ? model.bounds().innerHeight - model.y()(reference.at)",
    failingIn: ["packages/charts/test/reference-overlay.test.tsx"],
    minFailures: 1,
    observed: "reference lines sit at the wrong height while everything still renders",
    messagePattern: /expected|close to/,
  },
  {
    id: "reference-stale-value",
    file: "packages/charts/src/multi-series.ts",
    project: "charts",
    browser: true,
    breaks:
      "references are re-normalised inside a memo, so a threshold that moves is re-read. " +
      "Resolve them ONCE at setup instead — the plausible simplification, since 'a threshold " +
      "does not change' is exactly what it looks like — and the line freezes at its mount-time " +
      "value while the data keeps updating. The chart renders perfectly and the reference is " +
      "quietly describing a limit that was replaced hours ago.",
    anchor:
      "  const references = createMemo(\n" +
      "    () => normalizeReferences(spec.references?.(), { onIssue: spec.onIssue }).references,\n" +
      "  );",
    mutation:
      "  const resolvedOnce = normalizeReferences(spec.references?.(), {\n" +
      "    onIssue: spec.onIssue,\n" +
      "  }).references;\n" +
      "  const references = () => resolvedOnce;",
    failingIn: ["packages/charts/test/reference-overlay.test.tsx"],
    minFailures: 1,
    observed: "a replaced threshold never moves, and never re-scales the axis",
    messagePattern: /expected|close to|toEqual/,
  },
  {
    id: "reference-colour-only",
    file: "packages/charts/src/ReferenceOverlay.tsx",
    project: "charts",
    browser: true,
    breaks:
      "a reference carries its dash channel as well as its colour. Drop it and the line " +
      "becomes solid — visually identical to a series stroke and to the crosshair, so the one " +
      "thing separating a threshold from the data is a hue. That is the failure ADR-0005 §5 " +
      "forbids, and it is invisible to every structural assertion about the overlay: the line " +
      "is still there, still positioned correctly, still labelled.",
    anchor: '                  stroke-dasharray={p.reference.style.dash?.join(" ") ?? REFERENCE_DASH}',
    mutation: "                  stroke-dasharray={undefined}",
    failingIn: ["packages/charts/test/reference-overlay.test.tsx"],
    minFailures: 1,
    observed: "reference lines render solid; colour becomes the only channel",
    messagePattern: /expected|to be/,
  },
  {
    id: "reference-list-removed",
    file: "packages/charts/src/scaffold.tsx",
    project: "charts",
    browser: true,
    breaks:
      "the accessible reference list is what makes the overlay's collision fallback " +
      "acceptable: a label that cannot be placed is DROPPED rather than truncated or spilled " +
      "over an axis, and that is only survivable because the threshold's meaning also lives " +
      "in a real list. Remove the slot and the drawn label becomes the sole carrier — so on a " +
      "narrow container a threshold silently ceases to exist for every reader, and for a " +
      "screen-reader user it never existed at all.",
    anchor: "    {props.referenceList}",
    mutation: "    {null}",
    failingIn: [
      "packages/charts/test/reference-overlay.test.tsx",
      // The workload gate's W1 dense chart asserts the accessible reference list
      // over 22 series, so it reddens when the slot is removed — a declared suite.
      "packages/charts/test/workload.test.tsx",
    ],
    minFailures: 1,
    observed: "no reference list renders; the drawn label is the only carrier",
    messagePattern: /expected|toEqual|length/,
  },
  {
    id: "viewport-scale-divergence",
    file: "packages/solid/src/createViewport.ts",
    project: "solid",
    browser: true,
    breaks:
      "the public Date read is DERIVED from the one epoch-ms visible domain, so every " +
      "consumer — axis, gridlines, marks, the range control — sees the same window. Derive " +
      "it from anything else and the surfaces drift: the domain a reader sees stops matching " +
      "the domain the marks are drawn against (ADR-0014 §3, ADR-0017 §4).",
    anchor: "toTimeInterval(visibleMsDomain())",
    mutation: "toTimeInterval({ start: visibleMsDomain().start + 60000, end: visibleMsDomain().end })",
    failingIn: ["packages/solid/test/viewport.test.tsx"],
    minFailures: 1,
    observed: "1 failure: the public visibleDomain start no longer equals the ms domain start",
    messagePattern: /to be/,
  },
  {
    id: "viewport-unclamped-pan",
    file: "packages/core/src/viewport.ts",
    project: "core",
    browser: false,
    breaks:
      "a pan is clamped to the extent so nothing widens past the full data range (ADR-0014 " +
      "§3). Drop the clamp and a pan scrolls the window off the end of the data into empty " +
      "space, showing a range that does not exist.",
    anchor: "return slideIntoBound({ start: interval.start + deltaMs, end: interval.end + deltaMs }, bound);",
    mutation: "return { start: interval.start + deltaMs, end: interval.end + deltaMs };",
    failingIn: ["packages/core/test/viewport.test.ts"],
    minFailures: 2,
    observed: "2 failures: pan past either edge no longer stops at it",
    messagePattern: /to deeply equal/,
  },
  {
    id: "viewport-duplicate-callback",
    file: "packages/solid/src/createViewport.ts",
    project: "solid",
    browser: true,
    breaks:
      "the echo guard is what stops a controlled viewport looping: a command that resolves to " +
      "the domain already shown commits nothing and fires nothing, so a caller feeding the " +
      "emitted domain back does not re-fire (ADR-0014 §7). Remove it and the callback fires " +
      "on a no-op change.",
    anchor: "if (intervalsEqualMs(next, visibleMsDomain())) return;",
    mutation: "if (false && intervalsEqualMs(next, visibleMsDomain())) return;",
    failingIn: ["packages/solid/test/viewport.test.tsx"],
    minFailures: 1,
    observed: "1 failure: onVisibleDomainChange fires for a command that changed nothing",
    messagePattern: /to not be called|not be called/,
  },
  {
    id: "viewport-interval-authority",
    file: "packages/core/src/viewport.ts",
    project: "core",
    browser: false,
    breaks:
      "the visible interval is authoritative and stable: a data extent that merely GROWS " +
      "keeps the window and emits nothing (ADR-0014 §4), rather than being recomputed and " +
      "re-emitted the way a pixel-transform-backed viewport would be on every change. Remove " +
      "the no-op short-circuit and growth spuriously reports a change.",
    anchor: "if (intervalsEqualMs(next, prev)) return null;",
    mutation: "if (false && intervalsEqualMs(next, prev)) return null;",
    failingIn: ["packages/core/test/viewport.test.ts"],
    minFailures: 2,
    observed: "2 failures: growth and a same-source no-op no longer reconcile to null",
    messagePattern: /to be null/,
  },
  {
    id: "viewport-xscale-narrowed",
    file: "packages/charts/src/scaffold.tsx",
    project: "charts",
    browser: true,
    breaks:
      "a navigated time chart's x scale is the viewport interval, not the data extent (S007-P04b). " +
      "Ignore the interval and paint over the full extent instead, and a controlled `visibleDomain` " +
      "no longer positions the marks where the window says they are.",
    anchor: "return timeScale({ domain: [new Date(iv.start), new Date(iv.end)], range });",
    mutation: "return timeExtentScale(yData(), range);",
    failingIn: ["packages/charts/test/viewport-scope.test.tsx"],
    minFailures: 1,
    observed: "1 failure: the marks are positioned over the full extent, not the window",
    messagePattern: /close to/,
  },
  {
    id: "viewport-marks-filtered",
    file: "packages/charts/src/scaffold.tsx",
    project: "charts",
    browser: true,
    breaks:
      "the drawn marks are narrowed to the viewport interval (S007-P04b). Return the whole y-basis " +
      "instead and a zoomed-in chart paints every point, including the ones outside the window it " +
      "was told to show.",
    anchor: "    if (!sv.navigable()) return yData();",
    mutation: "    return yData();",
    failingIn: ["packages/charts/test/viewport-scope.test.tsx"],
    minFailures: 3,
    observed: "≥3 failures: the drawn point count is the whole series, not the windowed subset",
    messagePattern: /have a length/,
  },
  {
    id: "viewport-y-pinned",
    file: "packages/charts/src/LineChart.tsx",
    project: "charts",
    browser: true,
    breaks:
      "the y axis is computed from the effective-domain data (`yData`), so a zoom of x leaves y " +
      "pinned (ADR-0014 §3; S007-P04b). Feed the viewport-narrowed `visible` to the model instead " +
      "and zooming x silently autoscales y — the very coupling P04b decouples.",
    anchor: "    data: scope.yData,",
    mutation: "    data: scope.visible,",
    failingIn: ["packages/charts/test/viewport-scope.test.tsx"],
    minFailures: 1,
    observed: "1 failure: the drawn y follows the visible-subset extent, not the full-data extent",
    messagePattern: /close to/,
  },
  {
    id: "gesture-keyboard-before-datum",
    file: "packages/solid/src/ChartKeyboardSurface.tsx",
    project: "charts",
    browser: true,
    breaks:
      "the viewport keyboard runs BEFORE the datum composite (ADR-0018 §1), which is the only " +
      "thing that keeps `Shift`+arrow panning rather than stepping a datum — the datum composite " +
      "does not guard `shiftKey`. Skip the first-refusal call and pan/zoom keys never fire.",
    anchor: "if (props.beforeKeyDown?.(event)) return;",
    mutation: "if (false && props.beforeKeyDown?.(event)) return;",
    failingIn: ["packages/charts/test/viewport-gestures.test.tsx"],
    minFailures: 2,
    observed: "≥2 failures: Shift+arrow steps a datum, and +/-/0 do nothing to the viewport",
    messagePattern: /expected/,
  },
  {
    id: "gesture-wheel-modifier-gate",
    file: "packages/solid/src/createViewportGestures.ts",
    project: "charts",
    browser: true,
    breaks:
      "with `wheelZoom` on, only a MODIFIED wheel zooms — plain vertical scrolling stays the " +
      "page's, which keeps a tall dashboard scrollable (ADR-0014 §6). Drop the modifier gate and a " +
      "plain wheel over any chart traps the scroll and zooms.",
    anchor: "const zoom = plain || (wheelOn && modified);",
    mutation: "const zoom = plain || wheelOn;",
    failingIn: ["packages/charts/test/viewport-gestures.test.tsx"],
    minFailures: 1,
    observed: "1 failure: a plain (unmodified) wheel zooms instead of scrolling the page",
    messagePattern: /expected/,
  },
  {
    id: "gesture-brush-min-travel",
    file: "packages/solid/src/createViewportGestures.ts",
    project: "charts",
    browser: true,
    breaks:
      "a brush commits only past a min-travel threshold (ADR-0018 §3), so a CLICK is not a request " +
      "to zoom to a zero-width interval (which the min-span floor inflates into a jarring jump). " +
      "Drop the `moved` guard and a click zooms.",
    anchor: "    if (!moved) return;",
    mutation: "    if (false) return;",
    failingIn: ["packages/charts/test/viewport-gestures.test.tsx"],
    minFailures: 1,
    observed: "1 failure: a click below the threshold commits a zoom",
    messagePattern: /expected/,
  },
  {
    id: "gesture-autoscale-y-override",
    file: "packages/solid/src/createCartesianModel.ts",
    project: "charts",
    browser: true,
    breaks:
      "the autoscale snapshot REPLACES the data-derived y extent when set (ADR-0018 §4), which is " +
      "what makes `a` fit y to the visible values. Ignore the override and autoscale moves nothing.",
    anchor: "spec.y.override?.() ?? extentOf(spec.data(), spec.y.accessor),",
    mutation: "extentOf(spec.data(), spec.y.accessor),",
    failingIn: ["packages/charts/test/viewport-gestures.test.tsx"],
    minFailures: 1,
    observed: "1 failure: y stays pinned after autoscale",
    messagePattern: /close to/,
  },
];

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/* -------------------------------------------------------------------------- */
/* The residue sentinel                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Where an in-flight mutation records itself.
 *
 * `try/finally` restores a mutated file on every path this script controls —
 * and controls none of the ones that matter most. **A SIGKILL runs no `finally`
 * block**, and on 2026-07-20 a run wrapped in an external timeout was killed
 * mid-probe and left the ignored-gap mutation in `packages/core/src/series.ts`
 * with nothing anywhere announcing it. The mutation is a plausible one-line
 * simplification; the suites cannot catch it, because a probe mutation is
 * designed to keep the code COMPILING — it fails a suite, not the compiler.
 *
 * So the intent is written to disk BEFORE the mutation and removed only after a
 * restore has been verified byte-identical. If the file exists at any later
 * moment, a mutation may still be live, and `gate:probe-residue` can both say
 * so and put the file back from the recorded original.
 *
 * Gitignored: it is machine state, not a tracked artifact.
 */
const SENTINEL = join(repoRoot, ".probe-residue.json");

function writeSentinel(file, original) {
  writeFileSync(
    SENTINEL,
    JSON.stringify({ file, sha256: sha256(original), original }, null, 2),
    "utf8",
  );
}

/** Cleared ONLY after `restore` has verified the file byte-identical. */
function clearSentinel() {
  rmSync(SENTINEL, { force: true });
}
const abs = (relative) => join(repoRoot, relative);
const readSource = (relative) => readFileSync(abs(relative), "utf8");

class BrokenProbe extends Error {}

const jsonDir = mkdtempSync(join(tmpdir(), "silkplot-probes-"));

/**
 * Clean the temp directory on EVERY exit path, not only the happy one.
 *
 * The `finally` at the bottom of this file covers a normal fall-through, and
 * covers nothing else: this script exits through `process.exit()` from a dozen
 * places — a baseline that is not green, a restoration that cannot be verified,
 * a broken probe — and `process.exit` does not run a pending `finally`. Every
 * one of those paths leaked the directory plus up to one Vitest JSON report per
 * probe.
 *
 * `process.on("exit")` fires for all of them, including the normal path, so the
 * `finally` below becomes redundant rather than load-bearing. It is kept anyway:
 * it removes the directory at the earliest correct moment on the common path,
 * and defence in depth costs nothing here.
 *
 * Deliberately NOT wired to SIGINT/SIGTERM. A killed run is exactly the case
 * where the residue sentinel must survive for `gate:probe-residue` to read, and
 * this handler must not become a place where cleanup logic accretes on a path
 * that has to stay minimal.
 */
process.on("exit", () => {
  rmSync(jsonDir, { recursive: true, force: true });
});
let runCounter = 0;

/**
 * Run one Vitest project and return a structured summary.
 *
 * The JSON reporter rather than stdout scraping: the questions this script asks
 * — how many tests EXECUTED, which file each failure came from, what each
 * failure said — are answered exactly by the report and only approximately by
 * parsing a human-readable log.
 */
function runProject(project, browser) {
  runCounter += 1;
  const outputFile = join(jsonDir, `run-${runCounter}.json`);
  const args = [
    "vitest",
    "run",
    "--project",
    project,
    "--reporter=json",
    `--outputFile=${outputFile}`,
  ];
  // Only for the browser projects: `core` runs in node, and handing a node
  // project a browser flag is a config error, not a stricter run.
  if (browser) args.push(`--browser.api.port=${BROWSER_API_PORT}`);

  const result = spawnSync("npx", args, {
    cwd: repoRoot,
    encoding: "utf8",
    // Captured, not inherited: a probe's mutated run is EXPECTED to be red, and
    // dumping a screenful of red into the log of a passing gate is how people
    // learn to stop reading it. The summary below reports what matters, and a
    // broken probe prints the captured output in full.
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });

  let report;
  try {
    report = JSON.parse(readFileSync(outputFile, "utf8"));
  } catch {
    // No parseable report means the run did not get far enough to produce one:
    // a browser that would not launch, an OOM kill, a collection error. Not a
    // detection, and not something to guess about.
    return {
      exitCode: result.status,
      signal: result.signal,
      parsed: false,
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      executed: 0,
      failures: [],
    };
  }

  const failures = [];
  let executed = 0;
  for (const file of report.testResults ?? []) {
    const path = String(file.name ?? "").replace(`${repoRoot}/`, "");
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status === "pending" || assertion.status === "todo") continue;
      executed += 1;
      if (assertion.status === "failed") {
        failures.push({
          path,
          name: assertion.fullName ?? assertion.title ?? "",
          messages: assertion.failureMessages ?? [],
        });
      }
    }
  }

  return {
    exitCode: result.status,
    signal: result.signal,
    parsed: true,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    executed,
    failures,
  };
}

/**
 * Apply a probe's mutation, proving at every step that it landed.
 *
 * Returns the backup text. Throws `BrokenProbe` — never returns quietly — if
 * the anchor is missing, ambiguous, or the write did not change the file.
 */
function applyMutation(probe) {
  const before = readSource(probe.file);

  // Anchor validation happens BEFORE the sentinel is written, and the ordering
  // matters in both directions. A stale-anchor probe never writes, so recording
  // a sentinel for it would make the next run announce "a run was interrupted"
  // about a file nothing touched — training the reader to dismiss the one alarm
  // that actually means a live mutation. The sentinel still precedes the WRITE
  // below, so there is no window in which a mutation exists without a record.
  const occurrences = before.split(probe.anchor).length - 1;
  if (occurrences === 0) {
    throw new BrokenProbe(
      `anchor text not found in ${probe.file}\n` +
        `    looked for: ${JSON.stringify(probe.anchor)}\n` +
        "    the source moved and this probe no longer mutates anything — it would have\n" +
        "    run against unmodified code and reported a clean pass having proved nothing.\n" +
        "    remedy: re-anchor the probe on text that exists in the file today",
    );
  }
  if (occurrences > 1) {
    throw new BrokenProbe(
      `anchor text appears ${occurrences} times in ${probe.file}\n` +
        `    looked for: ${JSON.stringify(probe.anchor)}\n` +
        "    an ambiguous anchor cannot say which site it broke, so the failures it produces\n" +
        "    cannot be attributed.\n" +
        "    remedy: widen the anchor until it is unique",
    );
  }

  writeSentinel(probe.file, before);
  writeFileSync(abs(probe.file), before.replace(probe.anchor, probe.mutation), "utf8");

  // Re-read from disk. Trusting the write is exactly the assumption that made
  // three hand-run probes silently prove nothing.
  const after = readSource(probe.file);

  /*
    A `BrokenProbe` thrown from here used to LEAVE THE MUTATION LIVE.

    The caller catches it, reports "BROKEN PROBE" and moves on — but it has no
    backup to restore from, because `applyMutation` throws instead of returning
    one. So the file stayed mutated for the rest of the run and past the end of
    it, contradicting this file's own contract that every mutation is restored
    from an in-memory backup.

    `restore` verifies byte-identity and clears the sentinel, so routing these
    two paths through it makes the contract true rather than merely documented.
  */
  const restoreAndThrow = (message) => {
    restore(probe, before);
    throw new BrokenProbe(message);
  };

  if (after === before) {
    restoreAndThrow(
      `mutation did not change ${probe.file}\n` +
        "    the file on disk is byte-identical after the write — the anchor and the\n" +
        "    replacement may be the same text, or something restored the file underneath.\n" +
        "    remedy: check the probe's `mutation` actually differs from its `anchor`",
    );
  }
  if (!after.includes(probe.mutation) && probe.mutation !== "") {
    restoreAndThrow(
      `mutation text is absent from ${probe.file} after the write\n` +
        "    the file changed but not in the way the probe intended.\n" +
        "    remedy: check the probe's `mutation` for whitespace that the anchor does not carry",
    );
  }

  return before;
}

/** Put the file back, and prove it. A restoration nobody verified is a rumour. */
function restore(probe, backup) {
  writeFileSync(abs(probe.file), backup, "utf8");
  const restored = readSource(probe.file);
  if (sha256(restored) !== sha256(backup)) {
    console.error(
      "\nFATAL — could not restore a mutated source file.\n\n" +
        `  ${probe.file} does not match its backup after restoration.\n` +
        "  This file is CURRENTLY MUTATED in your working tree. Recover it with\n" +
        `  \`git checkout -- ${probe.file}\` before doing anything else.\n` +
        "  The residue sentinel is deliberately LEFT IN PLACE — `npm run\n" +
        "  gate:probe-residue` can restore from the original it recorded.\n",
    );
    process.exit(2);
  }

  // Only now, with the restoration proved byte-identical, is it honest to say
  // no mutation is outstanding.
  clearSentinel();
}

/**
 * Decide whether a mutated run is a detection or a crash wearing its clothes.
 *
 * Returns a list of reasons it is NOT a detection; empty means it is one.
 */
function judge(probe, run, baseline) {
  const reasons = [];

  if (!run.parsed) {
    reasons.push(
      "the run produced no parseable report — it died before it collected anything " +
        `(exit ${run.exitCode}${run.signal ? `, signal ${run.signal}` : ""}). ` +
        "That is a failed proof, not a detection.",
    );
    return reasons;
  }

  if (run.exitCode === 0) {
    reasons.push(
      "the run PASSED with the mutation applied. The suite does not detect this defect — " +
        "either the assertions no longer cover it, or the mutation is not the behaviour " +
        "they were written for.",
    );
  }

  if (run.signal !== null && run.signal !== undefined) {
    reasons.push(
      `the run was killed by ${run.signal}. SIGTRAP here is the local out-of-memory ` +
        "signature — swap exhaustion takes chromium out and it reads exactly like a code " +
        "defect. Check `free -m` and run again.",
    );
  }

  if (run.executed !== baseline.executed) {
    reasons.push(
      `the run executed ${run.executed} tests against ${baseline.executed} in the clean ` +
        "baseline. A mutation must redden tests, not remove them — a different count means " +
        "collection changed, which is not the property under test.",
    );
  }

  if (run.failures.length < probe.minFailures) {
    reasons.push(
      `${run.failures.length} test(s) failed, fewer than the ${probe.minFailures} this ` +
        "mutation is known to break. Part of the coverage has gone.",
    );
  }

  const strays = run.failures.filter((f) => !probe.failingIn.includes(f.path));
  if (strays.length > 0) {
    reasons.push(
      `${strays.length} failure(s) landed outside ${probe.failingIn.join(", ")}:\n` +
        `${[...new Set(strays.map((f) => `        ${f.path}`))].join("\n")}\n` +
        "    the mutation is reddening suites it has no business touching, so the failures " +
        "cannot be read as this probe's detection",
    );
  }

  const matched = run.failures.some((f) =>
    f.messages.some((m) => probe.messagePattern.test(m)),
  );
  if (!matched) {
    reasons.push(
      `no failure message matched ${probe.messagePattern}. The suite went red, but not in ` +
        "the shape this mutation produces — so something else broke and the detection is " +
        "unproven.",
    );
  }

  const passed = run.executed - run.failures.length;
  if (passed <= 0) {
    reasons.push(
      "every test in the project failed. A total wipeout is a broken build, not a targeted " +
        "detection — the unaffected tests must still pass for the run to be evidence of anything.",
    );
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

if (argv.includes("--list")) {
  console.log("Detection probes:\n");
  for (const p of PROBES) {
    console.log(`  ${p.id}`);
    console.log(`      mutates  ${p.file}`);
    console.log(`      proves   ${p.failingIn.join(", ")} (project "${p.project}")`);
    console.log(`      breaks   ${p.breaks}`);
    console.log(`      observed ${p.observed}\n`);
  }
  process.exit(0);
}

const onlyAt = argv.indexOf("--only");
const only = onlyAt === -1 ? undefined : argv[onlyAt + 1];
const selected = only === undefined ? PROBES : PROBES.filter((p) => p.id === only);
if (selected.length === 0) {
  console.error(`No probe named "${only}". Run with --list to see the ids.`);
  process.exit(1);
}

// A mutated tree would corrupt every backup this script takes, so it refuses to
// start on top of one. Scoped to the files the selected probes touch.
const dirty = spawnSync("git", ["status", "--porcelain", "--", ...selected.map((p) => p.file)], {
  cwd: repoRoot,
  encoding: "utf8",
});
// `git` failing is not "the tree is clean". Before 2026-07-20 only `stdout` was
// inspected, so a missing binary, a non-repo cwd, or any spawn error left
// `stdout` undefined, the check read as clean, and the harness went on to mutate
// sources on top of whatever uncommitted work was there. This check is one of
// the two things that caught a real live mutation; it must fail loud, not open.
if (dirty.error !== undefined || dirty.status !== 0) {
  console.error(
    "Detection probes REFUSED to start — could not determine whether the tree is clean.\n\n" +
      `  \`git status --porcelain\` ${dirty.error ? `failed: ${dirty.error.message}` : `exited ${dirty.status}`}\n` +
      `  ${(dirty.stderr ?? "").trim()}\n\n` +
      "  This harness mutates source files and restores them from an in-memory backup.\n" +
      "  Starting without knowing the tree is clean risks backing up — and then\n" +
      "  'restoring' — modified work into something it never was.\n",
  );
  process.exit(1);
}
if ((dirty.stdout ?? "").trim() !== "") {
  console.error(
    "Detection probes REFUSED to start — a source file a probe mutates is already modified:\n",
  );
  console.error(dirty.stdout);
  console.error(
    "  Each probe backs a file up, mutates it, and restores the backup. Starting from a\n" +
      "  dirty file would make that backup the modified state, and the probe would then\n" +
      "  'restore' your uncommitted work into something it never was.\n" +
      "  remedy: commit or stash these files first.\n",
  );
  process.exit(1);
}

console.log("Detection probes — proving the suites fail when the behaviour breaks.\n");

const projects = [...new Set(selected.map((p) => `${p.project}:${p.browser}`))];
const baselines = new Map();
const results = [];
let broken = 0;

try {
  // A clean run per project FIRST. It is the reference every mutated run is
  // judged against — the executed-test count that says "this run really ran".
  // It also means a suite that is red before any mutation is reported as such,
  // rather than being read as six successful detections.
  for (const key of projects) {
    const [project, browserFlag] = key.split(":");
    const browser = browserFlag === "true";
    process.stdout.write(`  baseline  ${project.padEnd(10)} `);
    const run = runProject(project, browser);
    if (!run.parsed || run.exitCode !== 0) {
      console.log("FAILED");
      console.error(
        `\nThe "${project}" project is not green before any mutation was applied.\n` +
          "  Every probe judges its mutated run against this one, so there is nothing to\n" +
          "  measure against. Fix the suite first.\n",
      );
      console.error(run.output);
      process.exit(1);
    }
    console.log(`green, ${run.executed} tests`);
    baselines.set(key, run);
  }

  console.log("");

  for (const probe of selected) {
    const key = `${probe.project}:${probe.browser}`;
    const baseline = baselines.get(key);
    process.stdout.write(`  probe     ${probe.id.padEnd(28)} `);

    let backup;
    try {
      backup = applyMutation(probe);
    } catch (error) {
      if (!(error instanceof BrokenProbe)) throw error;
      console.log("BROKEN PROBE");
      results.push({ probe, ok: false, brokenProbe: error.message });
      broken += 1;
      continue;
    }

    let run;
    try {
      run = runProject(probe.project, probe.browser);
    } finally {
      restore(probe, backup);
    }

    const reasons = judge(probe, run, baseline);
    if (reasons.length === 0) {
      const spread = [...new Set(run.failures.map((f) => f.path.split("/").pop()))];
      console.log(`detected — ${run.failures.length} failure(s) in ${spread.join(", ")}`);
      results.push({ probe, ok: true, failures: run.failures.length });
    } else {
      console.log("NOT DETECTED");
      results.push({ probe, ok: false, reasons, output: run.output });
    }
  }

  // Green has to come back. The per-file SHA check above proves the bytes are
  // restored; this proves the SUITE agrees, which is the claim the next session
  // will actually rely on.
  console.log("");
  for (const key of projects) {
    const [project, browserFlag] = key.split(":");
    process.stdout.write(`  restored  ${project.padEnd(10)} `);
    const run = runProject(project, browserFlag === "true");
    const expected = baselines.get(key).executed;
    if (!run.parsed || run.exitCode !== 0 || run.executed !== expected) {
      console.log("NOT GREEN");
      console.error(
        `\nThe "${project}" project is not green after the probes restored their files.\n` +
          `  Expected ${expected} passing tests; got ${run.executed} executed, ` +
          `${run.failures.length} failed (exit ${run.exitCode}).\n` +
          "  A mutation may have survived. Check `git status` and `git diff` now.\n",
      );
      console.error(run.output);
      process.exit(2);
    }
    console.log(`green, ${run.executed} tests`);
  }
} finally {
  rmSync(jsonDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);

if (failed.length > 0) {
  console.error(`\nDetection probes FAILED — ${failed.length} of ${selected.length}:\n`);
  for (const result of failed) {
    if (result.brokenProbe) {
      console.error(`  ✗ ${result.probe.id} — BROKEN PROBE\n    ${result.brokenProbe}\n`);
      continue;
    }
    console.error(`  ✗ ${result.probe.id}`);
    console.error(`    mutated ${result.probe.file}`);
    console.error(`    expected ${result.probe.failingIn.join(", ")} to fail: ${result.probe.observed}`);
    for (const reason of result.reasons) console.error(`    - ${reason}`);
    console.error("");
  }
  console.error(
    broken > 0
      ? "A BROKEN PROBE is not a skipped check. A probe whose mutation does not apply runs\n" +
          "against unmodified source and passes, which is indistinguishable from a working\n" +
          "gate and is the reason this script exists in the shape it does. Re-anchor it.\n"
      : "A suite that stays green while its behaviour is broken is not covering that\n" +
          "behaviour, whatever its assertion count says. Either the coverage regressed and\n" +
          "must be restored, or the contract changed — in which case change it deliberately,\n" +
          "in the suite and in this probe, in the same diff.\n",
  );
  process.exit(1);
}

console.log(`\nDetection probes: ${selected.length}/${selected.length} suites detected their defect.`);
for (const result of results) {
  console.log(`  ✓ ${result.probe.id.padEnd(28)} ${result.failures} failure(s)`);
}
