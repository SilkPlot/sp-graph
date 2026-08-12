---
name: orca-decisions
description: >-
  Bring a decision to the human and get it answered. Use whenever different
  answers would lead to materially different work: a blocker, an ambiguity
  that cannot be resolved from the records or the live state, an action whose
  authorization has not been granted, or a point where a wrong assumption
  would be unsafe. Governs the bundle format, the four-question limit,
  question independence, how a recommendation states its basis, and which
  instrument carries the question - decision gate, ask, or the agent harness's
  own.
metadata:
  baselineVersion: "0.23.0"
  derivedFrom: CANON-004
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-004 in orca-baseline.
  Baseline version: 0.23.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Decision Protocol

## 1. When a decision must be raised

Raise a decision only when different answers lead to **materially different
work**. Within that bar:

- A blocker under CANON-003.
- An ambiguity that cannot be resolved from the records, the code or the live
  state.
- Any action requiring authorization that has not been granted.
- Any point where proceeding under a wrong assumption would be unsafe or would
  make the work useless.

Do not raise a choice that has a conventional default, a fact that can be
verified first-hand, or a preference that does not change the work. Decide
those, and state the decision in one line.

Do not advance past a decision point until it is answered. Do not decide on the
human's behalf.

**There are two outcomes, and no third.** Either the question meets the bar, and
it is asked as a bundle in the section 3 format; or it does not, and it is
decided, with the call stated in one line.

A question asked in passing - trailing prose, "let me know if", "say if you would
rather", a parenthetical at the end of a report - is the illegitimate third
outcome. It is a decision request wearing the costume of a courtesy, and it
escapes the format precisely because it looks too small to need it. Size is not
the test. Whether different answers lead to different work is the test, and a
question small enough to ask in passing has usually already failed it - meaning
it should have been decided, not asked.

Before asking anything, name which outcome it is. That is the step being skipped
when this rule is broken.

## 1a. Name the owner before raising

A question is raised where its **concern** is owned, not where it was noticed.

Ask the promotion test of the decision itself: *would this be true
in a different project?* If yes, it belongs to the canonical source that owns it
and is raised there - even when a project session surfaced it, and even when that
session is the only one that can see it. If no, it belongs to the project.

The failure this prevents is one-directional and quiet. A session working inside
a project sees everything as a project question, because that is the context it
is standing in, so a defect in a shared artifact gets recorded as a local choice.
The project then carries an opt-out from something it never had the standing to
opt out of, and the shared defect stays unfixed because it now looks handled.

A capability shipped to every consumer is not something one consumer decides. If
its behaviour is unacceptable to a project, that is evidence about the
capability.

## 2. Bundling rules

- At most **four questions per bundle**. Fewer is better. The limit exists so
  that a bundle reaches the human as a single prompt rather than several.
- Every question in a bundle must be **independent of every other unanswered
  question in that bundle**.
- **Independence test:** if the answer to one question would change the options
  of another, the two are dependent.
- Defer dependent questions to a later bundle, and incorporate the prior answers
  into it so the next bundle learns from the last.
- State which questions are queued for the next bundle.

## 3. Required format

One `Description` per bundle, then one block per question:

```
# Description

<shared context for the whole bundle - at most two lines>

## 1. <question, one sentence, ending in a question mark>

Options:
- <option> - <one line>
- <option> - <one line>

Recommendation: <the pick> - <reason and basis, at most three lines>
```

**This is a content contract, not a layout.** Every element must reach the human,
whatever instrument carries the question.

An instrument that renders options natively satisfies the Options element. No
instrument renders Description or Recommendation, so those are always authored
and always visible. Folding the recommendation into an option label does not
satisfy it: the pick, the reason and the basis are three facts, and an option
label carries none of them.

## 4. Content rules

- **Length.** Description at most two lines; question one sentence; each option
  one line; recommendation at most three lines.
- **Shape.** Bullets and tables. Never large paragraphs.
- **Options.** Two to four, concrete and mutually exclusive. A question with no
  options is not ready to be asked.
- **Acronyms.** On first use in each bundle, immediately follow the acronym with
  its full name or term in parentheses. This includes terms coined inside the
  project. There is no exemption list - "everyone knows that one" is a judgement
  that drifts.
- **Basis.** Every recommendation states what it rests on: verified first-hand,
  a named source, or reasoning. Never assert "industry standard" or "best
  practice" without naming the source, per CANON-002.
- **No manufactured recommendation.** Where there is genuinely no
  recommendation, say so and say why. A fabricated one is worse than none.

## 5. Recording

A decision that changes how work is done is recorded in the project's durable
records at closeout, per CANON-006. A decision taken through an Orca decision
gate carries a gate identifier; record it.

## 6. Choosing the instrument

Three instruments carry questions, and they are not interchangeable. CANON-007
section 9 governs the distinction; this section governs which one a decision
uses.

| Instrument | Carries | Available when |
|---|---|---|
| Decision gate | A decision for the human | Orchestrated sessions only - a gate is raised against a task, so no task means no gate |
| Ask | A worker's blocking question to its coordinator | A dispatched worker has a coordinator to ask |
| The agent harness's own question instrument | A decision for the human | No orchestration task exists |

Rules:

- Orchestrated session, decision for the human: raise a gate and record its
  identifier.
- Unorchestrated session: use the harness instrument. A gate is not available.
- Never route a question aimed at the human through an ask, and never answer a
  worker's ask with a gate.
- Where the harness instrument accepts fewer questions than section 2 permits,
  the instrument's limit wins and the remainder is deferred to the next bundle.
- An instrument constrains **delivery**, never content. It may satisfy the
  Options element by rendering options itself; it never excuses a missing
  Description or Recommendation, per section 3.

Per CANON-007 section 0, this document carries no command syntax. Resolve the
commands against Orca's own version-matched guide.

## Scope of this skill

This skill governs how a decision is asked and answered, not what the answer
should be. A question that does not change the work is not a decision - decide
it, state the call in one line, and carry on.
