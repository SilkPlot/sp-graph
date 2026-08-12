---
name: orca-native-mechanisms
description: >-
  Honour the properties of the Orca runtime that any orchestrated session
  depends on: loading doctrine from Orca rather than memory, the boundary
  between orchestration and vendor agent-spawning, runtime-global task state,
  lifecycle identity, and the commands that report success while leaving work
  behind. Use before dispatching delegated or parallel work, before trusting a
  removal or a merge, and whenever a command that creates is about to be used
  as a query.
metadata:
  baselineVersion: "0.23.0"
  derivedFrom: CANON-007
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-007 in orca-baseline.
  Baseline version: 0.23.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Orca Native Mechanisms

## 0. Doctrine is loaded from Orca, never from memory

Orca ships version-matched guides and a machine-readable command schema that
cannot drift from the installed binary. This document deliberately carries no
command syntax; it records only the mechanisms and their consequences.

```bash
orca status --json                 # runtime ready and reachable
orca skills list
orca skills get orchestration      # dispatch lifecycle, waiting, messaging
orca skills get orca-cli           # worktrees, terminals, handoffs
orca agent-context --json          # confirm a command exists before using it
```

The guides are authoritative on **how Orca works**. Never assume a command from
memory. Where a guide and any other instruction conflict on a point this
document does not cover, the guide wins and the conflict is reported.

**The published documentation site is a third source, and it is not
authoritative.** It documents commands the installed schema may not carry, and
the schema is what settles it.

**The worked example this section used had itself gone stale, which is the
lesson.** It said `orchestration run-create` and `worker-start` were absent from
the live surface. **Both are present** - verified 2026-08-07 by using them, in
the document that says never to assume a command from memory. A recorded
divergence is a claim about one version and decays like any other. Read the
site for concepts; resolve every command against `orca agent-context --json` or
the version-matched guide. Where the site and the binary disagree, the binary
wins and the divergence is recorded here.

Orchestration must be enabled in Settings -> Experimental before any
orchestration command will work. A session that assumes it is on will fail at the
first dispatch.

**Resolve argument values, not only command names.** An identifier is scoped to
the surface that accepts it, and the same agent is named differently on different
surfaces. Carrying a value across from the tool you last used it on fails, and
fails with a message that reads as "not installed" rather than "wrong name here".
Never infer an identifier from a directory name either.

## 0.1 A command that creates is not a query

Some surfaces enumerate no valid values and offer no dry run. Probing them by
attempting the action is not a query - it is the action, and it succeeds for
every value that happens to be valid.

Task state is runtime-global (section 3), so anything created that way is briefly
visible to every other session on the machine.

Before probing by attempting:

- look for a dry run, a list command, or the version-matched guide;
- where none exists, plan the removal **before** creating anything; and
- verify the removal rather than assuming it.

A side effect you intend to undo is still a side effect you caused.

## 1. Tool boundary

Orca orchestration is not interchangeable with vendor agent-spawning. A vendor
subagent, generic agent-spawn API or chat-only parallel worker creates workers
but creates **no Orca task or dispatch provenance, no injected lifecycle
preamble, no worker_done authority and no decision gates**.

Before reporting that anything was orchestrated, prove it with the task and
dispatch records. If work was run outside Orca orchestration, say so plainly
rather than describing it as orchestrated.

### Orca orchestration is the default, and the vendor mechanism is the exception

**Parallel or delegated work is dispatched through `orca orchestration` unless a
stated reason says why it could not be.** The runtime vends what the vendor
mechanism does not: `task-create`, `dispatch`, `worker-start`, `gate-create`,
`ask`, and an inbox — so a task record, dispatch provenance, a decision gate and
an answerable question all exist by construction rather than by the coordinator
remembering to write them down.

**This was inverted in practice before it was written here.** On 2026-08-07 a
coordinator ran **four** delegated dispatches through a vendor agent-spawn API,
described them throughout in role and dispatch vocabulary, and recorded *"no
orchestration task, dispatch or gate was made"* at every close. Both halves were
accurate and the pair reads as orchestrated work. `lessons/0091`.

**What the vendor mechanism costs, concretely**, measured on that session:

| Absent | What was done instead |
|---|---|
| Task and dispatch records | Prose in the handoff, which no tool reads |
| Decision gates | The coordinator carried four rulings to the human by hand |
| `worker_done` authority | Each agent's own report, accepted on trust |
| An inbox | One `SendMessage` to a running agent, invisible to any record |
| Write-lease partitioning | File scopes assigned by hand — and **two dispatches took the same decision number** |

**Where the vendor mechanism is used anyway**, the session states in its runtime
provenance that the work ran **outside Orca orchestration**, in those words. That
is not a formality: it is the difference between a reader knowing there is no
dispatch record and a reader assuming one exists.

## 1.1 Installed capabilities are governed by source and scope

An earlier form of this section banned "vendor-global tooling" and exempted
"Orca's own bundled skills". That distinction does not survive contact with the
mechanism: Orca distributes its own skills with `npx skills add`, into the same
vendor agent skill directories as anything else. The delivery path is identical.
Only the source and the scope differ, so those are what this section governs.

A capability - a skill, an MCP server, a plugin, a hook, a custom command - may
be present in a session only when **all four** hold:

1. **Sourced** from orca-baseline, or bundled with Orca itself.
2. **Project-scoped**, installed into the project rather than the user account.
3. **Version-pinned**, recorded in the project's lockfile.
4. **Declared**, so the profile accounts for what the project carries.

Everything else is out of scope and is not installed or enabled - in particular
any ambient, user-level, unpinned capability supplied by Claude, Claude Code,
Codex, OpenCode or any other agent vendor. Ambient tooling is barred because it
is invisible to the project, unversioned, and different on every machine, which
makes a session unreproducible.

**One exception, and only one.** The bootstrap capability is installed globally,
because the project it bootstraps does not yet exist and cannot host it. It is
sourced from orca-baseline and version-pinned like everything else; it is exempt
from the project-scope rule alone. No other capability may claim this exception.

## 2. Supervision is an explicit unlock

Orca distinguishes a full ownership handoff from supervised coordination, and
unlocks supervised orchestration only on an explicit request naming supervision,
monitoring, waiting for completion, DAG coordination, decision gates or
ask/reply.

A session that intends supervision must declare it explicitly and standing.
Absent that declaration, Orca treats delegation as a handoff and no lifecycle
state is created.

## 3. Task state is runtime-global

Tasks, messages and gates are shared across every project on the machine, and
other sessions may be live in the same pool.

- Record the task, dispatch and gate identifiers you create, and filter to them.
- Never assume a task listing is yours.
- Never touch a dispatched task you did not create.
- Do not reset orchestration state while any other project has state in the
  pool - the reset is runtime-global.

## 4. Lifecycle identity is taskId + dispatchId, never a terminal handle

A pane can be issued a new handle after restart, so handles are routing metadata
only. Carry both identifiers in every lifecycle message. Never accept or reject
provenance by comparing handles.

**A coordinator must re-resolve its OWN handle before trusting any armed wait.**
The runtime can reissue a pane's handle at any time - after a restart, and also
mid-session with no visible cause. A wait armed on a superseded handle keeps
running, looks healthy, and returns an empty result at timeout, which is
indistinguishable from a worker still working. Nothing warns you.

So on every wait: resolve your own handle from the runtime rather than reusing a
remembered one, arm the wait on that, and treat an unfamiliar coordinator handle
in a worker's reply metadata as the symptom it is - stop and re-resolve before
anything else. That mismatch is usually the first and only sign.

Run exactly one wait per coordinator handle. Concurrent waits on one handle are
mutually destructive: each consumes matching messages, so a forgotten wait
silently swallows the completion the live one is waiting for. Never background a
wait inside another backgrounded command - it escapes the harness that would
notify you, and consumes the message regardless.

**Close a worker before dispatching into its worktree again.** A worker whose
task completed stays alive until closed. Dispatching a second agent into that
worktree puts two write-capable actors in one checkout, which the one-writer
invariant forbids. Confirm the target worktree has no live agent as a
precondition of every dispatch, not as cleanup afterwards.

## 5. A task circuit-breaks after three consecutive failed dispatches

The task is then marked failed. Review and correction loops routinely exceed
three rounds.

Therefore **each round is a new task linked to the original as its parent**,
never a retry of the same task. The DAG records the chain and no round is lost
to the breaker. Keep dependency chains no deeper than about three to four steps.

**That rule and this mechanism together open a hole, and CANON-013 closes it.**
This breaker keys on task identity; the correction rule mints a fresh identity
every round. So the budget resets while the same condition stays false, and no
link in the chain breaks a rule. CANON-013 section 2 spends the budget against
the **outcome** instead, which every task in the lineage carries. Nothing here
changes - the runtime still breaks a task at three - but the task budget is no
longer the only one counting.

## 6. Waiting is a first-class mechanism

Supervise with rolling waits filtered to completion, escalation and decision-gate
messages. Never use sleep or poll loops, and never read terminal output to guess
progress.

- A wait timeout or empty result is a **checkpoint, not a failure**.
- Heartbeats and terminal activity mean a worker is **alive, not done**.
- Do not stop, close, kill or restart a quiet worker. Coding tasks routinely run
  15-60 minutes.
- A wait returns **one message at a time**; loop once per worker expected.

## 7. worker_done completes the task automatically

Do not follow a valid completion message with a manual status update. Reserve
manual updates for explicit recovery or override.

## 8. A review-only completion does not authorize coordinator edits

Synthesize the findings, raise a decision gate if ownership is unclear, and
dispatch the corrections as new work. Do not silently absorb review findings
into your own edits.

## 9. Ask and gates are different instruments

- **Ask** - a worker's blocking question to the coordinator.
- **Decision gate** - a coordinator-level or human-level decision on the work.

Do not use a gate to answer a worker's ask.

## 10. Base ref is chosen, not inherited

Orca lineage and the Git base are separate decisions. Detaching a worktree's
lineage does not choose its base.

Use the repository's configured default base or pass one explicitly. Never base
a worker on the current feature branch unless stacked work was explicitly
requested.

## 11. Worktree isolation is an explicit unlock

Orca creates a worktree only on explicit request or a hard conflict, and treats
parallelism or convenience as insufficient grounds.

An independent verifier under CANON-005 **is** a genuine isolation requirement
and the unlock must be granted explicitly. Concurrent writers likewise require
separate worktrees and distinct branches: only one write-capable actor may be
active in a worktree at a time.

## 12. Agent-first worker creation

Prefer creating a worker worktree with the agent attached and taking the handle
from the create response. Creating a bare worktree and then adding a terminal
leaves an orphan shell; use that path only when custom agent arguments are
required.

Wait for interface readiness before dispatching, or the prompt races startup and
is lost.

## 13. Both coordinator paths are native

Orca supports a manual loop - create task, create worker, dispatch with
injection, rolling waits - and an autonomous coordinator loop. **Neither is
deprecated.**

- The manual loop keeps every dispatch decision reviewable and is the path that
  can satisfy a per-action approval boundary.
- The autonomous loop suits wide, independent fan-out where allocation order
  does not need review.

Choose deliberately and state which was chosen and why.

## 14. Coordinator memory is external

Use the ready-task view to drive dispatch waves, the brief view for sweeps, and
the cross-worktree orchestration summary for situational awareness. Do not hold
DAG state in your own context.

## 15. Runtime state is erasable and local

Orca task, dispatch and gate records do not survive in version control. Write
the identifiers created and the location of every verification report into the
project's durable records, so the session is reconstructible after runtime state
is gone.

## 16. Every claim about Orca lives here

A statement about what the Orca runtime is, does, or can express is **owned by
this document**. It may be cited elsewhere; it may not be originated elsewhere.

This is not tidiness. This document carries a re-verification obligation and a
dated history; no other document in this project does. A claim about Orca that
lives somewhere else is a claim **nothing re-verifies**, and no actor has to skip
a step for it to rot. That is not hypothetical - the claim in section 16.1 lived
in four canon documents and two roles for a week, was re-verified twice,
correctly, against a document that did not contain it, and was false the whole
time.

**A mechanism named in a control-tier basis must appear in section 16.1 or in the
sections above.** A tier declaration is where a claim about Orca does the most
work and gets the least scrutiny, because the reader is checking the tier rather
than the mechanism.

### 16.1 Withdrawn claims

A claim about Orca that has been **shown false** is recorded here permanently and
is not deleted. Deleting it loses the only thing that stops it being rediscovered
and believed a second time.

**The withdrawal is scoped to every representation of the claim, including
executable ones.** A fixture is a claim under version control. So is an error
string a tool prints at the moment of authorship, and that one is worse: it
instructs an author to assert something false at exactly the moment they are
looking for guidance.

`Pattern` is a JavaScript regular expression, matched case-insensitively against
every line of every tracked `.md` and `.mjs` file. It is written here rather than
in the checker because the claim is canon's to own and the tool's to enforce -
the same split CANON-008 section 5.2 makes for generated marks, where the
consumer is a tool and the mark is therefore structured.

| Claim | Pattern | Withdrawn | Why it is false |
|---|---|---|---|
| An Orca environment recipe can enforce a lane by mounting repositories read-only | `recipe[^.\n]{0,90}(?:mounts?\b|:ro)` | 2026-07-31 | The `environmentRecipes` schema is `id`, `name`, `create`, `suspend`, `resume`, `destroy`. There is no mount field, no access field and no `:ro`. A recipe boots one disposable runtime keyed to a single `projectRoot`, chosen when the workspace is created, and nothing binds it to a task, a dispatch or a role |
*(A second claim, about a lane withholding a capability by its `:ro` mount, was
withdrawn here on 2026-07-31 and **reinstated with a scope on 2026-08-03**. It
has moved to section 16.1a and is no longer enforced as false.)*

**Where the claim may still appear**, because a withdrawn claim has to be
discussable: this section; the lesson and decision records that document the
withdrawal; and the handoff section that warns the next session about it. Those
paths are declared in `build/withdrawn.mjs` and are the checker's only exemption.

### 16.1a Reinstated claims

A withdrawal is a measurement, and a measurement can be wrong. **A claim leaves
section 16.1 only by being shown true**, never by becoming inconvenient, and it is
recorded here with the same permanence — deleting the history would lose the fact
that the estate believed the opposite for three days.

| Claim | Withdrawn | Reinstated | Scope, and what stays false |
|---|---|---|---|
| A lane withholds a capability by its `:ro` mount | 2026-07-31 | 2026-08-03, decision 0084 | **True of the estate-owned container mechanism.** `orca-workspace-isolation` at `2.0.0` mounts a declared repository set per workspace and a `read-only` member is mounted `:ro`. Measured both directions on 2026-08-03: a writable member accepts a write; a read-only member refuses one **from `root` inside the container**, and the host file is unchanged. **Still false of an Orca environment recipe alone**, which is why the section 16.1 row above it stands |

**Why it was withdrawn, and why that was reasonable.** The 2026-07-31 basis reads
*"Same mechanism, same absence"* — it treated the lane claim as a restatement of
the recipe claim. They are not the same claim. A recipe **starts a script**, and
the script does the mounting; the schema's silence bounds what a recipe can
*say*, never what it can *start*.

**The distinction is the whole of the correction**, and it is why one row moved
and one did not. Decision 0066's 2026-08-02 amendment drew it first; this section
is where it becomes enforceable, and `canon/project-profile-contract.md` section
2.3 is where it was owed and missing until decision 0084.

### 16.2 Worktree removal

Every statement here is a claim about Orca, so it is originated here. Other
documents cite this section; CANON-006 obligation 6 is the one that does.

**A worktree is removed with the instrument that created it.** The two are not
interchangeable and neither cleans up after the other.

| Created by | Removed by | Why it must be that one |
|---|---|---|
| The runtime | `orca worktree rm --worktree <selector>` | It removes the worktree from Orca **and** from git. Using version control instead leaves the runtime's record behind |
| Version control | `git worktree remove` | The runtime never knew it. Section 16.2a's table already says such a checkout is invisible to every runtime-side listing |

**Neither listing is complete alone**, which is the property that makes the
symmetry matter rather than merely tidy. Verified 2026-08-01 in both directions:
`git worktree remove` and `git branch -d` each exited 0 and the runtime restored
both within two minutes.

**`orca worktree rm` reports success while leaving an unmerged branch behind.**
It applies git's own safe-delete semantics: the branch is **kept**, announced on
a line of its own, and the command still prints `removed: true` and exits 0.

```
warning: local branch "<name>" was kept because Git could not safely delete it
removed: true
```

The exit status answers whether the worktree went, not whether the cleanup
finished. So the case that leaves work stranded is the case whose command
reported success.

**Never remove the worktree a live session is standing in.** The runtime
re-provisions it, and the session continues in a directory it believes it
deleted - which reads as a new session resuming an old one.

### 16.2a What this project relies on, and what it cannot ask for

| Mechanism | Can express | Cannot express |
|---|---|---|
| `environmentRecipes` | Booting, suspending, resuming and destroying one disposable runtime per workspace | Access modes, mounts, per-repository read-only, or any binding to a task, dispatch or role |
| Worktrees | A registered checkout the runtime can later list and remove cleanly | Anything about a worktree created with version control instead - it is invisible to every runtime-side listing |
| Tasks, dispatches, gates | Lifecycle provenance, supervision, decision gates | Persistence past a runtime reset; none of it survives in version control (section 15) |

## Verification of this document

Re-verify against the installed build after any Orca upgrade:

```bash
# command surface size - distinct command names
orca agent-context --json \
  | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sort -u | wc -l
orca skills get orchestration                     # current doctrine

# section 16.2 - the schema of every mechanism this project relies on.
# environmentRecipes is listed EXPLICITLY because a claim about it was believed
# for a week while the re-verification ran twice over a document that did not
# mention it. A mechanism absent from this block is a mechanism nothing rechecks.
orca agent-context --json | grep -o '"environmentRecipes"[^}]*'
orca worktree --help
```

Do not use `grep -c '"command"'` for the count. It counts *lines containing* the
key, not distinct commands, and returns 210 against a surface of 206. The
recorded figure below was always right; the check published beside it was not,
and it disagreed with its own evidence in silence.

Last verified: 2026-07-30 against Orca `1.4.161`, 206 commands, 8 bundled skill
guides, orchestration enabled.

Re-verification history:

- 2026-07-30, `1.4.159` -> `1.4.161` (app self-update). Command surface
  unchanged at 206; orchestration guide unchanged at 254 lines; all mechanisms
  in this document re-checked present and unaltered. No canon change required.
- 2026-07-29, `1.4.159`. Initial verification.

## Scope of this skill

These are properties of the runtime, not preferences. A command's exit status is
evidence that it ran, never evidence of what it accomplished.
