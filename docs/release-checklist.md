<!-- markdownlint-disable MD013 -->
# Release checklist

The checks a release needs that CI cannot make for us. Everything CI *can* check
is in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and is not
repeated here — this file is deliberately only the manual half.

Copy this file's checklist into the release issue and tick items there. **Leave
the copy in this repository unticked**: it is the template, and a template with
ticks in it stops being a checklist and becomes a claim.

An unchecked item is an honest statement that the check has not been run. Do not
tick an item to make a release look ready, and do not delete an item because it
is inconvenient — an item that no longer applies is removed in its own commit,
with the reason in the message.

---

## Automated — verify, do not re-run by hand

CI enforces these. The release step is to confirm the run was green on the exact
commit being released, not to reproduce it locally.

- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` green on the release commit
- [ ] `npm run gate:accessibility` green — the accessibility suites are all present and reachable
- [ ] `npm run test:accessibility` green — the deterministic accessibility checks pass
- [ ] Full suite green, **with every browser project actually executing**. Read the
      per-project test counts, not the exit code alone: two concurrent Vitest browser
      processes collide on the browser API port, and the collision reports as a connect
      timeout having run zero tests, in about a second. A run that executed nothing is
      not a run that found nothing.

## Assistive technology — NOT YET RUN

**Status: pending. No assistive-technology testing has ever been performed
against this library.** Every box below is unchecked because none of these runs
has happened, and this matrix is the reason
[the accessibility guide](accessibility.md#tested-limitations) states that no
screen-reader compatibility is claimed.

Until this section has entries that are genuinely ticked, no release note, README
line, or issue reply may describe SilkPlot as screen-reader tested, screen-reader
friendly, or accessible to assistive technology.

For each combination: name and describe a chart, reach it by Tab, step it with
the arrow keys, jump with Home/End and Page keys, clear with Escape, leave with
Tab and Shift+Tab, reach the data table, and read the summary.

- [ ] NVDA + Firefox (Windows)
- [ ] NVDA + Chrome (Windows)
- [ ] JAWS + Chrome (Windows)
- [ ] VoiceOver + Safari (macOS)
- [ ] VoiceOver + Safari (iOS)
- [ ] Orca + Firefox (Linux)
- [ ] Narrator + Edge (Windows)
- [ ] TalkBack + Chrome (Android)

Record per combination: reader and browser version, what was announced verbatim
at each step, and anything that was silent. A silent step is the finding — a
combination that "seemed fine" without a transcript has not been tested.

### Open questions this matrix should inform

These are recorded as open in
[the accessibility guide](accessibility.md#four-open-evidence-gaps) and in
[ADR-0005](decisions/adr-0005-accessibility-contract.md). They stay open until
evidence closes them; testing is how that evidence arrives.

- [ ] Does live-region behaviour differ enough across these readers to change the
      default `announce` channel?
- [ ] Is the default `pointLabel` wording usable, or is it as poor in practice as
      it reads?
- [ ] Does the 150 ms announcement throttle coalesce too aggressively for any
      reader, or not aggressively enough?

## Manual visual and interaction review

Checks that need a human looking at a screen, on the playground and on any
example in the documentation.

- [ ] Focus ring visible and unclipped on every focusable element, in light,
      dark, light high-contrast, and dark high-contrast
- [ ] Forced-colors / Windows High Contrast mode: the focus outline survives and
      marks remain distinguishable
- [ ] Browser zoom to 400% and a 320px viewport: nothing is clipped or
      unreachable, and the data table remains readable
- [ ] Text-only zoom to 200%: labels do not collide or truncate
- [ ] `prefers-reduced-motion: reduce` honoured — no authored motion anywhere,
      and pointer tracking has no residual smoothing
- [ ] Series remain distinguishable in a greyscale screenshot (colour is never
      the only channel)
- [ ] Every documentation example is itself contract-compliant — a named,
      described chart, or an explicitly decorative one

## Documentation and claims

- [ ] No prose anywhere in the repository claims WCAG conformance, certification,
      or procurement readiness
- [ ] No prose claims screen-reader testing or compatibility while the matrix
      above is unrun
- [ ] Every accessibility number stated in prose is a measurement, traceable to a
      test that recomputes it
- [ ] [The accessibility guide](accessibility.md) still matches the shipped API
- [ ] Migration notes cover every breaking accessibility change in the release
- [ ] CHANGELOG entry states the contract changes plainly

## Packaging

- [ ] `npm pack --dry-run` contains no test files
- [ ] Package manifests list only the dependencies the package actually imports
- [ ] A packed tarball installs and renders in a consumer project outside this
      workspace

Up: [Documentation](../README.md#documentation)
