<!-- markdownlint-disable MD013 -->
<!--
Everything below maps to something CI actually runs. Nothing here is a formality,
and nothing here is checked by a human that a machine already checks.

Delete the sections that do not apply to your change — an unticked box that was
never relevant is noise. Leaving a box unticked because you could not run it is
fine and useful; say so.
-->

## What and why

<!--
Describe WHY, not just what. The diff already says what changed. What it cannot
say is what was broken, what you tried that did not work, or what the reviewer
should be sceptical about.
-->

## The architecture rule

> **D3 computes. Solid renders.**

- [ ] No `d3-selection`, `d3-transition`, or `d3-axis` in the render path.

These take ownership of the DOM and fight Solid's fine-grained renderer, so a PR
that imports one in the render path will be declined regardless of what else is
in it. Ticks come from a scale and render through a Solid `<For>`; interpolation
goes through `d3-interpolate` with you driving the frame; animation goes through
Solid reactivity plus `requestAnimationFrame`.

## Ran locally

```sh
npm run lint        # biome --error-on-warnings; a warning IS a failure
npm run typecheck   # tsc -b, plus test/ via tsconfig.test.json
npm run build       # cleans first, so this is a build from scratch
npm test            # node for core/theme, real chromium for solid/charts/playground
```

- [ ] `npm run lint` — clean. Lint runs with `--error-on-warnings`, so a warning
      fails CI. Plain `biome lint` exits 0 on warnings, which is exactly how six
      of them once accumulated under a green build.
- [ ] `npm run typecheck` — clean, covering `src` **and** `test/`. `tsc -b` alone
      cannot see `test/`; it is deliberately outside each package's `include` so
      tests are never emitted into `dist`.
- [ ] `npm run build` — clean build from scratch.
- [ ] `npm test` — green, and I read the exit code directly rather than through a
      pipe. Piping a run to `tail` masks `$?`, so a crashed suite reads as a pass.

<!--
Run one Vitest browser project at a time and pin its port. Two concurrent browser
runners collide, and the collision does not report as a collision: it reports a
connect timeout, executes ZERO tests, and finishes in about a second — which
reads exactly like a fast pass.
-->

## Gates

Each of these fails for a reason a passing test run cannot show you, and each
exists because the thing it checks has gone wrong before.

- [ ] `npm run gate:build-hygiene` — no generated config shadowing the TypeScript
      source, no `dist` output whose source no longer exists.
- [ ] `npm run gate:duplication-scope` — the Codacy duplication and metric
      exclusion lists match the test files on disk. Those must be literal paths;
      a glob there matches nothing, silently, so the list rots as tests are added.
- [ ] `npm run gate:accessibility` — the accessibility suites are present,
      non-empty, and reachable. A suite-wide green cannot tell you the
      accessibility files were among the ones that ran, and deleting a failing
      test is the cheapest way to stop it failing.
- [ ] `npm run test:coverage` — per-package coverage floors hold. The floors are
      chosen from observed runs rather than round numbers, and they are per
      package rather than aggregate because one repository-wide percentage is
      exactly where a stub hides.
- [ ] `npm run release:verify` — the packed tarballs work outside the workspace.
      Catches a manifest carrying tests or stale files, an internal dependency
      off the coordinated version, and an export condition pointing at source —
      none of which are visible from inside the workspace, where npm links the
      packages next door.

## Tests

- [ ] New behaviour is covered by a test that **fails without this change**.
- [ ] Tests live in the package's `test/` directory, not colocated in `src/`.
      Packages ship `src` and `tsc -b` compiles it, so a colocated test would be
      both published to consumers and emitted into `dist`.
- [ ] Deterministic — no `Math.random`, no `Date.now`, no bare `new Date()`.
- [ ] Async work polls (`vi.waitFor` / `expect.poll`) rather than racing a bare
      `setTimeout`.
- [ ] No assertion on d3's exact output. Tick counts are hints; formatters and
      path strings are version-sensitive. Assert structure and invariants, or
      cross-check against `computeTicks` / `computeBandTicks` called in the test.
- [ ] Nothing stubbed to manufacture coverage. If a branch cannot be exercised
      honestly in a real browser, leave it uncovered and say so here.

## Visual regression

The screenshot gate blocks. Skip this section if your change cannot move a pixel.

- [ ] Visual regression is green, **or** the baselines were re-pinned and I
      looked at the expected/actual/diff triptych from the
      `visual-regression-diffs` artifact before deciding anything.
- [ ] A re-pin carries a written, attributed rationale in the baseline change log
      in this same diff — `npm run gate:visual-baselines` fails without one.

Re-pinning is a decision about what "correct" means, not a way to clear a red
run, and a green suite after `--update-snapshots` is a tautology. If runner drift
ever appears, the answer is to regenerate baselines on the runner — never to
widen `threshold` or `maxDiffPixels`. See
[`docs/visual-regression.md`](../docs/visual-regression.md).

## Detection probes

`npm run probe:detection` applies forty-five known defects, asserts each one is caught,
and restores. It runs weekly rather than on every push, so it will not catch this
PR before merge.

- [ ] Not applicable — this change does not substantially refactor tests or the
      code they cover.
- [ ] `npm run probe:detection` passes.

Run it after any substantial refactor of tests or the code they cover. A refactor
that guts a suite still reports green everywhere else; this is what notices.

## Accessibility

Skip if your change touches no rendered output.

- [ ] Informative charts still carry a name and at least one description channel.
- [ ] Nothing here is stated as a WCAG conformance claim. **No assistive
      technology has been tested against this library** — see
      [`docs/accessibility.md`](../docs/accessibility.md#tested-limitations).
      If you tested with a real screen reader, say which and which version; that
      is evidence the project does not currently have.

## Docs

- [ ] The relevant `docs/` pointer is updated if behaviour changed.
- [ ] A decision worth arguing about is recorded as an ADR in `docs/decisions/`.

---

By contributing you agree your contributions are licensed under Apache-2.0.
