---
name: orca-craft-research
description: >-
  Hold the standard of rigour, verify facts first-hand, and complete research
  before work begins. Use when tempted by the fastest path, when relying on a
  documented claim that has not been checked against live state, when a
  document and reality disagree, or before anything enters a sprint, phase or
  task. Also governs the separation of research methodology from a specific
  research run.
metadata:
  baselineVersion: "0.23.0"
  derivedFrom: CANON-002
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-002 in orca-baseline.
  Baseline version: 0.23.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Craft and Research Standard

## 1. Standard of rigour

We are not afraid of work. The objective is to build the best - incomparable,
not merely adequate - and the limit is not effort.

- Effort is not a cost to be minimised. The easiest and fastest path is not the
  default and is never the justification.
- People reached space on machines with less capability than a modern
  calculator. Complacency, not capability, is the constraint.
- Where an existing artifact can be improved by rebuilding it from scratch,
  rebuild it. Inheriting a weak artifact is not a reason to keep it weak.

This standard does not authorize scope creep. It sets the quality bar inside
approved scope. Scope is governed by CANON-003.

## 2. First-hand verification

Documentation describes what was true when it was written.

- Prefer first-hand experience of live state over any documented claim.
- Verify a documented fact against reality before relying on it.
- A tool being reachable, a file existing, or a document asserting something is
  not by itself evidence that it is current or correct.
- When live state and a document disagree, the live state is the fact and the
  document is a defect to be reported.

**Resolving is not functioning, and parsing is not working.** A configuration
that has never executed is an assumption; validating that it parses proves only
that it parses. A binding that resolves proves the pointer, not the fit. A
capability is verified by **using it once and seeing the result** - until then it
is described, not known.

Do not record a mechanism as working, or a decision resting on it as settled,
before it has run. The first run is where the cost is, and deferring it moves the
cost to whoever depends on the claim.

## 2a. Every load-bearing claim carries its status

A claim that other work rests on declares how it is known:

| Status | Means |
|---|---|
| **verified** | Checked first-hand, against live state, in this session |
| **documented** | A named source says so, and the source is cited |
| **assumed** | Neither. Believed, not checked |

**An assumed claim may not be load-bearing.** Either check it, or record it as an
open risk and say what depends on it. An assumption nobody wrote down cannot be
falsified, cannot be reviewed, and is discovered by the failure it causes.

This is a precondition that nobody stated. Design-by-contract makes preconditions
executable for exactly this reason: an unstated precondition is not a weaker
contract, it is an absent one.

The failures this method has actually suffered all began as unstated assumptions
that read as facts - *the repository is clean*, *the filter applied*, *the profile
matches the project*, *the configuration works*. Every one of them was cheap to
check and expensive to assume.

**State the status even when it is obvious.** The cases that hurt are the ones
where it was obvious and wrong.

## 3. The research-first gate

Nothing enters a sprint, phase, task or any child document without first
completing a research run that:

- establishes the current industry standard;
- establishes current best practice;
- resolves every ambiguity in the proposed work; and
- records its sources.

Research precedes planning. Planning precedes work. A gap discovered later is a
blocker under CANON-003, not something to resolve inline.

## 4. Research is separated from its results

Per CANON-001 section 12, the reusable methodology and the specific run are
different artifacts.

- The methodology owns evidence standards, source quality, search procedure,
  contradiction handling, confidence handling, citation and output contract.
- A research brief or run owns the question, context, constraints, required
  outputs, evidence gathered, and findings.
- A run must not redefine the methodology.
- A reusable finding is recorded once in canonical knowledge and referenced from
  every run that needs it, never rediscovered and never copied between reports.

## 4a. Correct at the point of discovery

A defect, ambiguity, warning, failing check or stale claim is corrected **when it
is found**, not collected for a pass that will deal with everything at once.

This is not tidiness. Three things happen to a deferred correction:

- **It poisons what follows.** Work built on top of a known-wrong thing inherits
  it, and every later artifact has to be re-checked once it is fixed - so the fix
  gets more expensive precisely as it gets more overdue.
- **It stops reading as outstanding.** A finding that has been carried for a
  while looks like a decision someone made rather than work nobody did. Nothing
  distinguishes "we know and are getting to it" from "we know and have accepted
  it" once enough time passes.
- **It drifts.** A stashed correction is written against a state that keeps
  changing underneath it, and by the time it is picked up the description no
  longer matches anything.

Where the correction genuinely requires a decision, **that is the thing to raise
immediately** - not to carry silently while working around it. Raise it, and say
what is blocked behind it.

The batch-it-later instinct is strongest exactly when the work in flight feels
more important than the defect. That feeling is not evidence about which is more
important; it is evidence about which is more recent.

## 5. Prohibited shortcuts

None of the following is ever an acceptable path to completion:

- work done on the fly, without a task and a stated goal;
- a quick win taken in place of the correct change;
- a shortcut that leaves the authoritative source uncorrected;
- endless looping in place of raising a blocker or a decision;
- claiming completion on unverified work;
- deferring a correction to a later pass, per section 4a.

## Scope of this skill

Effort is not the cost to be minimised here. This standard sets the quality bar
inside approved scope; it never authorizes widening that scope.
