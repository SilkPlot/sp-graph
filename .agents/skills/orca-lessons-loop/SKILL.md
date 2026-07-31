---
name: orca-lessons-loop
description: >-
  Capture operational lessons during any session and write them as structured
  records the project keeps. Use when a session discovers that a rule is
  unsatisfiable as written, a check fails in only one direction, a runtime
  behaves in an undocumented way, a defect recurs, or something fails without
  signalling. Also use when deciding whether a finding is project-specific or
  would be true in a different project, and when a verification regime is
  producing more artifacts than the work it verifies.
metadata:
  baselineVersion: "0.3.0"
  derivedFrom: CANON-009a
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-009a in orca-baseline.
  Baseline version: 0.3.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Lessons Capture

## Why this exists

Sessions discover things reading cannot: that a rule is unsatisfiable in
practice, that a check fails in only one direction, that a runtime behaves in a
way no documentation states. Without a defined place to put them, those findings
stay in the session that hit them and are rediscovered at full cost by the next
one.

A lesson that is not written down is a lesson that will be paid for again.

## When to record one

- The finding is about this project - its history, its estate, its domain.
- The finding is about how work is done - the runtime, the method, the
  verification regime, the tooling.
- An independent review exposed a defect in the method rather than in the work
  under review.
- **Something failed.** An error, a timeout, a retry, a command that had to be
  run twice, a tool that behaved differently from its documentation. These count
  even when the cause is not yet understood.

Record it the moment it is hit. Do not defer to closeout: the detail that makes a
lesson useful is the first thing lost.

## The evidence bar

A record is worth keeping when one of these holds. State which.

- **Recurrence.** The same defect appeared twice or more, in different work.
- **Proven mechanism.** The cause is understood and demonstrated, not inferred.
- **Silent failure.** Something fails without signalling. Record these on first
  occurrence, because the second occurrence is invisible by construction.

A finding with none of the three is a preference wearing evidence as a costume.
Write it down if you like, but mark it as unproven.

**A failure is always recorded, proven or not.** An error or a timeout whose
cause is not yet understood is marked unproven and kept. Recurrence is one of the
three bars, and nothing can recur to a record that was never written - you cannot
count to two without recording one.

## Three findings that are easy to miss

These are lessons as much as a failing check is, and they are the ones most often
absorbed as "how it went" rather than recorded.

### Work a machine should have done

A procedure that is deterministic and repeatable, carried out by an agent, is a
defect in the tooling rather than a task well done. It costs more every time, and
it varies - which is the worse half, because the variation is invisible until it
matters.

Record it, and replace it with code. An agent's judgement is for the parts that
need judgement; anything with one correct answer belongs in a script that can be
run, reviewed and gated.

### A capability that would have helped

When a session finds that a role, a profile parameter, a check or a declared
lane would have made the work correct or cheaper, that is a finding. Record what
was missing and what it would have prevented.

The alternative is that the same absence is worked around silently by every
session that meets it, and nobody ever asks for the capability - because each
individual workaround was small.

### Knowledge the estate does not have

A missing mastery, role, technology or tool is a finding about the estate, not a
gap to be filled locally.

**Route it to the owning source's intake, which the profile declares. Never fix
it in place.** A local copy of knowledge the estate should own is a fork: it
inherits nothing, it is found by nobody, and the estate stays unaware of the gap
that produced it.

State what you were doing, what knowledge you needed, and what you found instead.
The failing use is the evidence.

**Search the whole corpus before claiming something is absent, and state the
extent of the search inside the claim.** "No evidence of X" describes the search,
not the corpus, and reads as a finding either way. A claim of absence with no
stated extent is not yet a claim - and a candidate raised in your own working and
then dropped is a defect in the reasoning, not a decision already taken.

## Fix the system, not the instance

A defect that is only corrected will return. Where a defect can be caught
mechanically, the fix includes **the check that would have caught it**, and that
check is **proven to fail on the defect before it is trusted**. A check adopted
without seeing it go red is an assumption in the shape of a test.

Where no mechanical check is possible, say so in the record. That is a finding
too, and it is the honest version of "we will be careful next time".

## What a record must contain

- The finding, stated as a rule rather than a story.
- Which of the three bars above it met, and how it was demonstrated.
- Which session produced it, and when - so a later reader can reconstruct the
  context.
- Whether you believe it is specific to this project, or would be true in a
  different one.
- **A status**, and where the rule now lives once it has one.

## A lesson has a lifecycle

A record is not finished when it is written. It is finished when the thing it
describes cannot happen the same way again.

| Status | Means |
|---|---|
| `OPEN` | Captured. The rule is stated; nothing yet stops a recurrence |
| `IMPLEMENTED` | The rule is in force somewhere named, with its enforcement stated |
| `ARCHIVED` | Implemented, and moved out of the active set |
| `SUPERSEDED` | A later finding replaced it. The record stays and says by which |

An `IMPLEMENTED` record names **where the rule now lives** and **what enforces
it** - a check, or an explicit statement that no mechanical check is possible.
"We will remember" is not an enforcement.

**Archive on implementation.** An active lesson list that includes everything
ever learned stops being read, and the ones still needing work become invisible
among the ones that do not. Archiving is not deletion: the record keeps its
provenance and stays linked from wherever the rule was promoted.

A record that has been open for a long time is itself a finding. Either the rule
is not worth enforcing, or it is and nobody has.

Keep the rule and drop the narrative. A record that needs its story retold to
make sense has not been written as a rule yet.

## Cost is itself a finding

A verification regime that produces more artifacts than the work it verifies is a
defect, and it is one only experience reveals. When a session's evidence output
substantially exceeds its subject, record that as a lesson about the regime
rather than treating the cost as the price of rigour.

Scale verification to consequence. Executable code, evidence artifacts and
anything on a durability path earn the full standard. A documentation edit earns
the validators. Re-proving every prior finding on every round grows
superlinearly - re-prove what the current change touches plus a bounded sample,
and say what the sample was.

## Where records live

The project profile declares the path. Write there and nowhere else, so the
records can be found without knowing which session produced them.

If the profile declares no lessons path, that is a profile defect: report it and
record the lesson in the project's durable records rather than losing it.

## Scope of this skill

This skill records lessons. It does not decide what becomes of them. Records are
assessed periodically against the bar above, away from the session that wrote
them, and a human accepts or declines each one. Write the record well and that
decision can be made without you in the room.
