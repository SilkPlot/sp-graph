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
  baselineVersion: "0.23.0"
  derivedFrom: CANON-009a
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-009a in orca-baseline.
  Baseline version: 0.23.0
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

A missing mastery, role, technology or tool is a finding about the **estate**, not
a gap to be filled locally. It is routed rather than recorded here, and *Filing a
gap against the method* below owns what that takes.

## Filing a gap against the method

Some findings are not yours to fix. A rule that is unsatisfiable as written, two
rules that contradict, knowledge the estate should own and does not - repairing
those in place forks the method, and a fork inherits nothing, is found by nobody,
and leaves the owner unaware of what produced it.

**Route it to the owning source's intake, which the profile declares. Never fix it
in place.**

Routing is not a gesture, and a finding a maintainer cannot act on is a finding that
was not routed. The rest of this section is what routing takes.

Until 2026-08-05 this was written only in the receiving repository's own inbox
README - a file no consumer holds. Every project was told to route findings
upstream and none was told what a report must contain, which is
[`lessons/0008`](../lessons/archive/0008-absence-must-be-searched-before-it-is-claimed.md)'s
shape one level up: an instruction whose satisfaction condition lives somewhere
the reader cannot reach.

**One file, one finding, in the owning source's declared intake path.** Name it
`gap-YYYY-MM-DD-<your-slug>-<short-slug>.md`. Commit exactly that file, message
prefixed `gap-intake:`, and touch nothing else - a report arriving inside a larger
change is a report the receiver must first separate from your work.

**Where your environment cannot write outside your own repository, draft it there
and say so.** A report that cannot be delivered is still evidence; an operator
carries it across.

### The eight fields, and why each is refused when absent

| Field | |
|---|---|
| `reporter` | Who found it. The receiver answers *to* someone |
| `reporter_kind` | `project`, `person` or `agent` |
| `date` | When it was hit, not when it was written up |
| `affected` | Every canonical id, role or capability you believe is involved, **or `unknown`**. `unknown` is honest; a guess that omits the nearest owner is what cost another team a full triage cycle |
| `kind_claimed` | `missing`, `stale`, `wrong`, `unclear` or `unsatisfiable`. These are different findings and are triaged differently |
| `searched` | **How much of the corpus you actually examined, with numbers.** Not how much you meant to |
| `status` | `new`. Triage sets everything after that |
| `priority` | `high`, `normal` or `low` - and see the rule below, which takes it out of your hands in one case |

**`searched` is the field that makes the report usable.** *"No evidence of X"*
describes the search, not the corpus, and reads as a finding either way. A claim of
absence with no stated extent is not yet a claim.

**State an extent and a number**, because a prose assurance cannot be checked and a
count can. A ratio does both at once - *"12 of 12 canon documents, 8 of 8 roles"* -
and it is the only form that can also say a search was **partial**, which is why a
ratio smaller than the corpus is refused. It is not the only acceptable form: *"all
15 roles"*, or a named artifact read in full with its counts - *"`build/x.mjs` read
in full; `checkY` occurs once, zero call sites"* - state both just as well, and a
report whose subject is one file read whole has no denominator to give.

**A number with no extent is a sample** - *"searched 4 files"* says nothing about
how many there were. **An extent with no number is the prose assurance** this field
exists to refuse, and *"no evidence of X"* is exactly that. Decision 0110, after
three consumers in one week wrote a correct extent in a form the validator did not
admit.

**Where a gap was met by a fallback rather than by a role that exists, it is `high`
and that is not the filer's call.** Reaching the default case is what makes it high:
a fallback makes an absence cheaper to live with, and cheap absences are never
built. Declare it with `fallback: yes`.

### The two prose sections

**What was needed** - what you were doing and what rule or behaviour you needed.
Concrete. The failing use is the evidence, and a report that describes a desire
rather than a failure cannot be reproduced.

**What the baseline has (or lacks)** - what you found instead, citing document and
section: nothing, a rule that is unsatisfiable as written, two rules that
contradict, or prose that did not answer the question.

### What you do not fill in

**The Triage section belongs to the receiving session.** Leave it untouched.
`status`, and that section, are the response channel - read your own report later
for the outcome. A report whose triage arrives pre-filled by its reporter has
answered itself, which is the one thing a gap report may not do.

### What this cannot promise you

A gap is **neither accepted nor rejected without a full-corpus precheck** by the
receiver, and a rejection is as expensive to get wrong as an acceptance - it is the
one nobody comes back to check. That obligation is the receiver's and is stated in
its own records; it is named here so a filer knows what they are owed, not so they
can enforce it.

**Validation is the receiver's tool and may not be on your machine.** Where it is,
run it before filing. Where it is not, the field table above is the contract, and a
report that satisfies it is filed correctly whether or not anything here could
check that.

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

## A defect that was caught is a near miss, and is recorded

A check going red, a human correcting the work, a review finding something before
it shipped - each is evidence that **the system permitted the defect**. The catch
is not the safety property; the permission is.

Record it as `kind: near-miss`. It carries what would have happened, what caught
it, and whether the catch was designed or lucky.

Two reasons this is not bookkeeping:

- **The deviance rate is invisible from inside.** Each caught defect feels like
  the system working. Enough of them in a row feels like a productive session.
  Only the count reveals otherwise, and nobody counts what they do not record.
- **A lucky catch is a defect with a good outcome.** If a human noticed, or a
  check written for something else happened to fire, the system did not catch it -
  someone did. Those are the ones that recur.

A near miss does not need a rule change to be worth recording. Most will not
produce one. The record exists so the pattern is visible before it produces
something that is not near.

## A lesson has a lifecycle

A record is not finished when it is written. It is finished when the thing it
describes cannot happen the same way again.

| Status | Means |
|---|---|
| `OPEN` | Captured. The rule is stated; nothing yet stops a recurrence |
| `IMPLEMENTED` | The rule is in force somewhere named, with its enforcement stated |
| `ARCHIVED` | Implemented, and moved out of the active set |
| `SUPERSEDED` | A later finding replaced it. The record stays and says by which |

A `near-miss` record has no lifecycle beyond being written: it is evidence, not
an obligation. It is `ARCHIVED` on creation.

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
