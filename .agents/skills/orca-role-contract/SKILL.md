---
name: orca-role-contract
description: >-
  Understand what an execution role is and what bounds it: its envelope, its
  permitted outputs, what it may never do, its knowledge bindings, and the
  control tier of each boundary it declares. Use when composing roles rather
  than widening one, when a role's output is being read as an enumeration
  rather than a subtraction, and when deciding whether an absent capability
  justifies a new role or a workflow.
metadata:
  baselineVersion: "0.23.0"
  derivedFrom: CANON-010
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-010 in orca-baseline.
  Baseline version: 0.23.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Execution Role Contract

## 1. An execution role is not an occupation

The estate already carries occupational roles: role-foundry indexes them, the
masteries hold their knowledge, and role-foundry owns no prose. An execution role
is a different artifact answering a different question.

| Artifact | Answers |
|---|---|
| Mastery role note | what a practitioner of this role knows |
| role-foundry entry | which roles exist, and which note routes to which work |
| Execution role | what a dispatched session may do, and must stop for |

An execution role **binds** to occupational roles for its knowledge. It never
restates them. Authoring role knowledge here would create a third surface for one
truth, which is the defect role-foundry's no-prose rule already prevents.

## 2. A role is an entity, and carries an envelope

A role is managed like any other distributed artifact, not as loose prose. Every
role carries frontmatter, shaped to the estate's own role-note envelope so a
reader moving between the two is not translating.

| Field | Meaning |
|-------|---------|
| `type` | `execution-role`, distinguishing it from the estate's `role` notes |
| `title` | Display title. Must equal the document's H1 |
| `status` | `draft` or `verified`. **`verified` means exercised, not reviewed** |
| `created` | Date the role entered the baseline |
| `updated` | Last content change, not regeneration |
| `provenance` | **Append-only.** One entry per change: what changed, who ruled it, when |
| `last_exercised` | When the role was last actually run. Distinct from `updated` |

`last_exercised` is the one field the estate's envelope does not have, and it
exists for the reason theirs has `last_verified`: without a hook, nothing
distinguishes a well-reviewed role from a proven one. `lessons/0005` was found by
exercising a role that reviewed cleanly.

## 2b. A required field with no reader decays to a constant

An envelope field that something is obliged to *contain* and nothing is obliged to
*read* stops carrying information, and stops silently. It passes every structural
check, appears in every file, and holds whatever the template said.

`last_exercised` exists to distinguish a well-reviewed role from a proven one. The
compile required it to be present and nothing required it to be true, so three
consecutive sessions each exercised a role and each left the field reading `none`.
**The one answer that is never suspicious is the one the template ships with.**

**Where a record already proves the fact, the record is the authority and the
field answers to it.** Two surfaces holding one fact will diverge; naming which
one is primary is what makes the other checkable. A role named as the author of a
verification or framing record has been exercised, whatever its envelope says.

**Scope the check to where the fact is asserted, not to where the name appears.**
A record cites roles it did not exercise - a review auditing a claim across every
role cites all of them - so a check matching the whole document marks a role proven
on the strength of being mentioned. That is the false positive that gets a check
switched off.

**A field that records a fact is maintained by a check; a field that records a
judgement is not.** Promotion of `status` requires *who ruled it* under section 2's
provenance rule, so it is never inferred from a date, and no session awards it to a
role on the strength of its own work.

## 2a. Required sections

Ten, in order, exactly spelled. **Sections 1, 2 and 4 are resolved from the bound
note and are not authored here.** Sections 5 to 9 are the **agent extension** and
have no occupational equivalent.

**The craft belongs to the mastery. The harness belongs to us.**

**The field schema is the estate's, matched exactly and never copied.** A
compiled role carries a generated **field map** of the estate's 14-field role
chapter plus `Sources`, taken verbatim from
`mastery-foundry/Template/Process/Briefs/guide-role.md.tmpl`. `checkFieldParity`
in `build/compile.mjs` verifies every bundled note against that schema on each
compile - same fields, same order, nothing missing or extra - so the map cannot
drift from the estate without the build going red.

The direction of that check is deliberate. It tests **the estate against our
expectation**: if a vault regenerates a chapter under a changed template, every
role bound to it is describing a shape that no longer exists, and a red build is
the estate telling us it moved. A hand-maintained list would simply be wrong and
say nothing.

**Linking follows role-foundry's contract, not a convention of ours.** A role
binds a canonical entry id, which is stable and declared. `members` are routes,
selected by the work in hand. No reference resolves relative to the index: join
`mastery` to `registry.toml` for the repository, then append `note`. The pin is
provenance about the index, and current knowledge is read from the vault at HEAD.

An execution role is a minted occupational role placed in an agent envelope. It
is not a new role. Where a section describes the *work* - what the role is, what
it does, how it characteristically fails - the bound note already says it, at
length, with sources, having been through a roster and an audit. Restating it
here produces a thinner duplicate that an agent reads *first* and the note
second, which is the worst possible ordering.

This is not a new rule. It is the one already stated for the knowledge estate -
*role-foundry owns no prose, and orca-baseline authors none* - applied to the
place it was being broken. ROLE-001 restated five of the note's fifteen sections
in 144 lines, against 25,833 bytes of the real thing, and the gap between them is
what "plain, with zero direction" describes.

| # | Heading | Class | Holds |
|---|---------|-------|-------|
| 1 | `Definition & output` | **resolved** | Points at the bound note. May add only the *artifact constraint* - which artifact types this envelope forbids |
| 2 | `Core responsibilities` | **resolved** | Points at the bound note. Adds nothing |
| 3 | `Foundational knowledge required` | authored | The occupational roles it binds, and the survey behind the choice |
| 4 | `Common mistakes & failure modes` | **resolved** | Points at the bound note. Adds nothing |
| 5 | `Boundaries` | **agent extension** | What it never does, and which role owns that instead |
| 6 | `Stop conditions` | **agent extension** | What halts it rather than being worked around |
| 7 | `Standards` | **agent extension** | The canon it applies, by identifier |
| 8 | `Definition of done` | **agent extension** | The proof owed, per CANON-005 |
| 9 | `Capability` | **agent extension** | What the role may hold: its lane, and the tier each boundary sits at |
| 10 | `Sources` | mirrors the estate | Where anything cited resolves |

A section with nothing to declare says `none` explicitly. Silence is not
permitted.

**Why five are extensions.** An occupational role note describes a practitioner
who exercises judgement about their own limits. An execution role describes a
dispatched process that must not - so what a person infers has to be written
down: where it stops, what it may not touch, which rules bind it, and what it
owes before claiming completion.

**Why three are resolved rather than mirrored.** The earlier contract asked these
three to *mirror the estate's fields by name* so the two could be read together.
Reading together is the right goal and naming was the wrong mechanism: a heading
that mirrors a field invites prose that mirrors the field, and what gets written
is a summary by an author who has not done the work, shipped alongside the note
of someone who has.

A resolved section names the note and the section within it. The note is bundled
under `references/`, so resolution is offline and exact.

**Section 1 carries the one legitimate addition.** An envelope may *subtract*
outputs the occupation would otherwise produce - a planner that may not write
source files. That is a property of the harness, not the craft, so it is authored
here. Anything that is not a constraint on output belongs to the note.

### Section 9 - Capability, and why every role declares one

A role states what it **may hold**, not only what it may do. For each boundary in
section 5, it names the control tier per CANON-005 section 1a:

| Tier | For a role means |
|---|---|
| `eliminated` | The role's lane does not grant the capability. It cannot perform the act |
| `engineered` | A check refuses the act, proven to fail on it |
| `administrative` | The boundary is stated and honoured by the actor |

**A boundary at `administrative` is declared as such and never implied to be
more.** A role whose boundaries are all administrative is a role held together by
memory, and the correction load falls on the human - which is the failure
`lessons/0023` measures.

Two rules follow, and they apply to every role built after this one:

- **Prefer elimination.** Where a lane can withhold the capability, withhold it.
  A role that cannot write outside its lane needs no rule saying it should not.
- **Declare honestly.** Overstating a tier is worse than a weak tier, because it
  buys confidence the boundary has not earned. `none possible` is a complete
  answer.

### Claims a role makes

Every load-bearing claim in a role's output carries its status per CANON-002
section 2a - `verified`, `documented` or `assumed` - and an assumed claim may not
be load-bearing. This is not optional per role; it is what makes a dispatched
result reviewable without re-doing the work.

**The estate's remaining fields are deliberately not carried.** `Maturity &
current state`, `Where it's practiced`, `How the role is named`, `Learning path`,
`The expert bar` and `Assessment & evidence of mastery` describe a profession in
the world. An execution role has no market, no career path and no practitioners.
Carrying them would produce fields nobody could fill honestly.

## 3. Standards do not vary

The role's section 7 lists canonical identifiers and restates none of them. A role applies
the same standards in every project and every repository; a role that needed
different standards somewhere would be describing a project override, which
belongs in the profile under CANON-008 section 2.8.

## 4. Knowledge binding

The role's section 3 binds **exactly one** canonical role identifier from the estate index.
The binding declares the identifier and nothing more - the route, the note path,
the commit pin and the typed reference graph all resolve from the index.

**One entry, because one entry is one role.** The index contract calls an entry
*"the single consumable entry for a role"*, and routes every mastery role note
through exactly one entry. Its `members` are **routes**: alternatives for the
same job, chosen by matching the mastery to the work in hand. Separate entries
are separate jobs.

**Each role has its own job.** A role that binds two entries is two roles wearing
one name, and nothing downstream can tell which of its jobs any given obligation
belongs to. ROLE-001 bound two, and the generated field map made the damage
legible: all fifteen fields resolved from both notes, because no field could say
which job it described. A role that needs a second entry **dispatches the role
that owns it** - that is what dispatching one role at a time is for.

`build/compile.mjs` refuses a second binding.

Three further rules:

- **A role may not bind to an entry whose confidence is `partial`.** That value
  means the entry's routes are not interchangeable, so no automatic selection is
  correct. Binding to one is a routing hazard, and the compile refuses it.
- **A source whose roster is incomplete is not exhaustive.** Treating it as
  complete is a defect, not an omission.
- **A role declares how much of each bound source it examined**, and the number
  must match the live index. Binding two entries from a corpus of thirty-two is
  sampling, not surveying, and a corpus nobody read is not evidence that nothing
  in it fits. The compile refuses a binding that does not declare its survey, and
  refuses a declared number that disagrees with the index.

## 5. Resolution and absence

Knowledge resolves from the estate declared in the project profile: an estate
root and a mastery slug. The role carries its bound notes; the reference graph
resolves from the local vault.

**Two commits are recorded, and they are different facts.** The index's pin is
provenance about *the index* - the tree it was derived from. It is not the commit
to read. Current knowledge is read from the vault, and the pin exists so drift
against the index can be detected. A vault ahead of the pin is *trailing*, which
is a scheduling fact and never a defect.

A compiled role therefore records both: the commit its bundled notes actually
came from, and the pin the index carried. Conflating them produces an artifact
that cites provenance it does not have.

Where the vault is absent and cannot be obtained, the role **stops and reports**.
It does not run without its knowledge and it does not degrade silently. Work
produced on no foundation is worse than work not started, and it is
indistinguishable from work produced on a good one.

**The dependency is deliberate and is not softened.** A proposal to bundle the
bound notes and continue without the vault - running on a snapshot and reaching
out only for depth - was considered and rejected. The vault is reachable because
that is what it is for, and a role reading a bundled copy is reading a fork:
current at the moment it shipped, silently wrong afterwards, with nothing to
signal which. Knowledge that is not read from the documented source drifts, and
drift is invisible by construction.

A role therefore requires its estate. Where a project cannot accept that, the
answer is that the project binds no execution role - not that the role runs
degraded.

## 6. Validity

A role is valid only when every required section is present with `none` used
rather than omission; every bound identifier resolves in the estate index; no
bound entry carries `partial` confidence; every canonical identifier in the role's section 7
exists; the envelope in section 2 is complete; and sections 5 and 1 do not
overlap - a boundary and a permitted output may not claim the same artifact.

## Scope of this skill

A role that can do everything bounds nothing. The absent capability is met by
composing narrow roles, never by widening one.
