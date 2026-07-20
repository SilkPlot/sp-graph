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
| `… --update-snapshots` | **Re-pin baselines.** Read [Reviewing a diff](#reviewing-a-diff--the-only-route-to-a-new-baseline) before you type this |
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
| Multi-series cases | `multi-one`, `multi-four`, `multi-22`, `multi-22-narrow`, `multi-gaps`, `multi-ref-one`, `multi-ref-three` — **Line and Area only** |
| Theme | light, dark, light-high-contrast, dark-high-contrast |
| Focus | every chart that owns a focus stop, in all four theme combinations |
| Motion | reduced motion, on both schemes, plus the multi-series surface |

**176 baselines**: 156 geometry, 8 focus, 12 reduced-motion.

The **Legend** is captured as its own surface rather than as a fifth chart
family. It has no data, no axes, and no y-domain policy, so the cases that
distinguish it are density, layout, and which entries are hidden — plus a
focused state, because the acceptance bar for a 22-entry legend is that it stays
operable *without clipping focused items*, and a focus ring is a computed style
no structural assertion reaches.

The multi-series cases break the otherwise-uniform chart × case product, and
that is a property of the library rather than an inconvenience: Bar and Scatter
have no `series` prop, so a baseline for them would be a picture of nothing
under a confident name. They are generated separately and counted separately.

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
- **`multi-one`** — one series through the `series` API. Not redundant with
  `default`, which reaches a different code path through the single-series
  `data` prop; both stay supported, so both are pinned.
- **`multi-four`** — four same-unit series, the ordinary operational shape.
- **`multi-22`** — the density the series contract names, and the case that
  exercises palette **wrap**. Colours repeat beyond the palette size by design,
  so this is where a wrap becoming a collision, or the dash channel being
  dropped, would show.
- **`multi-22-narrow`** — the same twenty-two in a fluid narrow box.
- **`multi-gaps`** — four series each carrying a null at a different index,
  under both gap policies. A null coerced to zero draws a spike to the baseline,
  which is a *picture* rather than an error and passes every path-counting
  assertion.

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
between machines that a strict comparison could disagree even when nothing
regressed.

This section used to predict that the CI job would therefore be red until the
set was re-pinned from a runner-generated artifact, and that this was the main
reason the job could not gate. **That prediction was wrong, and the evidence
that falsified it is worth more than the prediction was.** Seven consecutive
runner executions have been clean against workstation-pinned baselines. The
determinism controls in the table above — the pinned font face, the disabled
hinting and subpixel positioning, the forced sRGB profile, software raster —
close the machine-to-machine gap they were written to close, across a real
environment boundary rather than in theory.

The exposure is not zero, it is unmeasured beyond seven runs: a runner image
update could still change rasterisation under us. If that happens the diff will
be loud, and the remedy is to **re-pin from the runner**, never to loosen
`threshold` or `maxDiffPixels`. Those numbers are the gate.

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

### What enforces it

Everything above was, until recently, a description of a discipline nobody was
held to. `--update-snapshots` still runs, the suite still goes green, and no
check noticed. A document that describes a rule without enforcing it is a
document, not a gate.

`npm run gate:visual-baselines` is the enforcement. It runs in CI as its own job
and **fails when a file under `test/visual/baselines/` changes without a matching
entry in the [baseline change log](#baseline-change-log) below**, added in the
same diff.

An entry has to name the exact ids that moved. The guard checks the set **both
ways**: a baseline that changed without being named fails, and an id named that
did *not* change fails too. So the cheapest way out — pasting a previous entry,
or writing "all baselines updated" — does not work. You have to have looked at
which images actually moved, which is step 3 (check the blast radius) turned into
a check. It also reads only the lines **added** by the diff, so an entry from a
previous re-pin cannot license a new one.

It deliberately does **not** try to verify that the accepter is a second person.
Git authorship is settable and a name in a file is not an identity; a check on it
would assert something it cannot know. Two-person review is enforced by branch
protection and by the reviewer reading the entry. What the guard guarantees is
that the claim exists, is attributed, and is specific — so a reviewer who
disagrees has a sentence to disagree with, which is what was missing.

It does not block a legitimate re-pin. Three lines is the whole cost.

**What it compares against.** On a push it uses `github.event.before` — the commit
the branch pointed at before the push — passed in by the workflow as
`PUSH_BEFORE_SHA`. That detail is load-bearing rather than incidental: the first
version of this guard resolved `origin/main`, which on a push-to-main run *is*
the pushed commit, so it compared HEAD against itself, found nothing, and printed
a pass on every run regardless of what the push did. It was inert, in the most
dangerous way available. A base that cannot be determined now **fails** rather
than falling back to a ref that would be HEAD, and every run — pass or fail —
prints the base SHA, how it was chosen, and where HEAD is, so a wrong comparison
is visible in the log instead of hiding behind a green tick.

---

## Baseline change log

Every re-pin, in the same pull request that re-pins. Newest first.

Format — the guard parses it, so it is fixed:

```markdown
### YYYY-MM-DD — id, id, id
- **Why:** one sentence naming the cause, per step 2 of the review workflow.
- **Accepted by:** the person who looked at the rendered before/after.
```

Ids are baseline file names without `.png` (`area--negative--dark`, not
`test/visual/baselines/area--negative--dark.png`).

<!-- Entries below, newest first. -->

### 2026-07-20 — line--multi-ref-one--light, line--multi-ref-one--dark, line--multi-ref-one--light-high-contrast, line--multi-ref-one--dark-high-contrast, line--multi-ref-three--light, line--multi-ref-three--dark, line--multi-ref-three--light-high-contrast, line--multi-ref-three--dark-high-contrast, area--multi-ref-one--light, area--multi-ref-one--dark, area--multi-ref-one--light-high-contrast, area--multi-ref-one--dark-high-contrast, area--multi-ref-three--light, area--multi-ref-three--dark, area--multi-ref-three--light-high-contrast, area--multi-ref-three--dark-high-contrast
- **Why:** first pins for reference overlays (ADR-0008 §10) — two new cases on
  Line and Area across all four scheme/contrast combinations. `multi-ref-one`
  pins the `--sp-color-reference` token and the dash channel; `multi-ref-three`
  pins LABEL COLLISION, which is the property no geometry assertion can see.
  These are ADDITIONS, not re-pins: no existing baseline changed, verified with
  `git diff --cached --name-status` (16 added, 0 modified) rather than inferred
  from this guard, which reports added and changed together. That the overlay
  disturbed nothing already pinned is itself the result worth recording — it is
  what "additive at 0.x" (§12) looks like in pixels.
- **Opened and read as images:** `line--multi-ref-three--light`,
  `line--multi-ref-three--dark-high-contrast`,
  `area--multi-ref-one--light-high-contrast`, and `area--multi-ref-three--dark`
  — chosen because they carry the claims most likely to be wrong: that two
  thresholds one unit apart separate their labels instead of overprinting, that
  a temporal reference draws vertically with a top-anchored label, that the
  reference stays legible and dash-distinguishable over dense area fills, and
  that light-high-contrast does not lose the line among the black gridlines it
  shares a colour with (it does not — the gridlines are solid and the reference
  is dashed, which is the distinction the token comment predicts). The
  remaining 12 are the same two cases in the other theme combinations and were
  **not** opened individually.
- **Accepted by:** Adam Claassens, on merge.

  Stated plainly, because the previous two entries did not and it was raised
  both times: this line records the MERGE decision, not an image review. The
  four images named above were opened by the executing session, not by Adam.
  Whether that is the right convention is an open question the P04 close put to
  him and which he merged without changing — so it stands, and this is the
  third time it has been written down.

### 2026-07-20 — legend--legend-four--light, legend--legend-four--dark, legend--legend-four--light-high-contrast, legend--legend-four--dark-high-contrast, legend--legend-22--light, legend--legend-22--dark, legend--legend-22--light-high-contrast, legend--legend-22--dark-high-contrast, legend--legend-22-narrow--light, legend--legend-22-narrow--dark, legend--legend-22-narrow--light-high-contrast, legend--legend-22-narrow--dark-high-contrast, legend--legend-stack-scroll--light, legend--legend-stack-scroll--dark, legend--legend-stack-scroll--light-high-contrast, legend--legend-stack-scroll--dark-high-contrast, legend--legend-some-hidden--light, legend--legend-some-hidden--dark, legend--legend-some-hidden--light-high-contrast, legend--legend-some-hidden--dark-high-contrast, legend--focus--light, legend--focus--dark, legend--focus--light-high-contrast, legend--focus--dark-high-contrast
- **Why:** first pins for the Legend primitive — five cases across all four
  scheme/contrast combinations, plus a focused state. ADDITIONS, not re-pins: no
  existing baseline changed, verified with `git diff --cached --name-status`
  (24 added, 0 modified) rather than inferred from this guard, which reports
  added and changed together.
- **Accepted by:** Adam Claassens. Scope of the visual check is stated rather
  than implied: `legend--legend-22--light`, `legend--focus--dark`,
  `legend--legend-some-hidden--light`, and `legend--legend-stack-scroll--light`
  were opened and read as images — chosen because they carry the claims most
  likely to be wrong (22 entries staying readable and dash-distinguishable at
  density, a focus ring that is present and not clipped, a hidden entry that
  dims AND hollows its swatch rather than encoding state by colour alone, and a
  capped legend that scrolls rather than clipping). The remaining 20 are the
  same four cases in the other theme combinations and were not opened
  individually.


### 2026-07-20 — area--multi-22--dark, area--multi-22--dark-high-contrast, area--multi-22--light, area--multi-22--light-high-contrast, area--multi-22-narrow--dark, area--multi-22-narrow--dark-high-contrast, area--multi-22-narrow--light, area--multi-22-narrow--light-high-contrast, area--multi-four--dark, area--multi-four--dark-high-contrast, area--multi-four--light, area--multi-four--light-high-contrast, area--multi-four-reduced-motion--dark, area--multi-four-reduced-motion--light, area--multi-gaps--dark, area--multi-gaps--dark-high-contrast, area--multi-gaps--light, area--multi-gaps--light-high-contrast, area--multi-one--dark, area--multi-one--dark-high-contrast, area--multi-one--light, area--multi-one--light-high-contrast, line--multi-22--dark, line--multi-22--dark-high-contrast, line--multi-22--light, line--multi-22--light-high-contrast, line--multi-22-narrow--dark, line--multi-22-narrow--dark-high-contrast, line--multi-22-narrow--light, line--multi-22-narrow--light-high-contrast, line--multi-four--dark, line--multi-four--dark-high-contrast, line--multi-four--light, line--multi-four--light-high-contrast, line--multi-four-reduced-motion--dark, line--multi-four-reduced-motion--light, line--multi-gaps--dark, line--multi-gaps--dark-high-contrast, line--multi-gaps--light, line--multi-gaps--light-high-contrast, line--multi-one--dark, line--multi-one--dark-high-contrast, line--multi-one--light, line--multi-one--light-high-contrast
- **Why:** first pins for the multi-series surface — five new cases on Line and
  Area across all four scheme/contrast combinations, plus reduced motion. These
  are ADDITIONS, not re-pins: no existing baseline changed, verified with `git
  diff --cached --name-status` (44 added, 0 modified) rather than inferred from
  this guard, which reports added and changed together.
- **Accepted by:** Adam Claassens. Scope of the visual check is stated plainly
  rather than implied: `line--multi-22--light`, `area--multi-gaps--dark`, and
  `line--multi-22-narrow--dark-high-contrast` were opened and read as images —
  chosen because they carry the claims most likely to be wrong (palette wrap and
  the dash channel at 22 series, gaps that must not spike to the zero baseline,
  and the dark-high-contrast cell that once measured 1.16:1). The remaining 41
  were generated by the same declared fixtures and not opened individually.


---

## CI

The harness runs in CI as its own job, `Visual regression`, and uploads
expected/actual/diff artifacts on every run.

**It GATES, as of 2026-07-18.** A failing pixel comparison fails the build.

It is its own job rather than a step in the build job so its browser process can
never overlap the Vitest browser projects — two browser runners started
concurrently collide on the browser API port, and the collision reports as a
connect timeout having executed zero tests.

The artifact upload is `if: always()`, which matters more now than it did while
the job was advisory: the harness step is the one that fails the job, so without
it the images would be skipped on exactly the runs somebody needs to look at. A
blocking gate that goes red with no triptych attached is a build everyone is
stuck on and nobody can diagnose. **If this job is red, download
`visual-regression-diffs` and look at the images** — that is step 1 of the
review workflow, and re-pinning from a filename is what it forbids.

### Promotion criterion — met, and how

The criterion was:

1. Three consecutive clean runner executions, with no intervening baseline
   update, no retry, and no change to the harness between them.
2. The committed baselines generated in the runner environment (see
   [Baselines are pinned to one environment](#baselines-are-pinned-to-one-environment)).

**Criterion 1: met**, with more than double the margin asked for — seven
consecutive clean executions, read off the run history rather than inferred.

**Criterion 2: not literally met, and recorded as such rather than dropped.**
The baselines were generated on a maintainer's Linux workstation and still are.
That criterion existed to guard against exactly one risk: that font
rasterisation differs enough between the workstation and the runner for a strict
comparison to disagree. Seven consecutive clean runner executions are direct
evidence that it does not — the determinism controls hold across precisely the
boundary the criterion was worried about. So the criterion was **met in
substance, by evidence, rather than by regenerating the baselines**, and the
owner approved promotion on that basis on 2026-07-18.

This was a judged decision with evidence behind it, not a criterion that got
forgotten. A future reader is entitled to disagree with the judgement; they
should be able to see that it was made.

**If runner-environment drift ever appears, the answer is to regenerate the
baselines on the runner** — not to demote this gate, and not to widen
`threshold` or `maxDiffPixels`.

### Where the count stands

| Date | Consecutive clean runner executions | Note |
|---|---|---|
| Harness landed | **0** | No runner execution had occurred. Local runs are not runner runs and do not count toward this. |
| 2026-07-18 | **1** | First runner execution: 102 passed. Notable because the committed baselines were generated on the workstation, not the runner — the determinism controls held across the environment boundary the harness warns about. Criterion 2 formally unmet, so this counted toward criterion 1 only. |
| 2026-07-18 | **7** | `61f4bc6`, `8d59f24`, `8985986`, `f7e79fb`, `cc1bfe9`, `a33ad0b`, `8d84c7d` — every one a `success`. Criterion 1 met at run 3 and carried on holding. **Gate promoted to blocking on this date**, on the criterion-2 reasoning above. |

Update this table when the count moves, in the same change that observes it. A
promotion argued from memory is a promotion nobody can audit.

Up: [Documentation](../README.md#documentation)
