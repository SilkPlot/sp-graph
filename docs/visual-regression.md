<!-- markdownlint-disable MD013 -->
# Visual regression

SilkPlot pins deterministic screenshots of the chart surfaces that ship today,
so that unintended rendering, responsive, focus, and theme drift is caught
before it is published. This file is the operating manual: what is covered, how
determinism is engineered, and — the part that matters most — **how a diff is
reviewed and who accepts it before a baseline is re-pinned**.

Structural tests assert what somebody thought to write a predicate for. A
screenshot fails on things nobody predicted, which is its entire value and also
its entire danger: it fails on things nobody cares about too, unless
determinism is engineered rather than hoped for.

---

## Running it

The harness is a **dedicated command**, separate from `npm test`:

```sh
npx playwright test -c playwright.visual.config.ts
```

Separate on purpose. Vitest's browser mode auto-probes for a port, so a second
browser runner started alongside it collides — and the collision does not report
as one. It reports a connect timeout, executes zero tests, and finishes in about
a second. **Never run this at the same time as the Vitest browser projects.**

| Command | What it does |
|---|---|
| `npx playwright test -c playwright.visual.config.ts` | Compare against the committed baselines |
| `… --grep line--negative` | Run one baseline, or a family of them, by id |
| `… --update-snapshots` | **Re-pin baselines.** Read [Reviewing a diff](#reviewing-a-diff-the-only-route-to-a-new-baseline) before you type this |
| `npx playwright show-report test/visual/.report` | Open the expected / actual / diff triptych |

Failures write an expected image, an actual image, and a diff into
`test/visual/.output/`. Both output directories are gitignored;
`test/visual/baselines/` is the committed artifact.

---

## What is covered

The acceptance set is **declared as data** in
[`test/visual/acceptance-set.ts`](../test/visual/acceptance-set.ts), and every
test is generated from it. It is not "whichever baseline files happen to exist".

| Axis | Values |
|---|---|
| Charts | Line, Area, Bar, Scatter |
| Cases | `default`, `empty`, `negative`, `dense-label`, `responsive-mobile` |
| Theme | light, dark, light-high-contrast, dark-high-contrast |
| Focus | every chart that owns a focus stop, in all four theme combinations |
| Motion | reduced motion, on both schemes |

**92 baselines**: 80 geometry, 4 focus, 8 reduced-motion.

Each case earns its place by being a shape that has broken before, or one whose
breakage is invisible to a structural assertion:

- **`empty`** — no data. Scales have no extent and there are no marks; the frame
  must still render rather than collapsing or throwing.
- **`negative`** — an all-negative series. This is the *only* input where the
  `zero-floor` and `zero-baseline` y-domain policies differ visibly, which is
  what makes collapsing them an easy and invisible mistake. Area once inherited
  Line's domain and drew its flat fill edge on a pixel the axis labelled `-2`.
- **`dense-label`** — many more ticks than fit in a narrow box. Label collision
  and overflow are pure rendering defects; geometry assertions pass straight
  through them.
- **`responsive-mobile`** — a narrow viewport with a fluid container, so the
  measured-bounds path runs at a size the desktop cases never reach.

All four scheme × contrast combinations are captured because
`prefers-color-scheme` and `prefers-contrast` are **orthogonal** preferences,
not a three-value ladder. The fourth cell is not a formality: a single
high-contrast palette on `:root` painted light high-contrast values onto a dark
surface and measured 1.16:1, so "more contrast" produced an invisible page. Both
axes are emulated as user-agent preferences rather than set through
`data-sp-theme`, because that is the path a user's OS actually drives — and
contrast is deliberately not application-selectable.

### The set cannot shrink quietly

This is the failure mode a screenshot suite loses to first. Delete a case, or
delete the baselines it owns, and the suite goes green *faster* than before.
Nobody reads a passing run closely enough to notice it stopped covering
something.

[`test/visual/acceptance-set.spec.ts`](../test/visual/acceptance-set.spec.ts)
therefore asserts, as tests in their own right:

1. The chart, case, and theme lists equal literals written out a second time in
   the spec — so a deletion has to be made twice, in a diff a reviewer sees.
   (Comparing an array to itself proves only that it equals itself.)
2. The frozen totals: 80 / 4 / 8 / 92.
3. That the committed baseline files are **exactly** the declared ids — a
   declared baseline with no file is coverage that silently stopped, and a file
   with no declaration is a baseline nothing compares against.
4. That the charts declared to own a focus stop are exactly the charts that
   render one, **in both directions**. Only `LineChart` composes
   `ChartKeyboardSurface` today, so only `LineChart` has a `:focus-visible`
   treatment to pin. The day another chart gains a keyboard composite this check
   fails and stays failing until a focus baseline is declared for it — rather
   than an unproven focus indicator shipping under a green run.

### Deliberately not covered

Recorded in `EXCLUSIONS` in the acceptance set, so "there is no baseline for X"
is always answerable and an excluded surface can be told from a forgotten one:

| Surface | Why |
|---|---|
| Legend | not built |
| Calendar week grid | not built; deferred to the calendar layout work |
| Canvas substrate | not built; SVG is the only substrate today |
| The HTML data alternative (`<table>`) | structural, and asserted directly by the accessibility suite on its markup and ARIA relationships. Pinning its pixels re-tests text layout, where a screenshot gate is most brittle and least informative. Fixtures render without a `table` prop, so no table is in frame |
| Cross-platform pixel identity | out of scope by design — see below |

---

## How determinism is engineered

**An unstable harness is worse than none.** It teaches people that a red diff
means "run it again", and once that habit exists the gate has negative value: it
costs time and it no longer stops anything. Every knob below closes one named
source of variance.

| Source of variance | Control |
|---|---|
| Fonts | `font-family: "DejaVu Sans"` — never `system-ui`, which resolves to a different face per machine — plus `font-synthesis: none`, so a missing weight is not faked by algorithmic bold with different metrics |
| Text rasterisation | `--disable-lcd-text` (subpixel AA samples the pixel grid in colour), `--disable-font-subpixel-positioning`, `--font-render-hinting=none` (hinting snaps outlines using the platform's hinting engine *and its version*) |
| GPU | `--disable-gpu` — software raster. Driver-dependent output has nothing to offer a headless run |
| Colour management | `--force-color-profile=srgb`; without it Chromium adopts the display's profile and the same hex becomes different pixels |
| Device scale | `deviceScaleFactor: 1`. At 2× the antialiasing of a half-pixel stroke edge depends on the raster scale |
| Animation | `animations: "disabled"` freezes CSS animations and transitions at their end state, so the capture does not sample whichever frame the compositor was on |
| Scrollbars | `--hide-scrollbars`, so overflow in one fixture cannot change the viewport width |
| Timezone | `timezoneId: "UTC"`. Tick labels are formatted in the *browser's* zone, so a UTC series rendered in another zone shifts every label — a diff that reads as a rendering regression and is not one |
| Locale | `locale: "en-GB"`, fixed for the same reason |
| Data | Closed-form functions of the index. No `Math.random`, no `Date.now`, no locale-dependent parsing |
| Layout settling | `ChartRoot` measures itself with a `ResizeObserver`, so the first painted frame has no bounds. The fixture sets `data-visual-ready` only after two animation frames, and the suite waits for it plus `document.fonts.ready` |
| Concurrency | `workers: 1`, `fullyParallel: false`. Parallel workers contend for the same raster path and give the scheduler a say in the output — and screenshot work is memory-hungry enough that this box has previously exhausted swap and killed Chromium at launch with `SIGTRAP`, an OOM signature that reads exactly like a code defect |
| Flake laundering | `retries: 0`. A retry converts an unstable baseline into a green run, which is precisely what must stay visible — the promotion criterion is measured in consecutive clean runs |

Comparison is **exact**: `threshold: 0`, `maxDiffPixels: 0`. A single changed
pixel fails. That is only defensible because everything above is pinned. Any
tolerance would have to be picked without evidence, and a tolerance large enough
to absorb real jitter is also large enough to absorb a one-pixel stroke
regression — one of the two defects this harness exists to catch.

### Known gap: the harness is not typechecked

`npm run typecheck` does not cover `test/visual/`. Playwright transpiles
TypeScript without typechecking it, and wiring a `tsconfig` here needs
`@types/node` (the suite reads the baselines directory from disk) plus an entry
in the root `typecheck:tests` script. Neither is in place.

The practical exposure is small — every file in the suite is executed on every
run, so a type error surfaces immediately as a failing run rather than shipping
— but it is a real gap and it is recorded rather than left to be discovered.

### Baselines are pinned to one environment

Cross-platform pixel identity is explicitly out of scope, and this is the
practical consequence: **the committed baselines were generated on a maintainer
Linux workstation, not on the CI runner.** Font rasterisation differs enough
between machines that a strict comparison will disagree even when nothing
regressed.

So the CI job is expected to be red until the set is re-pinned from a
runner-generated artifact. That is a known state rather than a surprise, and it
is the main reason the job cannot gate yet. Do not "fix" it by loosening the
threshold — re-pin from the pinned environment instead.

---

## Reviewing a diff — the only route to a new baseline

**`--update-snapshots` is not a fix. It is a decision to change what "correct"
means.** A visual gate with no review workflow becomes a rubber stamp: the
update command gets run reflexively, and the baseline silently tracks the bug
until somebody notices the chart has looked wrong for six weeks.

A diff is only ever one of three things:

1. **An intended change.** A design change, a deliberate token change, a new
   feature that alters geometry. Re-pin.
2. **A regression.** Fix the code. The baseline does not move.
3. **Harness instability.** Nothing changed and the pixels moved anyway. Fix the
   determinism, not the baseline — and treat it as urgent, because instability
   is the failure that destroys the gate's usefulness entirely.

**Telling (1) from (2) is a judgement, and it is the reviewer's, not the
author's.**

### The workflow

1. **Look at the diff.** `npx playwright show-report test/visual/.report`, or the
   `visual-regression-diffs` artifact on the CI run. Expected, actual, and the
   pixel diff, side by side. Never re-pin from a filename.
2. **Name the cause in one sentence**, in the pull request, *before* running any
   update — "the axis label baseline moved 1px because the tick font size token
   changed", not "baselines updated". If you cannot write that sentence, you do
   not yet know which of the three cases you are in.
3. **Check the blast radius.** An intended change usually moves a predictable
   set of baselines. If a stroke-width change also moved the `empty` case, or
   moved dark but not light, the change is not what you think it is.
4. **Re-pin narrowly.** `--grep` the affected ids rather than updating all 92.
   A bulk update hides an unrelated regression inside an intended change, and
   that is the specific way a baseline starts tracking a bug.
5. **Commit the images in their own commit**, with the rationale from step 2 in
   the message. Baseline images are unreadable in a text diff, so the commit
   message is the only durable record of *why* they moved.
6. **A second person accepts it.** Baseline changes are reviewed by someone
   other than the author, who looks at the rendered before/after — not at the
   fact that the suite is green again. A green suite after `--update-snapshots`
   is guaranteed and means nothing; it is a tautology, not evidence.

### Rules

- Never run `--update-snapshots` across the whole suite to clear a red run.
- Never widen `threshold` or `maxDiffPixels` to make a diff go away. Those
  numbers are the gate.
- Never re-pin a baseline you have not looked at.
- A baseline commit that changes images **and** source in the same commit is not
  reviewable. Split it.

---

## CI

The harness runs in CI as its own job, `Visual regression (non-gating)`, and
uploads expected/actual/diff artifacts on every run.

**It does not gate.** `continue-on-error: true` is set deliberately: the gate is
promoted only after **three consecutive clean runner executions** establish
stability. It is its own job rather than a step in the build job so it cannot
fail the build even by accident, and so its browser process can never overlap
the Vitest browser projects.

### Promotion criterion

Remove `continue-on-error` when **all** of the following hold:

1. Three consecutive executions on the runner are clean, with no intervening
   baseline update, no retry, and no change to the harness between them.
2. The committed baselines were generated in the runner environment (see
   [Baselines are pinned to one environment](#baselines-are-pinned-to-one-environment)).

### Where the count stands

| Date | Consecutive clean runner executions | Note |
|---|---|---|
| Harness landed | **0** | No runner execution had occurred. Local runs are not runner runs and do not count toward this. |
| 2026-07-18 | **1** | First runner execution: 102 passed. Notable because the committed baselines were generated on the workstation, not the runner — the determinism controls held across the environment boundary the harness warns about. Criterion 2 is still formally unmet, so this counts toward criterion 1 only. |

Update this row when the count moves, in the same pull request that observes it.
A promotion argued from memory is a promotion nobody can audit.

Up: [Documentation](../README.md#documentation)
