---
name: orca-verification
description: >-
  Establish what counts as proof and run independent review. Use before
  reporting any finding closed, when deciding whether a check could actually
  have failed, when setting up a verifier, when issuing a verdict, and when
  deciding where verification evidence must live. Governs falsifiability,
  verifier independence, verdict format, and the rule that the verifier never
  scales away.
metadata:
  baselineVersion: "0.3.0"
  derivedFrom: CANON-005
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-005 in orca-baseline.
  Baseline version: 0.3.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Verification Standard

## 1. Falsifiability

A finding may not be reported closed on the strength of a check that passed.

The verifier must establish that the check was **capable of failing**: mutate
the behaviour the check protects and confirm the check fails. Name that mutation
in the verdict.

This applies to every finding, including findings inherited as already closed.
Re-run the defect mutation rather than inheriting a prior verdict.

- A check that cannot fail is not evidence.
- **A check must read the state it is checking**, not the output of a step that
  runs before it. A check placed after a repair tests the repairer, not the
  repair - and passes forever. Ordering is part of a check's correctness.
- A claim that something was verified when it was not is a reportable defect in
  its own right, independent of whether the underlying work was correct.

## 2. Independence

A verifier is independent only when it cannot reach the implementer's terminal,
reasoning or conclusions.

- The verifier receives the accepted task intent and the authoritative records.
- It never receives the implementing worker's conclusions.
- It does not edit files.
- It runs in its own isolated workspace.

Isolation is the mechanism that makes the verdict independent. Without it the
review gate is decorative.

## 3. Verdicts

A verdict is one of **aligned**, **partially aligned** or **misaligned**, with
exact file and command evidence, and the named mutation behind every closure.

- Corrections are dispatched as new work with a narrower brief, never absorbed
  silently by the coordinator.
- Independent verification repeats after every correction.
- Success is not declared while any finding remains open.
- An adversarial default applies: where a verifier cannot determine an outcome,
  it resolves against acceptance.

## 4. Scaling

The verifier is the one step that never scales away. Work may be small enough
that the coordinator performs it directly; it is never small enough to skip
independent verification.

## 5. Evidence durability

Verification evidence that exists only in runtime state, only in an ignored
directory, or only on an unmerged branch is evidence already at risk. Evidence
must reach a durable, tracked location, and its location must be recorded per
CANON-006.

## Scope of this skill

A check that cannot fail is not evidence, and claiming verification that did not
happen is a defect in its own right - independent of whether the work underneath
was correct.
