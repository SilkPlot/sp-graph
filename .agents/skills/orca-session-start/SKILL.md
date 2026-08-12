---
name: orca-session-start
description: >-
  Start a session correctly and report its position. Use at the beginning of
  any session to establish what is approved, what is mounted, and what remains
  unauthorized; when another agent is running against the same project in
  parallel; and when a position report is asked for. Closeout is a separate
  capability - orca-closeout.
metadata:
  baselineVersion: "0.23.0"
  derivedFrom: CANON-006
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-006 in orca-baseline.
  Baseline version: 0.23.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Session Lifecycle

## 1. Startup obligations

1. Read the project profile (CANON-008) and every canonical source it inherits.
2. Read the project's durable records: current handoff, open next-session
   prompt, active task or backlog contract, accepted decisions, and the
   repository-local verification instructions.
3. **Inventory the state this session is inheriting**, per section 1a. Not the
   checkout in front of you: every worktree of every declared repository, both
   listings, and the runtime state that already exists.
4. Confirm workspace, branch, repository identities, required commit pins, and
   read-write or read-only access modes.
5. Identify the exact approved task, its permitted outputs, its stop conditions,
   and everything that remains unauthorized.
6. Do not inspect or mutate an unmounted or unrelated repository.
7. Reuse recorded closeout evidence instead of re-running it, unless the task
   changes the same surface. Verify live state first-hand for any fact the work
   depends on, per CANON-002.
8. Before editing, report any mismatch between the live workspace and the
   accepted contract - including a branch or worktree whose name corresponds to
   no approved work item. Stop if the mismatch cannot be corrected without new
   authority.
9. **Open a session record** naming the approved task from step 5, per section
   2c. Work in flight is ahead of the handoff by construction, and this is what
   tells the freshness rule that the gap is a session rather than a defect.

A session must be able to start with **no inherited context** beyond the durable
records. If it cannot, the previous closeout was incomplete.

## 1a. The inherited-state inventory

Startup and closeout ask the same question from opposite ends - *what is actually
here?* - so they use the same mechanics. This section was weaker than the
closeout obligations for longer than it should have been: `lessons/0021` was
applied to closeout and
not back-ported, leaving a startup that inspected primary checkouts while the
closeout enumerated every worktree.

**Nothing here is optional because the previous closeout was good.** A closeout
records what one session did; it cannot record what another session did
afterwards, and the state that hurts is the state nobody was watching.

| Inherit | Because |
|---|---|
| **Every worktree of every declared repository** | A repository is an object database with N working trees. `git -C <repo> status` inspects exactly one, per CANON-006 section 2b |
| **Both listings, separately** | A worktree the runtime created is listed by the runtime; one created with version control is not. Neither listing is complete, and the gap is where an unaccounted writable checkout survives |
| **Work a crash would take** | Uncommitted paths, unpushed commits, and branches with no upstream **whose commits are not on the base branch**. Inherited at-risk work is still at risk, and finding it at closeout is finding it late |
| **Runtime state that already exists** | Tasks, dispatches and gates. The pool is runtime-global: **enumerate it, and claim none of it.** A session that adopts another's task state reports someone else's work as its own |
| **Open pull requests** | An open pull request is committed work awaiting a decision. A session that does not know it exists will duplicate it or contradict it |
| **Signs of a parallel agent** | Another worktree of this project, dirty or on an unfamiliar branch, is a session running now. Section 4 governs what follows |

**A dirty worktree that is not this session's is reported, never cleaned.**
Section 3 forbids touching it, and startup is exactly when it is most tempting -
the tree looks like leftover mess rather than someone's work in flight.

`node build/sweep.mjs --startup` answers the first four from the registered
repository list in seconds. It is scoped to this repository by default; the
estate is an explicit widening, per CANON-006 section 1 step 6.

## 2c. Handoff currency belongs to the closeout

**The session performing closeout owns the currency of the handoff.** No other
actor does, and no other actor is asked to.

This was unwritten for as long as the obligation existed, and the cost was
specific rather than theoretical: three consecutive dispatches, each correctly
forbidden to edit the handoff, were issued a definition of done they could not
reach. **An obligation with no owner is discharged by whoever feels worst about
the red.**

A narrow dispatch does not own it and is not failing when it sees the gap. A
worker rewriting the handoff is a worker rewriting its own supervision, which is
why the prohibition is correct and why the obligation has to sit somewhere else.

### The rule is scoped to closeout, not weakened

Work in flight is **supposed** to be ahead of the handoff. The handoff is written
at closeout, so that is the only moment at which *"the handoff does not carry the
work it hands over"* is a defect rather than a description.

So the session is represented, and the rule consults it:

| | |
|---|---|
| **What opens one** | Startup obligation 9, naming the approved task |
| **What closes one** | Closeout obligation 10, after the handoff is written |
| **Where it lives** | The working tree, untracked - its correct lifetime is the worktree's, and a session record that outlives the checkout it describes is a lie |
| **How the check reads it** | While a session is open the rule **defers**; closing it re-arms the rule, and the close is refused while the handoff is stale |

**Deferral is announced, never silent.** A suppressed check that says nothing is
indistinguishable from a check that passed, and an exemption nobody can see is an
exemption that outlives the fact it exempts.

**An open record that is never closed suppresses the rule indefinitely.** That is
the residual risk and it is stated rather than argued away. Four things bound it,
none of them a promise to remember: the close is refused while the handoff is
stale; the deferral is printed with the session that owns it and the count of
commits in flight; the inherited-state inventory reports an open session in every
worktree it enumerates, including ones that are not this session's; and the
record cannot outlive its worktree, which obligation 6 already refuses to leave
stale.

**A session closes against the world it proposed against.** Opening records the
integration tip the session read; closing asks whether integration happened since.
Where it did, the close is **refused** and names the fresh read that clears it - re-reading and then `amend`, which re-proposes -
what the session built stands on a read that no longer holds, and a warning nobody
must act on is what the reducer already was.

**A session record that is not this session's is reported, never closed** - for
the same reason the destructive-action limits forbid cleaning someone else's
worktree.

## 4. Parallel agents

Where another agent runs against the same project in parallel:

- Remain aware of it throughout the session.
- Produce a report at the end of closeout that the parallel session can
  consolidate, so the full closeout can be completed once across both.
- Never assume shared runtime state belongs to this session.

## 5. Status report

When a position report is requested, cover exactly:

- where we are;
- what has been completed;
- what is still outstanding; and
- how aligned we are with what we are trying to achieve.

Measured, not asserted. Gaps are stated explicitly rather than omitted.

## 2b. What a crash would take

A session should be able to answer, cheaply and at any moment: **if this machine
died now, what would be lost?**

Three categories, and only the first is unrecoverable:

| At risk | Survives a crash | Survives a disk loss |
|---|---|---|
| Uncommitted work in a working tree | **no** | no |
| Committed, unpushed | yes | **no** |
| Pushed | yes | yes |

**A branch protects nothing that is not committed to it.** Worktree branches do
live in their repository - that part is sound - so committed work is never
orphaned by removing a worktree. The exposure is entirely uncommitted state, and
it is invisible to every remote, every branch listing and every runtime view.

Sweep every worktree of every registered repository, not the one in front of you.
A primary checkout being clean says nothing about its worktrees, and the worktree
holding work at risk is usually one nobody is looking at - a parallel session's,
or one left behind by a session that ended badly.

This is a **recovery** obligation as much as a closeout one. After an
interruption, the first question is not what was being done but what was not
saved.

## 1. Scope

**Bound surfaces.** These are read by a human deciding what to do next:

| Surface | Where |
|---|---|
| Session output to the human | Everything an actor says in a session |
| The handoff's live section | The lead section, above the first history heading - CANON-006 section 2f |
| Decision bundles | CANON-004 section 3 owns the format; this owns the prose inside it |
| Verdicts and status reports | CANON-005 section 3, CANON-006 section 5 |
| Release notes | The consumer-facing note, not the changelog |

**Unbound surfaces**, and the exclusion is deliberate rather than an oversight:

canonical documents, role documents, lesson records, decision records once
accepted, and **the history below a handoff's live section**. These are read by
an actor looking up a rule or reconstructing what happened, not by a human
choosing a next action. Two of the rules below would actively damage them: a
history record's whole job is the recap section 3f forbids, and an evidence
table is not shortened without deleting evidence.

**This document is itself unbound**, which is why it carries long tables and a
provenance section. A contract that could not survive its own rules would be
declaring rules it does not believe.

## 2. Why the shape is a contract and not a preference

Five facts about reading under load, and every rule below descends from one of
them. They are stated because a rule whose reason is unstated gets optimized away
by the next actor who finds it inconvenient.

1. **Working memory is small.** Anything not on screen is gone. An instruction to
   "keep in mind" what was said three turns ago is an instruction that fails.
2. **Knowing the answer is not doing the answer.** The distance between
   understanding and acting is where work dies, and prose that explains without
   naming an action widens it.
3. **Starting is the hardest step.** The first action must be small, obvious and
   available now.
4. **Vague durations do not register.** "Some work" and "three days" land
   identically, so an estimate without a unit conveys nothing.
5. **Buried progress does not count as progress.** Work that completed and was
   not made visible reads as work that did not happen.

**Concision is the weakest of these, not the strongest.** The shape exists to
make substance reachable, never to reduce it. Section 5a is the boundary that
keeps this from inverting, and it is the most important rule in this document.

## 3. The rules

Each binds every surface in section 1. Each yields only where section 5 says so.

## 3a. Lead with the action

The first line is something the reader can do, or the answer itself. Not context,
not a plan to produce the answer, not a restatement of the question. If the answer
is a command, a path or a finding, it goes first and the reasoning follows.

A first line that describes what the actor is about to do is not an answer. It is
the announcement of one.

## 3b. Number multi-step instructions

Work of more than one step is a numbered list, one bounded action per step. Fold
away any step the reader does not need. A short path completed beats a complete
path abandoned.

This governs **instructions**. It does not govern the planning hierarchy, which
CANON-003 owns.

## 3c. An action list is capped at five and ranked; an evidence table is not

More than five things to do is split into *now* and *later*, or *must* and
*might*. Five ranked beats ten unranked, because an unranked list of ten defers
the prioritising back to the reader, who has less context than the actor.

**An evidence table, a census, an acceptance matrix or a findings list is not an
action list and carries no cap.** Truncating one deletes evidence, which
section 5a forbids outright. The cap applies to what the reader must *do*, never
to what the actor must *show*.

Where the surface is a decision bundle, CANON-004 section 2's limit of four
questions is tighter and governs; this cap never loosens it.

## 3d. State cost in units, with its basis

An estimate names a unit and what it assumes: *"about twenty minutes if the
fixtures already exist, an afternoon if they do not"*. An estimate with no unit is
not an estimate.

Where the thing being sized is planned work rather than an immediate next step,
sizing belongs to the role that owns it - ROLE-001 for delivery, ROLE-006 for
risk - and this rule requires only that the figure reaching the human carries its
basis with it.

## 3e. Finish the first thing before offering the second

A second issue found mid-work is not raised inline. Finish what was asked, then
offer the second as a separate, answerable question.

A question the actor can resolve first-hand is not a tangent and is not raised at
all - it is resolved, and the result folded in. CANON-002 section 2 already
requires this; the addition here is that an unresolved one surfaces **once**, at
the end, rather than as an aside in the middle.

## 3f. No preamble, no recap, no closing pleasantry

Do not open by announcing what you are about to do. Do not close by restating
what was just read. Do not close by inviting further questions.

**This binds session output. It does not bind the durable record, and the
distinction is written here rather than cross-referenced because the two read as
contradictory at a glance.** A closeout record is required by CANON-006 section 2
to state what happened; that is not a recap forbidden by this rule, it is the
artifact. The rule forbids *saying it again in the session* after the record
already carries it.

## 3g. An error is stated as cause and fix

Never as alarm. No "unfortunately", no "it looks like something went wrong". Name
what failed, where, why, and what changes it.

Failure is reported at full fidelity. Section 5a governs, and a failure
compressed until it stops being diagnosable is a failure concealed.

## 3h. Make completed work visible and concrete

State what now works and how to see it working, in terms the reader can check.
Not "the auth flow has been improved" but the command that demonstrates it.

This is the reporting half of CANON-005: the evidence already had to exist, and
this requires it to be *reachable* rather than buried in a paragraph.

## 4. What this composes rather than restates

Four of this contract's concerns were already owned before it existed, each
stated at a different instance site with no owner between them. They are composed
here under CANON-001, not copied. **Changing any of them means changing the
document named, not this one.**

| Concern | Owner | This document adds |
|---|---|---|
| Restating position across turns | CANON-006 section 5 | Nothing. A position report covers exactly the four things named there |
| Bundle format, option length, question cap | CANON-004 section 2 and its format rules | Nothing to the format; section 3c defers to its tighter cap |
| A claim's evidential status | CANON-002 section 2a | Nothing. Shape never changes what a claim is allowed to assert |
| Sizing with a stated basis | ROLE-001, ROLE-006 | Section 3d, for figures reaching the human outside a plan |

**A fifth was found during authoring and is left where it is.** The handoff's
"read the lead section and stop there" instruction is CANON-006 section 2f's
structural separation, not an output rule. It is cited by section 1 and not
absorbed.

## 5. Where shape yields

The rules are defaults. Each case below is a named override, not a judgement call
available on demand.

## 5a. Evidence outranks shape, always

**No rule in this document authorises removing a fact, a command, a file
reference, a caveat or a failure.** Where following a rule would delete
substance, the substance stays and the shape gives way.

This is the inversion the contract is most likely to suffer, because compressing
is easy and the loss is invisible to the one doing it. CANON-002 and CANON-005
outrank this entire document, and a session that reports less because it was
being concise has broken the contract, not kept it.

## 5b. An explanation was asked for

"Explain", "walk me through", "why" - the body runs as long as the subject needs.
Sections 3a and 3f still bind; length does not license preamble.

## 5c. The options are the answer

Where the reader asked what their options are, two to four ranked options with
one-line trade-offs *is* the action. Section 3a is satisfied by the
recommendation coming first, not by collapsing to a single path.

## 5d. A destructive or outward-facing action is next

Confirmation outranks brevity. The existing limits - CANON-006 section 3 - are
unchanged by anything here.

## 5e. Three turns without progress

Where the last three exchanges have been the same failure, stop iterating and
name the assumption that might be wrong. CANON-013's loop-breaker rules own what
happens next; this rule only requires that the shape stops pretending progress is
being made.

## 5f. The harness requires otherwise

Inside an agent harness the system prompt outranks this contract. Announce a tool
call where the harness requires an announcement, and do the work rather than
asking whether to. Same principle as section 5a - the constraint wins and the
shape stays.

## 6. The pre-send check

Before a bound surface is sent or committed, remove:

1. A first sentence that announces what is about to be done.
2. A last sentence that asks whether anything else is needed, or recaps.
3. Any "by the way" sidebar - section 3e governs where it goes instead.
4. Any hedging adverb carrying no information. **A hedge carrying real
   uncertainty stays**; deleting it manufactures confidence, which CANON-002
   section 2a forbids.
5. Any figurative phrase standing in for a literal action.

Then the test: reading only the first line and the last line, does the reader
know what to do next and what just happened? If not, the shape has failed and
the fix is to move substance forward, never to add a summary.

## 7. Provenance and attribution

The rule set this document adapts is
[`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd), MIT licensed,
read first-hand at `skills/i-have-adhd/SKILL.md` on 2026-08-04. The MIT licence
travels with the adaptation, and this section is why the attribution ships to
consumers rather than sitting in a commit message.

**What was changed, and why, because an unrecorded adaptation cannot be
reviewed:**

| Change | Reason |
|---|---|
| Four of ten rules removed and composed instead | CANON-001. They were already owned - section 4 names each owner |
| The list cap narrowed to *action* lists | A five-row cap over an evidence table deletes evidence. Section 3c |
| Section 5a added, with no counterpart in the source | The source's own rubric weights concision lowest of five and treats lost substance as a blocking finding; that judgement was load-bearing and lived only in the evaluation harness, so it is stated as a rule here |
| The no-recap rule bounded to session output | A closeout record is a recap by design. Section 3f |
| The always-on toggle dropped | The source ships a plugin needing an opt-in; canon binds by default, and a rule requiring activation is CANON-006 section 2e's unqueried obligation |

**The source's evaluation rubric is not adopted.** It scores candidate prompts
against a baseline, which is a question about a product, not about a session's
output. CANON-005 already owns what counts as proof here.

## Scope of this skill

A session must be able to start with no inherited context beyond the durable
records. If it cannot, the previous closeout was incomplete - and that is a
finding about the closeout, not about the session that suffered it.
