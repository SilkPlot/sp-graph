---
name: orca-gaps
description: >-
  File a gap against the method itself: something missing, stale, wrong,
  unclear or unsatisfiable at the point of use that cannot be fixed locally.
  Use when the method, a canonical rule or the knowledge estate does not
  answer a question your work needs answered, and fixing it in place would
  fork it. Governs where a report goes, the eight fields it must carry, why
  the extent of your search is part of the claim, what the receiving side owes
  you, and the one field that is not the filer's call.
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

## Scope of this skill

A gap report is routed, never fixed in place. A local copy of knowledge the
estate should own is a fork: it inherits nothing, it is found by nobody, and the
estate stays unaware of the gap that produced it. If you cannot deliver the
report, draft it anyway and say so - an undelivered report is still evidence.
