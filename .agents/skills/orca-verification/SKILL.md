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
  baselineVersion: "0.23.0"
  derivedFrom: CANON-005
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-005 in orca-baseline.
  Baseline version: 0.23.0
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
- **A check's exit status is its result.** Never pipe a gate: a pipe replaces its
  status with the last command's, which reports on formatting. Never sequence an
  action after a check as a separate statement - bind the action to the check's
  success, so a failure stops the sequence instead of scrolling past. A check
  whose result is read by a human and not by the next command is advisory,
  whatever it claims about itself.
- A claim that something was verified when it was not is a reportable defect in
  its own right, independent of whether the underlying work was correct.

### The mutation must be shown to have happened

A mutation test has two steps and only one of them is usually checked. The run is
watched closely; **the mutation itself is assumed.**

Where it silently does not apply — an anchor that no longer matches, a patch to a
path nobody reads, an edit reverted by a formatter — the check passes, and that
pass is read as *proved capable of failing*. **It does not merely fail to add
confidence; it manufactures it**, in the one procedure whose entire purpose is to
withhold it. A record then says *proven red* and is false in a way no reader can
detect.

Two obligations, and the second is cheaper than it looks:

- **Assert that the mutation applied**, before running anything. A string
  replacement that matches nothing must raise, not return the original.
- **Bind to the named failing check, not to the exit status.** A non-zero exit
  proves that something disagreed; the *name* of the failing fixture proves the
  mutation reached the check under test. Where the expected name is absent, the
  mutation tested something else.

**What no assertion reaches** is whether the mutation was semantically the right
one. An anchor can match and still produce a mutant the check does not look at,
which passes green for a different reason. Stated so it is not mistaken for
covered.

## 1a. Control tiers

Not all obligations are equally real. Borrowed from process safety, where the
hierarchy is elimination, substitution, engineering controls, administrative
controls, protective equipment - in descending order of how much they depend on
a person doing the right thing.

| Tier | Means | Fails when |
|---|---|---|
| **eliminated** | The actor cannot express the forbidden action - it holds no capability to do it | Never, while the capability is absent |
| **engineered** | A check refuses it, and the check is proven to fail on the defect | The check is bypassed, or was never proven |
| **administrative** | A rule states it. An actor that remembers it applies it | The actor is under pressure, or does not recall it at the moment it applies |

**Administrative is the default and the weakest.** Prose in a canonical document
is tier three. It constrains a reader who remembers the rule at the moment it
applies, which is exactly the moment the work in flight is competing for their
attention - and the party deciding whether the rule applies right now is the one
that benefits from deciding it does not.

Every canonical document **declares the tier of its obligations**, so the ratio
is visible. A method that cannot say what fraction of itself is enforced rather
than remembered is asserting its own reliability.

### A tier is declared for the repository that authors it, and does not travel

**A tier claim describes enforcement in the authoring repository. A project that
installs this canon inherits the RULE and does not inherit the ENFORCEMENT.**

Every `engineered` row names a tool. Those tools are the authoring repository's
build tooling; **a bootstrapped project installs capabilities, not `build/`.** So
a row reading `engineered` in an installed copy of this canon describes a check
the reader does not have and cannot obtain.

**Measured rather than reasoned about**, 2026-08-05: across the nine canonical
documents compiled into shipped capabilities, **45 of 45 `engineered` rows cite a
`build/*.mjs` tool, and `skills-lock.json` installs none of them.** Not a defect
in any one row — the ratio is 45 out of 45, which makes it a property of the
shape rather than an oversight in a document.

**So the honest reading, for an installed copy:**

| Row says | Means where it was authored | Means in a project that installed it |
|---|---|---|
| `eliminated` | The capability is absent | The capability is absent — **this one does travel**, because it is a statement about what an actor can do rather than about a check |
| `engineered` | A named check refuses it | **`administrative`.** The rule binds a reader who remembers it, and nothing checks it |
| `administrative` | A rule states it | The same |

**A consumer reading a tier table should subtract one level from every
`engineered` row unless the tool named is one it installs.** That is the whole
correction, and it is stated here rather than repeated in nine tier tables,
because CANON-001 gives a concern one owner.

**What this does not license.** It is not permission to declare `engineered` and
rely on this paragraph to excuse the gap. The claim must still be true where it
is authored, still name a tool that exists, and still be proven red on its own
defect. This scopes the claim's reach; it does not weaken the claim.

**`lessons/0085` is the instance that found it** — an obligation added to
CANON-006 section 2c, compiled into the two capabilities every session runs, with
its mechanism in `build/`. The finding was first written as one obligation
needing scoping and was wrong in that shape: the measurement above is what
changed it.

**Move down the hierarchy wherever it is possible.** A rule that could be a check
and is left as prose is a choice, and the honest form of that choice is to state
which tier it sits at rather than to imply enforcement it does not have.

## 1b. A suppression is matched by its use, and states a checkable basis

Every check worth having acquires a way to opt a case out of it - a marker, a
flag, an ignore list. That escape is a control in its own right and it is the one
nothing watches, because a suppressed line produces no output.

**A suppression marker is matched by its use, never by its text.** Anchor it to
the position and form that means *"I am marking this"* - a trailing comment, a
delimiter, a column - so that naming the marker in prose is inert. This direction
is asymmetric and the asymmetry is the whole point: **where a prohibition matched
by substring is a nuisance, a suppression matched by substring is a silent hole.**
A project that has fixed the nuisance has learned nothing about the hole, and the
defect is produced by the ordinary act of writing about the mechanism.

**A suppression states what it is exempt on the basis of, and that basis is
checkable.** A marker carrying no basis is an unbounded promise made by whoever
wrote it that day. The claim under it still depends on facts, and nothing
rechecks that dependency when a fact moves - so an exemption is the one kind of
line guaranteed to be unwatched, and it is also the shape most likely to rot,
because a line is exempted precisely because it says something subtle about the
thing being checked.

**Where a basis genuinely cannot be expressed as a checkable fact, the marker
says so in words**, and the count of those is the number worth watching. That
count is smaller and more honest than a count of indistinguishable exemptions.

**A marker with no basis is refused rather than grandfathered.** Grandfathering
needs a way to tell an old marker from a new one, which means a hand-maintained
enumeration of a set the rule guarantees will grow - a shape this method has
already promoted as a defect in its own right.

**A marker that suppresses nothing is refused.** It is pure count, and the count
is the only signal the mechanism has.

Both clauses are `lessons/archive/0045` and `lessons/archive/0037`, promoted
together on 2026-08-03 because landing either separately decides the other by
side effect.

## 1c1. A check runs against the live artifact, not only against fixtures

**A check that has only ever seen fixtures has only ever seen the shape its
author expected.** Point it at the corpus it governs, in the run that gates.

**Four instances in one day, 2026-08-05 to 06**, each a check that existed, was
correct on its own terms, and never reached the thing it was about:

| Record | The check | What it never saw |
|---|---|---|
| `lessons/0084` | `build/decisions.mjs` enumerates packets | A finding routed to *amendment in place* leaves no artifact when the amendment never happens. Six routed, none applied, two closes |
| `lessons/0085` | `build/tiers.mjs` resolves the tool an `engineered` row names | Whether that tool **reaches the actor the obligation binds**. 45 of 45 rows in shipped canon named a tool no consumer installs |
| `lessons/0088` | `build/gaps.mjs` validates a gap report | Its own corpus. Two filing-time rules were applied to every report, so **all four triaged gaps failed the validator** and only fixtures ever ran it |
| `lessons/0089` | `build/gate.mjs` asserts a lane declares every member read-only | That the declaration is **inert**. A member whose path is the workspace is skipped at create time, and the seated actor holds write |

**The failure is not that the checks were wrong.** Each was right about what it
read. The corpus was in the repository the whole time and nothing pointed the
tool at it, so every green was a statement about examples.

**Three forms this takes**, so it is recognisable before it is expensive:

1. **The corpus is never read.** Fixtures only. Ask: *what live files does this
   rule govern, and does the gate run it over them?*
2. **The check reads a declaration rather than an effect.** A lane that *says*
   read-only, a tier row that *names* a tool. Ask: *would this still pass if the
   thing it describes did nothing?*
3. **The check's reach stops at a boundary the obligation crosses.** A repository
   edge, a lifecycle stage. Section 1c owns this one and it is the same family.

**Where a live corpus cannot be made clean today, ratchet it.** Assert the count
does not grow rather than asserting it is zero: the debt stays visible, a new
instance goes red, and lowering the number is a deliberate commit. A ratchet is
not a suppression — the number is in the gate and in the open.

## 1c. A check is scoped to the obligation, not to the tool

Where a check is written because a tool leaves something behind, the question is
**what does the obligation forbid**, not **what does this tool touch**.

The test: **if the check's scope can be derived from the tool's implementation,
it is the wrong scope.** A scope taken from the tool inherits that tool's reach
as a limit, and the limit is invisible - the check reports clean over exactly the
residue the tool could not produce and the obligation still forbids.

`lessons/archive/0047` is the instance. An obligation said *local or remote*; the
check read local refs only, because the removal command it was written for cannot
reach a remote. Both scopes reported zero stranded branches while a merged branch
sat on the remote, and nothing anywhere said the answer was partial.

Where widening the scope means answering from a cache, **the freshness is part of
the answer**. A cached clean and a verified clean are different findings, and the
first is the one the check exists to prevent.

## 1d. A check matches the shape, and there is one of it

Three failures with one cause: a check that is narrower than the rule it enforces,
and no way to tell from reading it.

**Match the shape, never one spelling.** A check naming a single function, flag or
command enforces the rule at the sites that happen to use that spelling, and is
silent everywhere else. It reads as coverage. The check that refused a bare `orca`
matched `execFileSync('orca'` while the call sites it needed to catch used
`spawnSync`, so the rule was true of half the repository and the half it missed
was the tool that deletes worktrees.

**One implementation of a question, never two.** Where two functions answer the
same question, they will diverge, and the divergence is invisible because each is
correct in isolation. Two functions twenty lines apart answered *is this branch
merged* about the same branch and returned `true` and `false` - one resolving the
remote base, the other a local ref nobody updates.

**A promoted lesson that names a second site is a work item, not a record.** The
divergence above had been named in a promoted lesson two days earlier, which said
in terms that fixing one site and not the other would reproduce a known defect. One
site was fixed. Nothing tracks a promotion whose own text identifies remaining
work, so the record read as closed.

### Fixtures must contain the condition that distinguishes the implementations

The divergence survived four fixtures. **Every one ran in a scratch repository with
no remote**, so the branch that separates the two code paths was never taken and
both behaved identically under test. The fixtures could not have told them apart.

A fixture set that omits the distinguishing condition measures agreement between a
function and itself. Where a fixture depends on a state being *unusual* - stale,
absent, conflicting - **assert that state in its own fixture**, or the setup will
drift back to the ordinary case and the test will keep passing while measuring
nothing.

### An exclusion rule is one level unless it says otherwise

*"Exclude X, and anything whose only dependency is X"* is one level. Read as a
transitive closure it can absorb everything, because the excluded set grows to
include the tools the excluder legitimately touches - and a check whose exclusion
set is everything can never fire.

Where the real distinction is **why** something exists rather than what depends on
it, no property of the dependency graph answers it. **Declare that judgement in one
place with its reason attached, and compute everything else.** A heuristic
substituting for the judgement fails in both directions: one reading excluded the
entire codebase, and the obvious repair marked a self-test harness as live.

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
