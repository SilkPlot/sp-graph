---
name: orca-closeout
description: >-
  Close a session out completely, so the next one can start with no inherited
  context. Use at the end of any session, and whenever handing an action back
  that this session cannot take. Covers stale documentation, validators and
  diff inspection, secrets, committing and pushing across every repository
  touched, open pull requests, stale branches and worktrees both runtime-side
  and version-control-side, runtime provenance, and the next-session prompt.
  Also governs destructive-action limits and the format for handing over a
  blocked action with its command.
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

## 2. Closeout obligations

1. No stale, loose, contradictory or dangling documentation remains.
2. All repository-local validators pass, and the diff is checked for
   whitespace and formatting defects.
3. Every intended diff and staged path is inspected for secrets, credentials,
   private material, host paths, generated state and unrelated changes.
4. Everything is committed and pushed - **when that action is authorized**.
   Authorization is per-action and never transitive. **The session asks for it**
   and performs the action on the answer; an unasked authorization is not a
   blocked action, per section 2a.
   **In every repository the session touched, not only the one it started in.**
   A session that wrote across several repositories closes out across all of
   them; work left in a working tree is one worktree removal from gone, and the
   repository holding it is usually not the one being watched.
5. No open pull requests remain, verified across every repository in the
   project.
6. No stale branches, worktrees or workspaces remain, local or remote. Confirm
   rather than assume.
   **Check the runtime and the version control separately, and remove with the
   instrument that created it.** Both facts are CANON-007 section 16.2's -
   including that neither listing is complete on its own, which is why the gap
   between them is exactly where an unaccounted writable checkout survives, and
   that a removal reports success while keeping an unmerged branch. Cited here,
   not restated: a claim about Orca living outside the document that re-verifies
   it is `lessons/archive/0028`.
   **Check every worktree of every registered repository, not the checkout in
   front of you.** A repository's primary checkout being clean says nothing about
   its worktrees; they are separate working trees sharing one object database.
   Driven from the registered repository list this is seconds of work, not a
   filesystem search.
7. Runtime provenance reaches durable storage: the orchestration task, dispatch
   and gate identifiers created this session, and the location of every
   verification report. **Created by this session** - the pool is runtime-global
   and holds other sessions' state, so record what you made and state `none`
   when you made nothing. Never report the pool's contents as your own.
8. Remaining gates, residual risks and the exact next action are recorded.
9. The next-session prompt or command is produced.
10. **The session record is closed**, per section 2c. Closing it is what re-arms
    the handoff-freshness rule, so it is the last step and not the first.

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

## 2a. Handing over a blocked action

**A blocked action is one a session could not take even with a yes.** A credential
it does not hold, a policy that forbids it, a boundary that belongs to someone
else, an interface with no command surface, or a capability the session
structurally lacks - section 2d's case.

### Do not restate a fact the tooling computes. Ship the command

A handover, and the handoff carrying it, states no fact that a command in this
repository already computes. **The test: if a commit made after this sentence
could change its truth value, it is not a sentence, it is a cache.**

A document may record a fact that is **historical** - *"merged at
`1e72252..7ece1da` on this authorization"* is true forever. It may not record a
fact that is **current**, because current is a property of the reader's moment,
not the writer's.

**Updating the value is not the fix.** `lessons/archive/0046` measured four such
sites in one session: three were repaired by writing a fresher number and went
stale again, because the next commit is what changes the answer and the next
commit is always coming. Two of the four are the same paragraph, corrected once,
wrong both times and in opposite directions. The only repair that survived the
event which broke its predecessors deleted the restatement and shipped the
command that computes it.

The narrow case this is enforced on is a claim about the session's own branch,
because that is the one that was wrong four times. The general form is
`administrative`, and the tier table says which is which.

### Authorization that has not been granted is not a blocked action

**It is a decision, and CANON-004 owns it.** CANON-004 section 1 already names
*any action requiring authorization that has not been granted* as a decision to
be raised. A session that routes one through this section instead has
not found a blocker; it has declined to ask a question, and then handed the human
the work as though the question had been asked and refused.

The cost is not theoretical and it is not shared evenly. **The session keeps the
context and the human gets the command.** Every handover of this kind moves the
cheapest part of the work - typing a line the session already composed - onto the
one actor who has to reconstruct why it is being run, while the actor holding
that reason keeps it.

**The test is one question: would a yes be enough?**

| Answer | What it is | What the session does |
|---|---|---|
| Yes - the session could then act | A **decision** | Ask under CANON-004, in that document's format. On the answer, **do the work.** |
| No - the session still could not act | A **blocked action** | Hand it over, per the rest of this section |

A yes that is *sufficient* is the whole of the test. It does not matter how
consequential the action is, how irreversible, or how much the session would
rather be told twice. Those raise the bar for **asking well** - CANON-004 section
3's format exists for exactly that - and none of them convert an answerable
question into an obstacle.

### A precondition outlives the state it was written in

A handover is validated against the state at the moment of **writing** and
executed against the state at the moment of **reading**. Closeout obligations 4,
5 and 6 change that state — committing, integrating, retiring branches — so where
the writing session performs them afterwards, the two states are guaranteed to
differ.

**The action a precondition guards can be the action that invalidates it**, and
the more correctly the sequence is performed the more certainly it happens.
Retiring a remote branch, which section 2d prescribes, deletes the upstream ref;
a precondition written as `@{u}..HEAD` then fails with `fatal: ambiguous
argument` rather than answering.

**Write preconditions against the refs the procedure preserves, not the ones it
destroys.** `@{u}` names a relationship closeout is obliged to remove; the base
branch names one it is obliged to keep. The question a handover actually needs
answered is almost never *is this pushed* but *is this work already on the base
branch*, and only the second survives the cleanup.

**Do not ship `git merge-base --is-ancestor` as that precondition.** It prints
nothing and exits non-zero for a squash-merged branch whose content is entirely
on the trunk, so the human stops - correctly following an instruction that is
wrong, with no later event able to clear it. Section 2d's *the merged test is
whether merging would change anything* owns the test and the command; a
precondition uses it rather than restating a proxy for it.

**Then re-run the handover's own commands as the last act of the close**, after
every state-changing obligation. Running them before writing proves nothing about
the state the reader will meet.

### Decompose before handing over

**A handover is sized to the part that is genuinely blocked, never to the group
of steps it arrived in.** Where a procedure mixes both kinds, the session takes
every step a yes would authorize and hands over only the remainder.

A procedure handed over whole because one step in it is impossible is the common
form of this defect, and it is the expensive one: the impossible step is usually
one of several, and the others were the session's to take all along. It also
degrades the handover it is trying to serve, by burying the one line the human
genuinely must run among lines they did not need to see.

**State the split explicitly.** Say which steps were taken, on what authorization,
and which single step remains and why no yes could have moved it. A human reading
a residue of three commands cannot tell which of them were ever theirs.

### What a handover carries

Reporting that something is blocked moves the work to the human without moving
any of the means. They then reconstruct the command the session already knew.

A handover states, for each blocked action:

| Element | Why |
|---|---|
| The exact command | Runnable as written. Every placeholder named, with its value given |
| What it does | In one line, in plain terms |
| Why it is needed | What is currently broken or unavailable without it |
| What happens if it is not run | The consequence of declining, stated honestly |
| How to verify it worked | A command or observable result, not "it should work" |

The command must be **safe to paste**: prefixed with the `cd` to the right
directory, and with any artificial line-wrapping marked so a copy does not break
it. A command that fails on paste is a handover that did not happen.

Rules:

- **No bare blockers.** "This is blocked" without the command is an incomplete
  handover. Note what this rule is not: *"this needs your approval"* is not a
  defective handover to be repaired by adding the command. It is a decision that
  was never asked, and adding a command to it makes it a **complete handover of
  something that should not have been handed over at all.**
- **Never guess a command.** Resolve it against the tool's own schema or guide;
  where it genuinely cannot be resolved, say that plainly rather than offering a
  plausible-looking line that fails.
- **Say when there is no command.** Some blocks are decisions, information only
  the human holds, or a change made through an interface with no command surface.
  State which, so the human is not hunting for a command that does not exist.
- Where the action carries risk, say what it changes and what it does not.

The test is whether the human can act without reading the session back. If they
must reconstruct context to run it, the handover was not complete.

## 2d. Where the blocked action is the session's own cleanup

**A session cannot remove the worktree it is standing in.** The runtime
re-provisions it and the session carries on inside a directory it believes it
deleted. So a session whose remaining obligation is removing its own workspace
always ends with obligation 6 unmet, and section 2a's handover is how it says so.

**One step of that cleanup is blocked. The rest are not, and they are routinely
handed over with it.** The full sequence is typically to merge the branch, remove
the worktree, and delete the remote branch. Only the middle step is impossible
for the session standing in the worktree; **the merge and the remote delete are
ordinary actions a session performs on authorization**, per section 2a's
decomposition rule. Ask for them, take them, and hand over the one command that
no yes could have let the session run.

**This is the case that produced the rule**, so it is stated here rather than
left to be derived: a session that hands over all three has made the human the
executor of two actions that were never blocked, and has hidden the single
genuinely blocked one among them.

That handover is correct and it is not the only thing available. **A session that
cannot clean up after itself can create one that can** - off the base branch,
outside the worktree being removed. Where this is the blocked action, **both
routes are put in front of the human at the moment of closeout, and neither is
chosen for them**:

| Offered, every time | Never assumed |
|---|---|
| **Whether** to spawn a cleanup session at all | The section 2a handover command stays alongside it, runnable as pasted. A human who would rather run two lines than supervise another agent does not have that taken away |
| **Which agent** it runs | `--agent` names it. The choice is presented as a choice; a default buried in a script or a prompt has already made it |

**A closeout that spawns a cleanup session without asking has substituted its
judgement for the human's.** A closeout that offers only the handover has withheld
a capability it holds. The obligation is to *present* the option at closeout - not
to document somewhere that the possibility exists.

```bash
orca worktree create --repo <selector> --name <name> --base-branch <base> \
  --agent <agent> --prompt "<what the successor must do>" --no-parent
```

**`--no-parent` is load-bearing.** A cleanup session recorded as a child of the
worktree it exists to delete inherits the lineage it was created to end.

The prompt carries the removal's **preconditions**, not only its command: the
worktree is verified clean and its branch verified merged *before* anything is
removed, per section 3, and the successor is told to stop and report rather than
force where either fails. A successor that routes around a dirty worktree has
turned a finding into an obstacle.

### The removal reports success while leaving a branch behind

**What `orca worktree rm` does is CANON-007 section 16.2's to state**, and this
section cites it rather than restating it: the removal keeps an unmerged branch,
announces it on a line of its own, and still prints `removed: true` and exits 0.
That section also owns the rule that a worktree is removed with the instrument
that created it, and that the worktree a live session is standing in is never
removed at all.

This paragraph used to originate those facts, which CANON-007 section 16 reserves
to itself - a claim about Orca living where nothing re-verifies it is
`lessons/archive/0028`'s exact subject, and the breach was in the document that
cites 0028. Corrected 2026-08-03 under the sweep's ruling 5.

**What this section owns is the obligation**, which is what a session must do:
**confirm the branch is gone rather than inferring it from the exit code**, and
confirm from both listings per obligation 6. A removal that left a branch behind
satisfies every check that reads only the status.

### A spawn is refused unless the closeout it follows has passed

Where the option is taken, **the cleanup session is dispatched only after the
closeout it follows has actually passed** - not after it has been performed.

The asymmetry is the whole reason this is a rule. A cleanup session **deletes the
worktree that dispatched it**. So a spawn following a closeout that did not pass
destroys work that was never finished, and the failure is silent and total: the
evidence goes with the directory, and the session that could have reported it no
longer exists.

Refused, at minimum, where any of these holds:

| Refused when | Because |
|---|---|
| Any check is red | The removal is the last act; a red is a defect that will not survive it to be found |
| The working tree is dirty | Uncommitted paths exist in no other ref and die with the worktree |
| Commits are unpushed, or the branch has no upstream and is not merged | They survive a crash and not a removal. **No upstream is not zero unpushed** - reading one as the other spawns. It is not *commits exist only here* either: a branch pushed, merged, then stripped of its remote copy has no upstream and has lost nothing, and section 2d prescribes exactly that order. The question is whether the work is already on the base branch, and where that cannot be determined the answer is unknown and still refuses - `lessons/archive/0049` |
| The branch is not merged, or merged status is unknown | The removal keeps an unmerged branch, reports `removed: true` and exits 0, so the spawn produces a stranded branch rather than a clean removal |
| This is the repository's primary checkout | There is nothing to clean, and removing it takes the repository |
| A session record is still open | Obligation 10 closes it last, and a record abandoned in a removed worktree defers the freshness rule where nobody is standing |

**Every reason is reported, not the first.** A refusal that names one blocker
sends the reader round the loop once per blocker, which is the failure section 2a
exists to prevent for a human handover and is no better coming from a tool.

### The merged test is whether merging would change anything, not whether the branch is an ancestor

**Ancestry is a sufficient answer and not a necessary one.** A squash merge
writes a **new** commit carrying the branch's tree under a different parent, so a
branch whose content is entirely on the trunk is not an ancestor of it and never
becomes one. Nothing here weakens the refusals above - the refusal is right
whenever the answer is genuinely unknown - but a **permanent false refusal** is
not an unknown, and the two rows in the table are unreachable for such a branch
by construction.

This is not hypothetical: it has happened to a consumer and to this repository,
`registry/projects.md` records the first, and **two sessions derived the same
workaround independently, under time pressure, without either finding reaching
the method.**

**Ask the question directly.** Where the merge produces the base branch's own
tree, the branch adds nothing:

```bash
# merged when this prints the same tree as: git rev-parse <base>^{tree}
git merge-tree --write-tree <base> <branch>
```

Three outcomes and each is a different finding. It exits `0` and prints the
merged tree; it exits `1` on a **conflict**, which is unmerged and never unknown;
and on git older than 2.38 it exits `129` on the unknown option, which falls back
to ancestry - **and the fallback is reported**, because a narrower answer passed
on silently is how this defect reached two sessions in the first place.

**Two candidates were measured and rejected**, so a later reader does not spend
the same afternoon. `git cherry` compares patch ids **per commit**, and a squash
collapses several commits into one, so no original patch id matches - it answers
a rebase, not a squash. Tree equality between the branch and the base is right
only while the trunk has not moved on since the merge, which is a window of
minutes.

Ruled 2026-08-11 on
`intake/gaps/closed/gap-2026-08-11-the-merged-test-is-ancestry-and-a-squash-merge-makes-it-answer-no`.

**Automating the offer must not automate the choice.** A tool may remove the
typing; it may not supply the agent, and it may not spawn without being asked. A
default agent is the decision this section exists to prevent, wearing the costume
of a convenience.

### A removal is verified by absence, never by an expected count

**Confirm that the named path and the named branch are gone. Do not confirm that
some number of worktrees remain.**

A count is wrong in both directions and neither is detectable from the count
itself:

| | |
|---|---|
| **It over-counts by design** | The primary checkout is a working tree and is always listed. A count that forgot it reports failure on a clean removal |
| **It under-counts by surprise** | A parallel session's worktree is legitimately there, and the parallel-agent obligations say to expect one. A count derived when nobody else was running is wrong the moment somebody is |

The failure this actually causes is the second one: an expected total that
*happens* to match hides a surviving worktree whenever another has gone away, and
the two errors cancel silently. **An expected count is a claim about every other
session as well as this one**, which is not a claim a removal is in a position to
make.

This was written after a handover instructed *"expect one worktree in each
listing"* for a removal that correctly left two - the primary checkout, and the
cleanup session's own. The instruction was wrong when it was written, and the
removal it was checking was right.

Epistemic status `verified`, per CANON-002 section 2a: established first-hand
2026-08-01 in both directions - a merged branch was deleted along with its
worktree, and an unmerged branch on a scratch worktree was kept, with that
warning, on exit 0.

#### And never by an exit status, for a command that removes, retires or integrates

**Widened 2026-08-04 under decision 0093**, on evidence from three tools. The
original rule refused a *count*; the same failure arrives through `$?` and arrives
more often, because binding to the exit status is the correct habit everywhere
else and nothing marks where it stops working.

| Command | Exit | Answers | Was asked |
|---|---|---|---|
| `orca worktree rm` | `0` | did the worktree go | did the worktree **and its branch** go |
| `gh pr merge --delete-branch` | `0` | did the merge land | did the merge land **and both branches go** |
| `orca <cmd> --worktree <bad-selector>` | `0` | did the command run | **did it find anything** |

The first is documented and deliberate. The second is documented to do something
it did not do. The third reports `selector_not_found` and exits `0`, so **a lookup
that matched nothing reports success** - and a caller doing exactly what this canon
elsewhere instructs would record a removal that never happened.

**This does not weaken CANON-005 section 1, and the boundary is the whole point.**
*A check's exit status IS its result* governs a check **this project wrote** to
answer **its own** question; `hooks/pre-commit` is built on it and stays built on
it. A third-party command's exit status answers **its author's** question, and
where the two questions differ the status is not less informative, it is wrong.

So: read the output, then re-read the listing. **Confirm by the absence or
presence of the named thing.** The exit status is evidence that the command ran,
never evidence of what it accomplished.

Epistemic status `verified`: all three rows observed first-hand, the `gh` row on
2026-08-04 with both branches still standing after exit `0`.

## 3. Destructive-action limits

- Never force-remove a dirty workspace.
- Stop terminals before removing anything; preserve all work.
- Remove or archive a worktree only when its state is authenticated, clean or
  deliberately retained, and removal is authorized.
- Never clean, reset, overwrite or discard an unrelated or dirty worktree.

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

## 2e. An obligation nothing queries is not discharged

**A closeout may not report green over an obligation it never asked about.**

Obligations 1 to 10 are not equally checkable, and the ones with no query are the
ones that get skipped - not through carelessness, but because a tool reporting *all
checks green* is read as reporting on all of them. Twice, in the same tool: once
over three obligations it never examined, and once over obligation 5 while a pull
request carried the whole session's output and no tool in the repository contained
a pull-request query at all.

Two rules follow, and the second is the one that is usually missed:

- **Where an obligation has a query, run it and bind to it.**
- **Where it has none, the closeout says so by name.** Silence is indistinguishable
  from a pass, and an obligation that is `administrative` is not thereby optional.

### A prohibition in a dispatch brief does not discharge an obligation in canon

A brief saying *do not merge* forbids merging **unilaterally**. It does not answer
whether the obligation is met, and it does not convert an action into a blocked
one - section 2a's test still applies, and for an ordinary action a yes would be
enough.

**Reading a dispatch prohibition as settling a canonical obligation is how a
careful session skips one.** The failure looks like discipline from the inside. The
correct move is to ask, and then act on the answer; deferring the unasked question
into the next session's prompt hands over an action that was never blocked.

### Where a check would be red forever, partition rather than lower the bar

An obligation can be genuinely unreachable in its literal form. Release automation
opens a pull request from a release's own bookkeeping commits, so *no open pull
requests* is a state this kind of repository never occupies.

**A check that is red in the steady state is one somebody switches off**, and its
removal takes the real coverage with it. Partition the population instead: report
what the closeout must not act on, bind on the rest, and state which is which.
Lowering the obligation to match what is convenient loses the distinction
permanently; partitioning keeps it visible.

### An answer that cannot be obtained is not a clean answer

Where the query itself fails - a tool absent, unauthenticated, offline - the
obligation is **unverified**, and unverified binds. Resolving an unknown to its
comfortable value is the failure this whole section exists to prevent, arriving
through the tooling rather than through the actor.

## 2f. A live claim is separated from history structurally, not by reading

A handoff accumulates. The lead section describes now; everything below it is a
record of the moment it was written, and a later close may have moved what an
earlier one reported open.

**The boundary must be structural, and every check that reads the document must
use the same one.** Where it is a matter of reading, two things go wrong and both
are silent:

- **A live section written at the wrong depth is skipped**, and the nearest
  discharged section is validated in its place. A handover demoted one heading
  level left an older, already-discharged section standing in the live position,
  and the check reported on that instead.
- **A section omitted because it is empty promotes the next one into the live
  position.** So a close with nothing outstanding still writes the heading. An
  absent section does not mean *nothing outstanding*; it means the boundary moved.

**Earlier entries are not edited to match later truth.** Correcting them would
destroy the record of what was believed when a decision was taken, which is the
only thing history is for. The separation is what makes leaving them alone safe.

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

The test of a closeout is not that it was performed but that the next session
needs nothing from this one. Anything it would have to ask about is an item this
closeout missed - including work left uncommitted in a repository nobody was
watching.
