---
name: orca-outcome-model
description: >-
  Distinguish an outcome from an output, and manage attempt accounting and
  loop control. Use when work is being reported as done because an artifact
  exists, when the same failure has recurred across attempts, when a loop
  needs breaking rather than another iteration, and when deciding what
  actually changed for the party the work was for.
metadata:
  baselineVersion: "0.23.0"
  derivedFrom: CANON-013
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-013 in orca-baseline.
  Baseline version: 0.23.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Outcome Model

## 1. An outcome is not a task

An **outcome** is an externally observable condition that is currently false and
is meant to become true. It is written so that its truth can be checked by
someone who did not do the work.

A task is a decision to perform work. **The two answer different questions**, and
conflating them is what this document exists to prevent:

| | Answers |
|---|---|
| Task | What work have we decided to perform? |
| Outcome | Which observable condition is still false? |

A task can complete while its outcome stays false. That is normal, and it is not
a failure - it is the case the planning hierarchy alone cannot see.

## 2. The outcome identifier outlives every task beneath it

**Every dispatch carries the identifier of the outcome it serves.** Correction
rounds, retries, follow-ups, cleanups and renames all carry the same one.

This is the load-bearing rule. CANON-007 section 5 records that a task
circuit-breaks after three consecutive failed dispatches, and CANON-012 section 5
requires each correction round to be a **new task** linked to its parent. Both
are correct. Together they leave a hole:

```
Task A fails 3 times
  -> Task B "correct A"           the breaker keys on task identity,
      -> Task C "correct B"       so each new id starts a fresh budget
          -> Task D "clean up C"
```

**Nothing in that chain breaks a rule.** Each link is a properly linked child.
The budget resets four times while the same condition stays false.

The estate has run this for real. Its 2026-08-02 handoff records three cleanup
sessions in succession, each doing genuine work, each advancing one unresolved
condition exactly one turn, and the third describing itself as the third link in
a chain.

**So the budget is spent against the outcome, never against the task.** A
renamed, reworded or re-parented task consumes the same budget as the one it
replaces.

## 3. Progress is evidence, and only three things are progress

| Kind | Satisfied by |
|---|---|
| **Goal** | A success predicate became verifiably true |
| **Knowledge** | A material uncertainty was resolved - a hypothesis falsified, a failure domain eliminated, a dependency confirmed, a blocker identified |
| **Risk** | A material concern was closed - compatibility demonstrated, an invariant checked, rollback proven, residual risk accepted by the right authority |

**These are not progress**, however much work they represent:

- Editing a file
- Creating a task
- Spawning a worker
- Running a command
- Writing documentation
- Completing a checklist
- Producing a convincing explanation

Any of them **may produce** progress. None of them **is** progress. The test is
whether something is now true, known or closed that was not before - not whether
effort was expended.

## 4. The breaker

Evaluated against the outcome's whole lineage. `build/outcomes.mjs` is the
reducer and its self-tests are the specification.

| Rule | Fires when | Verdict |
|---|---|---|
| Repeated action | The same action signature runs twice with no delta | `repeated-action-no-progress` |
| Oscillation | The recorded state goes A -> B -> A | `oscillation` |
| No progress | Three consecutive authorized actions produce no delta | `no-progress` |
| Attempts | The outcome's attempt budget is spent | `attempts-exhausted` |
| Cleanup recursion | A cleanup is itself cleaned up | `cleanup-recursion` |

**An action signature excludes the task identifier and the human-facing title.**
Those are precisely what gets reworded when the same thing is tried again, and a
signature carrying them would report every reworded retry as novel - which is the
defect, not the detection.

**A fired breaker means STOP.** It does not mean try harder, and it never means
open a new task. The outcome is frozen and rediagnosed, or it is brought to the
human under CANON-004.

## 4a. The observer outside the actor

Sections 2, 3 and 4 all decide on a **ledger**, and until 2026-08-03 the ledger
was written by the party whose work it judges. The arithmetic was enforced and
the inputs were not.

An observer is anything that can contradict the actor's account without asking
it. This document requires two, and `build/observe.mjs` is the reducer over both.

### The dispatch record

Every attempt is reconciled **in both directions**.

| Disagreement | Meaning |
|---|---|
| A dispatch with no ledger entry | An attempt no budget can see |
| A ledger entry no dispatch witnessed | An attempt that exists only in the actor's account |
| An entry whose outcome differs from the witnessed one | The lineage was re-pointed after the fact |

The second row is the one that looks harmless. An extra entry appears to *spend*
budget, so there seems to be no motive to write one - **until it carries a
delta**. A fabricated entry claiming progress resets the consecutive no-progress
run, which buys three more rounds for the price of one invented record.

### Corroboration, and why a claim is demoted rather than rejected

A delta item may cite the evidence for it. **An item whose citation nothing
witnessed does not count as progress**, and neither does an item that cites
nothing at all.

It is **dropped, not refused**. The observer does not judge whether a claim is
true; it refuses to *count* an unwitnessed one. A dropped delta leaves the entry
standing as an attempt that produced nothing, which feeds straight back into
section 4 - so **inventing a delta now spends the budget it was invented to
preserve.** Refusing the entry instead would teach the actor to omit the delta
rather than earn it, and an entry refused outright is an attempt no budget
counts, which is the defect section 2 exists to stop.

Git is the witness that already exists: it records commits and the paths they
touched, it cannot be told that a commit exists, and the actor does not author
it.

### A fired breaker, asked afterwards

Nothing withholds the next dispatch, so the question is also asked of the record:
**was an attempt recorded after the breaker had already fired?** Evaluated on
growing prefixes, because the whole ledger only says the breaker fires *now* -
the prefix says when it first did, which is the only point after which
continuing is a violation.

A check that can go red on a merged ledger makes the violation non-shippable
even where nothing was able to prevent it live.

### The dispatch record

Orca vends the second witness. `orca orchestration task-list --run <id> --json`
inspects a Run **without binding to it**, and a task record carries `id`,
`parent_id`, `status`, and a `result` blob holding **`filesModified`** — what the
runtime saw a task change, written by the runtime and not by the actor.
`build/adapter-orca.mjs` reads it.

**Orca carries no outcome field.** The identifier section 2 requires therefore
travels in the task spec as a line:

```
Outcome: O-17
```

Anchored to its own line and case-sensitive, so a spec *discussing* an outcome
does not bind itself to one. **A dispatch carrying no marker is reported, never
guessed**, and deriving one from `parent_id` is refused outright — the correction
chain is exactly where a fresh budget gets minted, which is what section 2
exists to stop.

The same trick appears one level up and the ledger cannot see it: a correction
chain whose links each declare a **different** outcome mints a fresh budget while
every link is properly parented. The adapter reports that as outcome drift.

### Three read outcomes, never two

A runtime that did not answer, a runtime that answered and refused, and a Run.
Collapsing the first two reports a live runtime as absent — which is how the
claim that Orca had no tasks at all survived for two days. `unreachable`,
`refused`, and the tasks are distinct, and the read is bounded by a timeout
because a second `orca` on the same machine was measured hanging rather than
answering.

### What is still missing, named rather than implied

**Nothing forces a dispatch through Orca.** The adapter can see every task in a
Run and nothing about work performed outside one — this document's own sessions
included. **`admit()` still has no caller**: the authorization that refuses a
dispatch once the breaker has fired is written and proven, and live withholding
needs a coordinator that asks before dispatching. The tier table says so in those
terms.

## 5. Cleanup is not recursive

**A cleanup may be cleaned up once. A cleanup of a cleanup of a cleanup is
refused.** Where cleanup fails past that depth, it becomes one blocked outcome
carrying its exact recovery command - never another round.

## 6. What this document does not own

- **The task hierarchy.** CANON-003.
- **Runtime mechanisms**, including the task-level breaker itself. CANON-007.
- **The coordinator's job.** CANON-012.
- **What counts as proof** for a goal delta. CANON-005.

## Scope of this skill

An output is a thing produced. An outcome is a change in the world. Reporting
the first as the second is the defect this model exists to name.
